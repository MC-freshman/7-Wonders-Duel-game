import { parentPort } from 'node:worker_threads';
import { chooseAction, type Difficulty } from '../src/ai/index';
import type { GameAction, GameState, PlayerId } from '../src/core/types';

/* ------------------------------------------------------------------
 * AI 决策 worker（node:worker_threads）
 *
 * 为什么：AI 与对局服务器同进程，hard 难度单步最长 4s 的同步搜索会拖慢
 * 全部房间的心跳与广播。把决策移到工作线程，主线程事件循环保持畅通。
 * 引擎是纯函数，完整 GameState 结构化克隆进出，零共享状态。
 *
 * 打包：server:build 会把本文件单独 bundle 成 dist-server/aiWorkerNode.mjs
 * （与 server.mjs 同目录），aiPool.ts 按运行形态自动选 TS 源或产物。
 * ------------------------------------------------------------------ */

export interface AiNodeRequest {
  id: number;
  state: GameState;
  me: PlayerId;
  difficulty: Difficulty;
}

export type AiNodeResponse =
  | { id: number; ok: true; action: GameAction }
  | { id: number; ok: false; error: string };

if (!parentPort) {
  throw new Error('aiWorkerNode 只能作为 worker 线程入口运行');
}

parentPort.on('message', (req: AiNodeRequest) => {
  try {
    const decision = chooseAction(req.state, req.me, req.difficulty);
    const res: AiNodeResponse = { id: req.id, ok: true, action: decision.action };
    parentPort!.postMessage(res);
  } catch (err) {
    const res: AiNodeResponse = { id: req.id, ok: false, error: String(err) };
    parentPort!.postMessage(res);
  }
});
