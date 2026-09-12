import { applyAction, initialState } from './engine';
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
 * ------------------------------------------------------------------ */

/** 一局可回放所需的最小数据 */
export interface ReplaySource {
  seed: number;
  log: LogEntry[];
  /** 开局选项（Pantheon 等扩展）——重放必须用同一套初始设置 */
  options?: GameStateOptions;
  /** 可选的双方名称，纯展示用 */
  names?: [string, string];
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
 */
export function replayTo(source: ReplaySource, n: number): GameState {
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
