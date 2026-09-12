/* ------------------------------------------------------------------
 * 引擎压力测试：用随机策略跑完整对局，验证
 *   1) 不会出现无合法动作却未结束的死锁
 *   2) 三种胜利方式都能正常触发
 *   3) 关键不变量（奇迹上限 7、金币非负、牌数守恒）始终成立
 * ------------------------------------------------------------------ */

import { AGORA, PANTHEON } from './pantheonFlag';
import { activePlayer, applyAction, initialState, legalActions } from '../src/core/engine';
import { CARD_BY_ID } from '../src/core/data/index';
import { isSecretLeaked, publicView } from '../src/core/visibility';
import type { GameState, PlayerId } from '../src/core/types';

/** Pantheon 引入私密信息后，逐帧断言三种视角都无泄漏 */
function assertNoLeak(state: GameState): string | null {
  for (const viewer of [null, 0, 1] as const) {
    const leaks = isSecretLeaked(publicView(state, viewer));
    if (leaks.length > 0) {
      return `viewer=${viewer} 泄漏：${leaks.join(',')}`;
    }
  }
  return null;
}

function assertInvariants(state: GameState): string | null {
  for (const p of [0, 1] as PlayerId[]) {
    const pl = state.players[p];
    if (pl.coins < 0) return `玩家 ${p} 金币为负：${pl.coins}`;
    if (state.wondersBuiltTotal > 7) return `奇迹总数超限：${state.wondersBuiltTotal}`;
    if (pl.wondersBuilt.length + pl.wondersUnbuilt.length > (state.agora ? 8 : state.pantheon ? 5 : 4)) {
      return `玩家 ${p} 奇迹数异常：${pl.wondersBuilt.length}+${pl.wondersUnbuilt.length}`;
    }
    // Pantheon：Astarte 圣库金币不可为负
    if (state.pantheon && pl.pan.astarteCoins < 0) return `玩家 ${p} Astarte 圣库为负`;
    for (const id of pl.city) {
      if (!CARD_BY_ID[id]) return `未知卡牌 ${id}`;
    }
  }
  if (Math.abs(state.conflictPawn) > 9) return `冲突标记越界：${state.conflictPawn}`;
  const unique = new Set(pl(state, 0).concat(pl(state, 1)));
  if (unique.size !== pl(state, 0).length + pl(state, 1).length) return '出现重复卡牌';
  return null;
}

function pl(state: GameState, p: PlayerId): string[] {
  return state.players[p].city;
}

interface Stats {
  games: number;
  steps: number;
  military: number;
  science: number;
  civilian0: number;
  civilian1: number;
  draw: number;
  errors: string[];
}

function runGame(seed: number): { state: GameState; steps: number; error: string | null } {
  let state = initialState(seed, { pantheon: PANTHEON, agora: AGORA });
  let steps = 0;
  const rng = (() => {
    let s = seed * 7919 + 13;
    return () => {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s / 0x7fffffff;
    };
  })();

  while (!state.victory) {
    const actor = activePlayer(state);
    if (actor === null) return { state, steps, error: '无法确定行动玩家' };
    const actions = legalActions(state, actor);
    if (actions.length === 0) {
      return { state, steps, error: `阶段 ${state.phase} 无合法动作但未结束` };
    }
    const picked = actions[Math.floor(rng() * actions.length)];
    state = applyAction(state, picked);
    steps += 1;

    const bad = assertInvariants(state) ?? assertNoLeak(state);
    if (bad) return { state, steps, error: bad };

    if (steps > 400) return { state, steps, error: '步数超限，疑似死循环' };
  }
  return { state, steps, error: null };
}

const N = Number(process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 300);
const stats: Stats = {
  games: 0,
  steps: 0,
  military: 0,
  science: 0,
  civilian0: 0,
  civilian1: 0,
  draw: 0,
  errors: [],
};

for (let seed = 1; seed <= N; seed++) {
  const { state, steps, error } = runGame(seed);
  stats.games += 1;
  stats.steps += steps;
  if (error) {
    stats.errors.push(`seed ${seed}: ${error}`);
    continue;
  }
  const v = state.victory!;
  if (v.type === 'military') stats.military += 1;
  else if (v.type === 'science') stats.science += 1;
  else if (v.type === 'draw') stats.draw += 1;
  else if (v.winner === 0) stats.civilian0 += 1;
  else if (v.winner === 1) stats.civilian1 += 1;
}

console.log(`对局数：${stats.games}，平均步数：${(stats.steps / stats.games).toFixed(1)}${PANTHEON ? "（Pantheon）" : ""}`);
console.log(`军事压制：${stats.military}  科技压制：${stats.science}  终局计分：${stats.civilian0 + stats.civilian1}（先手 ${stats.civilian0} / 后手 ${stats.civilian1}）  平局：${stats.draw}`);
if (stats.errors.length) {
  console.log(`\n发现 ${stats.errors.length} 个问题：`);
  for (const e of stats.errors.slice(0, 20)) console.log('  -', e);
  process.exit(1);
} else {
  console.log('\n全部通过：无死锁、无不变量违规。');
}
