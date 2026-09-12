/* ------------------------------------------------------------------
 * M8-P Pantheon Solo 数据（fan-made 扩展，与 Agora Solo 同一作者 CloakedBartender）
 *
 * 权威来源：docs/rules/SOLO_PANTHEON_DATA.md
 *   - 3 位领袖：规则本 p1「Pantheon Leaders」+ 卡面逐条核对；
 *   - 3 张替换决策卡：⚠️ **推导值**（无公开卡面来源），依据见该文档 §5.1：
 *       ① 规则本：Pantheon 卡是 base 卡的「updated equivalents」，同 base Solo 替换机制；
 *       ② 组合牌堆恒等式 3 Pantheon + 5 Agora + 4 无图标 = 12；
 *       ③ 保留 base 两张连动卡（#6 ▲ / #12 ●）以免连动机制消失；
 *       ④ 分布均衡：GR-right / RG-right / RG-left 各取 1 张。
 *     取 base #2(idx1)、#5(idx4)、#10(idx9)，配色与方向与其 base 对应卡完全一致，仅多 Pantheon 图标。
 *
 * 卡面读取铁律（同 Agora）：三色格按箭头方向排列；⟶ = 从最左列起（direction:'left'），
 * ⟵ = 从最右列起（direction:'right'）。
 * ------------------------------------------------------------------ */

import { SOLO_DECISION_CARDS } from '../data';
import { SOLO_AGORA_DECISION_CARDS, SOLO_AGORA_REPLACED_BASE_INDEXES } from '../agora/data';
import type { SoloDecisionCardDef, SoloLeaderDef } from '../types';

/* ------------------------------ 三位 Pantheon 领袖 ------------------------------ */

/** Caligula：黄卡 / ◉ / 开局持 Poliorcetics（攻城术） */
export const SOLO_PANTHEON_LEADER_CALIGULA: SoloLeaderDef = {
  id: 'caligula',
  name: 'Caligula',
  zh: '卡利古拉',
  cardColor: 'yellow',
  replays: ['circle'],
  startProgress: ['poliorcetics'],
};

/**
 * Sappho：紫卡（= 大殿 Temples）/ ◉ / 开局持 Mysticism + Philosophy。
 * 注意：Pantheon 启用时「紫」一律指 Age III 的 5 座大殿（规则本 Leader changes：
 * "Caesar's purple card preference now regards Temples."）。主引擎把大殿的 type 记为
 * 'guild'，故 SOLO_COLOR_TO_TYPE.purple='guild' 天然命中大殿，无需额外分支。
 */
export const SOLO_PANTHEON_LEADER_SAPPHO: SoloLeaderDef = {
  id: 'sappho',
  name: 'Sappho',
  zh: '萨福',
  cardColor: 'purple',
  replays: ['circle'],
  startProgress: ['mysticism', 'philosophy'],
};

/**
 * Imhotep：**链接符号卡**（非某色）/ ◉ ▲ / 开局持 Engineering + Urbanism。
 * preferLink=true → 决策卡中「领袖色」的槽位改为「可用链接符号建造的卡」（freeLink 非空）。
 * 额外能力：每次打出带链接符号费用的卡得 4 金币，**即使城中没有对应链接符号**（见 solo.ts）。
 */
export const SOLO_PANTHEON_LEADER_IMHOTEP: SoloLeaderDef = {
  id: 'imhotep',
  name: 'Imhotep',
  zh: '伊姆霍特普',
  cardColor: 'brown', // 占位：实际偏好由 preferLink 接管
  preferLink: true,
  replays: ['circle', 'triangle'],
  startProgress: ['engineering', 'urbanism'],
};

export const SOLO_PANTHEON_LEADERS: SoloLeaderDef[] = [
  SOLO_PANTHEON_LEADER_CALIGULA,
  SOLO_PANTHEON_LEADER_SAPPHO,
  SOLO_PANTHEON_LEADER_IMHOTEP,
];

/** Pantheon 对局可用的领袖 = base 5 + Pantheon 3（Agora 组合时再加 Brutus） */
export function soloPantheonLeaders(baseLeaders: SoloLeaderDef[]): SoloLeaderDef[] {
  return [...baseLeaders, ...SOLO_PANTHEON_LEADERS];
}

/* --------------------------- 3 张 Pantheon 替换决策卡 --------------------------- */

/**
 * 三张卡均**无连动符号**，仅多一个 Pantheon 图标（样式见规则本 p1）。
 * 每张都与它替换的 base 卡在「箭头方向 + 三色」上完全一致。
 */
export const SOLO_PANTHEON_DECISION_CARDS: SoloDecisionCardDef[] = [
  // P1：卡面 ⟵ (领袖色)·RED·GREEN → 对应 base #2「GR● RIGHT」
  { direction: 'right', primaryColor: 'green', secondaryColor: 'red', tertiaryColor: null, replay: null, pantheonIcon: true },
  // P2：卡面 ⟵ (领袖色)·GREEN·RED → 对应 base #5「RG● RIGHT」
  { direction: 'right', primaryColor: 'red', secondaryColor: 'green', tertiaryColor: null, replay: null, pantheonIcon: true },
  // P3：卡面 ⟶ RED·GREEN·(领袖色) → 对应 base #10「RG● LEFT」
  { direction: 'left', primaryColor: 'red', secondaryColor: 'green', tertiaryColor: null, replay: null, pantheonIcon: true },
];

/**
 * 被 3 张 Pantheon 卡替换掉的 base 决策卡下标（`SOLO_DECISION_CARDS` 的 0-based 下标）。
 * #2 → idx1、#5 → idx4、#10 → idx9。与 Agora 的 [0,3,6,7,10] **不相交**，
 * 故组合时移除 8 张、保留 4 张无图标卡（#3 / #6 / #9 / #12，含两张连动卡）。
 */
export const SOLO_PANTHEON_REPLACED_BASE_INDEXES = [1, 4, 9] as const;

const has = (arr: readonly number[], i: number) => arr.includes(i);

/** 仅 Pantheon：base 保留 9 张 + Pantheon 卡 3 张 = 12 张 */
export function soloPantheonDeck(): SoloDecisionCardDef[] {
  const kept = SOLO_DECISION_CARDS.filter((_, i) => !has(SOLO_PANTHEON_REPLACED_BASE_INDEXES, i));
  return [...kept, ...SOLO_PANTHEON_DECISION_CARDS];
}

/** Pantheon + Agora 组合：4 张无图标 + 5 张 Agora 图标 + 3 张 Pantheon 图标 = 12 张 */
export function soloAgoraPantheonDeck(): SoloDecisionCardDef[] {
  const kept = SOLO_DECISION_CARDS.filter(
    (_, i) =>
      !has(SOLO_PANTHEON_REPLACED_BASE_INDEXES, i) && !has(SOLO_AGORA_REPLACED_BASE_INDEXES, i),
  );
  return [...kept, ...SOLO_AGORA_DECISION_CARDS, ...SOLO_PANTHEON_DECISION_CARDS];
}
