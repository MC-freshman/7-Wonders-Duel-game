/* M8-A Agora Solo 子模块统一出口（方案 B：隔离模块，删除本目录即回退） */
export {
  SOLO_AGORA_LEADER_BRUTUS,
  SOLO_AGORA_DECISION_CARDS,
  SOLO_AGORA_REPLACED_BASE_INDEXES,
  soloAgoraDeck,
  soloAgoraLeaders,
} from './data';
export {
  chooseAgoraAction,
  conspiratorChoice,
  hasFaceDownConspiracy,
  moveAction,
  placeAction,
  politicianAction,
  removeAction,
} from './agora';
export type { AgoraCtx } from './agora';
