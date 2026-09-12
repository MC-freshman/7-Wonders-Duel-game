/* 联机方案前置测量：状态体积、牌阵像素尺寸、单局动作数 */

import { activePlayer, applyAction, initialState, legalActions } from '../src/core/engine';
import { parseLayout } from '../src/core/layout';
import type { GameState } from '../src/core/types';

const CARD_W = 92;
const CARD_H = 128;
const CHAR_W = CARD_W / 2;
const ROW_H = 62;

console.log('【牌阵像素尺寸】');
for (const age of [1, 2, 3] as const) {
  const slots = parseLayout(age);
  const maxRow = Math.max(...slots.map((s) => s.row));
  const maxCol = Math.max(...slots.map((s) => s.col));
  const w = maxCol * CHAR_W + CARD_W;
  const h = maxRow * ROW_H + CARD_H;
  console.log(`  时代 ${age}: ${w} × ${h} px  （iPhone 375 宽需缩放 ${(375 / w).toFixed(2)}）`);
}

console.log('\n【状态体积】');
let rnd = 42;
const next = () => {
  rnd = (rnd * 1103515245 + 12345) & 0x7fffffff;
  return rnd / 0x7fffffff;
};
let state: GameState = initialState(7);
let steps = 0;
let maxJson = 0;
const snapshots: number[] = [];
while (!state.victory && steps < 400) {
  const actor = activePlayer(state);
  if (actor === null) break;
  const acts = legalActions(state, actor);
  if (acts.length === 0) break;
  state = applyAction(state, acts[Math.floor(next() * acts.length)]);
  steps += 1;
  const size = JSON.stringify(state).length;
  maxJson = Math.max(maxJson, size);
  if (steps % 15 === 0) snapshots.push(size);
}
console.log(`  单局动作数 ${steps}`);
console.log(`  JSON 峰值 ${(maxJson / 1024).toFixed(1)} KB`);
console.log(`  采样(每15步): ${snapshots.map((s) => (s / 1024).toFixed(1) + 'KB').join(' → ')}`);

// 剥离日志后的体积（日志可单独增量下发）
const { log, ...rest } = state;
void log;
console.log(`  去掉日志后 ${(JSON.stringify(rest).length / 1024).toFixed(1)} KB`);
console.log(`  日志条数 ${state.log.length}`);

console.log('\n【分支因子】');
for (const age of [1, 2, 3] as const) {
  let s2: GameState = initialState(11);
  let guard = 0;
  while ((s2.age < age || s2.phase !== 'playing') && guard < 300 && !s2.victory) {
    const a = activePlayer(s2);
    if (a === null) break;
    const acts = legalActions(s2, a);
    if (acts.length === 0) break;
    s2 = applyAction(s2, acts[Math.floor(next() * acts.length)]);
    guard += 1;
  }
  if (s2.phase === 'playing') {
    const a = activePlayer(s2)!;
    console.log(`  时代 ${age} 开局合法动作数 ${legalActions(s2, a).length}`);
  }
}
