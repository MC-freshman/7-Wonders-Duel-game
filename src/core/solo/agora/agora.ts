/* ------------------------------------------------------------------
 * M8-A Agora Solo 领袖决策逻辑
 *
 * 依据：docs/rules/SOLO_AGORA_DATA.md §2.2–§2.4、§2.8
 *
 * 关键约定：
 *  - 「决策箭头方向」取自本回合抽到的决策卡：
 *      arrow ⟶（本作 direction:'left'）  = 从牌阵最左列起 / 参议院厅 0→5；
 *      arrow ⟵（本作 direction:'right'） = 从最右列起 / 参议院厅 5→0。
 *  - 所有「第一个……」的判定都沿该顺序扫描。
 *  - 只读地挑选动作，实际执行统一交给主引擎 applyAction（零侵入）。
 * ------------------------------------------------------------------ */

import { SENATE_CUBE_SUPPLY, adjacentChambers, districtOf } from '../../data/agora';
import type { GameAction, GameState, PlayerId } from '../../types';
import type { Rng } from '../../rng';
import type { SoloDirection } from '../types';

export interface AgoraCtx {
  state: GameState;
  leaderId: PlayerId;
  /** 本回合决策卡箭头（决定一切「方向」判定） */
  direction: SoloDirection;
  rng: Rng;
}

/* --------------------------- 基础读数 --------------------------- */

/** 供给上限取自 data 层（引擎的放置校验用同一个数，避免两处各写一份 12） */
const TOTAL_CUBES = SENATE_CUBE_SUPPLY;

function foeOf(me: PlayerId): PlayerId {
  return (me === 0 ? 1 : 0) as PlayerId;
}

/** 已在参议院放下的方块数 */
function cubesPlaced(state: GameState, p: PlayerId): number {
  return state.agora ? state.agora.senate.chambers.reduce((s, ch) => s + ch.cubes[p], 0) : 0;
}

/** 领袖面前剩余的影响方块 */
function cubesLeft(ctx: AgoraCtx): number {
  return TOTAL_CUBES - cubesPlaced(ctx.state, ctx.leaderId);
}

function cubeCount(state: GameState, c: number, p: PlayerId): number {
  return state.agora?.senate.chambers[c]?.cubes[p] ?? 0;
}

/** 某厅的控制者（严格多数）；平局或无人 → null */
function controlOf(state: GameState, c: number): PlayerId | null {
  if (!state.agora) return null;
  const a = state.agora.senate.chambers[c].cubes[0];
  const b = state.agora.senate.chambers[c].cubes[1];
  if (a === b) return null;
  return (a > b ? 0 : 1) as PlayerId;
}

/** 玩家控制的厅数 */
function chambersControlledBy(state: GameState, p: PlayerId): number {
  let n = 0;
  for (let c = 0; c < 6; c++) if (controlOf(state, c) === p) n++;
  return n;
}

/** 沿箭头方向的厅顺序 */
function ordered(ctx: AgoraCtx): number[] {
  const base = [0, 1, 2, 3, 4, 5];
  return ctx.direction === 'left' ? base : [...base].reverse();
}

/* ------------------- §2.3 政治家：单次参议院行动 ------------------- */

/**
 * 政治家的一次参议院行动（district = 该政治家标注的分区）。
 * 返回要执行的 SENATE_PLACE / SENATE_MOVE，无法行动时返回 null。
 */
export function politicianAction(ctx: AgoraCtx, district: 'left' | 'center' | 'right' | null): GameAction | null {
  const { state, leaderId: me } = ctx;
  const ord = ordered(ctx);
  const sec = ord.filter((c) => (district ? districtOf(c) === district : true));

  // 1. 先看该分区内「领袖尚未控制的第一个厅」
  if (cubesLeft(ctx) > 0) {
    const t1 = sec.find((c) => controlOf(state, c) !== me);
    if (t1 !== undefined) return { type: 'SENATE_PLACE', player: me, chamber: t1 };
  }

  // 2. 领袖已控制该分区两个厅 → 尝试「移动」
  const controlsAllSection = sec.length > 0 && sec.every((c) => controlOf(state, c) === me);
  if (controlsAllSection) {
    const mv = moveAction(ctx);
    if (mv) return mv;
  }

  // 3. 兜底：该分区内第一个厅放置（无方块可用则不行动）
  if (cubesLeft(ctx) > 0 && sec.length > 0) {
    return { type: 'SENATE_PLACE', player: me, chamber: sec[0] };
  }
  return null;
}

/**
 * §2.3-2 / §2.8「移动」：从「任一方以 >1 差控制的第一个厅」取 1 个领袖方块，
 * 移到「无人控制、或领袖以 1 差控制的第一个厅」。可跨厅（不必相邻）。
 */
export function moveAction(ctx: AgoraCtx): GameAction | null {
  const { state, leaderId: me } = ctx;
  const foe = foeOf(me);
  const ord = ordered(ctx);

  const from = ord.find((c) => {
    if (cubeCount(state, c, me) <= 0) return false; // 领袖须在该厅有方块
    const diff = Math.abs(cubeCount(state, c, me) - cubeCount(state, c, foe));
    return diff > 1;
  });
  if (from === undefined) return null;

  const to = ord.find((c) => {
    if (c === from) return false;
    const mine = cubeCount(state, c, me);
    const his = cubeCount(state, c, foe);
    if (mine === 0 && his === 0) return true; // 无人控制
    return mine === his + 1; // 领袖以 1 差控制
  });
  if (to === undefined) return null;

  // 主引擎只接受「相邻」移动：若不接受，改为「移除再放置」两步由调用方回退
  if (!adjacentChambers(from).includes(to)) return null;
  return { type: 'SENATE_MOVE', player: me, from, to };
}

/**
 * §2.8「移除对方方块」：优先从「你以 1 差控制 / 无人控制」的第一个厅移除对方 1 个方块；
 * 若无此类厅，则从「对方至少有 1 个方块」的第一个厅移除。
 */
export function removeAction(ctx: AgoraCtx): GameAction | null {
  const { state, leaderId: me } = ctx;
  const foe = foeOf(me);
  const ord = ordered(ctx);

  const pref = ord.find((c) => {
    if (cubeCount(state, c, foe) <= 0) return false;
    const mine = cubeCount(state, c, me);
    const his = cubeCount(state, c, foe);
    return mine === his + 1 || (mine === 0 && his === 0);
  });
  if (pref !== undefined) return { type: 'SENATE_REMOVE', player: me, chamber: pref };

  const any = ord.find((c) => cubeCount(state, c, foe) > 0);
  return any !== undefined ? { type: 'SENATE_REMOVE', player: me, chamber: any } : null;
}

/** §2.8「放置」：向领袖未控制的第一个厅放 1 个方块（任意分区） */
export function placeAction(ctx: AgoraCtx): GameAction | null {
  if (cubesLeft(ctx) <= 0) return null;
  const t = ordered(ctx).find((c) => controlOf(ctx.state, c) !== ctx.leaderId);
  const fallback = t ?? ordered(ctx)[0];
  return { type: 'SENATE_PLACE', player: ctx.leaderId, chamber: fallback };
}

/* ----------------------- §2.4 密谋家参议员 ----------------------- */

/** 密谋家二选一：玩家控制 ≥4 厅且领袖仍有方块 → place；否则 conspire */
export function conspiratorChoice(ctx: AgoraCtx): 'place' | 'conspire' {
  const { state } = ctx;
  // §2.4：玩家控制 ≥4 个议事厅 且 领袖仍有影响力方块 → 放置；否则 Conspire
  if (chambersControlledBy(state, 0) >= 4 && cubesLeft(ctx) > 0 && placeAction(ctx)) return 'place';
  return 'conspire';
}

/* --------------------------- 待决选择统一入口 --------------------------- */

/**
 * 从主引擎给出的合法动作中，按 Agora Solo 规则挑一个。
 * 未在扩展规则中明确规定的步骤，采用「首个候选」的确定性回退（不影响可重放性）。
 */
export function chooseAgoraAction(ctx: AgoraCtx, actions: GameAction[]): GameAction | null {
  if (!actions.length) return null;
  const state = ctx.state;
  const step = state.pending?.kind === 'agora' ? state.pending.steps[0] : null;

  // 参议院小操作队列（招募政治家 / 密谋 ops / 军事 token / Knossos）
  if (state.agora && !step) {
    const head = state.agora.ops[0];
    if (head && head.player === ctx.leaderId) {
      if (head.op.kind === 'place') {
        const a = head.op.district && head.op.district !== 'any'
          ? politicianAction(ctx, head.op.district)
          : placeAction(ctx);
        if (a) return a;
      } else if (head.op.kind === 'move') {
        const a = moveAction(ctx);
        if (a) return a;
        if (head.op.optional) {
          const skip = actions.find((x) => x.type === 'CHOOSE_AGORA' && x.choice === 'skip');
          if (skip) return skip;
        }
      } else if (head.op.kind === 'remove') {
        const a = removeAction(ctx);
        if (a) return a;
      }
    }
    // 政治家的剩余参议院行动数
    if (state.agora.senateActionsLeft > 0) {
      const a = politicianAction(ctx, state.agora.politicianDistrict);
      if (a) return a;
      const skip = actions.find((x) => x.type === 'CHOOSE_AGORA' && x.choice === 'skip');
      if (skip) return skip;
    }
  }

  if (!step) return actions[0];

  switch (step.kind) {
    case 'conspiratorChoose': {
      const want = conspiratorChoice(ctx);
      return actions.find((a) => a.type === 'CHOOSE_AGORA' && a.choice === want) ?? actions[0];
    }
    case 'conspireKeep': {
      // 抽到 2 张密谋 → 随机保留 1 张
      const pick = ctx.rng.pick(step.options);
      return actions.find((a) => a.type === 'CHOOSE_AGORA' && a.choice === pick) ?? actions[0];
    }
    case 'conspireDiscard': {
      // 箭头 ⟶（direction:'left'）→ 放牌库顶；箭头 ⟵ → 放牌库底
      const want = ctx.direction === 'left' ? 'top' : 'bottom';
      return actions.find((a) => a.type === 'CHOOSE_AGORA' && a.choice === want) ?? actions[0];
    }
    case 'pickChamber': {
      if (step.purpose === 'moveFrom') {
        const a = moveAction(ctx);
        if (a && a.type === 'SENATE_MOVE') {
          return actions.find((x) => x.type === 'SENATE_MOVE' && x.from === a.from) ?? actions[0];
        }
        return actions[0];
      }
      if (step.purpose === 'remove') {
        const a = removeAction(ctx);
        if (a && a.type === 'SENATE_REMOVE') {
          return actions.find((x) => x.type === 'SENATE_REMOVE' && x.chamber === a.chamber) ?? actions[0];
        }
        return actions[0];
      }
      const a = placeAction(ctx);
      if (a && a.type === 'SENATE_PLACE') {
        return actions.find((x) => x.type === 'SENATE_PLACE' && x.chamber === a.chamber) ?? actions[0];
      }
      return actions[0];
    }
    case 'optMoveOrSkip': {
      const a = moveAction(ctx);
      if (a && a.type === 'SENATE_MOVE') {
        const hit = actions.find((x) => x.type === 'SENATE_MOVE');
        if (hit) return hit;
      }
      const skip = actions.find((x) => x.type === 'CHOOSE_AGORA' && x.choice === 'skip');
      return skip ?? actions[0];
    }
    case 'pickTrigger': {
      // 立即触发 1 张手中密谋（Curia Julia）：优先触发，否则 skip
      const non = actions.find((a) => a.type === 'CHOOSE_AGORA' && a.choice !== 'skip');
      if (non) return non;
      return actions.find((a) => a.type === 'CHOOSE_AGORA' && a.choice === 'skip') ?? actions[0];
    }
    default:
      // pickBuild / pickOppCard / pickOppWonder / pickProgress / pickWonderGive / pickDecreeMove
      // 扩展规则未逐条规定；取首个候选（确定性、可重放）。
      return actions[0];
  }
}

/* --------------------------- 咨询类小工具 --------------------------- */

/** 领袖是否还有面朝下的密谋卡（= 手中的密谋） */
export function hasFaceDownConspiracy(state: GameState, p: PlayerId): boolean {
  return (state.players[p].agora.conspiracies ?? []).length > 0;
}
