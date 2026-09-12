import { CARD_BY_ID, WONDER_BY_ID } from './data/index';
import type { CostPlan, ReadableState, PlayerId, Resource, CardDef, Mythology } from './types';
import { RESOURCES } from './types';

/* ------------------------------------------------------------------
 * 资源产出、贸易价格与建造费用
 * ------------------------------------------------------------------ */

/** 玩家城中的卡牌定义 */
export function cityCards(state: ReadableState, p: PlayerId): CardDef[] {
  return state.players[p].city.map((id) => CARD_BY_ID[id]).filter(Boolean);
}

/**
 * 玩家当前可使用的资源。
 * producesOneOf（商队客栈 / 集市 / 大灯塔 / 比雷埃夫斯）按「需要什么就产出什么」处理：
 * 资源不会被消耗，玩家每回合可自由改选，因此等价于同时具备这些资源。
 */
export function production(state: ReadableState, p: PlayerId): Record<Resource, number> {
  const out: Record<Resource, number> = { wood: 0, stone: 0, clay: 0, glass: 0, papyrus: 0 };
  for (const card of cityCards(state, p)) {
    if (card.produces) {
      for (const r of RESOURCES) out[r] += card.produces[r] ?? 0;
    }
    if (card.producesOneOf) {
      for (const r of card.producesOneOf) out[r] += 1;
    }
  }
  for (const wid of state.players[p].wondersBuilt) {
    const w = WONDER_BY_ID[wid];
    if (w?.producesOneOf) {
      for (const r of w.producesOneOf) out[r] += 1;
    }
  }
  return out;
}

/**
 * 贸易定价只统计「对手城中棕色与灰色卡牌」上的资源符号数量。
 * 黄色卡与奇迹的产出不计入；producesOneOf 亦不计入。
 */
export function resourceSymbols(state: ReadableState, p: PlayerId): Record<Resource, number> {
  const out: Record<Resource, number> = { wood: 0, stone: 0, clay: 0, glass: 0, papyrus: 0 };
  for (const card of cityCards(state, p)) {
    if (card.type !== 'raw' && card.type !== 'manufactured') continue;
    if (!card.produces) continue;
    for (const r of RESOURCES) out[r] += card.produces[r] ?? 0;
  }
  return out;
}

/** 玩家是否拥有把某资源买价压到 1 金币的商业卡 */
export function tradeDiscount(state: ReadableState, p: PlayerId): Set<Resource> {
  const s = new Set<Resource>();
  for (const card of cityCards(state, p)) {
    for (const r of card.trades ?? []) s.add(r);
  }
  return s;
}

/** 单资源购买价 = 2 + 对手棕/灰卡上该资源符号数；被商业卡覆盖则恒为 1 */
export function tradePrice(state: ReadableState, buyer: PlayerId, r: Resource): number {
  if (tradeDiscount(state, buyer).has(r)) return 1;
  const foe = (1 - buyer) as PlayerId;
  return 2 + resourceSymbols(state, foe)[r];
}

export function priceTable(state: ReadableState, buyer: PlayerId): Record<Resource, number> {
  const out = {} as Record<Resource, number>;
  for (const r of RESOURCES) out[r] = tradePrice(state, buyer, r);
  return out;
}

export interface CostInput {
  cost?: Partial<Record<Resource, number>>;
  coinCost?: number;
  /** 'building' 走市政折扣，'wonder' 走奇迹折扣 */
  kind?: 'building' | 'wonder';
  /** 建造建筑时用于判定市政折扣 */
  cardType?: CardDef['type'];
  /** 连锁免费条件 */
  freeLink?: string;
}

/** 玩家是否已持有能提供该连锁符号的建筑（或 Pantheon：对应神话 token） */
export function hasLink(state: ReadableState, p: PlayerId, link: string | undefined): boolean {
  if (!link) return false;
  if (link.startsWith('myth:')) {
    const myth = link.slice(5) as Mythology;
    return state.pantheon ? state.players[p].pan.mythologyTokens.includes(myth) : false;
  }
  if (cityCards(state, p).some((c) => c.link === link)) return true;
  // Agora 法令「外交连锁」：控制对应 chamber 时可借用对手卡上的连锁
  if (state.agora) {
    for (const ch of state.agora.senate.chambers) {
      if (ch.controller !== p) continue;
      const active = [
        ...(ch.decree && ch.decreeFaceUp ? [ch.decree] : []),
        ...ch.decreeExtra.filter((e) => e.faceUp).map((e) => e.id),
      ];
      if (active.includes('dec-link-borrow')) {
        const foe = (1 - p) as PlayerId;
        if (cityCards(state, foe).some((c) => c.link === link)) return true;
        break;
      }
    }
  }
  return false;
}

/** 建造时可减免的资源数量（建筑学 / 石工术） */
export function resourceDiscount(state: ReadableState, p: PlayerId, input: CostInput): number {
  const tokens = state.players[p].progressTokens;
  if (input.kind === 'wonder' && tokens.includes('architecture')) return 2;
  if (input.kind === 'building' && input.cardType === 'civilian' && tokens.includes('masonry')) return 2;
  return 0;
}

/**
 * 计算一次建造的完整支付方案。
 * 减免资源时优先扣掉「边际花费最高」的资源（单价高且自产不足的部分）。
 */
export function planCost(state: ReadableState, p: PlayerId, input: CostInput): CostPlan {
  const player = state.players[p];
  const prices = priceTable(state, p);
  const prod = production(state, p);

  if (input.freeLink && hasLink(state, p, input.freeLink)) {
    return {
      need: {},
      covered: {},
      toBuy: {},
      unitPrice: prices,
      buyCost: 0,
      coinCost: 0,
      total: 0,
      freeByLink: true,
      affordable: true,
    };
  }

  // 工程学：带连锁符号但未持有前置的卡，可以 1 金币建造（不触发都市化）
  if (input.freeLink && player.progressTokens.includes('engineering')) {
    return {
      need: {},
      covered: {},
      toBuy: {},
      unitPrice: prices,
      buyCost: 0,
      coinCost: 1,
      total: 1,
      freeByLink: false,
      affordable: player.coins + (state.pantheon ? player.pan.astarteCoins : 0) >= 1,
    };
  }

  const need: Partial<Record<Resource, number>> = { ...(input.cost ?? {}) };
  let discount = resourceDiscount(state, p, input);

  // 反复扣减边际成本最高的资源
  while (discount > 0) {
    let best: Resource | null = null;
    let bestMarginal = 0;
    for (const r of RESOURCES) {
      const n = need[r] ?? 0;
      if (n <= 0) continue;
      const marginal = n > (prod[r] ?? 0) ? prices[r] : 0;
      if (best === null || marginal > bestMarginal) {
        best = r;
        bestMarginal = marginal;
      }
    }
    if (best === null) break;
    need[best] = (need[best] as number) - 1;
    if (need[best] === 0) delete need[best];
    discount -= 1;
  }

  const covered: Partial<Record<Resource, number>> = {};
  const toBuy: Partial<Record<Resource, number>> = {};
  let buyCost = 0;
  for (const r of RESOURCES) {
    const n = need[r] ?? 0;
    if (n <= 0) continue;
    const own = Math.min(n, prod[r] ?? 0);
    covered[r] = own;
    const missing = n - own;
    if (missing > 0) {
      toBuy[r] = missing;
      buyCost += missing * prices[r];
    }
  }

  const coinCost = input.coinCost ?? 0;
  const total = coinCost + buyCost;
  return {
    need,
    covered,
    toBuy,
    unitPrice: prices,
    buyCost,
    coinCost,
    total,
    freeByLink: false,
    affordable: player.coins >= total,
  };
}
