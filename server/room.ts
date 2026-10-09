import { appendFileSync } from 'node:fs';
import type { MiniSocket } from './ws';
import { activePlayer, applyAction, initialState, legalActions } from '../src/core/engine';
import { chooseAction, type Difficulty } from '../src/ai/index';
import { getAiPool } from './aiPool';
import { publicView, maskSecretLogAction } from '../src/core/visibility';
import { isSecretLeaked } from '../src/core/visibility';
import type { GameAction, GameState, PlayerId } from '../src/core/types';
import {
  ACTION_RATE_LIMIT,
  bindAction,
  RECONNECT_GRACE_MS,
  sameAction,
  type ServerMsg,
} from './protocol';

/* ------------------------------------------------------------------
 * 房间：服务器权威地持有完整 GameState，对客户端只下发 publicView()
 * ------------------------------------------------------------------ */

interface Seat {
  ws: MiniSocket | null;
  ready: boolean;
  connected: boolean;
  /** 掉线时刻，null 表示在线 */
  disconnectedAt: number | null;
  /** 客户端身份，用于断线后回到原座位 */
  clientId: string | null;
  /** 限流窗口 */
  actionWindow: { start: number; count: number };
  /** 是否由 AI 接管（掉线超时后开启，真人重连即关闭） */
  aiControlled: boolean;
}

export class Room {
  readonly code: string;
  readonly createdAt = Date.now();
  state: GameState | null = null;
  lastActivity = Date.now();
  /** 本局是否启用万神殿扩展（房主 START 时指定；再来一局沿用） */
  pantheon = false;
  agora = false;
  /** 已广播出去的日志长度，用于增量下发 */
  private sentLog = 0;
  /** 最近一次处理过的 clientActionId，用于幂等 */
  private lastActionId: string | null = null;
  private lastActionState: GameState | null = null;

  /** AI 托管时的出招难度 */
  aiDifficulty: Difficulty = 'medium';
  /** worker 决策在途标记：同一房间一回合只允许一个在途决策 */
  private aiInFlight = false;

  readonly seats: [Seat, Seat] = [
    { ws: null, ready: false, connected: false, disconnectedAt: null, clientId: null, actionWindow: { start: 0, count: 0 }, aiControlled: false },
    { ws: null, ready: false, connected: false, disconnectedAt: null, clientId: null, actionWindow: { start: 0, count: 0 }, aiControlled: false },
  ];

  constructor(code: string) {
    this.code = code;
  }

  get started(): boolean {
    return this.state !== null;
  }

  seatOf(ws: MiniSocket): PlayerId | null {
    if (this.seats[0].ws === ws) return 0;
    if (this.seats[1].ws === ws) return 1;
    return null;
  }

  freeSeat(): PlayerId | null {
    if (this.seats[0].ws === null) return 0;
    if (this.seats[1].ws === null) return 1;
    return null;
  }

  join(ws: MiniSocket, clientId = ''): PlayerId | null {
    // 断线重连：凭 clientId 回到原座位，避免座位错乱
    if (clientId) {
      for (const p of [0, 1] as PlayerId[]) {
        const s = this.seats[p];
        if (s.clientId === clientId) {
          s.ws = ws;
          s.connected = true;
          s.disconnectedAt = null;
          // 真人回来了，立刻交还控制权（此前可能已被 AI 接管）
          s.aiControlled = false;
          this.lastActivity = Date.now();
          return p;
        }
      }
    }
    const seat = this.freeSeat();
    if (seat === null) return null;
    this.seats[seat].ws = ws;
    this.seats[seat].connected = true;
    this.seats[seat].disconnectedAt = null;
    this.seats[seat].clientId = clientId;
    this.seats[seat].aiControlled = false;
    this.lastActivity = Date.now();
    return seat;
  }

  /** 断线：保留座位 90 秒 */
  markDisconnected(seat: PlayerId): void {
    const s = this.seats[seat];
    s.connected = false;
    s.ws = null;
    s.disconnectedAt = Date.now();
  }

  disconnectDeadline(seat: PlayerId): number | null {
    const s = this.seats[seat];
    if (s.connected || s.disconnectedAt === null) return null;
    return s.disconnectedAt + RECONNECT_GRACE_MS;
  }

  bothGone(): boolean {
    return this.seats.every((s) => !s.connected);
  }

  /* ------------------------------ 对局 ------------------------------ */

  start(seed = Math.floor(Math.random() * 1e9), opts: { pantheon?: boolean; agora?: boolean } = {}): void {
    this.pantheon = opts.pantheon === true;
    this.state = initialState(seed, opts);
    this.sentLog = 0;
    this.lastActionId = null;
    this.lastActionState = null;
    this.seats[0].ready = false;
    this.seats[1].ready = false;
    this.seats[0].aiControlled = false;
    this.seats[1].aiControlled = false;
    this.lastActivity = Date.now();
  }

  /** 服务器唯一的状态推进入口：先验身份，再过合法动作白名单 */
  apply(seat: PlayerId, raw: GameAction, id: string): { ok: true } | { ok: false; reason: string } {
    const state = this.state;
    if (!state) return { ok: false, reason: '对局尚未开始' };
    if (state.victory) return { ok: false, reason: '对局已结束' };

    // 幂等：同一 clientActionId 重复到达（网络重试）直接视为成功
    if (id === this.lastActionId) return { ok: true };

    const actor = activePlayer(state);
    if (actor === null) return { ok: false, reason: '当前无人需要行动' };
    if (actor !== seat) return { ok: false, reason: '还没轮到你' };

    // 限流
    const win = this.seats[seat].actionWindow;
    const now = Date.now();
    if (now - win.start > 1000) {
      win.start = now;
      win.count = 0;
    }
    if (++win.count > ACTION_RATE_LIMIT) return { ok: false, reason: '操作过于频繁' };

    const action = bindAction(raw, seat);
    if (!legalActions(state, seat).some((a) => sameAction(a, action))) {
      return { ok: false, reason: '非法动作' };
    }

    this.lastActionState = state;
    this.state = applyAction(state, action);
    this.lastActionId = id;
    this.lastActivity = Date.now();
    return { ok: true };
  }

  /** 一次截取增量日志，按座位生成两份脱敏 UPDATE。
   *  Pantheon 引入玩家私有信息（献祭 token 面值）后必须按座位裁剪：
   *  每个座位只看得见自己的面值。并发出的视图都会过泄漏断言。
   *  增量条目与 lastAction 的私密字段（密谋 id、面朝下神格）同样掩码——
   *  完整未掩码日志只在终局 OVER 下发（见 server/index.ts overMsg）。 */
  updateMsgs(): [Extract<ServerMsg, { t: 'UPDATE' }>, Extract<ServerMsg, { t: 'UPDATE' }>] {
    const state = this.state!;
    const entries = state.log
      .slice(this.sentLog)
      .map((e) => (e.action ? { ...e, action: maskSecretLogAction(e.action) } : e));
    const from = this.sentLog;
    this.sentLog = state.log.length;
    const lastRaw = state.log[state.log.length - 1]?.action ?? null;
    const lastAction = lastRaw ? maskSecretLogAction(lastRaw) : null;
    const make = (seat: PlayerId | null): Extract<ServerMsg, { t: 'UPDATE' }> => {
      const view = publicView(state, seat);
      const leaks = isSecretLeaked(view);
      if (leaks.length > 0) {
        // 防御性：宁可中断也不要把暗牌发出去
        throw new Error(`公开状态泄漏隐藏信息：${leaks.join(', ')}`);
      }
      return { t: 'UPDATE', view, logFrom: from, entries, lastAction };
    };
    return [make(0), make(1)];
  }

  gameMsg(seat: PlayerId): Extract<ServerMsg, { t: 'GAME' }> {
    return { t: 'GAME', seat, view: publicView(this.state!, seat) };
  }

  roomMsg(seat: PlayerId | null): Extract<ServerMsg, { t: 'ROOM' }> {
    return {
      t: 'ROOM',
      code: this.code,
      seat,
      present: [this.seats[0].connected, this.seats[1].connected],
      ready: [this.seats[0].ready, this.seats[1].ready],
      started: this.started,
      pantheon: this.pantheon,
      agora: this.agora,
      aiControlled: [this.seats[0].aiControlled, this.seats[1].aiControlled],
    };
  }

  /** 再来一局：交换两个座位的连接，实现先后手互换（沿用本局的扩展设置） */
  restart(): void {
    const a = this.seats[0];
    const b = this.seats[1];
    this.seats[0] = b;
    this.seats[1] = a;
    this.start(undefined, { pantheon: this.pantheon, agora: this.agora });
  }

  /**
   * 断线超时的默认处理：由 AI 接管该方，而不是直接判负。
   *
   * 这样对手仍能把这一局打完，掉线方重连后还能接回去（见 join() 会清掉该标记）。
   * 返回是否真的发生了接管（重复调用不会产生多条日志）。
   */
  aiTakeover(absent: PlayerId): boolean {
    if (!this.state || this.state.victory) return false;
    const s = this.seats[absent];
    if (s.aiControlled) return false;
    s.aiControlled = true;
    const who = absent === 0 ? '玩家一' : '玩家二';
    this.state = {
      ...this.state,
      log: [
        ...this.state.log,
        {
          index: this.state.log.length,
          player: null,
          text: `${who}掉线超过 ${RECONNECT_GRACE_MS / 1000} 秒未重连，改由 AI 接管本方行动`,
        },
      ],
    };
    return true;
  }

  /**
   * 若当前行动方已由 AI 接管，则代其出招。
   * 决策优先在 worker 线程计算（hard 档 4s 搜索不再阻塞事件循环、拖慢全部房间）；
   * worker 不可用 / 超时 / 抛错时回落主线程同步计算。两种路径的兜底语义一致：
   * AI 异常时随机走一步合法动作，宁可下得差也绝不能让对局卡死。
   * 返回是否推进了状态（true 表示调用方需要广播一次 UPDATE）。
   */
  async aiStep(): Promise<boolean> {
    const state = this.state;
    if (!state || state.victory) return false;
    if (this.aiInFlight) return false;

    const actor = activePlayer(state);
    if (actor === null) {
      if (process.env.AI_DEBUG) console.error(`[AI调试] actor=null phase=${state.phase} pending=${JSON.stringify(state.pending)?.slice(0, 160)}`);
      return false;
    }
    if (!this.seats[actor].aiControlled) {
      if (process.env.AI_DEBUG && actor === 1) console.error(`[AI调试] actor=${actor} 未被接管 aiCtl=${this.seats[actor].aiControlled} phase=${state.phase}`);
      return false;
    }
    const actions = legalActions(state, actor);
    if (actions.length === 0) {
      if (process.env.AI_DEBUG) console.error(`[AI调试] 无合法动作 phase=${state.phase} pending=${JSON.stringify(state.pending)?.slice(0, 200)}`);
      return false;
    }

    const pool = getAiPool();
    if (!pool) return this.aiStepSync(state, actor, actions);

    this.aiInFlight = true;
    const t0 = Date.now();
    try {
      let action: GameAction;
      try {
        const decision = await pool.request(state, actor, this.aiDifficulty);
        action = decision.action;
      } catch (err) {
        if (process.env.AI_PROBE === '1') this.probeLog(`worker 决策失败回落同步 room=${this.code} err=${String(err).slice(0, 160)}`);
        // await 期间状态可能已被 NEW_GAME 换掉：先确认再兜底
        if (this.state !== state) return false;
        action = this.aiChooseFallback(actions);
      }
      if (this.state !== state) return false; // 决策期间对局已重开，本步作废
      const id = `ai-${actor}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const res = this.apply(actor, action, id);
      const took = Date.now() - t0;
      if (took > 5000) console.warn(`[AI慢步] ${took}ms(worker) actor=${actor} ${JSON.stringify(action).slice(0, 120)}`);
      if (!res.ok && process.env.AI_DEBUG) console.error(`[AI调试] 动作被拒：${res.reason} ${JSON.stringify(action).slice(0, 160)}`);
      return res.ok;
    } finally {
      this.aiInFlight = false;
    }
  }

  /** M10 打点：各分段耗时，慢段（>1.5s）同步落盘，进程冻结后也能事后定位 */
  private probeLog(text: string): void {
    try {
      appendFileSync(process.env.AI_PROBE_FILE ?? 'aiProbe.log', `${new Date().toISOString()} ${text}\n`);
    } catch { /* 忽略写失败 */ }
  }

  /** AI 异常时的兜底出招：随机合法动作 */
  private aiChooseFallback(actions: GameAction[]): GameAction {
    return actions[Math.floor(Math.random() * actions.length)];
  }

  /** 同步回落路径（worker 不可用时）：旧行为，主线程内完成决策 */
  private aiStepSync(state: GameState, actor: PlayerId, actions: GameAction[]): boolean {
    const probeOn = process.env.AI_PROBE === '1';

    const t0 = Date.now();
    let action: GameAction;
    try {
      const decision = chooseAction(state, actor, this.aiDifficulty);
      action = decision.action;
    } catch (err) {
      if (probeOn) this.probeLog(`chooseAction 抛异常 room=${this.code} err=${String(err).slice(0, 160)}`);
      action = this.aiChooseFallback(actions);
    }
    const tChoose = Date.now();
    if (probeOn && tChoose - t0 > 1500) this.probeLog(`慢段 chooseAction(同步) ${tChoose - t0}ms room=${this.code} actor=${actor} acts=${actions.length}`);

    const id = `ai-${actor}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const res = this.apply(actor, action, id);
    const tApply = Date.now();
    if (probeOn && tApply - tChoose > 1500) this.probeLog(`慢段 apply ${tApply - tChoose}ms room=${this.code} action=${JSON.stringify(action).slice(0, 140)}`);
    if (tApply - t0 > 5000) console.warn(`[AI慢步] ${tApply - t0}ms(同步) actor=${actor} ${JSON.stringify(action).slice(0, 120)}`);
    if (!res.ok && process.env.AI_DEBUG) console.error(`[AI调试] 动作被拒：${res.reason} ${JSON.stringify(action).slice(0, 160)}`);
    return res.ok;
  }

  /**
   * 直接判负。当前默认路径已改为 AI 接管（aiTakeover），
   * 这里保留下来供显式认输等场景使用。
   */
  forfeit(absent: PlayerId): void {
    if (!this.state || this.state.victory) return;
    this.state = {
      ...this.state,
      victory: { type: 'resign', winner: (1 - absent) as PlayerId },
      phase: 'gameOver',
      log: [
        ...this.state.log,
        {
          index: this.state.log.length,
          player: null,
          text: `对手掉线超过 ${RECONNECT_GRACE_MS / 1000} 秒未重连，判负`,
        },
      ],
    };
  }

  undoLast(): void {
    if (this.lastActionState) {
      this.state = this.lastActionState;
      this.lastActionId = null;
      this.lastActionState = null;
      this.sentLog = Math.min(this.sentLog, this.state.log.length);
    }
  }
}
