/* ------------------------------------------------------------------
 * 联机端到端测试 · 掉线 → AI 托管
 *
 * 场景：一局进行中，让「玩家二」在轮到自己行动时直接断线（不重连），
 * 验证：
 *   1. 服务器不再判负（不会收到 resign），而是广播「由 AI 接管」
 *   2. 留在场上的玩家一能靠服务器端的 AI 把对局打完
 *   3. 接管过程全程无隐藏信息泄漏、状态合法推进
 *
 * 说明：RECONNECT_GRACE_MS / SWEEP_MS / AI_STEP_MS 用环境变量调小，
 * 让「掉线 → 90 秒宽限 → 接管 → AI 出招」在秒级内跑完。
 * 必须在 import server 之前设置（protocol.ts 在模块加载时读取）。
 * ------------------------------------------------------------------ */

import { AGORA, PANTHEON } from './pantheonFlag';

process.env.RECONNECT_GRACE_MS = process.env.RECONNECT_GRACE_MS ?? '400';
process.env.SWEEP_MS = process.env.SWEEP_MS ?? '150';
process.env.AI_STEP_MS = process.env.AI_STEP_MS ?? '80';

const { startServer } = await import('../server/index');
const { connectWs } = await import('../server/wsClient');
const { activePlayer, legalActions } = await import('../src/core/engine');
const { isSecretLeaked } = await import('../src/core/visibility');
import type { MiniClient } from '../server/wsClient';
import type { PublicState } from '../src/core/visibility';
import type { ClientMsg, ServerMsg } from '../server/protocol';
import type { GameAction, PlayerId } from '../src/core/types';

const PORT = Number(process.env.PORT ?? 8081);
// 看门狗：任何挂起（如同步计算冻结）10 分钟后强制退出，避免批次循环被卡死
setTimeout(() => {
  console.error('[看门狗] 测试整体超时，强制退出');
  process.exit(1);
}, 10 * 60_000);
const GAMES = Number(process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 3);

class TestClient {
  view: PublicState | null = null;
  seat: PlayerId | null = null;
  code: string | null = null;
  updates = 0;
  errors: string[] = [];
  aiControlled: [boolean, boolean] = [false, false];

  constructor(
    private readonly c: MiniClient,
    readonly cid: string,
  ) {
    // 与真实客户端一致：定期 PING 保活，避免长链 AI 回合静默被服务器心跳判死
    const hb = setInterval(() => {
      try {
        this.send({ t: 'PING', ts: Date.now() });
      } catch {
        clearInterval(hb);
      }
    }, 10_000);
    c.onClose = () => clearInterval(hb);
    c.onMessage = (text) => {
      const msg = JSON.parse(text) as ServerMsg;
      switch (msg.t) {
        case 'ROOM':
          this.code = msg.code;
          if (msg.seat !== null) this.seat = msg.seat;
          this.aiControlled = msg.aiControlled;
          break;
        case 'GAME':
          this.seat = msg.seat;
          this.view = msg.view;
          break;
        case 'UPDATE':
          this.view = msg.view;
          this.updates += 1;
          break;
        case 'OVER':
          if (this.view) this.view = { ...this.view, victory: msg.victory };
          break;
        case 'ERROR':
          this.errors.push(msg.reason);
          break;
        default:
          break;
      }
    };
  }

  send(m: ClientMsg): void {
    this.c.send(JSON.stringify(m));
  }

  close(): void {
    this.c.close();
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor(label: string, pred: () => boolean, timeout = 10000): Promise<void> {
  const t0 = Date.now();
  while (!pred()) {
    if (Date.now() - t0 > timeout) throw new Error(`等待超时：${label}`);
    await sleep(3);
  }
}

async function connect(): Promise<TestClient> {
  const cid = Math.random().toString(36).slice(2);
  const c = await connectWs(`ws://127.0.0.1:${PORT}/ws`);
  const tc = new TestClient(c, cid);
  await waitFor('连接建立', () => c.onMessage !== null);
  return tc;
}

/** 掉线至少 8 步后才允许断线，保证对局已进入时代 I 正手阶段 */
const MIN_STEPS_BEFORE_DISCONNECT = 8;

async function playOneWithDisconnect(seed: number): Promise<string | null> {
  const a = await connect();
  const b = await connect();

  a.send({ t: 'ROOM_CREATE', clientId: a.cid });
  await waitFor('房主拿到房间码', () => a.code !== null);
  const code = a.code!;

  b.send({ t: 'ROOM_JOIN', code, clientId: b.cid });
  await waitFor('双方就位', () => a.seat !== null && b.seat !== null);
  const bSeat = b.seat!;

  a.send({ t: 'READY', ready: true });
  b.send({ t: 'READY', ready: true });
  a.send({ t: "START", pantheon: PANTHEON, agora: AGORA });
  await waitFor('对局开始', () => a.view !== null && b.view !== null);

  let steps = 0;
  let bAlive = true;
  let takeoverSeen = false;
  let aiMoves = 0;
  let rnd = seed * 7919 + 13;
  const next = () => {
    rnd = (rnd * 1103515245 + 12345) & 0x7fffffff;
    return rnd / 0x7fffffff;
  };

  try {
    while (!a.view!.victory) {
      const view = a.view!;
      const actor = activePlayer(view);
      if (actor === null) return '无法确定行动方';

      const leaks = isSecretLeaked(view);
      if (leaks.length > 0) return `隐藏信息泄漏：${leaks.join(',')}`;

      /* 掉线时机：双方都还正常时，轮到玩家二在正手阶段行动 → 直接断线 */
      if (bAlive && view.phase === 'playing' && actor === bSeat && steps >= MIN_STEPS_BEFORE_DISCONNECT) {
        b.close();
        bAlive = false;
        steps += 1;
        continue;
      }

      /* 断线后、接管前：等服务器广播 AI 接管 */
      if (!bAlive && !takeoverSeen) {
        if (a.aiControlled[bSeat]) {
          takeoverSeen = true;
          continue;
        }
        if (actor !== bSeat) {
          // 断线发生在玩家二回合，理论上在它出招前不会轮到玩家一；
          // 若出现异动说明状态推进异常。
          return `断线后未经 AI 接管状态就推进（actor=${actor}）`;
        }
        await waitFor('服务器广播 AI 接管', () => a.aiControlled[bSeat], 10000);
        takeoverSeen = true;
        continue;
      }

      /* 断线方回合：AI 托管出招，只等更新 */
      if (!bAlive && actor === bSeat) {
        const before = a.updates;
        await waitFor('AI 托管出招', () => a.updates > before || a.view!.victory !== null, 20000);
        aiMoves += 1;
        steps += 1;
        if (steps > 3000) {
          console.log(`[超限诊断] age=${a.view!.age} struct=${a.view!.structureRemaining} phase=${a.view!.phase} pending=${JSON.stringify(a.view!.pending)?.slice(0, 120)}`);
          for (const e of a.view!.log.slice(-12)) console.log(`  [${e.player ?? '-'}] ${e.text}`);
          return `步数超限(${steps})`;
        }
        continue;
      }

      /* 其余情况：当前行动方照常发动作（未断线前双方都发） */
      // Agora/Pantheon 的待决选项按座位脱敏：合法动作必须用行动方自己的视图推算
      const moverView = (actor === a.seat ? a : b).view!;
      const acts = legalActions(moverView, actor);
      if (acts.length === 0) return `阶段 ${view.phase} 无合法动作但未结束`;

      const mover = actor === a.seat ? a : b;
      const before = a.updates;
      mover.send({
        t: 'ACTION',
        id: `${mover.cid}-${steps}`,
        action: { ...acts[Math.floor(next() * acts.length)] } as GameAction,
      });
      await waitFor(`第 ${steps} 步状态推进`, () => a.updates > before || a.view!.victory !== null, 3000);
      steps += 1;
      await sleep(35); // 压住动作频率，避免触发每秒 40 次限流
      if (steps > 3000) {
          console.log(`[超限诊断] age=${a.view!.age} struct=${a.view!.structureRemaining} phase=${a.view!.phase} pending=${JSON.stringify(a.view!.pending)?.slice(0, 120)}`);
          for (const e of a.view!.log.slice(-12)) console.log(`  [${e.player ?? '-'}] ${e.text}`);
          return `步数超限(${steps})`;
        }
    }

    const v = a.view!.victory!;
    if (!takeoverSeen) return '对局结束但从未观察到 AI 接管广播';
    if (v.type === 'resign') return '掉线方被直接判负（应改为 AI 接管）';
    if (aiMoves === 0) return 'AI 托管后没有代打过任何一步';
    return null;
  } catch (err) {
    return String(err);
  } finally {
    a.close();
    b.close();
    await sleep(30);
  }
}

await startServer(PORT, '127.0.0.1');
await sleep(120);

let ok = 0;
const errors: string[] = [];
for (let i = 1; i <= GAMES; i++) {
  const err = await playOneWithDisconnect(i * 1000 + 7);
  if (err) {
    errors.push(`game ${i}: ${err}`);
    console.log(`  ✗ 第 ${i} 局失败：${err}`);
  } else {
    ok += 1;
    console.log(`  ✓ 第 ${i} 局：断线后由 AI 接管并正常打完`);
  }
}

console.log(`\n掉线 → AI 托管：通过 ${ok}/${GAMES}`);
if (errors.length) {
  for (const e of errors) console.log('  -', e);
  process.exit(1);
}
console.log('全部通过：不掉线判负、AI 能代打到终局、无隐藏信息泄漏。');
process.exit(0);
