/* ------------------------------------------------------------------
 * M8-A Agora Solo 数据（fan-made 扩展 CloakedBartender v1.2）
 *
 * 权威来源：docs/rules/SOLO_AGORA_DATA.md
 *   - 5 张 Agora 替换决策卡：7_wonders_duel_agora_solo_cards_v1.2.pdf p1（用户提供原件）
 *   - Agora 领袖 Brutus：同文件 p1 卡面 + 规则本 v1.2 p2
 *
 * 卡面读取铁律（官方 base Solo 规则本 Gameplay ①）：
 *   三个色格按「箭头方向」排列 —— 箭头 ⟶（from left to right）从左往右读；
 *   箭头 ⟵（from right to left）从右往左读。
 *   等价：⟶ = 从牌阵最左列起（本作 direction:'left'）；⟵ = from right（direction:'right'）。
 *
 * 5 张 Agora 卡与其 base 对应卡**配色 + 方向一一对应**，唯一差别是多一个 Agora 图标 ▢。
 * 因此 base 的两张连动卡（#6 ●RG RIGHT ▲、#12 ●GR LEFT ●）被保留。
 * ------------------------------------------------------------------ */

import { SOLO_DECISION_CARDS } from '../data';
import type { SoloDecisionCardDef, SoloLeaderDef } from '../types';

/* ------------------------------ Agora 领袖：Brutus ------------------------------ */

export const SOLO_AGORA_LEADER_BRUTUS: SoloLeaderDef = {
  id: 'brutus',
  name: 'Brutus',
  zh: '布鲁图斯',
  cardColor: 'blue',
  replays: ['circle'],
  startProgress: ['organized-crime'],
};

/** Agora 对局可用的领袖 = base 5 位 + Brutus（官方：All Leaders from the base game 可直接使用） */
export function soloAgoraLeaders(baseLeaders: SoloLeaderDef[]): SoloLeaderDef[] {
  return [...baseLeaders, SOLO_AGORA_LEADER_BRUTUS];
}

/* --------------------------- 5 张 Agora 替换决策卡 --------------------------- */

/** Agora 图标决策卡（A–E），色格顺序已按箭头方向还原为 primary/secondary/tertiary */
export const SOLO_AGORA_DECISION_CARDS: SoloDecisionCardDef[] = [
  // A：卡面 ⟶ RED·GREEN·(领袖色)  → 对应 base「RG● LEFT」
  { direction: 'left', primaryColor: 'red', secondaryColor: 'green', tertiaryColor: null, replay: null, agoraIcon: true },
  // B：卡面 ⟵ (领袖色)·RED·GREEN  → 对应 base「GR● RIGHT」
  { direction: 'right', primaryColor: 'green', secondaryColor: 'red', tertiaryColor: null, replay: null, agoraIcon: true },
  // C：卡面 ⟶ GREEN·RED·(领袖色)  → 对应 base「GR● LEFT」
  { direction: 'left', primaryColor: 'green', secondaryColor: 'red', tertiaryColor: null, replay: null, agoraIcon: true },
  // D：卡面 ⟵ (领袖色)·GREEN·RED  → 对应 base「RG● RIGHT」
  { direction: 'right', primaryColor: 'red', secondaryColor: 'green', tertiaryColor: null, replay: null, agoraIcon: true },
  // E：卡面 ⟶ GREEN·RED·(领袖色)  → 对应 base「GR● LEFT」
  { direction: 'left', primaryColor: 'green', secondaryColor: 'red', tertiaryColor: null, replay: null, agoraIcon: true },
];

/**
 * 被 5 张 Agora 卡替换掉的 base 决策卡下标（`SOLO_DECISION_CARDS` 的 0-based 下标）。
 * 对应关系（§5.1）：A↔#8(RG●L) / B↔#1(GR●R) / C↔#7(GR●L) / D↦#4(RG●R) / E↔#11(GR●L)。
 * 同色同向的 base 卡彼此完全等价，故取哪一张不影响牌堆多重集。
 */
export const SOLO_AGORA_REPLACED_BASE_INDEXES = [0, 3, 6, 7, 10] as const;

/** Agora 决策牌堆：base 保留 7 张 + Agora 卡 5 张 = 12 张 */
export function soloAgoraDeck(): SoloDecisionCardDef[] {
  const kept = SOLO_DECISION_CARDS.filter(
    (_, i) => !(SOLO_AGORA_REPLACED_BASE_INDEXES as readonly number[]).includes(i),
  );
  return [...kept, ...SOLO_AGORA_DECISION_CARDS];
}
