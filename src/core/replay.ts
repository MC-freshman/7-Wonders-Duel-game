import { applyAction, initialState } from './engine';
import {
  createSoloGame,
  leaderMustAct,
  soloApplyAction,
  soloFinalizeVictory,
  soloLeaderTurn,
  waitsForPlayerPending,
} from './solo/index';
import type { SoloGame } from './solo/index';
import type { GameAction, GameState, GameStateOptions, LogEntry } from './types';

/* ------------------------------------------------------------------
 * 对局回放
 *
 * 引擎是纯函数式的，随机流（rngState）随状态传递，因此
 *   初始状态由 seed 唯一决定，且相同动作序列必然得到相同结果。
 * 于是「回放」不需要保存每一步快照，只要保存 { seed, log }：
 * 从头重放 log 中记录的动作即可还原任意一帧。
 *
 * 依赖：engine.ts 保证「每个动作的第一条日志携带 action」。
 *
 * Solo（M8）额外一层：对手是算法化的领袖，其回合会消耗**独立的** solo 随机流
 * （决策牌堆重洗、rng.pick 选发展标记…），这些消耗不落日志。
 * 但领袖的**每个动作**本身都在日志里（`soloApplyAction` 走主引擎），且日志的
 * `action.player` 天然带出了「领袖段 / 玩家段」的交替顺序。
 * 故 Solo 回放 = 同一份 { seed, log }，按日志顺序交替驱动：
 *   轮到领袖 → 跑 `soloLeaderTurn`（自动重走当时的随机流）；否则 → 应用下一条动作。
 * 见 `createSoloRunner` 与 `solo/index.ts` 的 `leaderMustAct`。
 * ------------------------------------------------------------------ */

/** Solo 复盘所需的额外元数据（主链路的 { seed, log } 之外） */
export interface SoloReplayMeta {
  /** 本局领袖座位（当前实现恒为 1） */
  leaderId: 0 | 1;
  /** 本局领袖 id —— 决定领袖的取牌偏好与开局标记，复盘必须用同一位 */
  leader: string;
  /**
   * 实况建局时领袖是否「随机抽取」（玩家在 SoloBar 里选了「随机」）。
   * 重建须传同一形式的入参：随机 → `undefined`（同一 seed 抽到的仍是同一位），
   * 指定 → 该 id。两者随机流派生不同（id 会散列进种子），传错即整局错位。
   */
  leaderRandom: boolean;
}

/** 一局可回放所需的最小数据 */
export interface ReplaySource {
  seed: number;
  log: LogEntry[];
  /** 开局选项（Pantheon 等扩展）——重放必须用同一套初始设置 */
  options?: GameStateOptions;
  /** 可选的双方名称，纯展示用 */
  names?: [string, string];
  /** 存在即表示这是 Solo 对局：重放时需按日志交替驱动领袖回合 */
  solo?: SoloReplayMeta;
}

/**
 * 从日志中抽出实际发生过的动作序列。
 *
 * 日志里还有大量「派生条目」（翻开、进入军事区块、时代开始…）不带 action，
 * 它们只是文本，重放时会被跳过。
 */
export function replayActions(log: LogEntry[]): GameAction[] {
  const out: GameAction[] = [];
  for (const e of log) {
    if (e.action) out.push(e.action);
  }
  return out;
}

/** 总动作数（= 可回放的帧数上限） */
export function replayLength(log: LogEntry[]): number {
  let n = 0;
  for (const e of log) if (e.action) n += 1;
  return n;
}

/**
 * 重放到「已应用前 n 个动作」的状态。
 *
 * n = 0 得到开局状态，n = 动作总数 得到终局状态。
 * 每次调用都从 initialState 重算：单局约 70 个动作，重放耗时可忽略，
 * 换来的是任意跳转都无需维护快照数组。
 *
 * Solo 源走 `createSoloRunner`（同样从 seed 重建，但中间要交替驱动领袖回合）。
 */
export function replayTo(source: ReplaySource, n: number): GameState {
  if (source.solo) return createSoloRunner(source).state();
  const acts = replayActions(source.log);
  const clamped = Math.max(0, Math.min(n, acts.length));
  let state = initialState(source.seed, source.options ?? {});
  for (let i = 0; i < clamped; i++) {
    state = applyAction(state, acts[i]);
  }
  return state;
}

/**
 * 第 n 步「这一帧」对应的日志条目：
 * 从该动作所在条目起，到下一个动作之前的所有派生条目。
 * 用于在复盘时展示「这一步发生了什么」。
 */
export function entriesForStep(log: LogEntry[], n: number): LogEntry[] {
  if (n <= 0) return [];
  let seen = 0;
  let start = -1;
  let end = log.length;
  for (let i = 0; i < log.length; i++) {
    if (log[i].action) {
      seen += 1;
      if (seen === n) start = i;
      else if (seen === n + 1) {
        end = i;
        break;
      }
    }
  }
  if (start < 0) return [];
  return log.slice(start, end);
}

/* ================================ Solo ================================ */

/** Solo 复盘顶条（`SoloBar` 只读态）所需的信息，取自重放到当前帧的句柄 */
export interface SoloRunInfo {
  leader: SoloGame['leader'];
  /** 走到这一帧时领袖手上的决策卡（尚无则为 null） */
  lastDecision: SoloGame['lastDecision'];
  deckSize: number;
  deckLeft: number;
  pantheon: boolean;
  agora: boolean;
}

/**
 * Solo 重放器：把 { seed, log } 还原成「交替驱动」的时间线。
 *
 * 帧号 = 已施加的**玩家**动作数（`total` 同口径）。领袖的动作虽然也在日志里，
 * 但由 `soloLeaderTurn` 在轮到领袖时整段推演完成——一帧之内可能含领袖多步（连动），
 * 故不作为独立帧；玩家侧看到的时间线因此是「我走一步 → 领袖答一段」。
 * 前进是增量的；向后跳从 seed 重建（单局约 60 个玩家动作，重建在毫秒级）。
 * 只读使用：请勿对 `game` 做实况侧的写操作。
 */
export interface SoloRunner {
  readonly game: SoloGame;
  /** 已施加的玩家动作数 */
  readonly frame: number;
  /** 本局玩家动作总数（= 可回放的帧数上限） */
  readonly total: number;
  /** 重放到第 n 帧（自动钳制到 [0, total]） */
  seek(n: number): SoloRunInfo;
  /** 当前帧的画面 */
  state(): GameState;
  /** 当前帧的 Solo 顶条信息 */
  info(): SoloRunInfo;
}

export function createSoloRunner(source: ReplaySource): SoloRunner {
  const soloOpts = {
    agora: source.options?.agora === true,
    pantheon: source.options?.pantheon === true,
  };
  const meta: SoloReplayMeta =
    source.solo ?? (() => {
      throw new Error('createSoloRunner：source 缺少 solo 元数据');
    })();

  /** 与实况同入参建局：随机开局走 undefined、指定开局走该 id，随机流才逐位一致 */
  function build(): SoloGame {
    return createSoloGame(
      source.seed,
      meta.leaderRandom ? undefined : meta.leader,
      soloOpts,
    );
  }

  let game = build();
  /** 终局修正只施加一次（`soloFinalizeVictory` 就地累加，非幂等） */
  let finalized = false;
  /**
   * 日志里的全部动作，构造时按当前日志冻结（自检装置须以「当前帧的 log」重建，
   * 见 soloReplayCheck —— 主引擎 `applyAction` 每帧 `structuredClone`，日志是新数组）。
   */
  const acts = replayActions(source.log);

  /** 帧号 = 重放器自身日志里的动作数，与实况 `replayLength` 严格同口径 */
  const len = () => replayLength(game.state.log);

  function rewind(): void {
    game = build();
    finalized = false;
  }

  /**
   * 推进一帧。
   *
   * ⚠️ 领袖必须「一次一段」，与 `useSoloGame.drive` 的
   * `while (leaderMustAct) soloLeaderTurn(game)` 逐次同构：一段可能产出多条动作
   * （连动 / 待决），此时帧号一次跨过若干格——实况的复盘刻度本来就以「段」为单位。
   * 少跑或多跑一次 `soloLeaderTurn` 都会让 solo 随机流错位。
   */
  function step(): void {
    if (leaderMustAct(game) && !waitsForPlayerPending(game)) {
      soloLeaderTurn(game);
      return;
    }
    const a = acts[len()];
    if (!a) throw new Error('soloReplay: 玩家动作已用尽但仍需前进');
    if (a.player === game.leaderId) {
      throw new Error('soloReplay: 实况此处是领袖动作，重放却认为轮到玩家 —— 驱动已分叉');
    }
    soloApplyAction(game, a);
  }

  function seek(n: number): SoloRunInfo {
    const target = Math.max(0, Math.min(n, acts.length));
    if (target < len()) rewind();
    let guard = 0;
    while (len() < target) {
      step();
      if (guard++ > 4000) throw new Error('soloReplay: 推进超过 4000 步未到达目标帧');
    }
    /* 收束时不再多驱动领袖：目标帧之后若还有领袖回应，那是后面的帧。
       终局修正（Hammurabi +5）是就地累加、并非幂等，故用标志只施加一次。 */
    if (target === acts.length && !finalized) {
      soloFinalizeVictory(game);
      finalized = true;
    }
    return info();
  }

  function info(): SoloRunInfo {
    return {
      leader: game.leader,
      lastDecision: game.lastDecision,
      deckSize: game.decisionCards.length,
      deckLeft: game.deck.length - game.deckIndex,
      pantheon: !!game.pantheon,
      agora: !!game.agora,
    };
  }

  return {
    get game() {
      return game;
    },
    get frame() {
      return len();
    },
    get total() {
      return acts.length;
    },
    seek,
    state: () => game.state,
    info,
  };
}
