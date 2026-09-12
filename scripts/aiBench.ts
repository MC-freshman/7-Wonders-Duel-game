/* AI 强度与耗时基准：各难度互相对抗，并统计单步耗时 */

import { AGORA, PANTHEON } from './pantheonFlag';
import { activePlayer, applyAction, initialState, legalActions } from '../src/core/engine';
import { chooseAction, type Difficulty } from '../src/ai/index';
import type { GameState, PlayerId } from '../src/core/types';

function randomAgent(state: GameState, me: PlayerId, rnd: () => number): GameState {
  const actions = legalActions(state, me);
  return applyAction(state, actions[Math.floor(rnd() * actions.length)]);
}

function play(
  seed: number,
  agent0: (s: GameState, p: PlayerId) => GameState,
  agent1: (s: GameState, p: PlayerId) => GameState,
): { winner: PlayerId | null; type: string; steps: number; ms0: number; ms1: number; maxMs: number } {
  let state = initialState(seed, { pantheon: PANTHEON, agora: AGORA });
  let steps = 0;
  let ms0 = 0;
  let ms1 = 0;
  let maxMs = 0;
  while (!state.victory && steps < 400) {
    const actor = activePlayer(state)!;
    const t0 = performance.now();
    state = actor === 0 ? agent0(state, actor) : agent1(state, actor);
    const dt = performance.now() - t0;
    if (actor === 0) ms0 += dt;
    else ms1 += dt;
    maxMs = Math.max(maxMs, dt);
    steps += 1;
  }
  return {
    winner: state.victory?.winner ?? null,
    type: state.victory?.type ?? 'timeout',
    steps,
    ms0,
    ms1,
    maxMs,
  };
}

const rnd = (() => {
  let s = 12345;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
})();

const mkAi = (d: Difficulty) => (s: GameState, p: PlayerId) =>
  applyAction(s, chooseAction(s, p, d).action);

const N = Number(process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 12);
const JSON_OUT = process.argv.find((a) => a.startsWith('--json='))?.slice(7) ?? null;

const jsonOut = {
  generatedAt: new Date().toISOString(),
  games: N,
  pantheon: PANTHEON,
  agora: AGORA,
  vsRandom: {} as Record<string, unknown>,
  headToHead: {} as Record<string, unknown>,
};

for (const diff of ['easy', 'medium', 'hard'] as Difficulty[]) {
  let wins = 0;
  let totalMs = 0;
  let maxStep = 0;
  for (let seed = 1; seed <= N; seed++) {
    const r = play(seed, mkAi(diff), (s, p) => randomAgent(s, p, rnd));
    if (r.winner === 0) wins += 1;
    totalMs += r.ms0;
    maxStep = Math.max(maxStep, r.maxMs);
  }
  (jsonOut.vsRandom as Record<string, unknown>)[diff] = {
    winRate: wins / N,
    avgGameMs: Math.round(totalMs / N),
    maxStepMs: Math.round(maxStep),
  };
  console.log(
    `${diff.padEnd(6)} vs 随机：胜率 ${((wins / N) * 100).toFixed(0)}%  ` +
      `平均单局耗时 ${(totalMs / N).toFixed(0)}ms  单步峰值 ${maxStep.toFixed(0)}ms`,
  );
}

console.log('');
for (const [a, b] of [
  ['medium', 'easy'],
  ['hard', 'medium'],
] as [Difficulty, Difficulty][]) {
  let wins = 0;
  let totalMs = 0;
  let maxStep = 0;
  for (let seed = 1; seed <= N; seed++) {
    // 双方轮流担任先手，消除先手优势
    const swap = seed % 2 === 0;
    const r = swap
      ? play(seed, mkAi(b), mkAi(a))
      : play(seed, mkAi(a), mkAi(b));
    const winner = swap ? (r.winner === 0 ? 1 : r.winner === 1 ? 0 : null) : r.winner;
    if (winner === 0) wins += 1;
    totalMs += swap ? r.ms1 : r.ms0;
    maxStep = Math.max(maxStep, r.maxMs);
  }
  (jsonOut.headToHead as Record<string, unknown>)[`${a}-vs-${b}`] = {
    winRate: wins / N,
    avgGameMs: Math.round(totalMs / N),
    maxStepMs: Math.round(maxStep),
  };
  console.log(
    `${a} vs ${b}：${a} 胜率 ${((wins / N) * 100).toFixed(0)}%  ` +
      `平均单局耗时 ${(totalMs / N).toFixed(0)}ms  单步峰值 ${maxStep.toFixed(0)}ms`,
  );
}

if (JSON_OUT) {
  const { writeFileSync } = await import('node:fs');
  writeFileSync(JSON_OUT, JSON.stringify(jsonOut, null, 2));
  console.log(`基线已写入 ${JSON_OUT}`);
}
