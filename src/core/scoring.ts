import { CARD_BY_ID, CHAMBER_SCORES, DIVINITY_BY_ID, PROGRESS_BY_ID, templeScore, WONDER_BY_ID, zoneOf } from './data/index';
import { cityCards } from './resources';
import type { CardType, GameState, PlayerId, ScoreBreakdown, VictoryInfo } from './types';

/* ------------------------------------------------------------------
 * 终局计分
 * ------------------------------------------------------------------ */

export function countType(state: GameState, p: PlayerId, type: CardType): number {
  return cityCards(state, p).filter((c) => c.type === type).length;
}

/**
 * vpPer / coinsPer 的取值：
 * 行会一律取「两座城市中较多的一方」，发展标记「数学」只算自己。
 */
export function resolveTarget(state: GameState, p: PlayerId, target: string): number {
  const foe = (1 - p) as PlayerId;
  const both = (fn: (x: PlayerId) => number) => Math.max(fn(p), fn(foe));

  switch (target) {
    case 'raw':
      return both((x) => countType(state, x, 'raw'));
    case 'manufactured':
      return both((x) => countType(state, x, 'manufactured'));
    case 'civilian':
      return both((x) => countType(state, x, 'civilian'));
    case 'scientific':
      return both((x) => countType(state, x, 'scientific'));
    case 'commercial':
      return both((x) => countType(state, x, 'commercial'));
    case 'military':
      return both((x) => countType(state, x, 'military'));
    case 'wonder':
      return both((x) => state.players[x].wondersBuilt.length);
    case 'brownGrey':
      return both((x) => countType(state, x, 'raw') + countType(state, x, 'manufactured'));
    case 'coins3':
      return Math.floor(both((x) => state.players[x].coins) / 3);
    case 'progress':
      return state.players[p].progressTokens.length;
    default:
      return 0;
  }
}

export function scorePlayer(state: GameState, p: PlayerId): ScoreBreakdown {
  const player = state.players[p];
  const sign = p === 0 ? 1 : -1;
  const progress = Math.max(0, sign * state.conflictPawn);

  const military = zoneOf(progress).points;

  let buildings = 0;
  let blueVp = 0;
  for (const card of cityCards(state, p)) {
    buildings += card.vp ?? 0;
    if (card.type === 'civilian') blueVp += card.vp ?? 0;
    if (card.vpPer) {
      buildings += resolveTarget(state, p, card.vpPer.target) * card.vpPer.amount;
      if (card.type === 'civilian') {
        blueVp += resolveTarget(state, p, card.vpPer.target) * card.vpPer.amount;
      }
    }
  }

  const wonders = player.wondersBuilt.reduce((sum, id) => sum + (WONDER_BY_ID[id]?.vp ?? 0), 0);

  let progressVp = 0;
  for (const id of player.progressTokens) {
    const t = PROGRESS_BY_ID[id];
    if (!t) continue;
    progressVp += t.vp ?? 0;
    if (t.vpPer) progressVp += resolveTarget(state, p, t.vpPer.target) * t.vpPer.amount;
  }

  const coins = Math.floor(player.coins / 3);

  /* ------------------------------ Pantheon ------------------------------ */
  let pantheon = 0;
  if (state.pantheon) {
    // 大殿：1/2/3 座 = 5/12/21 分
    const temples = cityCards(state, p).filter((c) => c.temple).length;
    pantheon += templeScore(temples);
    // 神格固定分（Aphrodite 9）
    for (const id of player.pan.invoked) {
      const div = DIVINITY_BY_ID[id];
      if (div?.effect.kind === 'vp') pantheon += div.effect.amount;
    }
    // Astarte：圣库每剩余 1 金币 1 分
    pantheon += player.pan.astarteCoins;
    // 神秘主义：每枚神话 / 献祭 token 2 分
    if (player.progressTokens.includes('mysticism')) {
      pantheon += 2 * (player.pan.mythologyTokens.length + player.pan.offerings.length);
    }
  }

  /* ------------------------------ Agora ------------------------------ */
  let agora = 0;
  if (state.agora) {
    state.agora.senate.chambers.forEach((ch, i) => {
      if (ch.controller === p) agora += CHAMBER_SCORES[i];
    });
  }

  const total = military + buildings + wonders + progressVp + coins + pantheon + agora;

  return {
    player: p,
    military,
    buildings,
    wonders,
    progress: progressVp,
    coins,
    pantheon,
    agora,
    total,
    blueVp,
  };
}

export function scoreGame(state: GameState): VictoryInfo {
  const a = scorePlayer(state, 0);
  const b = scorePlayer(state, 1);
  const breakdown = [a, b];

  if (a.total > b.total) return { type: 'civilian', winner: 0, breakdown };
  if (b.total > a.total) return { type: 'civilian', winner: 1, breakdown };
  if (a.blueVp > b.blueVp) return { type: 'civilian', winner: 0, breakdown };
  if (b.blueVp > a.blueVp) return { type: 'civilian', winner: 1, breakdown };
  return { type: 'draw', winner: null, breakdown };
}

/** 供 UI / AI 预览用的即时分数（不含终局才结算的 guild vpPer 之外的东西） */
export function currentVp(state: GameState, p: PlayerId): number {
  return scorePlayer(state, p).total;
}

/** 已建造建筑中某张卡贡献的固定分 */
export function cardVp(state: GameState, p: PlayerId, cardId: string): number {
  const card = CARD_BY_ID[cardId];
  if (!card) return 0;
  let vp = card.vp ?? 0;
  if (card.vpPer) vp += resolveTarget(state, p, card.vpPer.target) * card.vpPer.amount;
  return vp;
}
