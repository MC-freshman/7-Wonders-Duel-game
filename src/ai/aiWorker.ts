import { chooseAction } from './index';
import type { GameAction, GameState, PlayerId } from '../core/types';

/* ------------------------------------------------------------------
 * AI 专用 Web Worker（Vite 原生 module worker）
 *
 * 为什么：hard 难度的搜索时间墙是 4 秒，在主线程同步计算会整段冻结 UI
 * （动画、按钮、心跳全部停摆）。引擎与 AI 都是纯函数，把完整 GameState
 * structuredClone 进 worker、把决策传回来即可，零共享状态。
 *
 * 失败语义：worker 崩溃 / 超时由调用方（useLocalGame）回落到主线程同步
 * 计算——慢一点但永远能出招，不影响正确性。
 * ------------------------------------------------------------------ */

export type AiDifficulty = 'easy' | 'medium' | 'hard';

export interface AiWorkerRequest {
  id: number;
  state: GameState;
  me: PlayerId;
  difficulty: AiDifficulty;
}

export type AiWorkerResponse =
  | { id: number; ok: true; action: GameAction; degraded: boolean }
  | { id: number; ok: false; error: string };

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<AiWorkerRequest>) => void) | null;
  postMessage(msg: AiWorkerResponse): void;
};

ctx.onmessage = (e) => {
  const { id, state, me, difficulty } = e.data;
  try {
    const decision = chooseAction(state, me, difficulty);
    ctx.postMessage({
      id,
      ok: true,
      action: decision.action,
      degraded: decision.degraded === true,
    });
  } catch (err) {
    ctx.postMessage({ id, ok: false, error: String(err) });
  }
};
