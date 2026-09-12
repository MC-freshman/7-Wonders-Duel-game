/* M8 Solo 模式（官方 Print & Play 2020）隔离模块统一出口 */
export {
  createSoloGame,
  soloApplyAction,
  soloLeaderTurn,
  soloFinalizeVictory,
  soloCurrentDecision,
  isSoloLeaderTurn,
  isLeaderAgoraPending,
  isLeaderPantheonPending,
} from './solo';
export type { SoloOptions } from './solo';
export { SOLO_LEADERS, SOLO_DECISION_CARDS, SOLO_COLOR_TO_TYPE } from './data';
export type {
  SoloReplay,
  SoloCardColor,
  SoloDirection,
  SoloLeaderDef,
  SoloDecisionCardDef,
  SoloGame,
} from './types';

/* ---- M8-A：Agora Solo 子模块（删 ./agora 即回退） ---- */
export {
  SOLO_AGORA_LEADER_BRUTUS,
  SOLO_AGORA_DECISION_CARDS,
  SOLO_AGORA_REPLACED_BASE_INDEXES,
  soloAgoraDeck,
  soloAgoraLeaders,
  chooseAgoraAction,
  conspiratorChoice,
  hasFaceDownConspiracy,
  moveAction,
  placeAction,
  politicianAction,
  removeAction,
} from './agora/index';
export type { AgoraCtx } from './agora/index';

/* ---- M8-P：Pantheon Solo 子模块（删 ./pantheon 即回退） ---- */
export {
  SOLO_PANTHEON_LEADER_CALIGULA,
  SOLO_PANTHEON_LEADER_SAPPHO,
  SOLO_PANTHEON_LEADER_IMHOTEP,
  SOLO_PANTHEON_LEADERS,
  SOLO_PANTHEON_DECISION_CARDS,
  SOLO_PANTHEON_REPLACED_BASE_INDEXES,
  soloPantheonDeck,
  soloPantheonLeaders,
  soloAgoraPantheonDeck,
} from './pantheon/index';
