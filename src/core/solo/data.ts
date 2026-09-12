import type { CardType } from '../types';
import type { SoloCardColor, SoloDecisionCardDef, SoloLeaderDef } from './types';

/* ------------------------------------------------------------------
 * 5 位领袖（官方 Solo PnP，Kotlin 转录逐字）
 *
 * 规则原文：
 *  - CAESAR     purple,   replays=∅,            starts with the Strategy Progress token.
 *  - HAMMURABI  yellow,   replays={circle},     starts with the Economy Progress token.
 *                                                        +5 VP if game ends after Age III.
 *  - CLEOPATRA  blue,     replays={triangle},   starts with Philosophy & Agriculture tokens.
 *  - ARISTOTLE  grey,     replays={circle},     starts with Law & Mathematics tokens.
 *  - BILKIS     brown,    replays={circle,triangle}, starts with the Economy Progress token.
 * ------------------------------------------------------------------ */
export const SOLO_LEADERS: SoloLeaderDef[] = [
  {
    id: 'caesar',
    name: 'Caesar',
    zh: '凯撒',
    cardColor: 'purple',
    replays: [],
    startProgress: ['strategy'],
  },
  {
    id: 'hammurabi',
    name: 'Hammurabi',
    zh: '汉谟拉比',
    cardColor: 'yellow',
    replays: ['circle'],
    startProgress: ['economy'],
    endBonus: { points: 5, condition: 'afterAge3' },
  },
  {
    id: 'cleopatra',
    name: 'Cleopatra',
    zh: '克娄巴特拉',
    cardColor: 'blue',
    replays: ['triangle'],
    startProgress: ['philosophy', 'agriculture'],
  },
  {
    id: 'aristotle',
    name: 'Aristotle',
    zh: '亚里士多德',
    cardColor: 'grey',
    replays: ['circle'],
    startProgress: ['law', 'mathematics'],
  },
  {
    id: 'bilkis',
    name: 'Bilkis',
    zh: '巴尔基斯',
    cardColor: 'brown',
    replays: ['circle', 'triangle'],
    startProgress: ['economy'],
  },
];

/* ------------------------------------------------------------------
 * 12 张决策卡（官方 Solo PnP，Kotlin 转录逐字）
 *
 * DecisionCard 默认值：
 *   direction     = RIGHT
 *   primaryColor  = GREEN
 *   secondaryColor= RED
 *   tertiaryColor = null
 *   replay        = null
 *
 * 运行时解析（leaderTurn）：
 *   primary   = primaryColor   ?? leader.cardColor
 *   secondary = secondaryColor ?? leader.cardColor
 *   tertiary  = tertiaryColor  ?? leader.cardColor
 *   colors    = [primary, secondary, tertiary]
 *                 .filter(age === 3 || it !== PURPLE)   // 非时代 III 时紫被过滤
 * ------------------------------------------------------------------ */
export const SOLO_DECISION_CARDS: SoloDecisionCardDef[] = [
  // 1-3：默认 RIGHT，GREEN / RED
  { direction: 'right', primaryColor: 'green', secondaryColor: 'red', tertiaryColor: null, replay: null },
  { direction: 'right', primaryColor: 'green', secondaryColor: 'red', tertiaryColor: null, replay: null },
  { direction: 'right', primaryColor: 'green', secondaryColor: 'red', tertiaryColor: null, replay: null },
  // 4-5：RIGHT，RED / GREEN
  { direction: 'right', primaryColor: 'red', secondaryColor: 'green', tertiaryColor: null, replay: null },
  { direction: 'right', primaryColor: 'red', secondaryColor: 'green', tertiaryColor: null, replay: null },
  // 6：RIGHT；primary 空→领袖色；**secondary 取类默认值 RED**（Kotlin 卡片 6 只传了 primaryCardColor=null /
  //    tertiaryCardColor=GREEN / replay=TRIANGLE，未传 secondaryCardColor → 沿用默认 RED，而非 null）；
  //    tertiary=GREEN；replay=triangle
  { direction: 'right', primaryColor: null, secondaryColor: 'red', tertiaryColor: 'green', replay: 'triangle' },
  // 7：LEFT，默认 GREEN / RED
  { direction: 'left', primaryColor: 'green', secondaryColor: 'red', tertiaryColor: null, replay: null },
  // 8-10：LEFT，RED / GREEN
  { direction: 'left', primaryColor: 'red', secondaryColor: 'green', tertiaryColor: null, replay: null },
  { direction: 'left', primaryColor: 'red', secondaryColor: 'green', tertiaryColor: null, replay: null },
  { direction: 'left', primaryColor: 'red', secondaryColor: 'green', tertiaryColor: null, replay: null },
  // 11：LEFT，默认 GREEN / RED
  { direction: 'left', primaryColor: 'green', secondaryColor: 'red', tertiaryColor: null, replay: null },
  // 12：LEFT，primary 空→领袖色，secondary=GREEN，tertiary=RED，replay=circle
  { direction: 'left', primaryColor: null, secondaryColor: 'green', tertiaryColor: 'red', replay: 'circle' },
];

/** Solo 颜色 → 主引擎 CardType（用于匹配牌阵中的卡牌） */
export const SOLO_COLOR_TO_TYPE: Record<SoloCardColor, CardType> = {
  purple: 'guild',
  yellow: 'commercial',
  blue: 'civilian',
  grey: 'manufactured',
  brown: 'raw',
  red: 'military',
  green: 'scientific',
};
