import type { ProgressTokenDef } from '../types';
import { AGORA_PROGRESS } from './agora';

/* 发展标记：官方规则书第 14 页正文 */
export const PROGRESS_TOKENS: ProgressTokenDef[] = [
  { id: 'agriculture', name: 'Agriculture', zh: '农业', coins: 6, vp: 4, text: '立即从银行取 6 金币；终局 4 分' },
  { id: 'architecture', name: 'Architecture', zh: '建筑学', discount: 'wonder', text: '此后你建造的奇迹减少 2 个资源（每次可自选减免哪些资源）' },
  { id: 'economy', name: 'Economy', zh: '经济', special: 'gain-trade-costs', text: '对手为购买资源支付的金币转交给你（不含卡牌本身的金币费用）' },
  { id: 'law', name: 'Law', zh: '法律', science: 'law', text: '视为一个「法」科技符号' },
  { id: 'masonry', name: 'Masonry', zh: '石工术', discount: 'civilian', text: '此后你建造的蓝卡减少 2 个资源（每次可自选减免哪些资源）' },
  { id: 'mathematics', name: 'Mathematics', zh: '数学', vpPer: { target: 'progress', amount: 3 }, text: '终局每枚发展标记（含本身）计 3 分' },
  { id: 'philosophy', name: 'Philosophy', zh: '哲学', vp: 7, text: '终局 7 分' },
  { id: 'strategy', name: 'Strategy', zh: '战略', special: 'shield-bonus', text: '此后你建造的红卡额外获得 1 面战争盾（对奇迹无效，对已建造红卡无效）' },
  { id: 'theology', name: 'Theology', zh: '神学', special: 'extra-turn', text: '此后你建造的奇迹均视为具有「再次行动」效果（不叠加）' },
  { id: 'urbanism', name: 'Urbanism', zh: '都市化', coins: 6, special: 'free-link-bonus', text: '立即从银行取 6 金币；此后每通过连锁免费建造一张建筑，额外获得 4 金币' },
];

/* ------------------------------ Pantheon 新增（3） ------------------------------ */

export const PANTHEON_PROGRESS: ProgressTokenDef[] = [
  { id: 'mysticism', name: 'Mysticism', zh: '神秘主义', extension: 'pantheon', special: 'mysticism', text: '终局每持有 1 枚神话 token 和 1 枚献祭 token 计 2 分' },
  { id: 'poliorcetics', name: 'Poliorcetics', zh: '攻城术', extension: 'pantheon', special: 'poliorcetics', text: '你每将冲突棋子向前移动 1 格，对手失去 1 金币' },
  { id: 'engineering', name: 'Engineering', zh: '工程学', extension: 'pantheon', special: 'engineering', text: '可以 1 金币建造任何带白色连锁符号的卡（无需持有前置；不触发都市化）' },
];

/** Pantheon 开启时的完整进度池（13 枚） */
export const ALL_PROGRESS_TOKENS: ProgressTokenDef[] = [
  ...PROGRESS_TOKENS,
  ...PANTHEON_PROGRESS,
  ...AGORA_PROGRESS,
];

export const PROGRESS_BY_ID: Record<string, ProgressTokenDef> = Object.fromEntries(
  ALL_PROGRESS_TOKENS.map((t) => [t.id, t]),
);
