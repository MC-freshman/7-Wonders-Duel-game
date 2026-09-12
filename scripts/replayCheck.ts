/* ------------------------------------------------------------------
 * 回放一致性校验
 *
 * 验证两件事：
 *   1) 每个动作都恰好在日志中留下一条带 action 的记录（不多不少）
 *   2) 用 { seed, log } 从头重放，任意第 k 帧都与实时对局的第 k 帧完全一致
 *
 * 这是「观战 / 复盘」功能的正确性根基：只要这里通过，
 * UI 上拖动进度条看到的每个画面就都是真实发生过的。
 * ------------------------------------------------------------------ */

import { AGORA, PANTHEON } from './pantheonFlag';
import { activePlayer, applyAction, initialState, legalActions } from '../src/core/engine';
import { entriesForStep, replayActions, replayTo, type ReplaySource } from '../src/core/replay';
import type { GameState } from '../src/core/types';

function rngFor(seed: number): () => number {
  let s = (seed * 7919 + 13) & 0x7fffffff;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

const snap = (s: GameState): string => JSON.stringify(s);

/**
 * 跑一局，返回每一步的实时快照。
 * snapshots[0] = 开局，snapshots[i] = 应用第 i 个动作之后的状态。
 */
function playRecording(seed: number): { snapshots: GameState[]; error: string | null } {
  let state = initialState(seed, { pantheon: PANTHEON, agora: AGORA });
  const snapshots: GameState[] = [state];
  const rng = rngFor(seed);
  let steps = 0;

  while (!state.victory) {
    const actor = activePlayer(state);
    if (actor === null) return { snapshots, error: '无法确定行动玩家' };
    const actions = legalActions(state, actor);
    if (actions.length === 0) {
      return { snapshots, error: `阶段 ${state.phase} 无合法动作但未结束` };
    }
    state = applyAction(state, actions[Math.floor(rng() * actions.length)]);
    snapshots.push(state);
    steps += 1;
    if (steps > 400) return { snapshots, error: '步数超限，疑似死循环' };
  }
  return { snapshots, error: null };
}

const N = Number(process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 100);
const errors: string[] = [];
let checkedGames = 0;
let checkedFrames = 0;
let totalActions = 0;

for (let seed = 1; seed <= N; seed++) {
  const { snapshots, error } = playRecording(seed);
  if (error) {
    errors.push(`seed ${seed}: ${error}`);
    continue;
  }

  const final = snapshots[snapshots.length - 1];
  const source: ReplaySource = { seed, log: final.log, options: { pantheon: PANTHEON, agora: AGORA } };
  const acts = replayActions(final.log);

  // 1) 动作数必须与日志中带 action 的条目数一致
  const applied = snapshots.length - 1;
  totalActions += applied;
  if (acts.length !== applied) {
    errors.push(
      `seed ${seed}: 日志记录了 ${acts.length} 个动作，实际应用了 ${applied} 个`,
    );
    continue;
  }

  // 2) 逐帧比对：重放第 k 帧 == 实时第 k 帧
  let frameError = 0;
  for (let k = 0; k <= applied; k++) {
    const replayed = replayTo(source, k);
    if (snap(replayed) !== snap(snapshots[k])) {
      errors.push(`seed ${seed} 第 ${k} 帧不一致`);
      frameError += 1;
      break;
    }
    checkedFrames += 1;
  }
  if (frameError) continue;

  // 3) 每一步都能取到描述该步的日志条目（复盘面板要用）
  for (let k = 1; k <= applied; k++) {
    if (entriesForStep(final.log, k).length === 0) {
      errors.push(`seed ${seed} 第 ${k} 步取不到日志条目`);
      break;
    }
  }

  checkedGames += 1;
}

console.log(
  `回放校验：${checkedGames} 局通过，共比对 ${checkedFrames} 帧（平均 ${(totalActions / Math.max(1, N)).toFixed(1)} 个动作/局）`,
);
if (errors.length) {
  console.log(`\n发现 ${errors.length} 个问题：`);
  for (const e of errors.slice(0, 20)) console.log('  -', e);
  process.exit(1);
}
console.log('全部通过：日志动作数一致，逐帧重放与实时对局完全相同。');
