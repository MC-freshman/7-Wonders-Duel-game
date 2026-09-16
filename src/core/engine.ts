import {
  BOARD_POSITION_COSTS,
  CARD_BY_ID,
  CAPITAL_POS,
  CONSPIRACY_BY_ID,
  DEGREE_BY_ID,
  DIVINITY_BY_ID,
  GATE_ID,
  MYTHOLOGIES,
  PANTHEON_WONDERS,
  PROGRESS_BY_ID,
  SENATOR_BY_ID,
  SENATE_CUBE_SUPPLY,
  WONDERS,
  WONDER_BY_ID,
  ZONE_FINES,
  adjacentChambers,
  districtOf,
  senateActionsFor,
  zoneIndex,
} from './data/index';
import { accessibleSlots, isSlotAccessible } from './layout';
import { Rng } from './rng';
import { planCost, cityCards } from './resources';
import { resolveTarget, scoreGame } from './scoring';
import { initialState as createInitial, setupAge, WONDER_DRAFT_ORDER } from './setup';
import type { DivinityDef } from './data/pantheon';
import type {

  AgoraStep,
  ChamberState,
  GameAction,
  GameState,
  Mythology,
  PantheonStep,
  PendingChoice,
  Phase,
  PlayerId,
  ReadableState,
  ScienceSymbol,
  SenateOp,
  Slot,
  WonderDef,
  CostPlan,
} from './types';

/* ------------------------------------------------------------------
 * 规则引擎
 *
 * 全部导出均为纯函数：applyAction 返回全新状态，不修改入参。
 * 本地热座、人机、联机三种模式共用同一套动作与状态。
 * ------------------------------------------------------------------ */

export { createInitial as initialState };

const clone = <T,>(v: T): T => structuredClone(v);

const MAX_WONDERS = 7;

/** Agora 新奇迹 id 列表（奇迹池组装用） */
const AGORA_WONDERS_IDS = ['curia-julia', 'knossos'];

/* ------------------------------ 基础工具 ------------------------------ */

/**
 * 当前正在应用的动作。
 *
 * 一个动作往往会产生多条日志（例如「建造奇迹」+「对手失去 N 金币」+「翻开 …」），
 * 但回放只需要知道「发生了哪个动作」。因此约定：**本次动作的第一条日志**携带 action，
 * 其余派生日志只记文本。这样按日志顺序重放时，每个动作恰好被应用一次。
 */
let pendingAction: GameAction | null = null;

function pushLog(state: GameState, player: PlayerId | null, text: string, action?: GameAction): void {
  const carried: GameAction | undefined = action ?? pendingAction ?? undefined;
  // 一旦被某条日志领走就清空，保证同一动作不会在回放时被重复应用
  if (carried) pendingAction = null;
  state.log.push({ index: state.log.length, player, text, action: carried });
}

function other(p: PlayerId): PlayerId {
  return (1 - p) as PlayerId;
}

function rngOf(state: GameState): Rng {
  return new Rng(state.rngState);
}

function saveRng(state: GameState, rng: Rng): void {
  state.rngState = rng.state;
}

function phaseForPending(pending: PendingChoice): Phase {
  switch (pending.kind) {
    case 'progressToken':
      return 'chooseProgressToken';
    case 'discardedCard':
      return 'chooseDiscardedCard';
    case 'opponentCard':
      return 'chooseOpponentCard';
    case 'startPlayer':
      return 'chooseStartPlayer';
    case 'pantheon':
      return 'pantheonChoice';
    case 'agora':
      return 'agoraChoice';
  }
}

function gainCoins(state: GameState, p: PlayerId, n: number): void {
  if (n <= 0) return;
  state.players[p].coins += n;
}

function loseCoins(state: GameState, p: PlayerId, n: number): number {
  const lost = Math.min(n, state.players[p].coins);
  state.players[p].coins -= lost;
  return lost;
}

/**
 * 支付金币：Astarte 圣库的金币优先花（防抢但可正常花费）。
 * 献祭 token 的折扣在调用动作里单独结算，不走这里。
 */
function payCoins(state: GameState, p: PlayerId, amount: number): void {
  const pan = state.players[p].pan;
  if (state.pantheon && pan.astarteCoins > 0) {
    const use = Math.min(pan.astarteCoins, amount);
    pan.astarteCoins -= use;
    amount -= use;
  }
  state.players[p].coins -= amount;
}

/** 支付：其中购买资源的部分会经由「经济」发展标记转给对手 */
function payPlan(state: GameState, p: PlayerId, plan: CostPlan): void {
  payCoins(state, p, plan.total);
  const foe = other(p);
  if (plan.buyCost > 0 && state.players[foe].progressTokens.includes('economy')) {
    gainCoins(state, foe, plan.buyCost);
  }
}

/** 队列一条 Pantheon 选择（若已有 pantheon pending 则续接队列） */
function pushPantheonStep(state: GameState, p: PlayerId, step: PantheonStep): void {
  const pend = state.pending;
  if (pend && pend.kind === 'pantheon' && pend.player === p) {
    pend.steps.push(step);
  } else {
    state.pending = { kind: 'pantheon', player: p, steps: [step] };
  }
}

/* ------------------------------ 科技 ------------------------------ */

function distinctScience(state: GameState, p: PlayerId): number {
  return Object.values(state.players[p].science).filter((n) => (n ?? 0) > 0).length;
}

function requestProgressToken(state: GameState, p: PlayerId, fromDiscard: boolean): void {
  if (fromDiscard) {
    if (state.progressRemoved.length === 0) return;
    const rng = rngOf(state);
    const options = rng.sample(state.progressRemoved, Math.min(3, state.progressRemoved.length));
    saveRng(state, rng);
    const prev = state.pending;
    const count = prev && prev.kind === 'progressToken' ? prev.count + 1 : 1;
    state.pending = { kind: 'progressToken', player: p, count, fromDiscard: true, options };
    return;
  }
  if (state.progressAvailable.length === 0) return;
  const prev = state.pending;
  const count = prev && prev.kind === 'progressToken' ? prev.count + 1 : 1;
  state.pending = { kind: 'progressToken', player: p, count, fromDiscard: false };
}

function addScience(state: GameState, p: PlayerId, sym: ScienceSymbol): void {
  const s = state.players[p].science;
  s[sym] = (s[sym] ?? 0) + 1;
  if (s[sym] === 2) requestProgressToken(state, p, false);
}

/* ------------------------------ 军事 ------------------------------ */

function advanceShields(state: GameState, p: PlayerId, rawShields: number): void {
  if (rawShields <= 0) return;
  const sign = p === 0 ? 1 : -1;
  const foe = other(p);

  if (!state.pantheon) {
    // 基础版：一次性移动 + 区块罚金（militaryZone 只触发一次）
    let pawn = state.conflictPawn + sign * rawShields;
    if (pawn > CAPITAL_POS) pawn = CAPITAL_POS;
    if (pawn < -CAPITAL_POS) pawn = -CAPITAL_POS;
    state.conflictPawn = pawn;
    const own = Math.max(0, sign * pawn);
    const zi = zoneIndex(own);
    if (zi > state.players[p].militaryZone) {
      state.players[p].militaryZone = zi;
      if (state.agora) {
        agoraZoneEntry(state, p, zi);
      } else {
        const fine = ZONE_FINES[zi] ?? 0;
        if (fine > 0) {
          const lost = loseCoins(state, foe, fine);
          pushLog(state, p, `进入「${zoneLabel(zi)}」，对手失去 ${lost} 金币`);
        }
      }
    }
    if (Math.abs(pawn) >= CAPITAL_POS) {
      state.victory = { type: 'military', winner: p };
    }
    return;
  }

  /* Pantheon 版：逐格移动（Minerva 拦截）+ 攻城术（Poliorcetics） + 状态化军事 token */
  let moved = 0;
  for (let i = 0; i < rawShields; i++) {
    const next = state.conflictPawn + sign;
    if (next > CAPITAL_POS || next < -CAPITAL_POS) break;
    // Minerva 棋子：冲突棋子进入该格前立即停下，剩余移动作废
    if (state.pantheon.minerva !== null && next === state.pantheon.minerva) {
      pushLog(state, p, '冲突棋子被 Minerva 棋子拦下，剩余移动作废');
      state.pantheon.minerva = null;
      break;
    }
    state.conflictPawn = next;
    moved += 1;
    // 区块效果：Agora 军事 token 替代基础罚金
    const own = Math.max(0, sign * state.conflictPawn);
    const zi = zoneIndex(own);
    if (zi > state.players[p].militaryZone) {
      state.players[p].militaryZone = zi;
      if (state.agora) {
        agoraZoneEntry(state, p, zi);
      } else {
        const fine = ZONE_FINES[zi] ?? 0;
        if (fine > 0) {
          const token = state.pantheon.military.find((t) => !t.used && t.fine === fine);
          if (token) token.used = true;
          const lost = loseCoins(state, foe, fine);
          pushLog(state, p, `进入「${zoneLabel(zi)}」，对手失去 ${lost} 金币`);
        }
      }
    }
    if (Math.abs(state.conflictPawn) >= CAPITAL_POS) {
      state.victory = { type: 'military', winner: p };
      return;
    }
  }

  // 攻城术：每向前移动 1 格，对手失去 1 金币
  if (moved > 0 && state.players[p].progressTokens.includes('poliorcetics')) {
    const lost = loseCoins(state, foe, moved);
    if (lost > 0) pushLog(state, p, `攻城术：对手失去 ${lost} 金币`);
  }
}

function zoneLabel(zi: number): string {
  return ['均势', '边境摩擦', '兵临城下', '深入腹地'][zi] ?? '';
}

/* ------------------------------ 建造建筑的效果 ------------------------------ */

function applyCardEffects(state: GameState, p: PlayerId, cardId: string, freeByLink: boolean): void {
  const card = CARD_BY_ID[cardId];
  if (!card) return;
  const player = state.players[p];

  if (card.coins) gainCoins(state, p, card.coins);

  if (card.coinsPer) {
    const n = resolveTarget(state, p, card.coinsPer.target) * card.coinsPer.amount;
    gainCoins(state, p, n);
  }

  if (card.type === 'military' && card.shields) {
    const bonus = player.progressTokens.includes('strategy') ? 1 : 0;
    advanceShields(state, p, card.shields + bonus);
  }

  if (card.science) addScience(state, p, card.science);

  // 都市化：每次通过连锁免费建造额外获得 4 金币
  if (freeByLink && player.progressTokens.includes('urbanism')) {
    gainCoins(state, p, 4);
  }
}

/* ------------------------------ 牌阵 ------------------------------ */

/**
 * 翻开所有可拿取的暗牌。
 * Pantheon：被翻开的牌若带有神话 / 献祭 token，由翻牌方（actor）获得；
 * 神话 token 会产生「选神格 → 放图板」的两步选择队列。
 */
function revealSlots(state: GameState, actor: PlayerId): void {
  const flipped: Slot[] = [];
  for (const slot of accessibleSlots(state.slots)) {
    if (!slot.faceUp) {
      slot.faceUp = true;
      flipped.push(slot);
      pushLog(state, null, `翻开 ${CARD_BY_ID[slot.cardId!]?.zh ?? ''}`);
    }
  }
  if (!state.pantheon) return;
  const pan = state.pantheon;

  for (const slot of flipped) {
    const myth = pan.age1Tokens[slot.index];
    if (myth) {
      // 神话 token：拿走并从对应牌组抽 2 张选 1 放图板
      delete pan.age1Tokens[slot.index];
      state.players[actor].pan.mythologyTokens.push(myth);
      const deck = pan.decks[myth];
      const draws = deck.splice(0, Math.min(2, deck.length));
      pushLog(state, actor, `获得「${mythLabel(myth)}」神话 token，从该组抽 2 张神格`);
      if (draws.length > 0) {
        pushPantheonStep(state, actor, { kind: 'placeDivinitySelect', options: draws });
      }
    }
    const offer = pan.age2Tokens[slot.index];
    if (offer !== undefined) {
      delete pan.age2Tokens[slot.index];
      state.players[actor].pan.offerings.push(offer);
      pushLog(state, actor, `获得 1 枚献祭 token`);
    }
  }
}

function mythLabel(m: Mythology): string {
  return { mesopotamian: '美索不达米亚', phoenician: '腓尼基', greek: '希腊', egyptian: '埃及', roman: '罗马' }[m];
}

function takeSlot(state: GameState, slotIndex: number): string {
  const slot: Slot = state.slots[slotIndex];
  const cardId = slot.cardId!;
  slot.taken = true;
  state.structureRemaining = Math.max(0, state.structureRemaining - 1);
  return cardId;
}

/* ------------------------------ 胜负检查 ------------------------------ */

function checkVictory(state: GameState): boolean {
  if (state.victory) return true;
  for (const p of [0, 1] as PlayerId[]) {
    if (distinctScience(state, p) >= 6) {
      state.victory = { type: 'science', winner: p };
      return true;
    }
  }
  if (Math.abs(state.conflictPawn) >= CAPITAL_POS) {
    state.victory = { type: 'military', winner: state.conflictPawn > 0 ? 0 : 1 };
    return true;
  }
  return false;
}

/* ------------------------------ 回合推进 ------------------------------ */

/** 回合真正移交（或新回合开始）时清掉上一位玩家的 Agora 残留门控 */
function beginTurnReset(state: GameState, next: PlayerId): void {
  state.current = next;
  if (state.agora) {
    // 「军事推进」法令换手时会给新控制者 push 参议院操作——
    // 属于下一位玩家的 op 保留到其回合开始时执行，其余清空
    state.agora.ops = state.agora.ops.filter((o) => o.player === next);
    state.agora.senateActionsLeft = 0;
    state.agora.politicianDistrict = null;
    state.agora.endTurnAfterOps = false;
    state.agora.triggeredThisTurn = false;
  }
}

function advanceTurn(state: GameState, actor: PlayerId): void {
  if (checkVictory(state)) {
    state.phase = 'gameOver';
    return;
  }
  if (state.structureRemaining === 0) {
    endAge(state);
    return;
  }
  if (state.extraTurn) {
    // 奇迹的「再次行动」：同一玩家继续
    state.extraTurn = false;
    return;
  }
  beginTurnReset(state, other(actor));
}

function endAge(state: GameState): void {
  if (state.age === 3) {
    state.victory = scoreGame(state);
    state.phase = 'gameOver';
    pushLog(state, null, '时代 III 结束，进入最终计分');
    return;
  }
  const pawn = state.conflictPawn;
  const chooser: PlayerId = pawn > 0 ? 1 : pawn < 0 ? 0 : state.lastActive;
  state.pending = { kind: 'startPlayer', chooser };
  state.phase = 'chooseStartPlayer';
  pushLog(state, null, `时代 ${state.age} 结束，由 ${chooser === 0 ? '玩家一' : '玩家二'} 决定下一时代的先手`);
}

/**
 * 排空队列里已无从执行的「放置」操作（该方 12 枚方块已全部摆出）。
 *
 * 正常路径不会产出这种操作（`pushPlaceOp` 在入队前就拦掉了），但一次回合里可能
 * 先排队了两个放置、中间把方块摆完（例：密谋「政治操盘」+ 军事 token）。
 * 回合推进会停在 `ops[0]` 上等待，留着它就等于整局卡死。
 */
function dropStarvedPlaceOps(state: GameState): void {
  const ag = state.agora;
  if (!ag) return;
  while (ag.ops.length > 0) {
    const head = ag.ops[0];
    if (head.op.kind !== 'place' || hasSpareCube(state, head.player)) return;
    ag.ops.shift();
    pushLog(state, head.player, '参议院：面前方块已用尽，跳过一次放置');
  }
}

function finishAction(state: GameState, actor: PlayerId): void {
  state.lastActive = actor;
  revealSlots(state, actor);
  if (state.pending) {
    state.phase = phaseForPending(state.pending);
    return;
  }
  dropStarvedPlaceOps(state);
  // Agora：自己的参议院小操作未执行完时推迟回合推进；
  // 他人的 op（如军事推进法令换手）留给对方回合执行
  if (state.agora && state.agora.ops[0]?.player === actor) {
    state.agora.endTurnAfterOps = true;
    return;
  }
  // Agora：政治家招募后的参议院行动数未用完时同样推迟推进，
  // 否则 beginTurnReset 会把它们清零、这些动作永远无法执行（2 人局同样受影响）
  if (state.agora && state.agora.senateActionsLeft > 0) {
    state.agora.endTurnAfterOps = true;
    return;
  }
  advanceTurn(state, actor);
}

/** 交互式效果（发展标记 / 陵墓 / 摧毁建筑）处理完毕后，继续推进回合 */
function afterPending(state: GameState): void {
  const actor = state.lastActive;
  if (state.pending) {
    state.phase = phaseForPending(state.pending);
    return;
  }
  state.phase = 'playing';
  dropStarvedPlaceOps(state);
  if (state.agora && state.agora.ops[0]?.player === actor) {
    state.agora.endTurnAfterOps = true;
    return;
  }
  if (state.agora && state.agora.senateActionsLeft > 0) {
    state.agora.endTurnAfterOps = true;
    return;
  }
  if (checkVictory(state)) {
    state.phase = 'gameOver';
    return;
  }
  if (state.structureRemaining === 0) {
    endAge(state);
    return;
  }
  if (state.extraTurn) {
    state.extraTurn = false;
    return;
  }
  beginTurnReset(state, other(actor));
}

/* ------------------------------ 合法动作 ------------------------------ */

export function costPlanForCard(state: ReadableState, p: PlayerId, cardId: string): CostPlan {
  const card = CARD_BY_ID[cardId];
  if (!card) throw new Error(`未知卡牌 ${cardId}`);
  const plan = planCost(state, p, {
    cost: card.cost,
    coinCost: card.coinCost,
    kind: 'building',
    cardType: card.type,
    freeLink: card.freeLink,
  });
  return applyCostDecrees(state, p, plan, card.type);
}

export function costPlanForWonder(state: ReadableState, p: PlayerId, wonder: WonderDef): CostPlan {
  const plan = planCost(state, p, { cost: wonder.cost, kind: 'wonder' });
  return applyWonderDecrees(state, p, plan);
}

export function legalActions(state: ReadableState, p: PlayerId): GameAction[] {
  if (state.victory) return [];

  switch (state.phase) {
    case 'wonderDraft': {
      const picker = WONDER_DRAFT_ORDER[state.wonderDraftStep];
      if (picker !== p) return [];
      return state.wonderOffer.map((wonderId) => ({ type: 'DRAFT_WONDER', player: p, wonderId }));
    }
    case 'chooseProgressToken': {
      const pend = state.pending;
      if (!pend || pend.kind !== 'progressToken' || pend.player !== p) return [];
      const ids = pend.options ?? state.progressAvailable;
      return ids.map((tokenId) => ({ type: 'CHOOSE_PROGRESS_TOKEN', player: p, tokenId }));
    }
    case 'chooseDiscardedCard': {
      const pend = state.pending;
      if (!pend || pend.kind !== 'discardedCard' || pend.player !== p) return [];
      return pend.options.map((cardId) => ({ type: 'CHOOSE_DISCARDED_CARD', player: p, cardId }));
    }
    case 'chooseOpponentCard': {
      const pend = state.pending;
      if (!pend || pend.kind !== 'opponentCard' || pend.player !== p) return [];
      return pend.options.map((cardId) => ({ type: 'CHOOSE_OPPONENT_CARD', player: p, cardId }));
    }
    case 'chooseStartPlayer': {
      const pend = state.pending;
      if (!pend || pend.kind !== 'startPlayer' || pend.chooser !== p) return [];
      return ([0, 1] as PlayerId[]).map((next) => ({ type: 'CHOOSE_START_PLAYER', player: p, next }));
    }
    case 'pantheonChoice': {
      const pend = state.pending;
      if (!pend || pend.kind !== 'pantheon' || pend.player !== p) return [];
      const step = pend.steps[0];
      if (!step) return [];
      if (step.kind === 'placeDivinitySelect') {
        return step.options.map((divinityId) => ({ type: 'CHOOSE_PANTHEON', player: p, choice: divinityId }));
      }
      if (step.kind === 'placeDivinityPosition') {
        const empty: number[] = [];
        state.pantheon?.board.forEach((id, i) => {
          if (id === null) empty.push(i);
        });
        return empty.map((position) => ({
          type: 'PLACE_DIVINITY' as const,
          player: p,
          divinityId: step.divinityId,
          position,
        }));
      }
      // invokePick
      return step.options.map((choice) => ({ type: 'CHOOSE_PANTHEON', player: p, choice }));
    }
    case 'agoraChoice': {
      const pend = state.pending;
      if (!pend || pend.kind !== 'agora' || pend.player !== p) return [];
      const step = pend.steps[0];
      if (!step) return [];
      const out: GameAction[] = step.options.map((choice) => ({
        type: 'CHOOSE_AGORA' as const,
        player: p,
        choice,
      }));
      // pickChamber 步骤直接生成参议院动作（place / move / remove）
      if (step.kind === 'pickChamber') {
        if (step.purpose === 'place') {
          return step.options.map((c) => ({ type: 'SENATE_PLACE' as const, player: p, chamber: Number(c) }));
        }
        if (step.purpose === 'remove') {
          return step.options.map((c) => ({ type: 'SENATE_REMOVE' as const, player: p, chamber: Number(c) }));
        }
        // moveFrom：源 chamber 选定后目标必须在相邻集合内
        const from = Number(pend.payload);
        return adjacentChambers(from)
          .filter((to) => to !== from)
          .map((to) => ({ type: 'SENATE_MOVE' as const, player: p, from, to }));
      }
      if (step.kind === 'optMoveOrSkip') {
        out.push({ type: 'CHOOSE_AGORA', player: p, choice: 'skip' });
      }
      return out;
    }
    case 'playing': {
      if (state.current !== p) return [];
      const actions: GameAction[] = [];
      const player = state.players[p];

      /* Agora：参议院小操作 / 招募行动数未耗尽时，只允许参议院动作与触发密谋 */
      const ag = state.agora;
      if (ag) {
        const head = ag.ops[0];
        if (head && head.player === p) {
          const opActs = senateOpActions(state, p, head);
          // 无合法目标（如对手无方块可移除）时允许跳过，避免僵局
          if (opActs.length === 0) {
            return [{ type: 'CHOOSE_AGORA', player: p, choice: 'skip' }];
          }
          return opActs;
        }
        if (ag.senateActionsLeft > 0) {
          return senateRecruitActions(state, p);
        }
        // 回合开始可触发 1 张已准备的密谋（每回合限 1，不消耗主行动）
        if (!ag.triggeredThisTurn && player.agora.prepared.length > 0) {
          actions.push(
            ...player.agora.prepared.map((e) => ({
              type: 'TRIGGER_CONSPIRACY' as const,
              player: p,
              conspiracyId: e.conspiracyId,
            })),
          );
        }
        // 准备密谋：消耗整回合（零费用）
        if (player.agora.conspiracies.length > 0 && accessibleSlots(state.slots).length > 0) {
          for (const cid of player.agora.conspiracies) {
            for (const slot of accessibleSlots(state.slots)) {
              actions.push({
                type: 'PREPARE_CONSPIRACY',
                player: p,
                conspiracyId: cid,
                slot: slot.index,
              });
            }
          }
        }
      }

      for (const slot of accessibleSlots(state.slots)) {
        const i = slot.index;
        // 弃牌永远合法
        actions.push({ type: 'DISCARD_CARD', player: p, slot: i });
        const cardId = slot.cardId!;
        const card = CARD_BY_ID[cardId];
        // Agora：参议员不能「建造」，只能招募 / 弃掉 / 垫奇迹
        if (card?.type === 'senator') {
          // 费用 = 已有参议员数（Corruption 免费）：付不起不得列入合法动作，
          // 否则会出现「合法却必然被拒」的空转动作（无限循环根因）
          const recruitCost = player.progressTokens.includes('corruption') ? 0 : player.agora.senators.length;
          if (recruitCost <= player.coins) {
            actions.push({ type: 'RECRUIT_SENATOR', player: p, slot: i });
          }
        } else {
          const plan = costPlanForCard(state, p, cardId);
          if (plan.affordable) actions.push({ type: 'BUILD_CARD', player: p, slot: i });
        }
        for (const wonderId of player.wondersUnbuilt) {
          const w = WONDER_BY_ID[wonderId];
          if (!w) continue;
          const wplan = costPlanForWonder(state, p, w);
          if (wplan.affordable) actions.push({ type: 'BUILD_WONDER', player: p, slot: i, wonderId });
        }
      }
      // Pantheon：时代 II/III 可调用图板上已翻开的神格 / 门
      if (state.pantheon && state.age >= 2) {
        state.pantheon.board.forEach((id, position) => {
          if (!id || !state.pantheon!.revealed[position]) return;
          const cost = invokeCost(state, p, position, []);
          if (cost <= player.coins + player.pan.astarteCoins - player.pan.offerings.reduce((a, b) => a + b, 0)) {
            actions.push({ type: 'INVOKE_DIVINITY', player: p, position });
          }
        });
      }
      return actions;
    }
    default:
      return [];
  }
}

/* ------------------------------ 动作应用 ------------------------------ */

export function applyAction(prev: GameState, action: GameAction): GameState {
  const state = clone(prev);
  const p = action.player;

  // 登记本动作，由它产生的第一条日志领走（见 pendingAction 注释）
  pendingAction = action;

  switch (action.type) {
    case 'DRAFT_WONDER':
      applyDraftWonder(state, action);
      break;
    case 'BUILD_CARD':
      applyBuildCard(state, p, action.slot);
      break;
    case 'DISCARD_CARD':
      applyDiscard(state, p, action.slot);
      break;
    case 'BUILD_WONDER':
      applyBuildWonder(state, p, action.slot, action.wonderId);
      break;
    case 'CHOOSE_PROGRESS_TOKEN':
      applyChooseToken(state, p, action.tokenId);
      break;
    case 'CHOOSE_DISCARDED_CARD':
      applyChooseDiscarded(state, p, action.cardId);
      break;
    case 'CHOOSE_OPPONENT_CARD':
      applyChooseOpponent(state, p, action.cardId);
      break;
    case 'CHOOSE_START_PLAYER':
      applyChooseStart(state, action.next, action.player);
      break;
    case 'PLACE_DIVINITY':
      applyPlaceDivinity(state, action);
      break;
    case 'INVOKE_DIVINITY':
      applyInvokeDivinity(state, action);
      break;
    case 'CHOOSE_PANTHEON':
      applyChoosePantheon(state, action);
      break;
    case 'RECRUIT_SENATOR':
      applyRecruitSenator(state, action);
      break;
    case 'SENATE_PLACE':
      applySenatePlace(state, action);
      break;
    case 'SENATE_MOVE':
      applySenateMove(state, action);
      break;
    case 'SENATE_REMOVE':
      applySenateRemove(state, action);
      break;
    case 'PREPARE_CONSPIRACY':
      applyPrepareConspiracy(state, action);
      break;
    case 'TRIGGER_CONSPIRACY':
      applyTriggerConspiracy(state, action);
      break;
    case 'CHOOSE_AGORA':
      applyChooseAgora(state, action);
      break;
  }

  // 兜底：若本次动作没有产生任何日志（理论上不会发生），补一条只携带 action 的记录，
  // 否则回放会漏掉这一步，导致重放结果与实时对局不一致。
  if (pendingAction) {
    state.log.push({ index: state.log.length, player: p, text: '（无日志动作）', action });
    pendingAction = null;
  }

  return state;
}

/* ------------------------------ 各动作实现 ------------------------------ */

function applyDraftWonder(state: GameState, action: Extract<GameAction, { type: 'DRAFT_WONDER' }>): void {
  const p = action.player;
  const idx = state.wonderOffer.indexOf(action.wonderId);
  if (idx < 0) return;

  state.wonderOffer.splice(idx, 1);
  state.players[p].wondersUnbuilt.push(action.wonderId);
  pushLog(state, p, `选择奇迹「${WONDER_BY_ID[action.wonderId]?.zh}」`, action);

  state.wonderDraftStep += 1;
  if (state.wonderDraftStep === 8) {
    const rng = rngOf(state);
    setupAge(state, 1, rng);
    saveRng(state, rng);
    state.phase = 'playing';
    state.current = 0;
    pushLog(state, null, '奇迹选择结束，时代 I 开始');
    // 开局即翻开所有可拿取的牌
    revealSlots(state, p);
  } else {
    if (state.wonderOffer.length === 0) {
      const rng = rngOf(state);
      const all = state.players[0].wondersUnbuilt
        .concat(state.players[1].wondersUnbuilt)
        .concat(state.wonderOffer);
      // 扩展开启时奇迹池含新奇迹（Pantheon 14 / Agora 14 / 合体 16 座）
      const pool = WONDERS.map((w) => w.id).concat(
        state.pantheon ? PANTHEON_WONDERS.map((w) => w.id) : [],
        state.agora ? AGORA_WONDERS_IDS : [],
      );
      const rest = pool.filter((id) => !all.includes(id));
      state.wonderOffer = rng.sample(rest, 4);
      saveRng(state, rng);
      pushLog(state, null, '展示第二批奇迹');
    }
  }

  // Agora 新奇迹选择时效果（在牌堆推进之后处理，避免阻塞选择流程）
  const drafted = WONDER_BY_ID[action.wonderId];
  if (state.agora && drafted) {
    if (drafted.special === 'agora-knossos') {
      if (hasSpareCube(state, p)) {
        pushLog(state, p, '克诺索斯王宫：放 1 方块到任意 chamber');
        pushAgoraStep(state, p, {
          kind: 'pickChamber',
          options: state.agora.senate.chambers.map((_, i) => String(i)),
          purpose: 'place',
        });
      } else {
        pushLog(state, p, '克诺索斯王宫：面前方块已用尽，跳过放置');
      }
    } else if (drafted.special === 'agora-curia') {
      const deck = state.agora.senate.conspiracyDeck;
      const draws = deck.splice(0, Math.min(2, deck.length));
      const keepBoth = state.players[p].progressTokens.includes('organized-crime');
      if (draws.length > 0) {
        pushLog(state, p, '元老院议事室：抽 2 张密谋');
        if (keepBoth) {
          state.players[p].agora.conspiracies.push(...draws);
          pushLog(state, p, '有组织犯罪：两张密谋都保留');
        } else {
          pushAgoraStep(state, p, { kind: 'conspireKeep', options: draws });
        }
      }
    }
    if (state.pending) state.phase = phaseForPending(state.pending);
  }
}

function applyBuildCard(state: GameState, p: PlayerId, slotIndex: number): void {
  if (!isSlotAccessible(state.slots, slotIndex)) return;
  const cardId = state.slots[slotIndex].cardId!;
  const card = CARD_BY_ID[cardId];
  if (!card || card.type === 'senator') return;
  const plan = costPlanForCard(state, p, cardId);
  if (!plan.affordable) return;

  payPlan(state, p, plan);
  takeSlot(state, slotIndex);
  state.players[p].city.push(cardId);
  pushLog(
    state,
    p,
    `建造「${card?.zh}」${plan.freeByLink ? '（连锁免费）' : `，支付 ${plan.total} 金币`}`,
  );
  applyCardEffects(state, p, cardId, plan.freeByLink);
  decreeBuildCoins(state, card.type);
  finishAction(state, p);
}

function applyDiscard(state: GameState, p: PlayerId, slotIndex: number): void {
  if (!isSlotAccessible(state.slots, slotIndex)) return;
  const cardId = takeSlot(state, slotIndex);
  state.discard.push(cardId);
  const yellow = cityCards(state, p).filter((c) => c.type === 'commercial').length;
  let gain = 2 + yellow;
  // 法令「弃牌补贴」：控制该 chamber 时额外 +2 金
  if (decreeController(state, 'dec-discard-coin2') === p) gain += 2;
  gainCoins(state, p, gain);
  pushLog(state, p, `弃掉「${CARD_BY_ID[cardId]?.zh}」，获得 ${gain} 金币`);
  finishAction(state, p);
}

function applyBuildWonder(state: GameState, p: PlayerId, slotIndex: number, wonderId: string): void {
  if (!isSlotAccessible(state.slots, slotIndex)) return;
  const player = state.players[p];
  if (!player.wondersUnbuilt.includes(wonderId)) return;
  if (state.wondersBuiltTotal >= MAX_WONDERS) return;
  const wonder = WONDER_BY_ID[wonderId];
  if (!wonder) return;
  const plan = costPlanForWonder(state, p, wonder);
  if (!plan.affordable) return;

  payPlan(state, p, plan);
  // 用于建造奇迹的时代卡翻面垫在奇迹下，不进城市也不进弃牌堆（Anubis 需要其身份）
  const tuckedCardId = takeSlot(state, slotIndex);

  player.wondersUnbuilt = player.wondersUnbuilt.filter((id) => id !== wonderId);
  player.wondersBuilt.push(wonderId);
  player.wonderCards[wonderId] = tuckedCardId;
  state.wondersBuiltTotal += 1;
  pushLog(state, p, `建造奇迹「${wonder.zh}」，支付 ${plan.total} 金币`);

  if (wonder.coins) gainCoins(state, p, wonder.coins);
  if (wonder.destroyCoins) {
    const lost = loseCoins(state, other(p), wonder.destroyCoins);
    pushLog(state, p, `对手失去 ${lost} 金币`);
  }
  if (wonder.shields) advanceShields(state, p, wonder.shields);
  decreeBuildCoins(state, 'wonder');

  // Agora 新奇迹建成效果
  if (wonder.special === 'agora-knossos') {
    // 放 1 方块 + 可移 1 方块到相邻
    pushPlaceOp(state, p, 'any');
    pushOp(state, p, { kind: 'move', optional: true });
    pushLog(state, p, '克诺索斯王宫：获得参议院操作');
  } else if (wonder.special === 'agora-curia') {
    // 触发 1 张未准备的密谋（可选）+ 6 金 + 再行动
    gainCoins(state, p, 6);
    state.extraTurn = true;
    const hand = state.players[p].agora.conspiracies;
    if (hand.length > 0) {
      pushAgoraStep(state, p, { kind: 'pickTrigger', options: [...hand, 'skip'] });
      pushLog(state, p, '元老院议事室：可立即触发一张密谋');
    } else {
      pushLog(state, p, '元老院议事室：+6 金币，立即再行动');
    }
  }

  // 神学：此后建造的奇迹均视为「再次行动」；圣堂自带再行动
  const replay =
    wonder.special === 'extra-turn' ||
    wonder.special === 'pantheon-sanctuary' ||
    player.progressTokens.includes('theology');
  if (replay) state.extraTurn = true;

  if (state.wondersBuiltTotal >= MAX_WONDERS) {
    state.players[0].wondersUnbuilt = [];
    state.players[1].wondersUnbuilt = [];
    pushLog(state, null, '第 7 座奇迹落成，最后一座未建造的奇迹被移出游戏');
  }

  if (wonder.destroyCard) {
    const foe = other(p);
    const options = cityCards(state, foe)
      .filter((c) => c.type === wonder.destroyCard)
      .map((c) => c.id);
    if (options.length > 0) {
      state.pending = { kind: 'opponentCard', player: p, options, cardType: wonder.destroyCard! };
    }
  } else if (wonder.special === 'take-discards') {
    if (state.discard.length > 0) {
      state.pending = { kind: 'discardedCard', player: p, options: state.discard.slice() };
    }
  } else if (wonder.special === 'take-progress-discard') {
    requestProgressToken(state, p, true);
  } else if (wonder.special === 'pantheon-theatre') {
    // 通神大剧场：选一神话组 → 翻开该组全部卡 → 选 1 神免费调用
    if (MYTHOLOGIES.some((m) => state.pantheon!.decks[m].length > 0)) {
      pushPantheonStep(state, p, { kind: 'invokePick', divinityId: '', effect: 'theatreDeck', options: MYTHOLOGIES.filter((m) => state.pantheon!.decks[m].length > 0) });
    }
  }

  finishAction(state, p);
}

function applyChooseToken(state: GameState, p: PlayerId, tokenId: string): void {
  const pend = state.pending;
  if (!pend || pend.kind !== 'progressToken' || pend.player !== p) return;
  const pool = pend.options ?? state.progressAvailable;
  if (!pool.includes(tokenId)) return;

  if (pend.fromDiscard) {
    state.progressRemoved = state.progressRemoved.filter((id) => id !== tokenId);
    state.pending = null;
  } else {
    state.progressAvailable = state.progressAvailable.filter((id) => id !== tokenId);
    const remaining = pend.count - 1;
    state.pending = remaining > 0 ? { kind: 'progressToken', player: p, count: remaining } : null;
  }

  state.players[p].progressTokens.push(tokenId);
  const token = PROGRESS_BY_ID[tokenId];
  pushLog(state, p, `获得发展标记「${token?.zh}」`);
  if (token?.coins) gainCoins(state, p, token.coins);
  if (token?.science) addScience(state, p, token.science);

  afterPending(state);
}

function applyChooseDiscarded(state: GameState, p: PlayerId, cardId: string): void {
  const pend = state.pending;
  if (!pend || pend.kind !== 'discardedCard' || pend.player !== p) return;
  if (!pend.options.includes(cardId)) return;

  state.discard = state.discard.filter((id) => id !== cardId);
  state.pending = null;
  state.players[p].city.push(cardId);
  pushLog(state, p, `从弃牌堆免费建造「${CARD_BY_ID[cardId]?.zh}」`);
  applyCardEffects(state, p, cardId, false);
  afterPending(state);
}

function applyChooseOpponent(state: GameState, p: PlayerId, cardId: string): void {
  const pend = state.pending;
  if (!pend || pend.kind !== 'opponentCard' || pend.player !== p) return;
  if (!pend.options.includes(cardId)) return;

  const foe = other(p);
  state.players[foe].city = state.players[foe].city.filter((id) => id !== cardId);
  state.discard.push(cardId);
  state.pending = null;
  pushLog(state, p, `摧毁对手的「${CARD_BY_ID[cardId]?.zh}」`);
  afterPending(state);
}

function applyChooseStart(state: GameState, next: PlayerId, actor: PlayerId): void {
  const pend = state.pending;
  if (!pend || pend.kind !== 'startPlayer') return;
  state.pending = null;
  beginTurnReset(state, next);
  const nextAge = (state.age + 1) as 1 | 2 | 3;
  const rng = rngOf(state);
  setupAge(state, nextAge, rng);
  saveRng(state, rng);
  state.phase = 'playing';
  pushLog(state, null, `时代 ${nextAge} 开始，先手为${next === 0 ? '玩家一' : '玩家二'}`);
  revealSlots(state, actor);
}

/* ------------------------------ Pantheon ------------------------------ */

/** 某玩家在图板某位置的调用费用（不含献祭折扣；offerings 传负值列表） */
export function invokeCost(
  state: ReadableState,
  p: PlayerId,
  position: number,
  offerings: number[] = [],
): number {
  if (!state.pantheon) return 0;
  const base = BOARD_POSITION_COSTS[position]?.[p] ?? 0;
  const isGate = state.pantheon.board[position] === GATE_ID;
  let cost = isGate ? base * 2 : base;
  if (state.players[p].wondersBuilt.includes('sanctuary')) cost -= 2;
  // 献祭 token 以负值存储（-2/-3/-4），叠加负数总和即得折扣
  cost += offerings.reduce((a, b) => a + b, 0);
  return Math.max(0, cost);
}

function unshiftPantheonStep(state: GameState, p: PlayerId, step: PantheonStep): void {
  const pend = state.pending;
  if (pend && pend.kind === 'pantheon' && pend.player === p) {
    pend.steps.unshift(step);
  } else {
    state.pending = { kind: 'pantheon', player: p, steps: [step] };
  }
}

/** Pantheon 选择队列处理完毕后的回合推进 */
function afterPantheonChoice(state: GameState): void {
  const pend = state.pending;
  if (pend && pend.kind === 'pantheon') {
    if (pend.steps.length > 0) {
      state.phase = 'pantheonChoice';
      return;
    }
    state.pending = null;
  }
  // 效果可能已产生其它待决（如科技成对拿发展标记），交给 afterPending
  afterPending(state);
}

function applyPlaceDivinity(
  state: GameState,
  action: Extract<GameAction, { type: 'PLACE_DIVINITY' }>,
): void {
  const pan = state.pantheon;
  const pend = state.pending;
  if (!pan || !pend || pend.kind !== 'pantheon' || pend.player !== action.player) return;
  const step = pend.steps[0];
  if (!step || step.kind !== 'placeDivinityPosition' || step.divinityId !== action.divinityId) return;
  if (action.position < 0 || action.position > 5) return;
  if (pan.board[action.position] !== null) return;

  pan.board[action.position] = action.divinityId;
  pend.steps.shift();
  pushLog(
    state,
    action.player,
    `将「${DIVINITY_BY_ID[action.divinityId]?.zh ?? action.divinityId}」面朝下放到图板`,
  );
  afterPantheonChoice(state);
}

function applyInvokeDivinity(
  state: GameState,
  action: Extract<GameAction, { type: 'INVOKE_DIVINITY' }>,
): void {
  const pan = state.pantheon;
  if (!pan) return;
  const p = action.player;
  if (state.current !== p || state.phase !== 'playing') return;
  if (state.age < 2) return;
  const position = action.position;
  if (position < 0 || position > 5) return;
  const id = pan.board[position];
  if (!id || !pan.revealed[position]) return;

  // 献祭 token：须为持有者实际持有的面值
  const offerings = (action.offerings ?? []).slice();
  const owned = state.players[p].pan.offerings.slice();
  for (const v of offerings) {
    const idx = owned.indexOf(v);
    if (idx < 0) return;
    owned.splice(idx, 1);
  }

  let cost = invokeCost(state, p, position, offerings);

  // 动作未指定献祭且金币不足时，自动由大到小补足献祭折扣（等价于玩家必然的选择）
  if (cost > state.players[p].coins + state.players[p].pan.astarteCoins && offerings.length === 0) {
    const auto = owned.slice().sort((a, b) => a - b); // 负值：绝对值大者优先
    for (const v of auto) {
      offerings.push(v);
      owned.splice(owned.indexOf(v), 1);
      cost = invokeCost(state, p, position, offerings);
      if (cost <= state.players[p].coins + state.players[p].pan.astarteCoins) break;
    }
  }

  if (cost > state.players[p].coins + state.players[p].pan.astarteCoins) return;

  // 消耗献祭 token
  for (const v of offerings) {
    const idx = state.players[p].pan.offerings.indexOf(v);
    state.players[p].pan.offerings.splice(idx, 1);
  }
  payCoins(state, p, cost);

  pan.board[position] = null;
  const isGate = id === GATE_ID;
  if (isGate) {
    pushLog(state, p, `打开 Pantheon 之门，支付 ${cost} 金币`);
  } else {
    state.players[p].pan.invoked.push(id);
    pushLog(state, p, `调用神格「${DIVINITY_BY_ID[id]?.zh ?? id}」，支付 ${cost} 金币`);
  }
  finishAction(state, p);
  // 效果在回合推进前结算（可能产生新的选择队列）
  if (isGate) {
    applyDivinityEffect(state, p, { kind: 'gate' });
  } else {
    const div = DIVINITY_BY_ID[id];
    if (div) applyDivinityEffect(state, p, div.effect);
  }
  // 效果可能再次推进回合（如 Aphrodite 无事发生）——见各 resolve 分支末尾
  resolveAfterEffects(state, p);
}

/**
 * 神格效果结算后的回合推进。
 * 选择了目标的效果在「选择完成时」各自调用 afterPantheonChoice；
 * 无选择的效果在这里直接推进。
 */
function resolveAfterEffects(state: GameState, p: PlayerId): void {
  const pend = state.pending;
  if (pend && pend.kind === 'pantheon' && pend.steps.length > 0) {
    state.phase = 'pantheonChoice';
    return;
  }
  if (state.pending) {
    // 效果产生了其它待决（如科技成对拿发展标记）
    state.phase = phaseForPending(state.pending);
    return;
  }
  if (state.extraTurn) {
    state.extraTurn = false;
    state.phase = 'playing';
    return;
  }
  state.phase = 'playing';
  if (checkVictory(state)) {
    state.phase = 'gameOver';
    return;
  }
  if (state.structureRemaining === 0) {
    endAge(state);
    return;
  }
  state.current = other(p);
}

function applyDivinityEffect(state: GameState, p: PlayerId, effect: DivinityDef['effect']): void {
  const foe = other(p);
  switch (effect.kind) {
    case 'coins':
      gainCoins(state, p, effect.amount);
      break;
    case 'vp':
      // 终局计分（被动），无即时效果
      break;
    case 'shields':
      advanceShields(state, p, effect.amount);
      break;
    case 'science':
      addScience(state, p, effect.symbol);
      break;
    case 'astarte':
      state.players[p].pan.astarteCoins += 7;
      break;
    case 'enki': {
      if (state.pantheon!.enkiProgress.length > 0) {
        pushPantheonStep(state, p, {
          kind: 'invokePick',
          divinityId: 'enki',
          effect: 'enki',
          options: state.pantheon!.enkiProgress.slice(),
        });
      }
      break;
    }
    case 'nisaba': {
      const greens = cityCards(state, foe)
        .filter((c) => c.type === 'scientific' && c.science)
        .map((c) => c.id);
      if (greens.length > 0) {
        pushPantheonStep(state, p, { kind: 'invokePick', divinityId: 'nisaba', effect: 'nisaba', options: greens });
      }
      break;
    }
    case 'baal': {
      const targets = cityCards(state, foe)
        .filter((c) => c.type === 'raw' || c.type === 'manufactured')
        .map((c) => c.id);
      if (targets.length > 0) {
        pushPantheonStep(state, p, { kind: 'invokePick', divinityId: 'baal', effect: 'baal', options: targets });
      }
      break;
    }
    case 'hades': {
      if (state.discard.length > 0) {
        pushPantheonStep(state, p, { kind: 'invokePick', divinityId: 'hades', effect: 'hades', options: state.discard.slice() });
      }
      break;
    }
    case 'zeus': {
      const options = state.slots
        .filter((s) => !s.taken && s.cardId !== null)
        .map((s) => String(s.index));
      if (options.length > 0) {
        pushPantheonStep(state, p, { kind: 'invokePick', divinityId: 'zeus', effect: 'zeus', options });
      }
      break;
    }
    case 'anubis': {
      const options: string[] = [];
      for (const pl of state.players) {
        for (const wid of pl.wondersBuilt) options.push(wid);
      }
      if (options.length > 0) {
        pushPantheonStep(state, p, { kind: 'invokePick', divinityId: 'anubis', effect: 'anubis', options });
      }
      break;
    }
    case 'isis': {
      if (state.discard.length > 0 && state.players[p].wondersUnbuilt.length > 0) {
        pushPantheonStep(state, p, { kind: 'invokePick', divinityId: 'isis', effect: 'isis', options: state.discard.slice() });
      }
      break;
    }
    case 'ra': {
      const targets = state.players[foe].wondersUnbuilt.slice();
      if (targets.length > 0) {
        pushPantheonStep(state, p, { kind: 'invokePick', divinityId: 'ra', effect: 'ra', options: targets });
      }
      break;
    }
    case 'minerva': {
      const options: string[] = [];
      for (let pos = -CAPITAL_POS; pos <= CAPITAL_POS; pos++) {
        if (pos !== state.conflictPawn) options.push(String(pos));
      }
      pushPantheonStep(state, p, { kind: 'invokePick', divinityId: 'minerva', effect: 'minerva', options });
      break;
    }
    case 'neptune': {
      const unused = state.pantheon!.military
        .map((t, i) => (t.used ? null : String(i)))
        .filter((v): v is string => v !== null);
      if (unused.length >= 2) {
        pushPantheonStep(state, p, { kind: 'invokePick', divinityId: 'neptune', effect: 'neptuneDiscard', options: unused });
      }
      break;
    }
    case 'gate': {
      const options = MYTHOLOGIES.map((m) => state.pantheon!.decks[m][0]).filter(
        (id): id is string => Boolean(id),
      );
      if (options.length > 0) {
        pushPantheonStep(state, p, { kind: 'invokePick', divinityId: GATE_ID, effect: 'gate', options });
      }
      break;
    }
  }
}

function applyChoosePantheon(
  state: GameState,
  action: Extract<GameAction, { type: 'CHOOSE_PANTHEON' }>,
): void {
  const pan = state.pantheon;
  const pend = state.pending;
  if (!pan || !pend || pend.kind !== 'pantheon' || pend.player !== action.player) return;
  const step = pend.steps[0];
  if (!step) return;
  const p = action.player;
  const choice = action.choice;

  /* ---- 神话 token：先选神、再选图板位置 ---- */
  if (step.kind === 'placeDivinitySelect') {
    if (!step.options.includes(choice)) return;
    pend.steps.shift();
    pend.steps.unshift({ kind: 'placeDivinityPosition', divinityId: choice });
    pushLog(state, p, `把「${DIVINITY_BY_ID[choice]?.zh ?? choice}」加入 Pantheon 图板候选`);
    state.phase = 'pantheonChoice';
    return;
  }

  if (step.kind === 'placeDivinityPosition') {
    // 应走 PLACE_DIVINITY 动作，这里不处理
    return;
  }

  /* ---- invokePick：按效果类型结算 ---- */
  if (step.kind === 'invokePick') {
    if (!step.options.includes(choice)) return;
    pend.steps.shift();
    const deckOf = (name: string) => pan.decks[name as Mythology];

    switch (step.effect) {
      case 'enki': {
        // 选 1 枚获得，另 1 枚回盒
        pan.enkiProgress = pan.enkiProgress.filter((id) => id !== choice);
        state.progressRemoved = state.progressRemoved.filter((id) => id !== choice);
        state.players[p].progressTokens.push(choice);
        const token = PROGRESS_BY_ID[choice];
        pushLog(state, p, `Enki：获得发展标记「${token?.zh}」`);
        if (token?.coins) gainCoins(state, p, token.coins);
        if (token?.science) addScience(state, p, token.science);
        break;
      }
      case 'nisaba': {
        pan.snake = { cardId: choice, owner: other(p) };
        const sym = CARD_BY_ID[choice]?.science;
        if (sym) addScience(state, p, sym);
        pushLog(state, p, `Nisaba：蛇 token 附着对手的「${CARD_BY_ID[choice]?.zh}」`);
        break;
      }
      case 'baal': {
        state.players[other(p)].city = state.players[other(p)].city.filter((id) => id !== choice);
        state.players[p].city.push(choice);
        pushLog(state, p, `Baal：抢走对手的「${CARD_BY_ID[choice]?.zh}」`);
        break;
      }
      case 'hades': {
        state.discard = state.discard.filter((id) => id !== choice);
        state.players[p].city.push(choice);
        pushLog(state, p, `Hades：从弃牌堆免费建造「${CARD_BY_ID[choice]?.zh}」`);
        applyCardEffects(state, p, choice, false);
        break;
      }
      case 'zeus': {
        const slotIndex = Number(choice);
        const slot = state.slots[slotIndex];
        if (slot && !slot.taken && slot.cardId !== null) {
          const cardId = slot.cardId;
          slot.cardId = null;
          slot.taken = true;
          state.structureRemaining = Math.max(0, state.structureRemaining - 1);
          state.discard.push(cardId);
          delete pan.age1Tokens[slotIndex];
          delete pan.age2Tokens[slotIndex];
          pushLog(state, p, `Zeus：把「${CARD_BY_ID[cardId]?.zh}」弃入弃牌堆`);
          revealSlots(state, p);
        }
        break;
      }
      case 'anubis': {
        const wid = choice;
        for (const pl of state.players) {
          if (pl.wondersBuilt.includes(wid)) {
            pl.wondersBuilt = pl.wondersBuilt.filter((id) => id !== wid);
            pl.wondersUnbuilt.push(wid);
            const tucked = pl.wonderCards[wid];
            delete pl.wonderCards[wid];
            if (tucked) state.discard.push(tucked);
            state.wondersBuiltTotal = Math.max(0, state.wondersBuiltTotal - 1);
          }
        }
        pushLog(state, p, `Anubis：拆掉「${WONDER_BY_ID[wid]?.zh}」（已获效果保留，可重建）`);
        break;
      }
      case 'ra': {
        const foe = other(p);
        state.players[foe].wondersUnbuilt = state.players[foe].wondersUnbuilt.filter(
          (id) => id !== choice,
        );
        state.players[p].wondersUnbuilt.push(choice);
        pushLog(state, p, `Ra：抢走对手未建的「${WONDER_BY_ID[choice]?.zh}」`);
        break;
      }
      case 'minerva': {
        pan.minerva = Number(choice);
        pushLog(state, p, `Minerva：棋子放到军事轨道第 ${choice} 格`);
        break;
      }
      case 'neptuneDiscard': {
        const idx = Number(choice);
        if (pan.military[idx]) pan.military[idx].used = true;
        pend.payload = choice;
        pushLog(state, p, `Neptune：弃掉 1 枚军事 token（不生效）`);
        // 下一步：从剩余未用 token 中选 1 枚生效
        const rest = pan.military
          .map((t, i) => (t.used ? null : String(i)))
          .filter((v): v is string => v !== null);
        unshiftPantheonStep(state, p, {
          kind: 'invokePick',
          divinityId: 'neptune',
          effect: 'neptuneApply',
          options: rest,
        });
        state.phase = 'pantheonChoice';
        return;
      }
      case 'neptuneApply': {
        const idx = Number(choice);
        const token = pan.military[idx];
        if (token) {
          token.used = true;
          const lost = loseCoins(state, other(p), token.fine);
          pushLog(state, p, `Neptune：军事 token 生效，对手失去 ${lost} 金币`);
        }
        break;
      }
      case 'gate': {
        const deckName = (MYTHOLOGIES as Mythology[]).find((m) => pan.decks[m][0] === choice);
        if (deckName) pan.decks[deckName].shift();
        state.players[p].pan.invoked.push(choice);
        pushLog(state, p, `门：免费调用「${DIVINITY_BY_ID[choice]?.zh ?? choice}」`);
        const div = DIVINITY_BY_ID[choice];
        if (div) applyDivinityEffect(state, p, div.effect);
        break;
      }
      case 'theatreDeck': {
        const deck = deckOf(choice);
        const options = deck.slice();
        pend.payload = choice;
        unshiftPantheonStep(state, p, {
          kind: 'invokePick',
          divinityId: 'divine-theatre',
          effect: 'theatrePick',
          options,
          payload: choice,
        });
        pushLog(state, p, `通神大剧场：翻开「${mythLabel(choice as Mythology)}」组的全部神格`);
        state.phase = 'pantheonChoice';
        return;
      }
      case 'theatrePick': {
        const deckName = (step.payload ?? pend.payload ?? '') as Mythology;
        const deck = pan.decks[deckName];
        const idx = deck.indexOf(choice);
        if (idx >= 0) deck.splice(idx, 1);
        state.players[p].pan.invoked.push(choice);
        pushLog(state, p, `通神大剧场：免费调用「${DIVINITY_BY_ID[choice]?.zh ?? choice}」`);
        const div = DIVINITY_BY_ID[choice];
        if (div) applyDivinityEffect(state, p, div.effect);
        break;
      }
      case 'isis': {
        // 第一步选中的弃牌存入 payload，第二步选择用哪座奇迹承接
        pend.payload = choice;
        unshiftPantheonStep(state, p, {
          kind: 'invokePick',
          divinityId: 'isis',
          effect: 'isisWonder',
          options: state.players[p].wondersUnbuilt.slice(),
          payload: choice,
        });
        state.phase = 'pantheonChoice';
        return;
      }
      case 'isisWonder': {
        const cardId = step.payload ?? pend.payload ?? '';
        if (!cardId) break;
        state.discard = state.discard.filter((id) => id !== cardId);
        const player = state.players[p];
        player.wondersUnbuilt = player.wondersUnbuilt.filter((id) => id !== choice);
        player.wondersBuilt.push(choice);
        player.wonderCards[choice] = cardId;
        state.wondersBuiltTotal += 1;
        pushLog(state, p, `Isis：用「${CARD_BY_ID[cardId]?.zh}」免费建造奇迹「${WONDER_BY_ID[choice]?.zh}」`);
        if (state.wondersBuiltTotal >= MAX_WONDERS) {
          state.players[0].wondersUnbuilt = [];
          state.players[1].wondersUnbuilt = [];
          pushLog(state, null, '第 7 座奇迹落成，最后一座未建造的奇迹被移出游戏');
        }
        if (player.progressTokens.includes('theology')) state.extraTurn = true;
        break;
      }
    }

    afterPantheonChoice(state);
    return;
  }
}



/** 当前需要作出选择的玩家（联合机 / AI 共用） */
export function activePlayer(state: ReadableState): PlayerId | null {
  if (state.victory) return null;
  switch (state.phase) {
    case 'wonderDraft':
      return WONDER_DRAFT_ORDER[state.wonderDraftStep] ?? null;
    case 'playing':
      return state.current;
    case 'chooseStartPlayer': {
      const pend = state.pending;
      return pend && pend.kind === 'startPlayer' ? pend.chooser : null;
    }
    default: {
      const pend = state.pending;
      return pend && 'player' in pend ? pend.player : null;
    }
  }
}

/** 某槽位是否可拿取（供 UI 高亮） */
export function canTake(state: ReadableState, slotIndex: number): boolean {
  return isSlotAccessible(state.slots, slotIndex);
}

export function pendingOptions(state: ReadableState): string[] {
  const pend = state.pending;
  if (!pend) return [];
  if (pend.kind === 'progressToken') return pend.options ?? state.progressAvailable;
  if (pend.kind === 'discardedCard' || pend.kind === 'opponentCard') return pend.options;
  if (pend.kind === 'pantheon') {
    const step = pend.steps[0];
    if (!step) return [];
    if (step.kind === 'placeDivinitySelect' || step.kind === 'invokePick') return step.options;
    // placeDivinityPosition 的选项是图板空位序号
    const empty: string[] = [];
    state.pantheon?.board.forEach((id, i) => {
      if (id === null) empty.push(String(i));
    });
    return empty;
  }
  return [];
}

/* ====================================================================
 * Agora 扩展（M7）
 *
 * 参议院：6 chamber（分值 1,2,3,3,2,1）、24 方块、严格多数控制、
 * 政治霸权（控制全部 6 chamber 立即胜）。
 * 参议员：招募费用 = 已有参议员数（Corruption 免费）；政治家按蓝卡分档
 * 获得参议院行动数（0-1→1 / 2-3→2 / 4+→3，参议院雄辩 +2）；
 * 密谋者二选一（放 1 方块 或 Conspire 抽 2 留 1）。
 * 密谋：回合开始可触发 1 张（不消耗回合）；准备密谋消耗整回合。
 * 法令：16 枚随机 6 枚上 board，控制者享受效果。
 * ==================================================================== */

/** chamber 上当前生效（面朝上）的法令 id 列表 */
function activeDecrees(ch: ChamberState): string[] {
  const out: string[] = [];
  if (ch.decree && ch.decreeFaceUp) out.push(ch.decree);
  for (const e of ch.decreeExtra) if (e.faceUp) out.push(e.id);
  return out;
}

/** 拥有某生效法令的玩家（若多 chamber 重复则取先者；同一法令全局仅一枚） */
function decreeController(state: ReadableState, decreeId: string): PlayerId | null {
  if (!state.agora) return null;
  for (const ch of state.agora.senate.chambers) {
    if (activeDecrees(ch).includes(decreeId)) return ch.controller;
  }
  return null;
}

/** 控制 chamber 的法令效果是否对玩家 p 生效 */
function hasActiveDecree(state: ReadableState, p: PlayerId, decreeId: string): boolean {
  return state.agora !== null && decreeController(state, decreeId) === p;
}

function pushAgoraStep(state: GameState, p: PlayerId, step: AgoraStep): void {
  const pend = state.pending;
  if (pend && pend.kind === 'agora' && pend.player === p) {
    pend.steps.push(step);
  } else {
    state.pending = { kind: 'agora', player: p, steps: [step] };
  }
}

function pushOp(state: GameState, p: PlayerId, op: SenateOp['op']): void {
  state.agora?.ops.push({ player: p, op });
}

/**
 * 排队一次「放置」：方块已全部摆出时直接跳过。
 *
 * ⚠️ 必须在**入队时**判，不能等到枚举动作时才判 —— 回合推进会在 `ops[0]` 上等待，
 * 一个无从执行的放置操作会把整局卡住（与 M8-P 合体 seed 1370 那类卡死同一形状）。
 */
function pushPlaceOp(
  state: GameState,
  p: PlayerId,
  district: 'left' | 'center' | 'right' | 'any',
): void {
  if (!hasSpareCube(state, p)) return;
  pushOp(state, p, { kind: 'place', district });
}

/** 图板上已摆出的方块数（供给上限见 `SENATE_CUBE_SUPPLY`） */
function cubesPlaced(state: ReadableState, p: PlayerId): number {
  return state.agora!.senate.chambers.reduce((s, ch) => s + ch.cubes[p], 0);
}

/** 该方手里是否还有可摆的方块 */
function hasSpareCube(state: ReadableState, p: PlayerId): boolean {
  return cubesPlaced(state, p) < SENATE_CUBE_SUPPLY;
}

/**
 * 在 chamber 放置 1 枚方块：触碰暗法令即翻开，并重算控制。
 * 方块已全部摆出时**不执行**（返回 false）——官方规则每人只有 12 枚。
 */
function placeCube(state: GameState, p: PlayerId, chamberIdx: number): boolean {
  const ch = state.agora!.senate.chambers[chamberIdx];
  if (!ch || !hasSpareCube(state, p)) return false;
  ch.cubes[p] += 1;
  if (ch.decree && !ch.decreeFaceUp) {
    ch.decreeFaceUp = true;
    pushLog(state, p, `参议院：翻开法令「${DEGREE_BY_ID[ch.decree]?.zh ?? ch.decree}」`);
  }
  updateChamber(state, chamberIdx);
  return true;
}

/** 重算 chamber 控制权；控制变化时结算「军事推进」法令并检查政治霸权 */
function updateChamber(state: GameState, idx: number): void {
  const ag = state.agora!;
  const ch = ag.senate.chambers[idx];
  const prev = ch.controller;
  const next: PlayerId | null = ch.cubes[0] > ch.cubes[1] ? 0 : ch.cubes[1] > ch.cubes[0] ? 1 : null;
  if (prev === next) return;
  ch.controller = next;

  // 「军事推进」法令：失去控制 → 冲突棋子反向；被夺 → 退 2 格
  if (prev !== null && activeDecrees(ch).includes('dec-shield-push')) {
    shiftPawnAgainst(state, prev, next !== null ? 2 : 1);
  }
  if (next !== null && activeDecrees(ch).includes('dec-shield-push')) {
    advanceShields(state, next, 1);
  }

  if (next !== null) {
    pushLog(state, next, `控制了参议院第 ${idx + 1} 议厅`);
  } else if (prev !== null) {
    pushLog(state, prev, `失去对参议院第 ${idx + 1} 议厅的控制`);
  }

  checkHegemony(state);
}

/** 让玩家 q 的冲突棋子向其对手方向移动 n 格 */
function shiftPawnAgainst(state: GameState, q: PlayerId, n: number): void {
  const dir = q === 0 ? -1 : 1;
  let pawn = state.conflictPawn + dir * n;
  if (pawn > CAPITAL_POS) pawn = CAPITAL_POS;
  if (pawn < -CAPITAL_POS) pawn = -CAPITAL_POS;
  state.conflictPawn = pawn;
  if (Math.abs(pawn) >= CAPITAL_POS) {
    state.victory = { type: 'military', winner: pawn > 0 ? 0 : 1 };
  }
}

/** 政治霸权：控制全部 6 chamber 立即获胜 */
function checkHegemony(state: GameState): void {
  if (state.victory || !state.agora) return;
  for (const q of [0, 1] as PlayerId[]) {
    if (state.agora.senate.chambers.every((ch) => ch.controller === q)) {
      pushLog(state, q, '政治霸权：控制了全部 6 个议厅！');
      state.victory = { type: 'political', winner: q };
      state.phase = 'gameOver';
      return;
    }
  }
}

/** 进入军事区块时结算 Agora 军事 token（替换基础版罚金） */
function agoraZoneEntry(state: GameState, p: PlayerId, zi: number): void {
  const ag = state.agora!;
  const token = ag.military.find((t) => !t.used && t.zone === zi);
  if (!token) return;
  token.used = true;
  if (token.kind === 'place') {
    pushLog(state, p, `进入「${zoneLabel(zi)}」，军事 token：放置 1 方块`);
    pushPlaceOp(state, p, 'any');
  } else {
    pushLog(state, p, `进入「${zoneLabel(zi)}」，军事 token：移动 + 移除方块`);
    pushOp(state, p, { kind: 'move' });
    pushOp(state, p, { kind: 'remove' });
  }
}

/* ------------------------------ 参议院动作的合法枚举 ------------------------------ */

function allowedPlaceChambers(state: ReadableState, p: PlayerId, district: string | undefined): number[] {
  if (!hasSpareCube(state, p)) return [];
  const out: number[] = [];
  state.agora!.senate.chambers.forEach((_, i) => {
    if (!district || district === 'any' || districtOf(i) === district) out.push(i);
  });
  return out;
}

function ownMovePairs(state: ReadableState, p: PlayerId): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  state.agora!.senate.chambers.forEach((ch, i) => {
    if (ch.cubes[p] <= 0) return;
    for (const to of adjacentChambers(i)) out.push({ from: i, to });
  });
  return out;
}

/** ops 队列头的动作枚举 */
function senateOpActions(state: ReadableState, p: PlayerId, head: SenateOp): GameAction[] {
  const out: GameAction[] = [];
  if (head.op.kind === 'place') {
    for (const c of allowedPlaceChambers(state, p, head.op.district)) {
      out.push({ type: 'SENATE_PLACE', player: p, chamber: c });
    }
  } else if (head.op.kind === 'move') {
    for (const m of ownMovePairs(state, p)) {
      out.push({ type: 'SENATE_MOVE', player: p, from: m.from, to: m.to });
    }
    if (head.op.optional) out.push({ type: 'CHOOSE_AGORA', player: p, choice: 'skip' });
  } else {
    state.agora!.senate.chambers.forEach((ch, i) => {
      if (ch.cubes[other(p)] > 0) out.push({ type: 'SENATE_REMOVE', player: p, chamber: i });
    });
  }
  return out;
}

/** 招募政治家后的行动数枚举：放置（限分区）或移动，二选一 */
function senateRecruitActions(state: ReadableState, p: PlayerId): GameAction[] {
  const ag = state.agora!;
  const out: GameAction[] = [];
  for (const c of allowedPlaceChambers(state, p, ag.politicianDistrict ?? undefined)) {
    out.push({ type: 'SENATE_PLACE', player: p, chamber: c });
  }
  for (const m of ownMovePairs(state, p)) {
    out.push({ type: 'SENATE_MOVE', player: p, from: m.from, to: m.to });
  }
  return out;
}

/** ops 队列清空（且招募行动数用完）时的回合推进 */
function resolveSenateOpsDone(state: GameState, p: PlayerId): void {
  const ag = state.agora;
  if (!ag) return;
  dropStarvedPlaceOps(state);
  // 参议院小操作同样可能经由法令 / 军事推进即时定胜负。
  // 此时即使还有未用完的参议院行动，也必须立即结束对局——否则会留下
  // 「victory 已定、phase 仍为 playing」的不一致状态（legalActions 因 victory 返回空，
  // 而 senateActionsLeft > 0 又让调用方以为还能继续行动 → 卡死）。
  // 该路径由 M8-P Pantheon+Agora 合体仿真发现（seed 1370）。
  if (state.victory) {
    state.phase = 'gameOver';
    return;
  }
  if (ag.ops.length > 0 || ag.senateActionsLeft > 0) return;
  if (ag.endTurnAfterOps) {
    ag.endTurnAfterOps = false;
    finishAction(state, p);
  }
}

/* ------------------------------ 动作实现 ------------------------------ */

function applyRecruitSenator(
  state: GameState,
  action: Extract<GameAction, { type: 'RECRUIT_SENATOR' }>,
): void {
  const ag = state.agora;
  if (!ag) return;
  const p = action.player;
  if (state.current !== p || state.phase !== 'playing') return;
  if (!isSlotAccessible(state.slots, action.slot)) return;
  const cardId = state.slots[action.slot].cardId!;
  const sen = SENATOR_BY_ID[cardId];
  if (!sen) return;
  const player = state.players[p];

  const free = player.progressTokens.includes('corruption');
  const cost = free ? 0 : player.agora.senators.length;
  if (cost > player.coins) return;

  player.coins -= cost;
  takeSlot(state, action.slot);
  player.agora.senators.push(cardId);
  pushLog(state, p, `招募「${sen.zh}」${free ? '（腐败：免费）' : `，支付 ${cost} 金币`}`);

  if (sen.kind === 'politician') {
    const blue2 = hasActiveDecree(state, p, 'dec-senate-blue2');
    const blues = cityCards(state, p).filter((c) => c.type === 'civilian').length + (blue2 ? 2 : 0);
    ag.senateActionsLeft = senateActionsFor(blues);
    ag.politicianDistrict = sen.district ?? null;
    ag.endTurnAfterOps = true;
    finishAction(state, p); // 只做 reveal + 延迟推进（senateActionsLeft > 0）
    return;
  }

  // 密谋者：二选一（放 1 方块 或 Conspire）；方块用尽时只剩 Conspire
  ag.endTurnAfterOps = true;
  pushAgoraStep(state, p, {
    kind: 'conspiratorChoose',
    options: hasSpareCube(state, p) ? ['place', 'conspire'] : ['conspire'],
  });
  if (hasActiveDecree(state, p, 'dec-conspire-extra')) {
    pushLog(state, p, '密谋再起：招募密谋者后立即再行动');
    state.extraTurn = true;
  }
  finishAction(state, p);
}

function applySenatePlace(
  state: GameState,
  action: Extract<GameAction, { type: 'SENATE_PLACE' }>,
): void {
  const ag = state.agora;
  if (!ag) return;
  const p = action.player;
  const ch = ag.senate.chambers[action.chamber];
  if (!ch) return;

  // pending 的 pickChamber(place) 路径（Knossos 选择时效果等）
  const pend = state.pending;
  if (pend?.kind === 'agora') {
    const step = pend.steps[0];
    if (step?.kind !== 'pickChamber' || step.purpose !== 'place') return;
    if (!step.options.includes(String(action.chamber))) return;
    if (pend.player !== p) return;
    pend.steps.shift();
    if (placeCube(state, p, action.chamber)) {
      pushLog(state, p, `参议院：放置方块到第 ${action.chamber + 1} 议厅`);
    }
    afterAgoraChoice(state, p);
    return;
  }
  if (state.current !== p) return;

  const head = ag.ops[0];
  if (head && head.player === p && head.op.kind === 'place') {
    const d = head.op.district;
    if (d && d !== 'any' && districtOf(action.chamber) !== d) return;
    ag.ops.shift();
  } else if (!head && ag.senateActionsLeft > 0) {
    if (ag.politicianDistrict && districtOf(action.chamber) !== ag.politicianDistrict) return;
    ag.senateActionsLeft -= 1;
  } else {
    return;
  }

  if (placeCube(state, p, action.chamber)) {
    pushLog(state, p, `参议院：放置方块到第 ${action.chamber + 1} 议厅`);
  }
  resolveSenateOpsDone(state, p);
}

function applySenateMove(
  state: GameState,
  action: Extract<GameAction, { type: 'SENATE_MOVE' }>,
): void {
  const ag = state.agora;
  if (!ag) return;
  const p = action.player;
  const src = ag.senate.chambers[action.from];
  const dst = ag.senate.chambers[action.to];
  if (!src || !dst) return;
  if (!adjacentChambers(action.from).includes(action.to)) return;
  if (src.cubes[p] <= 0) return;

  // pending 的 pickChamber(moveFrom) 路径
  const pend = state.pending;
  if (pend?.kind === 'agora') {
    const step = pend.steps[0];
    if (step?.kind !== 'pickChamber' || step.purpose !== 'moveFrom') return;
    if (pend.player !== p) return;
    if (step.options.includes(String(action.from)) && pend.payload === String(action.from)) {
      pend.steps.shift();
      pend.payload = undefined;
      src.cubes[p] -= 1;
      dst.cubes[p] += 1;
      if (dst.decree && !dst.decreeFaceUp) {
        dst.decreeFaceUp = true;
        pushLog(state, p, `参议院：翻开法令「${DEGREE_BY_ID[dst.decree]?.zh ?? dst.decree}」`);
      }
      updateChamber(state, action.from);
      updateChamber(state, action.to);
      pushLog(state, p, `参议院：移动方块（第 ${action.from + 1} → 第 ${action.to + 1} 议厅）`);
      afterAgoraChoice(state, p);
    }
    return;
  }
  if (state.current !== p) return;

  const head = ag.ops[0];
  if (head && head.player === p && head.op.kind === 'move') {
    ag.ops.shift();
  } else if (!head && ag.senateActionsLeft > 0) {
    ag.senateActionsLeft -= 1;
  } else {
    return;
  }

  src.cubes[p] -= 1;
  dst.cubes[p] += 1;
  if (dst.decree && !dst.decreeFaceUp) {
    dst.decreeFaceUp = true;
    pushLog(state, p, `参议院：翻开法令「${DEGREE_BY_ID[dst.decree]?.zh ?? dst.decree}」`);
  }
  updateChamber(state, action.from);
  updateChamber(state, action.to);
  pushLog(state, p, `参议院：移动方块（第 ${action.from + 1} → 第 ${action.to + 1} 议厅）`);
  resolveSenateOpsDone(state, p);
}

function applySenateRemove(
  state: GameState,
  action: Extract<GameAction, { type: 'SENATE_REMOVE' }>,
): void {
  const ag = state.agora;
  if (!ag) return;
  const p = action.player;
  const ch = ag.senate.chambers[action.chamber];
  if (!ch || ch.cubes[other(p)] <= 0) return;

  // pending 的 pickChamber(remove) 路径
  const pend = state.pending;
  if (pend?.kind === 'agora') {
    const step = pend.steps[0];
    if (step?.kind !== 'pickChamber' || step.purpose !== 'remove') return;
    if (pend.player !== p) return;
    if (!step.options.includes(String(action.chamber))) return;
    pend.steps.shift();
    ch.cubes[other(p)] -= 1;
    updateChamber(state, action.chamber);
    pushLog(state, p, `参议院：移除对手第 ${action.chamber + 1} 议厅的 1 枚方块`);
    afterAgoraChoice(state, p);
    return;
  }
  if (state.current !== p) return;

  const head = ag.ops[0];
  if (head && head.player === p && head.op.kind === 'remove') {
    ag.ops.shift();
  } else {
    return;
  }

  ch.cubes[other(p)] -= 1;
  updateChamber(state, action.chamber);
  pushLog(state, p, `参议院：移除对手第 ${action.chamber + 1} 议厅的 1 枚方块`);
  resolveSenateOpsDone(state, p);
}

function applyPrepareConspiracy(
  state: GameState,
  action: Extract<GameAction, { type: 'PREPARE_CONSPIRACY' }>,
): void {
  if (!state.agora || state.current !== action.player || state.phase !== 'playing') return;
  const p = action.player;
  const pl = state.players[p];
  if (!pl.agora.conspiracies.includes(action.conspiracyId)) return;
  if (!isSlotAccessible(state.slots, action.slot)) return;
  const slot = state.slots[action.slot];
  if (slot.cardId === null) return;

  // 盖上的牌取自明置牌阵（身份公开），密谋身份保密
  takeSlot(state, action.slot);
  pl.agora.prepared.push({ conspiracyId: action.conspiracyId, cardId: slot.cardId });
  pushLog(state, p, '进行了一次密谋准备');
  finishAction(state, p);
}

function applyTriggerConspiracy(
  state: GameState,
  action: Extract<GameAction, { type: 'TRIGGER_CONSPIRACY' }>,
): void {
  const ag = state.agora;
  if (!ag || state.current !== action.player || state.phase !== 'playing') return;
  const p = action.player;
  if (ag.triggeredThisTurn) return;
  const pl = state.players[p];
  const entry = pl.agora.prepared.find((e) => e.conspiracyId === action.conspiracyId);
  if (!entry) return;

  ag.triggeredThisTurn = true;
  pl.agora.prepared = pl.agora.prepared.filter((e) => e !== entry);
  pl.agora.triggered.push(entry.conspiracyId);
  state.discard.push(entry.cardId);
  pushLog(state, p, `触发密谋「${CONSPIRACY_BY_ID[entry.conspiracyId]?.zh}」`);
  // 触发不消耗回合：主行动仍可执行
  ag.endTurnAfterOps = false;
  triggerConspiracyEffect(state, p, entry.conspiracyId);
  // 主效果需要选择时：先阻塞在 agoraChoice，决完再回到 playing 执行 ops / 主行动
  if (state.pending?.kind === 'agora') state.phase = 'agoraChoice';
}

/** 密谋效果结算：主效果（可能产生选择队列）+ 方块小操作 */
function triggerConspiracyEffect(state: GameState, p: PlayerId, conspiracyId: string): void {
  const def = CONSPIRACY_BY_ID[conspiracyId];
  if (!def) return;
  const foe = other(p);

  if (def.main) applyConspiracyMain(state, p, def.main);

  for (const op of def.ops) {
    switch (op.kind) {
      case 'place':
        pushPlaceOp(state, p, 'any');
        break;
      case 'move':
        pushOp(state, p, { kind: 'move' });
        break;
      case 'remove':
        pushOp(state, p, { kind: 'remove' });
        break;
      case 'gain-cubes': {
        const n = state.agora!.senate.chambers.reduce((s, ch) => s + ch.cubes[p], 0);
        gainCoins(state, p, n);
        pushLog(state, p, `参议院影响：获得 ${n} 金币`);
        break;
      }
      case 'drain-cubes': {
        const n = state.agora!.senate.chambers.reduce((s, ch) => s + ch.cubes[foe], 0);
        const lost = loseCoins(state, foe, n);
        pushLog(state, p, `参议院影响：对手失去 ${lost} 金币`);
        break;
      }
    }
  }
}

/** 建造类免费效果共用：把一张移除牌直接建进城市 */
function freeBuildRemoved(state: GameState, p: PlayerId, cardId: string): void {
  if (!state.removedFromGame.includes(cardId)) return;
  const card = CARD_BY_ID[cardId];
  if (!card || card.type === 'senator') return;
  state.removedFromGame = state.removedFromGame.filter((id) => id !== cardId);
  state.players[p].city.push(cardId);
  pushLog(state, p, `免费建造「${card.zh}」（取回被移除的卡）`);
  applyCardEffects(state, p, cardId, false);
  decreeBuildCoins(state, card.type);
}

/** 结构上的免费建造（密谋 / 财产欺诈） */
function freeBuildStructure(state: GameState, p: PlayerId, cardId: string): void {
  const slot = state.slots.find((s) => !s.taken && s.cardId === cardId);
  if (!slot) return;
  const card = CARD_BY_ID[cardId];
  if (!card || card.type === 'senator') return;
  takeSlot(state, state.slots.indexOf(slot));
  state.players[p].city.push(cardId);
  pushLog(state, p, `免费建造「${card.zh}」`);
  applyCardEffects(state, p, cardId, false);
  decreeBuildCoins(state, card.type);
}

function applyConspiracyMain(state: GameState, p: PlayerId, main: string): void {
  const foe = other(p);
  const foeCity = cityCards(state, foe);
  const push = (step: AgoraStep, payload?: string) => {
    pushAgoraStep(state, p, step);
    if (payload !== undefined && state.pending?.kind === 'agora') state.pending.payload = payload;
  };

  switch (main) {
    case 'discard-opp-blue':
    case 'discard-opp-yellow': {
      const type = main === 'discard-opp-blue' ? 'civilian' : 'commercial';
      const options = foeCity.filter((c) => c.type === type).map((c) => c.id);
      if (options.length === 0) return;
      push({ kind: 'pickOppCard', options, cardType: main === 'discard-opp-blue' ? 'blue' : 'yellow' }, 'discard');
      return;
    }
    case 'discard-structure2': {
      const options = state.slots.filter((s) => !s.taken && s.faceUp && s.cardId !== null).map((s) => s.cardId!);
      if (options.length === 0) return;
      push({ kind: 'pickBuild', options }, 'discard-structure:1');
      return;
    }
    case 'destroy-opp-wonder': {
      const options = state.players[foe].wondersBuilt.slice();
      if (options.length === 0) return;
      push({ kind: 'pickOppWonder', options, mode: 'destroy' });
      return;
    }
    case 'free-build-bottom': {
      // 末行卡：可拿取的槽位里的非参议员卡
      const options = accessibleSlots(state.slots)
        .map((s) => s.cardId!)
        .filter((id) => CARD_BY_ID[id]?.type !== 'senator');
      if (options.length === 0) return;
      push({ kind: 'pickBuild', options }, 'free-build-structure');
      return;
    }
    case 'free-build-removed-1':
    case 'free-build-removed-2':
    case 'free-build-removed-3': {
      const age = Number(main.slice(-1)) as 1 | 2 | 3;
      const options = state.removedFromGame.filter((id) => {
        const c = CARD_BY_ID[id];
        return c && c.age === age && c.type !== 'senator';
      });
      if (options.length === 0) return;
      push({ kind: 'pickBuild', options }, 'free-build-removed');
      return;
    }
    case 'steal-progress-token': {
      if (state.progressAvailable.length === 0) return;
      push({ kind: 'pickProgress', options: state.progressAvailable.slice(), mode: 'steal' });
      return;
    }
    case 'peek-removed-build': {
      const options = state.removedFromGame.filter((id) => CARD_BY_ID[id]?.type !== 'senator');
      if (options.length === 0) return;
      push({ kind: 'pickBuild', options }, 'free-build-removed');
      return;
    }
    case 'take-removed-progress': {
      if (state.progressRemoved.length === 0) return;
      push({ kind: 'pickProgress', options: state.progressRemoved.slice(), mode: 'fromRemoved' });
      return;
    }
    case 'steal-unbuilt-wonder': {
      const options = state.players[foe].wondersUnbuilt.slice();
      if (options.length === 0) return;
      push({ kind: 'pickOppWonder', options, mode: 'steal' });
      return;
    }
    case 'take-half-coins': {
      const half = Math.ceil(state.players[foe].coins / 2);
      const lost = loseCoins(state, foe, half);
      gainCoins(state, p, lost);
      pushLog(state, p, `敲诈：夺取对手 ${lost} 金币`);
      return;
    }
    case 'swap-blue-green': {
      const options = foeCity.filter((c) => c.type === 'civilian' || c.type === 'scientific').map((c) => c.id);
      if (options.length === 0) return;
      push({ kind: 'pickOppCard', options, cardType: 'blue' }, 'swap');
      return;
    }
    case 'move-decree': {
      const options = state.agora!.senate.chambers
        .map((ch, i) => (ch.decree || ch.decreeExtra.length > 0 ? String(i) : ''))
        .filter((s) => s !== '');
      if (options.length === 0) return;
      push({ kind: 'pickDecreeMove', options });
      return;
    }
    case 'steal-raw-manu': {
      const options = foeCity.filter((c) => c.type === 'raw' || c.type === 'manufactured').map((c) => c.id);
      if (options.length === 0) return;
      push({ kind: 'pickOppCard', options, cardType: 'raw' }, 'steal');
      return;
    }
  }
}

/** CHOOSE_AGORA 通用结算（含 optional move 的 skip） */
function applyChooseAgora(
  state: GameState,
  action: Extract<GameAction, { type: 'CHOOSE_AGORA' }>,
): void {
  const p = action.player;
  const ag = state.agora!;
  const choice = action.choice;

  // 无 pending 的 skip：跳过可选移动 op，或无合法目标的 op
  if (choice === 'skip' && ag && (!state.pending || state.pending.kind !== 'agora')) {
    const head = ag.ops[0];
    if (head && head.player === p) {
      const acts = senateOpActions(state, p, head);
      const skippable =
        (head.op.kind === 'move' && head.op.optional) || acts.length === 0;
      if (skippable) {
        ag.ops.shift();
        pushLog(state, p, '跳过参议院操作（无可选目标或可选项）');
        resolveSenateOpsDone(state, p);
      }
    }
    return;
  }

  const pend = state.pending;
  if (!pend || pend.kind !== 'agora' || pend.player !== p) return;
  const step = pend.steps[0];
  if (!step) return;

  const done = () => afterAgoraChoice(state, p);

  switch (step.kind) {
    case 'conspiratorChoose': {
      if (!step.options.includes(choice)) return;
      pend.steps.shift();
      if (choice === 'place') {
        pushPlaceOp(state, p, 'any');
        pushLog(state, p, '密谋者：放置 1 方块');
      } else if (choice === 'conspire') {
        const deck = ag.senate.conspiracyDeck;
        const draws = deck.splice(0, Math.min(2, deck.length));
        pushLog(state, p, `Conspire：抽 ${draws.length} 张密谋`);
        if (state.players[p].progressTokens.includes('organized-crime')) {
          state.players[p].agora.conspiracies.push(...draws);
          pushLog(state, p, '有组织犯罪：两张密谋都保留');
        } else if (draws.length > 0) {
          pushAgoraStep(state, p, { kind: 'conspireKeep', options: draws });
        }
      }
      done();
      return;
    }
    case 'conspireKeep': {
      if (!step.options.includes(choice)) return;
      pend.steps.shift();
      state.players[p].agora.conspiracies.push(choice);
      pushLog(state, p, '保留 1 张密谋');
      const otherCard = step.options.find((c) => c !== choice);
      if (otherCard !== undefined) {
        pushAgoraStep(state, p, { kind: 'conspireDiscard', options: ['top', 'bottom'] });
        if (state.pending?.kind === 'agora') state.pending.payload = otherCard;
      }
      done();
      return;
    }
    case 'conspireDiscard': {
      if (choice !== 'top' && choice !== 'bottom') return;
      pend.steps.shift();
      const card = pend.payload;
      if (card) {
        if (choice === 'top') ag.senate.conspiracyDeck.unshift(card);
        else ag.senate.conspiracyDeck.push(card);
      }
      pushLog(state, p, `另一张密谋放回牌库${choice === 'top' ? '顶' : '底'}`);
      done();
      return;
    }
    case 'pickChamber': {
      if (!step.options.includes(choice)) return;
      const idx = Number(choice);
      if (step.purpose === 'moveFrom') {
        // 记录来源，等待 SENATE_MOVE（目标必须相邻）
        pend.payload = choice;
        return;
      }
      pend.steps.shift();
      if (step.purpose === 'place') {
        placeCube(state, p, idx);
        pushLog(state, p, `参议院：放置方块到第 ${idx + 1} 议厅`);
      } else {
        if (ag.senate.chambers[idx].cubes[other(p)] <= 0) return;
        ag.senate.chambers[idx].cubes[other(p)] -= 1;
        updateChamber(state, idx);
        pushLog(state, p, `参议院：移除对手第 ${idx + 1} 议厅的 1 枚方块`);
      }
      done();
      return;
    }
    case 'pickBuild': {
      if (!step.options.includes(choice)) return;
      pend.steps.shift();
      const mode = pend.payload ?? '';
      if (mode.startsWith('discard-structure')) {
        // 弃掉结构上的牌（不得金币）
        const slot = state.slots.find((s) => !s.taken && s.cardId === choice);
        if (!slot) {
          done();
          return;
        }
        takeSlot(state, state.slots.indexOf(slot));
        state.discard.push(choice);
        pushLog(state, p, `密谋：弃掉「${CARD_BY_ID[choice]?.zh}」`);
        const count = Number(mode.split(':')[1] ?? '1');
        const remain = state.slots.filter((s) => !s.taken && s.cardId !== null).map((s) => s.cardId!);
        if (count < 2 && remain.length > 0) {
          pushAgoraStep(state, p, { kind: 'pickBuild', options: remain });
          if (state.pending?.kind === 'agora') state.pending.payload = `discard-structure:${count + 1}`;
        }
      } else if (mode === 'free-build-removed') {
        freeBuildRemoved(state, p, choice);
      } else {
        freeBuildStructure(state, p, choice);
      }
      done();
      return;
    }
    case 'pickOppCard': {
      if (!step.options.includes(choice)) return;
      pend.steps.shift();
      const mode = pend.payload ?? 'discard';
      const foe = other(p);
      const foePl = state.players[foe];
      const card = CARD_BY_ID[choice];
      if (!card) return;
      if (mode === 'steal') {
        foePl.city = foePl.city.filter((id) => id !== choice);
        state.players[p].city.push(choice);
        pushLog(state, p, `密谋：夺取对手的「${card.zh}」`);
      } else if (mode === 'swap') {
        // 偷梁换柱第二步：从自己城市选一张同色卡给出
        const give = cityCards(state, p).filter((c) => c.type === card.type).map((c) => c.id);
        if (give.length === 0) {
          pushLog(state, p, '密谋：没有同色卡可交换，效果落空');
          done();
          return;
        }
        pushAgoraStep(state, p, { kind: 'pickWonderGive', options: give });
        if (state.pending?.kind === 'agora') state.pending.payload = choice;
        done();
        return;
      } else {
        foePl.city = foePl.city.filter((id) => id !== choice);
        state.discard.push(choice);
        pushLog(state, p, `密谋：弃掉对手的「${card.zh}」`);
      }
      done();
      return;
    }
    case 'pickOppWonder': {
      if (!step.options.includes(choice)) return;
      pend.steps.shift();
      const foe = other(p);
      const foePl = state.players[foe];
      if (step.mode === 'destroy') {
        foePl.wondersBuilt = foePl.wondersBuilt.filter((id) => id !== choice);
        state.wondersBuiltTotal = Math.max(0, state.wondersBuiltTotal - 1);
        pushLog(state, p, `密谋：把对手的「${WONDER_BY_ID[choice]?.zh}」拆回盒中`);
      } else {
        foePl.wondersUnbuilt = foePl.wondersUnbuilt.filter((id) => id !== choice);
        state.players[p].wondersUnbuilt.push(choice);
        pushLog(state, p, `密谋：夺走对手未建的「${WONDER_BY_ID[choice]?.zh}」`);
      }
      done();
      return;
    }
    case 'pickProgress': {
      if (!step.options.includes(choice)) return;
      pend.steps.shift();
      if (step.mode === 'steal') {
        state.progressAvailable = state.progressAvailable.filter((id) => id !== choice);
        state.players[p].agora.tuckedProgress.push(choice);
        pushLog(state, p, '密谋：偷走 1 枚进度 token，面朝下压在密谋上');
      } else {
        state.progressRemoved = state.progressRemoved.filter((id) => id !== choice);
        state.players[p].progressTokens.push(choice);
        pushLog(state, p, `获得发展标记「${PROGRESS_BY_ID[choice]?.zh}」`);
        const t = PROGRESS_BY_ID[choice];
        if (t?.coins) gainCoins(state, p, t.coins);
      }
      done();
      return;
    }
    case 'pickWonderGive': {
      if (!step.options.includes(choice)) return;
      pend.steps.shift();
      const take = pend.payload;
      const foe = other(p);
      const mine = state.players[p];
      const foePl = state.players[foe];
      if (take && CARD_BY_ID[take] && CARD_BY_ID[choice]) {
        foePl.city = foePl.city.filter((id) => id !== take);
        mine.city = mine.city.filter((id) => id !== choice);
        foePl.city.push(choice);
        mine.city.push(take);
        pushLog(state, p, `偷梁换柱：用「${CARD_BY_ID[choice]?.zh}」换来「${CARD_BY_ID[take]?.zh}」`);
      }
      done();
      return;
    }
    case 'pickDecreeMove': {
      if (!step.options.includes(choice)) return;
      const idx = Number(choice);
      if (!pend.payload) {
        // 第一步：选来源 chamber（先消费本步，再压入目标选择步）
        pend.steps.shift();
        pend.payload = `src:${idx}`;
        pushAgoraStep(state, p, {
          kind: 'pickDecreeMove',
          options: ag.senate.chambers.map((_, i) => String(i)).filter((s) => s !== String(idx)),
        });
        return;
      }
      // 第二步：选目标
      const src = Number((pend.payload as string).split(':')[1]);
      pend.steps.shift();
      pend.payload = undefined;
      if (src === idx) {
        done();
        return;
      }
      const srcCh = ag.senate.chambers[src];
      const dstCh = ag.senate.chambers[idx];
      if (srcCh.decree) {
        dstCh.decreeExtra.push({ id: srcCh.decree, faceUp: srcCh.decreeFaceUp });
        srcCh.decree = '';
        srcCh.decreeFaceUp = false;
      } else if (srcCh.decreeExtra.length > 0) {
        const moved = srcCh.decreeExtra.pop()!;
        dstCh.decreeExtra.push(moved);
      }
      if (dstCh.decree && !dstCh.decreeFaceUp) dstCh.decreeFaceUp = true;
      updateChamber(state, src);
      updateChamber(state, idx);
      pushLog(state, p, `密谋：把第 ${src + 1} 议厅的法令挪到第 ${idx + 1} 议厅`);
      done();
      return;
    }
    case 'pickTrigger': {
      if (!step.options.includes(choice)) return;
      pend.steps.shift();
      if (choice !== 'skip') {
        const pl = state.players[p];
        pl.agora.conspiracies = pl.agora.conspiracies.filter((id) => id !== choice);
        pl.agora.triggered.push(choice);
        pushLog(state, p, `元老院议事室：触发密谋「${CONSPIRACY_BY_ID[choice]?.zh}」`);
        triggerConspiracyEffect(state, p, choice);
      }
      done();
      return;
    }
    case 'optMoveOrSkip': {
      pend.steps.shift();
      done();
      return;
    }
  }
}

/** Agora 选择队列收尾：回奇迹选择 / 继续参议院操作 / 正常推进回合 */
function afterAgoraChoice(state: GameState, p: PlayerId): void {
  void p;
  const pend = state.pending;
  if (pend && pend.kind === 'agora' && pend.steps.length > 0) {
    state.phase = 'agoraChoice';
    return;
  }
  state.pending = null;
  // 奇迹选择阶段的选择时效果：回到选择流程
  if (state.wonderDraftStep < 8) {
    state.phase = 'wonderDraft';
    return;
  }
  state.phase = 'playing';
  if (state.agora && state.agora.ops[0]?.player === p) {
    state.agora.endTurnAfterOps = true;
    return;
  }
  afterPending(state);
}

/* ------------------------------ 法令的费用与税收效果 ------------------------------ */

const RESOURCE_KIND: Record<string, 'brown' | 'grey'> = {
  wood: 'brown',
  clay: 'brown',
  stone: 'brown',
  glass: 'grey',
  papyrus: 'grey',
};

/** 建筑费用上的法令效果：贸易优惠 + 忽略 1 个费用符号 */
function applyCostDecrees(state: ReadableState, p: PlayerId, plan: CostPlan, cardType: string): CostPlan {
  if (!state.agora) return plan;

  // 贸易优惠：买棕/灰资源每单位少 1 金（最低 1）
  let trade: 'dec-trade-brown' | 'dec-trade-grey' | null = null;
  for (const res of Object.keys(plan.toBuy)) {
    const kind = RESOURCE_KIND[res];
    if (kind === 'brown' && hasActiveDecree(state, p, 'dec-trade-brown')) trade = 'dec-trade-brown';
    if (kind === 'grey' && hasActiveDecree(state, p, 'dec-trade-grey')) trade = 'dec-trade-grey';
  }
  if (trade) {
    const toBuy = plan.toBuy as Record<string, number | undefined>;
    const unitPrice = plan.unitPrice as Record<string, number | undefined>;
    for (const res of Object.keys(toBuy)) {
      const kind = RESOURCE_KIND[res];
      if ((kind === 'brown' && trade === 'dec-trade-brown') || (kind === 'grey' && trade === 'dec-trade-grey')) {
        const price = unitPrice[res] ?? 2;
        const reduced = Math.max(1, price - 1);
        if (reduced !== price) {
          plan.buyCost -= price - reduced;
          unitPrice[res] = reduced;
        }
      }
    }
    plan.total = plan.buyCost + plan.coinCost;
  }

  // 忽略 1 个费用符号（按卡色）
  const ignore =
    cardType === 'commercial'
      ? 'dec-ignore-yellow'
      : cardType === 'military'
        ? 'dec-ignore-red'
        : cardType === 'scientific'
          ? 'dec-ignore-green'
          : null;
  if (ignore && hasActiveDecree(state, p, ignore)) {
    dropOneCostSymbol(plan);
  }

  if (plan.total < 0) plan.total = 0;
  // 法令可能把 total 降下来（贸易优惠 / 忽略 1 个费用符号），必须重算 affordable；
  // 否则会出现「total 已为 0 但仍 affordable=false」→ 卡牌被判为不可建、动作被静默拒绝。
  plan.affordable = state.players[p].coins + (state.pantheon ? state.players[p].pan.astarteCoins : 0) >= plan.total;
  return plan;
}

/** 奇迹费用上的法令效果：少付 1 资源（自选最优） */
function applyWonderDecrees(state: ReadableState, p: PlayerId, plan: CostPlan): CostPlan {
  if (!state.agora) return plan;
  if (hasActiveDecree(state, p, 'dec-wonder-cheap')) {
    dropOneCostSymbol(plan);
  }
  if (plan.total < 0) plan.total = 0;
  return plan;
}

/** 从费用计划里去掉最优（最贵）的一个费用符号 */
function dropOneCostSymbol(plan: CostPlan): void {
  const toBuy = plan.toBuy as Record<string, number | undefined>;
  const need = plan.need as Record<string, number | undefined>;
  const covered = plan.covered as Record<string, number | undefined>;
  const unitPrice = plan.unitPrice as Record<string, number | undefined>;
  let bestRes: string | null = null;
  let bestPrice = 0;
  for (const res of Object.keys(toBuy)) {
    if ((toBuy[res] ?? 0) > 0) {
      const price = unitPrice[res] ?? 0;
      if (price > bestPrice) {
        bestPrice = price;
        bestRes = res;
      }
    }
  }
  if (bestRes) {
    toBuy[bestRes] = (toBuy[bestRes] ?? 1) - 1;
    need[bestRes] = (need[bestRes] ?? 1) - 1;
    plan.buyCost -= bestPrice;
  } else if (plan.coinCost > 0) {
    plan.coinCost -= 1;
  } else {
    // 没有购买项也没有金币费：从自产覆盖中免掉 1 个
    for (const res of Object.keys(covered)) {
      if ((covered[res] ?? 0) > 0) {
        covered[res] = (covered[res] ?? 1) - 1;
        need[res] = (need[res] ?? 1) - 1;
        break;
      }
    }
  }
  plan.total = plan.buyCost + plan.coinCost;
  if (plan.total < 0) plan.total = 0;
}

/** 建造时的「税收」法令：控制者得金 = 当前时代数 */
function decreeBuildCoins(state: GameState, built: string | 'wonder'): void {
  if (!state.agora) return;
  const decreeFor =
    built === 'wonder'
      ? 'dec-coin-wonder'
      : built === 'civilian'
        ? 'dec-coin-blue'
        : built === 'scientific'
          ? 'dec-coin-green'
          : built === 'commercial'
            ? 'dec-coin-yellow'
            : built === 'military'
              ? 'dec-coin-red'
              : null;
  if (!decreeFor) return;
  const c = decreeController(state, decreeFor);
  if (c === null) return;
  gainCoins(state, c, state.age);
  pushLog(state, c, `参议院法令：+${state.age} 金币`);
}
