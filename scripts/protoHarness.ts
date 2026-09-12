/* ------------------------------------------------------------------
 * 联机端到端测试的共享测试装置
 *
 * 被两个入口复用，保证二者跑的是**同一套**校验逻辑：
 *   - scripts/protoTest.ts     起源码服务器（import startServer）后跑
 *   - scripts/protoProd.ts     连「已运行的正式产物」dist-server/server.mjs 跑
 *
 * 校验项：
 *   1. 客户端仅凭收到的公开状态就能算出合法动作（说明脱敏没删掉必要信息）
 *   2. 全局无隐藏信息泄漏（seed / rngState / 暗牌 / 密谋手牌）
 *   3. 两个客户端看到的公开状态完全一致
 *   4. 非行动方发动作会被服务器拒绝
 *   5. 三种胜利方式都能正常走完
 * ------------------------------------------------------------------ */

import { AGORA, PANTHEON } from './pantheonFlag';
import { connectWs, type MiniClient } from '../server/wsClient';
import { activePlayer, legalActions } from '../src/core/engine';
import { isSecretLeaked } from '../src/core/visibility';
import type { PublicState } from '../src/core/visibility';
import type { ClientMsg, ServerMsg } from '../server/protocol';
import type { GameAction, PlayerId } from '../src/core/types';

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function waitFor(label: string, pred: () => boolean, timeout = 8000): Promise<void> {
  const t0 = Date.now();
  while (!pred()) {
    if (Date.now() - t0 > timeout) throw new Error(`等待超时：${label}`);
    await sleep(3);
  }
}

export class TestClient {
  view: PublicState | null = null;
  seat: PlayerId | null = null;
  code: string | null = null;
  started = false;
  rejects = 0;
  errors: string[] = [];
  updates = 0;
  lastMsg: ServerMsg | null = null;
  lastActionSeen: GameAction | null = null;

  constructor(
    private readonly c: MiniClient,
    readonly cid: string,
  ) {
    c.onMessage = (text) => {
      const msg = JSON.parse(text) as ServerMsg;
      this.lastMsg = msg;
      switch (msg.t) {
        case 'ROOM':
          this.code = msg.code;
          if (msg.seat !== null) this.seat = msg.seat;
          this.started = msg.started;
          break;
        case 'GAME':
          this.seat = msg.seat;
          this.view = msg.view;
          this.started = true;
          break;
        case 'UPDATE':
          this.view = msg.view;
          this.updates += 1;
          break;
        case 'REJECT':
          this.rejects += 1;
          this.errors.push(`REJECT:${msg.reason}:${JSON.stringify(this.lastActionSeen ?? '')}`);
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

export interface Result {
  ok: boolean;
  steps: number;
  type: string;
  winner: PlayerId | null;
  error?: string;
}

/** 把按座位裁剪过的视图规约成「观战视角」规范形，供两侧一致性比对 */
export function canonical(view: PublicState): string {
  const copy = JSON.parse(JSON.stringify(view)) as PublicState;
  copy.viewer = null;
  if (copy.pantheon) {
    copy.players = copy.players.map((pl) => ({
      ...pl,
      pan: { ...pl.pan, offerings: pl.pan.offerings.map(() => -1) },
    })) as typeof copy.players;
  }
  if (copy.agora) {
    copy.players = copy.players.map((pl) => ({
      ...pl,
      agora: {
        ...pl.agora,
        conspiracies: [],
        prepared: pl.agora.prepared.map(() => ({ conspiracyId: '#', cardId: '#' })),
        tuckedProgress: pl.agora.tuckedProgress.map(() => '#'),
      },
    })) as unknown as typeof copy.players;
  }
  // Pantheon 待决选项只下发给选择者本人：比对前统一抹平
  if (copy.pending?.kind === 'pantheon') {
    copy.pending = {
      ...copy.pending,
      steps: copy.pending.steps.map((s) => ({ ...s, options: [] })),
    };
  }
  // Agora 待决选项同规则
  if (copy.pending?.kind === 'agora') {
    copy.pending = {
      ...copy.pending,
      steps: copy.pending.steps.map((s) => ({ ...s, options: [] })),
    };
  }
  return JSON.stringify(copy);
}

/** 连上一台**已经跑起来**的服务器（不负责启动它） */
export async function connect(port: number): Promise<TestClient> {
  const cid = Math.random().toString(36).slice(2);
  const c = await connectWs(`ws://127.0.0.1:${port}/ws`);
  const tc = new TestClient(c, cid);
  await waitFor('连接建立', () => c.onMessage !== null);
  return tc;
}

/**
 * 跑一整局完整对局。
 * @param port          目标服务器端口
 * @param seedTag       仅用于客户端侧随机挑选动作的确定性种子
 * @param testWrongSeat 是否抽查「非行动方动作被拒」
 */
export async function playOneGame(
  port: number,
  seedTag: number,
  testWrongSeat: boolean,
): Promise<Result> {
  const a = await connect(port);
  const b = await connect(port);

  a.send({ t: 'ROOM_CREATE', clientId: a.cid });
  await waitFor('房主拿到房间码', () => a.code !== null);
  const code = a.code!;

  b.send({ t: 'ROOM_JOIN', code, clientId: b.cid });
  await waitFor('双方就位', () => a.seat !== null && b.seat !== null);
  if (a.seat === b.seat) {
    a.close();
    b.close();
    return { ok: false, steps: 0, type: '-', winner: null, error: '两个客户端分到了同一个座位' };
  }

  a.send({ t: 'READY', ready: true });
  b.send({ t: 'READY', ready: true });
  a.send({ t: 'START', pantheon: PANTHEON, agora: AGORA });
  await waitFor('对局开始', () => a.view !== null && b.view !== null);
  if (!!a.view!.pantheon !== PANTHEON || !!a.view!.agora !== AGORA) {
    return { ok: false, steps: 0, type: '-', winner: null, error: 'ROOM/GAME 未正确传递 Pantheon 开关' };
  }

  let steps = 0;
  let wrongSeatChecked = !testWrongSeat;
  let rnd = seedTag * 7919 + 13;
  const next = () => {
    rnd = (rnd * 1103515245 + 12345) & 0x7fffffff;
    return rnd / 0x7fffffff;
  };

  while (!a.view!.victory) {
    const actor = activePlayer(a.view!);
    if (actor === null) return { ok: false, steps, type: '-', winner: null, error: '无法确定行动方' };
    // Pantheon 后视图按座位裁剪：合法动作必须用行动方自己的视图推算
    const mover0 = a.seat === actor ? a : b;
    const view = mover0.view!;
    if (view.viewer !== actor) {
      return { ok: false, steps, type: '-', winner: null, error: '收到的视图座位标记错误' };
    }

    const acts = legalActions(view, actor);
    if (acts.length === 0) {
      return { ok: false, steps, type: view.victory?.type ?? '-', winner: null, error: '无合法动作但未结束' };
    }

    // 校验：客户端仅凭公开状态就能算出动作，且公开状态无泄漏
    for (const cl of [a, b]) {
      const leaks = isSecretLeaked(cl.view!);
      if (leaks.length > 0) {
        return { ok: false, steps, type: '-', winner: null, error: `隐藏信息泄漏：${leaks.join(',')}` };
      }
    }

    // 校验：非行动方发动作应被拒绝
    if (!wrongSeatChecked) {
      wrongSeatChecked = true;
      const mover = a.seat === actor ? a : b;
      const idler = a.seat === actor ? b : a;
      const before = idler.rejects;
      idler.send({ t: 'ACTION', id: 'wrong-seat', action: acts[0] });
      await sleep(30);
      if (idler.rejects <= before) {
        mover.close();
        idler.close();
        return { ok: false, steps, type: '-', winner: null, error: '非行动方的动作没有被服务器拒绝' };
      }
    }

    const action = { ...acts[Math.floor(next() * acts.length)] } as GameAction;
    const mover = a.seat === actor ? a : b;
    mover.lastActionSeen = action;
    const updatesBefore = [a.updates, b.updates];

    // 本地回环可能在一秒内打出 40+ 动作触发限流：被限流就稍候重试（同一 id，幂等安全）
    let attempt = 0;
    for (;;) {
      const rj = mover.rejects;
      mover.send({ t: 'ACTION', id: `${mover.cid}-${steps}`, action });
      try {
        await waitFor(
          `第 ${steps} 步状态推进`,
          () =>
            // 必须两端都收到本步 UPDATE 再比对：只等一端会读到大帧差（曾误报「状态不一致」）。
            // 注意不能用「a 已见 victory」短路 —— 终局动作的服务器广播是先 UPDATE 后 OVER，
            // 两socket到达有先后，A 见到 victory 时 B 可能还没收到自己的 UPDATE。
            // 被限流 / 非法动作则由 rejects 分支兜住。
            (a.updates > updatesBefore[0] && b.updates > updatesBefore[1]) || mover.rejects > rj,
          3000,
        );
      } catch (err) {
        const detail = [
          `actor=${actor}`,
          `动作=${JSON.stringify(action)}`,
          `A错误=${a.errors.join('|') || '无'}`,
          `B错误=${b.errors.join('|') || '无'}`,
          `A拒=${a.rejects} B拒=${b.rejects}`,
          `阶段=${a.view?.phase}`,
          `待办=${a.view?.pending?.kind ?? '无'}`,
        ].join(' ');
        a.close();
        b.close();
        await sleep(20);
        return { ok: false, steps, type: '-', winner: null, error: `${String(err)} — ${detail}` };
      }
      if (
        mover.rejects > rj &&
        mover.errors[mover.errors.length - 1]?.startsWith('REJECT:操作过于频繁') &&
        ++attempt < 5
      ) {
        await sleep(60);
        continue;
      }
      break;
    }
    steps += 1;

    // 校验：两侧公开状态一致（规约到观战视角后比较；Pantheon 按座位裁剪属预期差异）
    const ca = canonical(a.view!);
    const cb = canonical(b.view!);
    if (ca !== cb) {
      // 给出首个差异点的上下文，便于定位（否则只能看到一句「不一致」）
      let i = 0;
      while (i < ca.length && i < cb.length && ca[i] === cb[i]) i++;
      const w = 90;
      const diff = `位置 ${i}\n    A …${ca.slice(Math.max(0, i - w), i + w)}…\n    B …${cb.slice(Math.max(0, i - w), i + w)}…`;
      return { ok: false, steps, type: '-', winner: null, error: `两个客户端的公开状态不一致 — ${diff}` };
    }

    if (steps > 300) {
      return { ok: false, steps, type: '-', winner: null, error: '步数超限' };
    }
  }

  const v = a.view!.victory!;
  a.close();
  b.close();
  await sleep(20);
  return { ok: true, steps, type: v.type, winner: v.winner };
}

/** 汇总并打印结果；有失败则以非零码退出 */
export function report(results: Result[], games: number): void {
  const ok = results.filter((r) => r.ok);
  const bad = results.filter((r) => !r.ok);

  console.log(
    `完成 ${ok.length}/${games} 局，平均 ${(ok.reduce((s, r) => s + r.steps, 0) / Math.max(1, ok.length)).toFixed(1)} 步`,
  );
  const byType = new Map<string, number>();
  for (const r of ok) byType.set(r.type, (byType.get(r.type) ?? 0) + 1);
  console.log('胜利方式分布：', [...byType.entries()].map(([k, v]) => `${k} ${v}`).join(' / ') || '无');

  if (bad.length) {
    console.log(`\n失败 ${bad.length} 局：`);
    for (const b of bad.slice(0, 10)) console.log(`  - ${b.error}`);
    process.exit(1);
  }
  console.log('\n联机端到端全部通过：状态一致、无泄漏、非行动方被拒、对局可正常结束。');
  process.exit(0);
}
