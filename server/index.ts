import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, relative, resolve, sep } from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';

import { Room } from './room';
import { attachWebSocket, type MiniSocket } from './ws';
import {
  AI_STEP_MS,
  HEARTBEAT_MS,
  PEER_TIMEOUT_MS,
  RECONNECT_GRACE_MS,
  ROOM_TTL_MS,
  SWEEP_MS,
  makeRoomCode,
  type ClientMsg,
  type ServerMsg,
} from './protocol';
import type { PlayerId } from '../src/core/types';
import { publicView } from '../src/core/visibility';

/* ------------------------------------------------------------------
 * 联机服务器
 *
 *   - 同一端口同时提供两件事：静态托管 dist/（前端）、WebSocket（对局）。
 *     这样局域网里只要跑起这一条命令，另一台设备打开 http://<本机IP>:8080
 *     就能直接开玩，不需要额外的 Web 服务器。
 *   - 服务器是唯一的状态推演方：客户端只发意图，只收 publicView() 脱敏后的状态。
 * ------------------------------------------------------------------ */

const PORT = Number(process.env.PORT ?? 8080);
const DIST = resolve(fileURLToPath(new URL('../dist', import.meta.url)));

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.ico': 'image/x-icon',
};

const rooms = new Map<string, Room>();

function send(ws: MiniSocket, msg: ServerMsg): void {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function broadcast(room: Room, msg: ServerMsg): void {
  for (const seat of room.seats) {
    if (seat.ws) send(seat.ws, msg);
  }
}

/** 按座位分别下发 UPDATE：Pantheon 的献祭 token 面值只有本人可见 */
function broadcastUpdate(room: Room): void {
  const [m0, m1] = room.updateMsgs();
  if (room.seats[0].ws) send(room.seats[0].ws, m0);
  if (room.seats[1].ws) send(room.seats[1].ws, m1);
}

/**
 * 广播房间状态。必须**按座位分别下发**：
 * roomMsg(null) 会把 seat 覆盖为 null，导致客户端丢失自己的座位号。
 */
function broadcastRoom(room: Room): void {
  for (const p of [0, 1] as PlayerId[]) {
    const s = room.seats[p];
    if (s.ws) send(s.ws, room.roomMsg(p));
  }
}

/**
 * 终局消息：附带 seed，让双方都能在本地复盘重放这一局。
 * 只有对局已结束时才会发送，此时牌面与移除的牌都已无保密价值。
 */
function overMsg(state: NonNullable<Room['state']>): ServerMsg {
  return { t: 'OVER', victory: state.victory!, seed: state.seed };
}

function roomOf(ws: MiniSocket): Room | null {
  for (const room of rooms.values()) {
    if (room.seatOf(ws) !== null) return room;
  }
  return null;
}

/* ------------------------------ 消息处理 ------------------------------ */

function handle(ws: MiniSocket, raw: string): void {
  let msg: ClientMsg;
  try {
    msg = JSON.parse(raw) as ClientMsg;
  } catch {
    send(ws, { t: 'ERROR', reason: '无法解析的消息' });
    return;
  }

  if (msg.t === 'PING') {
    send(ws, { t: 'PONG', ts: msg.ts });
    return;
  }

  const room = roomOf(ws);

  if (msg.t === 'ROOM_CREATE') {
    if (room) leaveRoom(room, room.seatOf(ws)!);
    let code = makeRoomCode();
    while (rooms.has(code)) code = makeRoomCode();
    const r = new Room(code);
    rooms.set(code, r);
    const seat = r.join(ws, msg.clientId ?? '');
    if (seat === null) {
      send(ws, { t: 'ERROR', reason: '无法创建房间' });
      return;
    }
    send(ws, r.roomMsg(seat));
    broadcastRoom(r);
    console.log(`[房间] 创建 ${code}`);
    return;
  }

  if (msg.t === 'ROOM_JOIN') {
    const code = String(msg.code ?? '').trim().toUpperCase();
    const r = rooms.get(code);
    if (!r) {
      send(ws, { t: 'ERROR', reason: '房间不存在或已过期' });
      return;
    }
    if (room && room !== r) leaveRoom(room, room.seatOf(ws)!);
    const seat = r.join(ws, msg.clientId ?? '');
    if (seat === null) {
      send(ws, { t: 'ERROR', reason: '房间已满' });
      return;
    }
    broadcastRoom(r);
    if (r.started) {
      send(ws, r.gameMsg(seat));
      if (r.state?.victory) send(ws, overMsg(r.state));
    }
    console.log(`[房间] ${code} 座位 ${seat} 就位`);
    return;
  }

  if (msg.t === 'LEAVE') {
    if (room) leaveRoom(room, room.seatOf(ws)!);
    return;
  }

  if (!room) {
    send(ws, { t: 'ERROR', reason: '尚未加入房间' });
    return;
  }
  const seat = room.seatOf(ws)!;

  if (msg.t === 'READY') {
    room.seats[seat].ready = msg.ready;
    broadcastRoom(room);
    return;
  }

  if (msg.t === 'START') {
    if (room.started) return;
    if (seat !== 0) {
      send(ws, { t: 'ERROR', reason: '只有房主可以开始对局' });
      return;
    }
    if (!room.seats[0].connected || !room.seats[1].connected) {
      send(ws, { t: 'ERROR', reason: '两位玩家都需在线' });
      return;
    }
    room.start(undefined, { pantheon: msg.pantheon === true, agora: msg.agora === true });
    broadcastRoom(room);
    for (const p of [0, 1] as PlayerId[]) {
      const s = room.seats[p];
      if (s.ws) send(s.ws, room.gameMsg(p));
    }
    console.log(`[房间] ${room.code} 对局开始${room.pantheon ? '（万神殿）' : ''}${room.agora ? '（Agora）' : ''}`);
    return;
  }

  if (msg.t === 'NEW_GAME') {
    if (!room.started) return;
    room.restart();
    for (const p of [0, 1] as PlayerId[]) {
      const s = room.seats[p];
      if (s.ws) send(s.ws, room.gameMsg(p));
    }
    console.log(`[房间] ${room.code} 再来一局（先后手互换）`);
    return;
  }

  if (msg.t === 'RESYNC') {
    if (!room.started) {
      send(ws, room.roomMsg(seat));
      return;
    }
    send(ws, room.gameMsg(seat));
    if (room.state!.victory) send(ws, overMsg(room.state!));
    return;
  }

  if (msg.t === 'ACTION') {
    const before = room.state?.log.length ?? 0;
    const res = room.apply(seat, msg.action, String(msg.id ?? ''));
    if (!res.ok) {
      send(ws, { t: 'REJECT', id: String(msg.id ?? ''), reason: res.reason });
      return;
    }
    const view = room.state!;
    const after = view.log.length;
    if (after === before) {
      // 幂等命中（网络重发同一 clientActionId）：不重复广播日志，只回最新状态
      for (const p of [0, 1] as PlayerId[]) {
        const s = room.seats[p];
        if (s.ws) send(s.ws, { t: 'UPDATE', view: publicView(view, p), logFrom: after, entries: [], lastAction: null });
      }
    } else {
      // Pantheon 有玩家私有信息，UPDATE 必须按座位分别裁剪下发
      const [m0, m1] = room.updateMsgs();
      if (room.seats[0].ws) send(room.seats[0].ws, m0);
      if (room.seats[1].ws) send(room.seats[1].ws, m1);
    }
    if (view.victory) broadcast(room, overMsg(view));
    return;
  }
}

function leaveRoom(room: Room, seat: PlayerId): void {
  room.markDisconnected(seat);
  broadcastRoom(room);
  const other = room.seats[(1 - seat) as PlayerId];
  if (other.ws) send(other.ws, { t: 'PEER', connected: false, deadline: room.disconnectDeadline(seat) });
}

/* ------------------------------ 静态托管 ------------------------------ */

/**
 * dist 产物缓存策略：
 *   - assets/ 下带内容哈希的文件 → 运行期不变，raw+gzip 各缓存一份
 *   - index.html 等非哈希文件 → 每次读盘（与下发 no-cache 头语义一致；
 *     曾因缓存导致 rebuild 后服务器仍吐旧入口、引用已删除的旧 JS 而白屏）
 * Lighthouse 实测（2026-09-11）：无压缩时主 JS 传输 312KB，模拟慢速 4G 下
 * 仅网络就占 ~1.6s；gzip 后 ~101KB，FCP/LCP 显著改善。
 */
const staticCache = new Map<string, { type: string; body: Buffer; gz: Buffer | null }>();

function compressible(type: string): boolean {
  return type.startsWith('text/') || type === 'application/json' || type === 'image/svg+xml';
}

function makeEntry(type: string, body: Buffer) {
  return { type, body, gz: compressible(type) ? gzipSync(body, { level: 6 }) : null };
}

async function loadEntry(target: string, type: string, immutable: boolean) {
  if (!immutable) return makeEntry(type, await readFile(target));
  let entry = staticCache.get(target);
  if (!entry) {
    entry = makeEntry(type, await readFile(target));
    staticCache.set(target, entry);
  }
  return entry;
}

function respondStatic(
  req: IncomingMessage,
  res: ServerResponse,
  entry: { type: string; body: Buffer; gz: Buffer | null },
  immutable: boolean,
): void {
  const accept = String(req.headers['accept-encoding'] ?? '');
  const gz = entry.gz !== null && /\bgzip\b/i.test(accept) ? entry.gz : null;
  const body = gz ?? entry.body;
  res.writeHead(200, {
    'content-type': entry.type,
    'content-length': String(body.length),
    vary: 'accept-encoding',
    ...(gz ? { 'content-encoding': 'gzip' } : {}),
    // 带内容哈希的 assets 一年不可变；入口 html 用 no-cache，发版即生效
    'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  res.end(body);
}

const http = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    let path = decodeURIComponent(url.pathname);
    if (path === '/' || path === '') path = '/index.html';

    // 只允许读取 dist 目录内的文件
    const target = join(DIST, normalize(path).replace(/^([.]{2}[/\\])+/, ''));
    if (!target.startsWith(DIST)) {
      res.writeHead(403).end('forbidden');
      return;
    }

    const info = await stat(target).catch(() => null);
    if (info && info.isFile()) {
      // 相对路径以 assets/ 开头 ⇒ 文件名带内容哈希，运行期不变可放心缓存
      const immutable = relative(DIST, target).startsWith(`assets${sep}`);
      const entry = await loadEntry(target, MIME[extname(target)] ?? 'application/octet-stream', immutable);
      respondStatic(req, res, entry, immutable);
      return;
    }

    // SPA 回落：未知路径一律返回入口页（不存在则提示先构建）
    const fallbackTarget = join(DIST, 'index.html');
    const fb = await stat(fallbackTarget).catch(() => null);
    if (!fb) {
      res
        .writeHead(503, { 'content-type': 'text/html; charset=utf-8' })
        .end(
          '<meta charset="utf-8"><h3>未找到前端构建产物</h3>' +
            '<p>请先执行 <code>npm run build</code>，再启动联机服务器。</p>',
        );
      return;
    }
    respondStatic(req, res, await loadEntry(fallbackTarget, MIME['.html'], false), false);
  } catch (err) {
    res.writeHead(500).end(String(err));
  }
});

/* ------------------------------ WebSocket ------------------------------ */

attachWebSocket(http, '/ws', (ws) => {
  send(ws, { t: 'HELLO', serverTime: Date.now() });

  let alive = Date.now();
  const heartbeat = setInterval(() => {
    if (Date.now() - alive > PEER_TIMEOUT_MS) {
      ws.terminate();
      clearInterval(heartbeat);
      return;
    }
    try {
      ws.ping();
    } catch {
      clearInterval(heartbeat);
    }
  }, HEARTBEAT_MS);

  const noteAlive = () => {
    alive = Date.now();
  };

  ws.onMessage = (data) => {
    noteAlive();
    try {
      handle(ws, data);
    } catch (err) {
      console.error('[错误] 处理消息时异常：', err);
      send(ws, { t: 'ERROR', reason: '服务器内部错误' });
    }
  };

  ws.onClose = () => {
    clearInterval(heartbeat);
    const room = roomOf(ws);
    if (!room) return;
    const seat = room.seatOf(ws);
    if (seat === null) return;
    room.markDisconnected(seat);
    const other = room.seats[(1 - seat) as PlayerId];
    if (other.ws) {
      send(other.ws, { t: 'PEER', connected: false, deadline: room.disconnectDeadline(seat) });
      send(other.ws, room.roomMsg((1 - seat) as PlayerId));
    }
    console.log(`[房间] ${room.code} 座位 ${seat} 断开`);
  };

  ws.onError = () => {
    clearInterval(heartbeat);
  };
});

/* 掉线超时 → 由 AI 接管（不再是直接判负） + 房间回收 */
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of [...rooms]) {
    if (room.started && !room.state?.victory) {
      for (const p of [0, 1] as PlayerId[]) {
        const s = room.seats[p];
        if (!s.connected && s.disconnectedAt !== null && now - s.disconnectedAt > RECONNECT_GRACE_MS) {
          if (room.aiTakeover(p)) {
            broadcastRoom(room);
            broadcastUpdate(room);
            console.log(`[房间] ${code} 座位 ${p} 掉线超时，改由 AI 接管`);
          }
        }
      }
    }
    if (room.bothGone() && now - room.lastActivity > RECONNECT_GRACE_MS) {
      rooms.delete(code);
      console.log(`[房间] ${code} 已回收`);
      continue;
    }
    if (now - room.createdAt > ROOM_TTL_MS) {
      rooms.delete(code);
      console.log(`[房间] ${code} 超过 24 小时，已回收`);
    }
  }
}, SWEEP_MS);

/**
 * AI 托管心跳：当前行动方若已被 AI 接管，就在这里代其出招。
 * 间隔 AI_STEP_MS（默认 700ms），既让对手看清 AI 做了什么，
 * 也远低于每秒 40 次的动作限流。
 */
setInterval(() => {
  for (const room of rooms.values()) {
    if (!room.started || room.state?.victory) continue;
    const before = room.state?.log.length ?? 0;
    if (!room.aiStep()) continue;

    const view = room.state!;
    if (view.log.length === before) {
      broadcast(room, { t: 'UPDATE', view: publicView(view, null), logFrom: view.log.length, entries: [], lastAction: null });
    } else {
      broadcastUpdate(room);
    }
    if (view.victory) {
      broadcast(room, overMsg(view));
      console.log(`[房间] ${room.code} AI 托管对局已结束`);
    }
  }
}, AI_STEP_MS);

/** 测试脚本可复用同一份服务器实例 */
export function startServer(port = PORT, host = '0.0.0.0'): Promise<typeof http> {
  return new Promise((res, rej) => {
    http.once('error', rej);
    http.listen(port, host, () => res(http));
  });
}

const isMain = (() => {
  try {
    return resolve(process.argv[1] ?? '') === resolve(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();

if (isMain) {
  void startServer(PORT).then(() => {
    console.log('');
    console.log('  七大奇迹对决 · 联机服务器已启动');
    console.log('  --------------------------------------------------');
    console.log(`  本机访问：    http://localhost:${PORT}`);
    const ips = lanAddresses();
    for (const ip of ips) {
      console.log(`  局域网访问：  http://${ip}:${PORT}   <- 同一 WiFi 下的另一台设备用这个`);
    }
    if (ips.length === 0) console.log('  局域网访问：  未检测到局域网地址，请检查网络连接');
    console.log('  --------------------------------------------------');
    console.log('  玩法：一台设备「创建房间」拿到 6 位房间码，另一台输入房间码加入。');
    console.log('');
  });
}

function lanAddresses(): string[] {
  const out: string[] = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const ni of list ?? []) {
      if (ni.family === 'IPv4' && !ni.internal) out.push(ni.address);
    }
  }
  return out;
}
