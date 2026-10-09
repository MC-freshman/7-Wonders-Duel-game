import { Worker } from 'node:worker_threads';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Difficulty } from '../src/ai/index';
import type { GameAction, GameState, PlayerId } from '../src/core/types';
import type { AiNodeResponse } from './aiWorkerNode';

/* ------------------------------------------------------------------
 * AI 决策线程池（单 worker 足够：同一房间一回合一步，请求天然排队）
 *
 * 入口解析：dev（tsx 直跑 TS 源）用 aiWorkerNode.ts；esbuild 产物
 * （dist-server/server.mjs）用同目录的 aiWorkerNode.mjs（server:build
 * 的第二个入口）。两者都不在时返回 null，调用方回落主线程同步计算。
 * AI_WORKER=0 可显式停用（排查用）。
 * ------------------------------------------------------------------ */

export interface AiDecision {
  action: GameAction;
}

export interface AiPool {
  request(state: GameState, me: PlayerId, difficulty: Difficulty): Promise<AiDecision>;
}

/** worker 决策超时：hard 时间墙 4s + 克隆/排队余量 */
const REQUEST_TIMEOUT_MS = 12_000;

let singleton: AiPool | null | undefined;

function resolveWorkerUrl(): URL | null {
  const here = new URL('.', import.meta.url);
  for (const rel of ['./aiWorkerNode.ts', './aiWorkerNode.mjs']) {
    const candidate = new URL(rel, here);
    if (existsSync(fileURLToPath(candidate))) return candidate;
  }
  return null;
}

function createPool(): AiPool {
  const url = resolveWorkerUrl();
  if (!url) throw new Error('AI worker 入口不存在（既无 TS 源也无打包产物）');
  const worker = new Worker(url);
  const pending = new Map<number, { resolve: (d: AiDecision) => void; reject: (e: Error) => void }>();
  let nextId = 1;
  let broken = false;

  worker.on('message', (msg: AiNodeResponse) => {
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.ok) p.resolve({ action: msg.action });
    else p.reject(new Error(msg.error));
  });
  const failAll = (err: Error) => {
    broken = true;
    for (const p of pending.values()) p.reject(err);
    pending.clear();
  };
  worker.on('error', (err) => failAll(err));
  worker.on('exit', (code) => {
    if (code !== 0) failAll(new Error(`AI worker 异常退出：code ${code}`));
  });

  return {
    request(state, me, difficulty) {
      if (broken) return Promise.reject(new Error('AI worker 已失效'));
      const id = nextId++;
      return new Promise<AiDecision>((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error('AI worker 响应超时'));
        }, REQUEST_TIMEOUT_MS);
        pending.set(id, {
          resolve: (d) => {
            clearTimeout(timer);
            resolve(d);
          },
          reject: (e) => {
            clearTimeout(timer);
            reject(e);
          },
        });
        worker.postMessage({ id, state, me, difficulty });
      });
    },
  };
}

/** 进程级单例；不可用时返回 null（room.aiStep 回落同步计算） */
export function getAiPool(): AiPool | null {
  if (singleton !== undefined) return singleton;
  if (process.env.AI_WORKER === '0') {
    singleton = null;
    return null;
  }
  try {
    singleton = createPool();
    console.log('[AI] 决策已在 worker 线程执行（主线程不再被 hard 档搜索阻塞）');
  } catch (err) {
    console.warn('[AI] worker 线程不可用，回落主线程同步计算：', String(err));
    singleton = null;
  }
  return singleton;
}
