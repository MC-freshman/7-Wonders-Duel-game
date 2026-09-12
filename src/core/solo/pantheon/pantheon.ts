/* ------------------------------------------------------------------
 * M8-P Pantheon Solo —— 领袖侧「按 Pantheon Solo 规则挑动作」的纯决策模块
 *
 * 设计：本文件**只做决策**（返回 GameAction），不改状态、不导入 solo.ts，
 * 保证依赖单向：solo.ts → pantheon/*。状态改动一律交回主引擎 applyAction。
 *
 * 规则依据：docs/rules/SOLO_PANTHEON_DATA.md §2 / §3。
 * ------------------------------------------------------------------ */

import { CARD_BY_ID, DIVINITY_BY_ID } from '../../data/index';
import type { CardDef, GameAction, GameState, Mythology, PantheonStep } from '../../types';
import { SOLO_COLOR_TO_TYPE } from '../data';
import type { SoloCardColor, SoloDecisionCardDef, SoloGame, SoloLeaderDef } from '../types';

/* ------------------------------ 箭头方向 ------------------------------ */

/**
 * 万神殿图板 6 格的「按箭头方向」遍历顺序。
 * ⟶（from left to right，本作 direction:'left'）= 从左端起 → 槽位 0→5；
 * ⟵（from right to left，direction:'right'）= 从右端起 → 槽位 5→0。
 */
export function arrowOrder(direction: 'left' | 'right'): number[] {
  return direction === 'left' ? [0, 1, 2, 3, 4, 5] : [5, 4, 3, 2, 1, 0];
}

/** 按箭头方向找到万神殿**第一个空位**（时代 I 放神格用） */
export function firstEmptyPantheonSlot(
  state: GameState,
  direction: 'left' | 'right',
): number | null {
  const pan = state.pantheon;
  if (!pan) return null;
  for (const pos of arrowOrder(direction)) {
    if (pan.board[pos] === null) return pos;
  }
  return null;
}

/** 按箭头方向找到**第一个已翻开的可用神格位**（时代 II/III 的 Pantheon 图标用） */
export function firstAvailableDivinity(
  state: GameState,
  direction: 'left' | 'right',
): number | null {
  const pan = state.pantheon;
  if (!pan) return null;
  for (const pos of arrowOrder(direction)) {
    if (pan.board[pos] !== null && pan.revealed[pos]) return pos;
  }
  return null;
}

/* ------------------------------ 偏好解析 ------------------------------ */

type ColorPref = { kind: 'color'; color: SoloCardColor };
type Pref = ColorPref | { kind: 'link' };

/**
 * 决策卡 → 领袖偏好序。null 槽位 = 「领袖色」；Imhotep（preferLink）时理解为
 * 「可用链接符号建造的卡」。非时代 III 过滤紫色（与 base Solo 一致）。
 */
export function leaderPrefs(
  leader: SoloLeaderDef,
  card: SoloDecisionCardDef,
  age: number,
): Pref[] {
  const resolve = (slot: SoloCardColor | null): Pref =>
    slot === null
      ? leader.preferLink
        ? { kind: 'link' }
        : { kind: 'color', color: leader.cardColor }
      : { kind: 'color', color: slot };
  const prefs: Pref[] = [
    resolve(card.primaryColor),
    resolve(card.secondaryColor),
    resolve(card.tertiaryColor),
  ];
  return age === 3
    ? prefs
    : prefs.filter((p) => !(p.kind === 'color' && p.color === 'purple'));
}

/** 领袖「自己的颜色」偏好（Zeus 的「非其偏好色」判定用） */
function ownColorPref(leader: SoloLeaderDef): Pref {
  return leader.preferLink ? { kind: 'link' } : { kind: 'color', color: leader.cardColor };
}

function matchesPref(card: CardDef | null | undefined, pref: Pref): boolean {
  if (!card) return false;
  if (pref.kind === 'link') return card.freeLink != null;
  return card.type === SOLO_COLOR_TO_TYPE[pref.color];
}

/** 反转偏好序的「第 1 选」：既不是绿、也不是红、也不是领袖偏好色 */
function isOutside(card: CardDef | null | undefined, leader: SoloLeaderDef): boolean {
  if (!card) return false;
  if (card.type === 'scientific' || card.type === 'military') return false;
  return !matchesPref(card, ownColorPref(leader));
}

/** 按偏好序从候选卡 id 中挑第一张 */
function pickCardByPrefs(candidates: string[], prefs: Pref[]): string | null {
  for (const pref of prefs) {
    const hit = candidates.find((id) => matchesPref(CARD_BY_ID[id], pref));
    if (hit) return hit;
  }
  return null;
}

/* ------------------------------ 待决步骤分派 ------------------------------ */

/** 时代 I 领袖只取堆顶，另一张应放回牌堆——暂存到此处供 solo 侧回填 */
export interface PantheonSpare {
  spareId?: string;
  spareMyth?: Mythology;
}

/**
 * 领袖遇到 Pantheon 待决时，按 Solo 规则给出动作。
 * 返回 null 表示无法决策（调用方应停止本回合）。
 */
export function resolveLeaderPantheonStep(
  game: SoloGame,
  step: PantheonStep,
  spare: PantheonSpare,
): GameAction | null {
  const direction = game.lastDecision?.direction ?? 'left';
  const me = game.leaderId;

  switch (step.kind) {
    /* 时代 I：神话 token → 取该组牌堆**顶** 1 张（引擎一次抽 2 张，options[0] 即堆顶） */
    case 'placeDivinitySelect': {
      const top = step.options[0];
      if (!top) return null;
      const spareId = step.options[1];
      if (spareId) {
        spare.spareId = spareId;
        spare.spareMyth = DIVINITY_BY_ID[spareId]?.mythology;
      }
      return { type: 'CHOOSE_PANTHEON', player: me, choice: top };
    }

    /* 时代 I：按箭头方向放入**第一个空位** */
    case 'placeDivinityPosition': {
      const pos = firstEmptyPantheonSlot(game.state, direction);
      if (pos === null) return null;
      return { type: 'PLACE_DIVINITY', player: me, divinityId: step.divinityId, position: pos };
    }

    case 'invokePick':
      return resolveInvokePick(game, step, direction);
  }
}

/** 把时代 I 多抽的那张放回对应神话组堆顶（由 solo 侧在动作生效后调用） */
export function restoreSpareDivinity(state: GameState, spare: PantheonSpare): void {
  if (!spare.spareId || !spare.spareMyth) return;
  const pan = state.pantheon;
  if (!pan) return;
  const deck = pan.decks[spare.spareMyth];
  if (deck && !deck.includes(spare.spareId)) deck.unshift(spare.spareId);
  spare.spareId = undefined;
  spare.spareMyth = undefined;
}

/* ------------------------- invokePick：各效果的领袖决策 ------------------------- */

function resolveInvokePick(
  game: SoloGame,
  step: Extract<PantheonStep, { kind: 'invokePick' }>,
  direction: 'left' | 'right',
): GameAction | null {
  const st = game.state;
  const me = game.leaderId;
  const opts = step.options;
  if (opts.length === 0) return null;
  const pick = (choice: string): GameAction => ({ type: 'CHOOSE_PANTHEON', player: me, choice });
  const card = game.lastDecision ?? BLANK_CARD;

  switch (step.effect) {
    /* 随机类：Enki（2 枚取 1）/ Nisaba（随机绿卡）/ Baal（随机棕灰卡）/ Ra（随机未建奇迹） */
    case 'enki':
    case 'nisaba':
    case 'baal':
    case 'ra':
      return pick(game.rng.pick(opts));

    /* Anubis：领袖只能拆**你**的奇迹 —— 洗混后随机取 1 座 */
    case 'anubis': {
      const yours = opts.filter((wid) => st.players[0].wondersBuilt.includes(wid));
      return pick(game.rng.pick(yours.length > 0 ? yours : opts));
    }

    /* Hades：按决策卡偏好序从弃牌堆选 1 张 */
    case 'hades':
      return pick(pickCardByPrefs(opts, leaderPrefs(game.leader, card, st.age)) ?? opts[0]!);

    /* Zeus：反转偏好序；从**顶行**开始、按箭头方向评估 */
    case 'zeus': {
      const order = [...opts].sort((a, b) => {
        const sa = st.slots[Number(a)];
        const sb = st.slots[Number(b)];
        if (sa.row !== sb.row) return sa.row - sb.row; // 行号小 = 图上方 = 顶行优先
        return direction === 'left' ? sa.col - sb.col : sb.col - sa.col;
      });
      const prefs = leaderPrefs(game.leader, card, st.age);
      const reversed = prefs.length >= 3 ? [prefs[2]!, prefs[1]!, prefs[0]!] : prefs.slice().reverse();
      for (const pref of reversed) {
        const hit = order.find((s) => matchesPref(CARD_BY_ID[st.slots[Number(s)].cardId ?? ''], pref));
        if (hit) return pick(hit);
      }
      // 第 1 选：非绿 / 非红 / 非其偏好色
      const outside = order.find((s) => isOutside(CARD_BY_ID[st.slots[Number(s)].cardId ?? ''], game.leader));
      return pick(outside ?? order[0]!);
    }

    /* Minerva：棋子放到「军事棋子右边一格」——即拦下**你**下一次推进的落点 */
    case 'minerva': {
      const forward = String(st.conflictPawn + 1);
      const backward = String(st.conflictPawn - 1);
      if (opts.includes(forward)) return pick(forward);
      if (opts.includes(backward)) return pick(backward);
      return pick(opts[0]!);
    }

    /* Neptune：先弃领袖自己最便宜那枚（不生效），再让你一侧最贵那枚生效 */
    case 'neptuneDiscard':
      return pick(pickMilitary(st, opts, 'cheap'));
    case 'neptuneApply':
      return pick(pickMilitary(st, opts, 'dear'));

    /* 门 / 通神大剧场：洗混本局未使用的神话 token，随机抽 1 组 → 取该组堆顶神格 */
    case 'gate':
    case 'theatreDeck':
      return pick(game.rng.pick(opts));
    case 'theatrePick':
      return pick(opts[0]!); // 堆顶

    /* Isis：领袖无未建奇迹（引擎不会推该步）；若出现则取首项兜底 */
    case 'isis':
    case 'isisWonder':
      return pick(opts[0]!);
  }
}

function pickMilitary(state: GameState, opts: string[], mode: 'cheap' | 'dear'): string {
  const arr = state.pantheon?.military ?? [];
  return opts.reduce((best, cur) => {
    const b = arr[Number(best)]?.fine ?? (mode === 'cheap' ? Infinity : -Infinity);
    const c = arr[Number(cur)]?.fine ?? (mode === 'cheap' ? Infinity : -Infinity);
    return mode === 'cheap' ? (c < b ? cur : best) : c > b ? cur : best;
  }, opts[0]!);
}

/** 兜底用的空决策卡（理论上 lastDecision 总有值） */
const BLANK_CARD: SoloDecisionCardDef = {
  direction: 'left',
  primaryColor: null,
  secondaryColor: null,
  tertiaryColor: null,
  replay: null,
};

/* --------------------------- 领袖专属修正项 --------------------------- */

/**
 * 领袖打出「伊西斯」时，主引擎的 2 人语义（从弃牌堆取卡免费建奇迹）对领袖无意义
 * （领袖无需卡牌即可建奇迹、且没有未建奇迹），改按领袖规则结算：
 * 洗混领袖已建奇迹（含面朝下的），随机取 1 座，**再次获得其开局收益**。
 * 返回被选中的奇迹 id（供调用方结算收益），无奇迹则返回 null。
 */
export function leaderIsisPick(game: SoloGame): string | null {
  const built = game.state.players[game.leaderId].wondersBuilt;
  if (built.length === 0) return null;
  return game.rng.pick(built);
}
