/* ------------------------------------------------------------------
 * Agora 参议院方块供给校验（官方每人 12 枚，docs/rules/AGORA_DATA.md §1）
 *
 * 背景：引擎此前完全没有「手里还有几枚方块」的概念，任何「放置」都无条件 +1，
 * 于是密谋 / 军事 token / Knossos / 政治家行动数叠起来可以让一方摆出第 13 枚。
 * 随机仿真很难自然走到（需要净增 >12），所以这里**直接构造边界状态**做确定性断言，
 * 另加一段 soak 兜底。
 *
 * 用法：npm run check:senate -- [soak 局数，默认 150]
 * 自证：把 engine.ts 的 placeCube 守卫去掉后本脚本必须变红（修复前实测为红）。
 * ------------------------------------------------------------------ */

import { activePlayer, applyAction, initialState, legalActions } from '../src/core/engine';
import { SENATE_CUBE_SUPPLY } from '../src/core/data/agora';
import { Rng } from '../src/core/rng';
import type { GameAction, GameState, PlayerId } from '../src/core/types';

const SOAK = Number(process.argv[2]) || 150;
const failures: string[] = [];

function check(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? `　${detail}` : ''}`);
  if (!ok) failures.push(name);
}

const cubesOf = (state: GameState, p: PlayerId): number =>
  state.agora!.senate.chambers.reduce((s, ch) => s + ch.cubes[p], 0);

/** 造一个「已过开局、双方都能行动」的中局状态（随机合法动作推进 steps 步） */
function midGame(seed: number, steps = 45): GameState {
  let state = initialState(seed, { agora: true });
  const rng = new Rng(seed);
  for (let i = 0; i < 600; i++) {
    if (state.victory || state.phase === 'gameOver') return midGame(seed + 1, steps);
    if (i >= steps && state.phase === 'playing' && !state.pending) return state;
    const actor = activePlayer(state);
    if (actor === null) break;
    const acts = legalActions(state, actor);
    if (!acts.length) break;
    state = applyAction(state, acts[Math.floor(rng.float() * acts.length)]);
  }
  return state;
}

/** 把 p 的方块摆到 0 号议厅；`left` = 手里还剩几枚（默认 0 = 全部摆出） */
function exhaust(state: GameState, p: PlayerId, left = 0): GameState {
  const placed = SENATE_CUBE_SUPPLY - left;
  const s = structuredClone(state) as GameState;
  s.agora!.senate.chambers.forEach((ch, i) => {
    ch.cubes[p] = i === 0 ? placed : 0;
    ch.controller = i === 0 && placed > 0 ? p : null;
  });
  return s;
}

/* ---------------- 1. 招募政治家的「放置」行动数：无方块时不得摆出第 13 枚 ---------------- */
{
  const state = exhaust(midGame(20260916), 0);
  state.phase = 'playing';
  state.current = 0;
  state.pending = null;
  state.agora!.ops = [];
  state.agora!.senateActionsLeft = 2;
  state.agora!.politicianDistrict = null;
  state.agora!.endTurnAfterOps = true;

  const placeOptions = legalActions(state, 0).filter((a) => a.type === 'SENATE_PLACE');
  check('方块用尽时不枚举任何 SENATE_PLACE', placeOptions.length === 0, `枚举到 ${placeOptions.length} 个`);

  // 即便客户端硬塞一个放置（联机恶意 / 脚本 bug），也必须被引擎拒绝
  const forced: GameAction = { type: 'SENATE_PLACE', player: 0, chamber: 3 };
  const after = applyAction(state, forced);
  check(
    '硬塞放置也不摆出第 13 枚',
    cubesOf(after, 0) === SENATE_CUBE_SUPPLY,
    `实际 ${cubesOf(after, 0)} 枚`,
  );
}

/* ---------------- 2. 只剩 1 枚方块却排了两次放置：第二次必须被丢弃，回合不得卡住 ---------------- */
{
  const state = exhaust(midGame(20260917), 0, 1);
  state.phase = 'playing';
  state.current = 0;
  state.pending = null;
  state.agora!.senateActionsLeft = 0;
  state.agora!.endTurnAfterOps = true;
  state.agora!.ops = [
    { player: 0, op: { kind: 'place', district: 'any' } },
    { player: 0, op: { kind: 'place', district: 'any' } },
  ];

  const acts = legalActions(state, 0).filter((a) => a.type === 'SENATE_PLACE');
  check('手里还有 1 枚时仍可放置', acts.length > 0, `枚举到 ${acts.length} 个落点`);

  const after = applyAction(state, acts[0]);
  check('摆出第 12 枚', cubesOf(after, 0) === SENATE_CUBE_SUPPLY, `实际 ${cubesOf(after, 0)} 枚`);
  const starved = after.agora!.ops.filter((o) => o.player === 0 && o.op.kind === 'place');
  check('排不掉的第二放置被丢弃而非卡住回合', starved.length === 0, `残留 ${starved.length} 个`);
  const nextActor = after.victory ? null : activePlayer(after);
  check(
    '回合继续可推进',
    nextActor === null || legalActions(after, nextActor).length > 0,
    nextActor === null ? '已终局' : `actor=${nextActor}`,
  );
}

/* ---------------- 3. soak：每步断言双方都不超上限 ---------------- */
{
  let worst = 0;
  let broken: string | null = null;
  for (let g = 0; g < SOAK && !broken; g++) {
    const seed = (g * 2654435761 + 1013) >>> 0;
    const pantheon = g % 2 === 0;
    let state = initialState(seed, { agora: true, pantheon });
    const rng = new Rng(seed);
    for (let i = 0; i < 3000; i++) {
      const actor = activePlayer(state);
      if (actor === null) {
        broken = `seed=${seed} 第 ${i} 步无行动方（phase=${state.phase}，victory=${!!state.victory}）`;
        break;
      }
      const acts = legalActions(state, actor);
      if (!acts.length) {
        broken = `seed=${seed} 第 ${i} 步无合法动作（actor=${actor}，phase=${state.phase}）`;
        break;
      }
      state = applyAction(state, acts[Math.floor(rng.float() * acts.length)]);
      for (const p of [0, 1] as PlayerId[]) worst = Math.max(worst, cubesOf(state, p));
      const over = ([0, 1] as PlayerId[]).find((p) => cubesOf(state, p) > SENATE_CUBE_SUPPLY);
      if (over !== undefined) {
        broken = `seed=${seed} 第 ${i} 步 p${over} 方块 ${cubesOf(state, over)} > ${SENATE_CUBE_SUPPLY}`;
        break;
      }
      if (state.victory || state.phase === 'gameOver') break;
    }
  }
  check(`soak ${SOAK} 局（Agora / 合体）不超上限`, !broken, `峰值 ${worst} 枚${broken ? `　${broken}` : ''}`);
}

console.log(failures.length ? `\n❌ ${failures.length} 项未通过：${failures.join('、')}\n` : '\n✅ 参议院方块供给校验全部通过\n');
if (failures.length) process.exit(1);
