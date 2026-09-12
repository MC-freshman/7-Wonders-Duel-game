/* ------------------------------------------------------------------
 * M8 Solo 控制器（方案 B：隔离模块，零侵入主引擎）
 *
 * 设计约束：
 *  - 不修改 engine.ts / types.ts / setup.ts / layout.ts 等主引擎文件；
 *    删除 src/core/solo/ 目录即对局回退到无 Solo 状态。
 *  - 复用主引擎的纯函数（applyAction / costPlanForCard / accessibleSlots /
 *    initialState / setupAge）执行动作，保证规则一致、可重放。
 *
 * 领袖「免费建造」实现（零侵入关键）：
 *  主引擎 BUILD_CARD 在 applyBuildCard 内按 plan.total 收费。
 *  我们在调用 applyAction 前，把传入状态的「领袖金币」临时 +plan.total，
 *  由于 applyAction 内部 structuredClone 会把这笔赠金一并复制并随后被扣回，
 *  净效果 = 建造成本为 0，而卡牌自身的产出（金币 / 科技符号 / 盾 等）照常生效。
 *  该赠金仅存在于本次克隆的输入快照上，绝不污染真实状态。
 * ------------------------------------------------------------------ */

import { Rng, makeRng } from '../rng';
import { initialState, setupAge } from '../setup';
import { accessibleSlots } from '../layout';
import { applyAction, costPlanForCard, invokeCost, legalActions } from '../engine';
import {
  CARD_BY_ID,
  WONDER_BY_ID,
  WONDERS,
  CAPITAL_POS,
  PROGRESS_BY_ID,
  AGORA_WONDERS,
  PANTHEON_WONDERS,
} from '../data/index';
import type {
  CardType,
  GameAction,
  GameState,
  PlayerId,
  PlayerState,
  ScoreBreakdown,
} from '../types';
import { SOLO_COLOR_TO_TYPE, SOLO_DECISION_CARDS, SOLO_LEADERS } from './data';
import type { SoloCardColor, SoloDecisionCardDef, SoloGame, SoloLeaderDef } from './types';
import { soloAgoraDeck, soloAgoraLeaders } from './agora/data';
import { chooseAgoraAction, type AgoraCtx } from './agora/agora';
import {
  firstAvailableDivinity,
  leaderIsisPick,
  restoreSpareDivinity,
  resolveLeaderPantheonStep,
  soloAgoraPantheonDeck,
  soloPantheonDeck,
  soloPantheonLeaders,
  type PantheonSpare,
} from './pantheon/index';

const LEADER_ID: PlayerId = 1;

/** 领袖「虚拟密谋准备区」占位卡 id：Agora Solo 允许领袖无需准备直接触发，结算后清理 */
const SOLO_CONSPIRACY_PLACEHOLDER = '__solo_conspiracy__';

/** createSoloGame 选项 */
export interface SoloOptions {
  /** 启用 Agora Solo（M8-A）：Agora 版决策牌堆 + Brutus 领袖 + 参议院组件 */
  agora?: boolean;
  /** 启用 Pantheon Solo（M8-P）：Pantheon 版决策牌堆 + 3 位新领袖 + 万神殿组件 */
  pantheon?: boolean;
}

/** 字符串 → 32 位散列，用于把 leaderId 并入 solo 随机流 */
function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function createSoloGame(seed: number, leaderId?: string, opts: SoloOptions = {}): SoloGame {
  const agora = opts.agora === true;
  const pantheon = opts.pantheon === true;
  const rng = makeRng((seed ^ 0x504e509 ^ (leaderId ? hashStr(leaderId) : 0)) >>> 0);

  // 领袖候选池：base 5 → Pantheon +3 → Agora +1（组合时 9 位，见 SOLO_PANTHEON_DATA §4）
  let leaders = SOLO_LEADERS;
  if (pantheon) leaders = soloPantheonLeaders(leaders);
  if (agora) leaders = soloAgoraLeaders(leaders);
  const leader: SoloLeaderDef =
    (leaderId && leaders.find((l) => l.id === leaderId)) || leaders[rng.int(leaders.length)];

  // 决策牌堆：三类互斥（无图标 / Agora 图标 / Pantheon 图标），组合恒为 12 张
  const decisionCards =
    agora && pantheon
      ? soloAgoraPantheonDeck()
      : agora
        ? soloAgoraDeck()
        : pantheon
          ? soloPantheonDeck()
          : SOLO_DECISION_CARDS;

  const state = initialState(seed, { pantheon, agora }); // Agora 时含参议院 / 密谋牌库 / 法令
  // Solo 不走「选奇迹」流程（下面直接分配奇迹），但主引擎的 Agora 选择收尾
  // afterAgoraChoice() 用 `wonderDraftStep < 8` 判断是否仍在选奇迹阶段。
  // 不置 8 会在任意 Agora 选择后把阶段误切回 wonderDraft → 死锁。
  state.wonderDraftStep = 8;

  // 奇迹分配：洗牌后每轮抽 3 —— 其中 2 张给玩家(0)，1 张给领袖(1)预建；共两轮。
  // Agora / Pantheon 时奇迹池分别额外含 2 张对应扩展奇迹。
  const remaining = [
    ...WONDERS.map((w) => w.id),
    ...(pantheon ? PANTHEON_WONDERS.map((w) => w.id) : []),
    ...(agora ? AGORA_WONDERS.map((w) => w.id) : []),
  ];
  const player0Wonders: string[] = [];
  const leaderWonders: string[] = [];
  for (let round = 0; round < 2; round++) {
    const draw = rng.sample(remaining, 3);
    for (const id of draw) {
      const idx = remaining.indexOf(id);
      if (idx >= 0) remaining.splice(idx, 1);
    }
    player0Wonders.push(draw[0], draw[1]);
    leaderWonders.push(draw[2]);
  }
  state.players[0].wondersUnbuilt = player0Wonders;
  state.players[0].coins = 7;
  state.players[1].coins = 0;
  state.players[1].wondersUnbuilt = [];
  const preTriggers: string[] = [];
  for (const wid of leaderWonders) {
    const t = applyPrebuiltWonder(state, wid, rng);
    if (t) preTriggers.push(t);
  }
  state.wondersBuiltTotal = leaderWonders.length;

  // 领袖开局发展标记（含即时金币 / 科技符号效果）
  for (const tid of leader.startProgress) applyStartProgress(state, tid);

  // 铺设时代 I 牌阵（复用主引擎；Agora 时参议员卡会按 5/5/3 混入各时代）
  const setupRng = new Rng(state.rngState);
  setupAge(state, 1, setupRng);
  state.rngState = setupRng.state;
  for (const s of accessibleSlots(state.slots)) s.faceUp = true;

  state.phase = 'playing';
  state.current = LEADER_ID;
  state.lastActive = LEADER_ID;

  const deck = rng.shuffle(decisionCards.map((_, i) => i));

  const game: SoloGame = {
    state,
    leaderId: LEADER_ID,
    leader,
    deck,
    deckIndex: 0,
    decisionCards,
    rng,
    lastDecision: null,
    decisionHistory: [],
    agora,
    pantheon,
  };
  // Agora：预建 Curia Julia 的「开局立即触发 1 张密谋」顺延到领袖首个回合开始时结算
  if (preTriggers.length) (game as SoloGame & { preTrigger?: string[] }).preTrigger = preTriggers;
  return game;
}

/* --------------------------- 预建奇迹 / 开局标记 --------------------------- */

/**
 * 领袖预建奇迹（视为已建成）。
 * 返回：需要「开局立即触发」的密谋 id（Agora：Curia Julia），无则 undefined。
 */
function applyPrebuiltWonder(state: GameState, wid: string, rng: Rng): string | undefined {
  const w = WONDER_BY_ID[wid];
  if (!w) return undefined;
  state.players[LEADER_ID].wondersBuilt.push(wid);
  return applyWonderOpening(state, wid, rng);
}

/**
 * 只结算奇迹的「落成 / 开局」收益（**不**改动 wondersBuilt 列表）。
 * 供预建（开局一次）与领袖化 Isis（再次触发开局收益）复用。
 */
function applyWonderOpening(state: GameState, wid: string, rng: Rng): string | undefined {
  const w = WONDER_BY_ID[wid];
  if (!w) return undefined;
  // 盾：移动冲突标记（领袖为玩家 1，符号取负）
  if (w.shields) {
    let pawn = state.conflictPawn - w.shields;
    if (pawn > CAPITAL_POS) pawn = CAPITAL_POS;
    if (pawn < -CAPITAL_POS) pawn = -CAPITAL_POS;
    state.conflictPawn = pawn;
  }
  // 金币（基础奇迹无负金币；broken coins 在官方 solo 规则中按负金币处理，此处同样适用）
  if (w.coins) state.players[LEADER_ID].coins += w.coins;
  // 发展标记：great-library 类效果从「开局弃置池」随机取 1 枚
  if (w.special === 'take-progress-discard' && state.progressRemoved.length > 0) {
    const tid = rng.pick(state.progressRemoved);
    state.progressRemoved = state.progressRemoved.filter((id) => id !== tid);
    state.players[LEADER_ID].progressTokens.push(tid);
  }

  /* ------------------------ Agora 奇迹（SOLO_AGORA_DATA §2.6） ------------------------ */
  // Curia Julia：给领袖 6 金 + 抽阴谋堆顶 1 张并立即触发（Organized Crime 抽 2 张但只触发第一张）
  if (w.special === 'agora-curia') {
    state.players[LEADER_ID].coins += 6;
    const deck = state.agora?.senate.conspiracyDeck ?? [];
    if (deck.length > 0) {
      const first = deck.shift()!;
      const organized = state.players[LEADER_ID].progressTokens.includes('organized-crime');
      if (organized && deck.length > 0) {
        // 只触发第一张；第二张仍归领袖（面朝下）
        state.players[LEADER_ID].agora.conspiracies.push(deck.shift()!);
      }
      state.players[LEADER_ID].agora.conspiracies.push(first);
      return first;
    }
  }
  // Knossos：取领袖 2 个影响力方块，分别放入中间两个议事厅（终局 3 VP 由主引擎计分）
  if (w.special === 'agora-knossos' && state.agora) {
    state.agora.senate.chambers[2].cubes[LEADER_ID] += 1;
    state.agora.senate.chambers[3].cubes[LEADER_ID] += 1;
  }
  // Sanctuary / Divine Theatre 的领袖化收益为「持续被动」或「时代 II 延迟触发」，
  // 不在落成瞬间结算（见 soloLeaderTurnAdvanced 的 age2 钩子与 afterLeaderInvoke）。
  // 其余效果（destroyCoins / destroyCard / producesOneOf / extra-turn / take-discards）按官方规则「忽略」
  return undefined;
}

function applyStartProgress(state: GameState, tid: string): void {
  const t = PROGRESS_BY_ID[tid];
  if (!t) return;
  state.players[LEADER_ID].progressTokens.push(tid);
  if (t.coins) state.players[LEADER_ID].coins += t.coins;
  if (t.science) {
    const s = state.players[LEADER_ID].science;
    s[t.science] = (s[t.science] ?? 0) + 1;
  }
}

/* ------------------------------ 决策卡抽取 ------------------------------ */

function drawDecision(game: SoloGame): SoloDecisionCardDef {
  if (game.deckIndex >= game.deck.length) {
    game.deck = game.rng.shuffle(game.decisionCards.map((_, i) => i));
    game.deckIndex = 0;
  }
  return game.decisionCards[game.deck[game.deckIndex++]];
}

/* ------------------------- 决策卡 → 目标槽位 ------------------------- */

interface LeaderTarget {
  slot: number;
  cardType: CardType;
}

/** 决策卡三个色格的偏好（`link` = 可用链接符号建造的卡，仅 Imhotep） */
type SlotPref = { kind: 'color'; color: SoloCardColor } | { kind: 'link' };

function chooseLeaderCard(
  game: SoloGame,
  card: SoloDecisionCardDef,
  preferSenator = false,
): LeaderTarget | null {
  const st = game.state;
  const leader = game.leader;

  const accessible = accessibleSlots(st.slots);
  const sorted = [...accessible].sort((a, b) =>
    card.direction === 'left'
      ? a.col - b.col || a.row - b.row
      : b.col - a.col || b.row - a.row,
  );

  // Agora 图标：本回合第一优选 = 从牌阵取 1 张参议员卡（无视费用）
  if (preferSenator) {
    const sen = sorted.find((s) => {
      const c = s.cardId ? CARD_BY_ID[s.cardId] : null;
      return c != null && c.type === 'senator';
    });
    if (sen) return { slot: sen.index, cardType: 'senator' };
  }

  // 空槽位 = 「领袖色」；Imhotep（preferLink）时理解为「可用链接符号建造的卡」
  const resolve = (slot: SoloCardColor | null): SlotPref =>
    slot === null
      ? leader.preferLink
        ? { kind: 'link' }
        : { kind: 'color', color: leader.cardColor }
      : { kind: 'color', color: slot };
  let prefs: SlotPref[] = [
    resolve(card.primaryColor),
    resolve(card.secondaryColor),
    resolve(card.tertiaryColor),
  ];
  // 非时代 III 时过滤紫色（官方：age == 3 || it != PURPLE）
  if (st.age !== 3) prefs = prefs.filter((p) => !(p.kind === 'color' && p.color === 'purple'));

  for (const pref of prefs) {
    const found = sorted.find((s) => {
      const c = s.cardId ? CARD_BY_ID[s.cardId] : null;
      if (!c) return false;
      return pref.kind === 'link' ? c.freeLink != null : c.type === SOLO_COLOR_TO_TYPE[pref.color];
    });
    if (found) return { slot: found.index, cardType: CARD_BY_ID[found.cardId!]!.type };
  }
  // 兜底：从指定方向取第一张可拿取的牌
  const first = sorted[0];
  if (first) return { slot: first.index, cardType: CARD_BY_ID[first.cardId!]!.type };
  return null;
}

/* ------------------------------ 应用动作 ------------------------------ */

/** 领袖执行该动作时需临时补足的金币数（「领袖不付费」统一入口） */
function leaderFreeCost(game: SoloGame, action: GameAction): number {
  if (action.player !== game.leaderId) return 0;
  switch (action.type) {
    case 'BUILD_CARD': {
      const cardId = game.state.slots[action.slot]?.cardId;
      if (!cardId) return 0;
      return Math.max(0, costPlanForCard(game.state, game.leaderId, cardId).total);
    }
    case 'RECRUIT_SENATOR': {
      const p = game.state.players[game.leaderId];
      return p.progressTokens.includes('corruption') ? 0 : p.agora.senators.length;
    }
    case 'INVOKE_DIVINITY':
      // Pantheon Solo：领袖调用神明「无视费用」
      return invokeCost(game.state, game.leaderId, action.position, action.offerings ?? []);
    default:
      return 0;
  }
}

/**
 * 应用任意动作。
 *  - 领袖的建材 / 参议员招募 / 调用神明一律「无视费用」：调用前临时补足金币，
 *    主引擎的 structuredClone 会把这笔赠金一并复制并随后扣回，净额 = 0；
 *    赠金仅存在于本次克隆的输入快照上，绝不污染真实状态。
 *  - Imhotep：打出「链接符号费用」的卡得 4 金币（无条件；不与都市化重复计）。
 *  - 调用神明后结算领袖化被动（圣堂 +2 / 伊西斯复触发奇迹开局收益）。
 */
export function soloApplyAction(game: SoloGame, action: GameAction): void {
  const leader = game.leader;
  // applyAction 后状态已变，故前置信息需在调用前采集
  let builtCardId: string | null = null;
  let builtFreeByLink = false;
  if (action.type === 'BUILD_CARD' && action.player === game.leaderId) {
    builtCardId = game.state.slots[action.slot]?.cardId ?? null;
    if (builtCardId) {
      builtFreeByLink = costPlanForCard(game.state, game.leaderId, builtCardId).freeByLink;
    }
  }
  const invokedBefore = game.state.players[game.leaderId].pan.invoked.length;

  const amount = leaderFreeCost(game, action);
  if (amount > 0) {
    const players = game.state.players.map((p) =>
      p.id === game.leaderId ? { ...p, coins: p.coins + amount } : p,
    ) as [PlayerState, PlayerState];
    const working: GameState = { ...game.state, players };
    game.state = applyAction(working, action);
  } else {
    game.state = applyAction(game.state, action);
  }

  // Imhotep：工程学 + 都市化 → 每次打出「链接符号费用」的卡 +4 金币（无条件）
  if (builtCardId && leader.preferLink && !builtFreeByLink) {
    const c = CARD_BY_ID[builtCardId];
    if (c?.freeLink != null) {
      game.state.players[game.leaderId].coins += 4;
      pushSoloLog(game, `伊姆霍特普：打出「${c.zh}」（链接符号卡），获得 4 金币`);
    }
  }

  afterLeaderInvoke(game, invokedBefore);
}

/* --------------------- Pantheon：调用神明后的领袖化结算 --------------------- */

/** 领袖调用神格后的领袖化结算（圣堂 +2/位、伊西斯复触发奇迹开局收益） */
function afterLeaderInvoke(game: SoloGame, invokedBefore: number): void {
  const st = game.state;
  const me = st.players[game.leaderId];
  const invoked = me.pan.invoked;
  if (invoked.length <= invokedBefore) return;
  const newly = invoked.slice(invokedBefore);

  // 圣堂（领袖化 §3.7）：领袖每次打出神格卡得 2 金币
  if (me.wondersBuilt.includes('sanctuary')) {
    me.coins += newly.length * 2;
    pushSoloLog(game, `圣堂：领袖打出 ${newly.length} 位神格，获得 ${newly.length * 2} 金币`);
  }

  // 伊西斯（领袖化 §3.4）：随机取 1 座已建奇迹，再次获得其开局收益（不从弃牌堆取卡、不加分）
  for (const id of newly) {
    if (id !== 'isis') continue;
    const wid = leaderIsisPick(game);
    if (!wid) continue;
    applyWonderOpening(st, wid, game.rng);
    pushSoloLog(game, `伊西斯（领袖化）：再次触发「${WONDER_BY_ID[wid]?.zh ?? wid}」的开局收益`);
  }
}

/* --------------------------- 领袖完整行动 --------------------------- */

/**
 * 执行领袖当前这一「回合」（含连动 replay 的连续额外行动，以及连动过程中
 * 由科技对子触发的进度标记选择）。遇到属于玩家的 pending 或阶段切换时停止，
 * 交还控制权。
 */
export function soloLeaderTurn(game: SoloGame): void {
  if (game.agora || game.pantheon) return soloLeaderTurnAdvanced(game);
  return soloLeaderTurnBase(game);
}

function soloLeaderTurnBase(game: SoloGame): void {
  let guard = 0;
  let chain = false; // 本回合是否处于「连动」状态（由带 replay 的牌授予的额外行动权）
  game.state.extraTurn = false;
  while (guard++ < 80) {
    const st = game.state;
    if (st.victory || st.phase === 'gameOver') return;

    // 1) 解析属于领袖的待决（如科技对子取发展标记）。
    //    注意：科技对子只是「本张牌的附赠效果」，解析后必须结束本回合（除非处于连动）。
    if (st.pending) {
      const pid = st.pending.kind === 'startPlayer' ? st.pending.chooser : st.pending.player;
      if (pid !== game.leaderId) return; // 等待玩家处理
      if (chain) game.state.extraTurn = true; // 连动中：解析待决后仍需把行动权留在领袖
      const a = resolveLeaderPending(game);
      if (!a) return;
      soloApplyAction(game, a);
      if (!chain) return; // 非连动：解析完即结束回合（修复：科技对子不再白送一张牌）
      continue;
    }

    if (st.phase !== 'playing') return;
    if (st.current !== game.leaderId) return;

    // 2) 抽决策卡并建造
    const card = drawDecision(game);
    game.lastDecision = card;
    const target = chooseLeaderCard(game, card);
    if (!target) return;

    const isReplay = card.replay != null && game.leader.replays.includes(card.replay);
    if (isReplay) game.state.extraTurn = true; // 让主引擎在结算后把行动权留在领袖

    const action: GameAction =
      target.cardType === 'senator'
        ? { type: 'DISCARD_CARD', player: game.leaderId, slot: target.slot }
        : { type: 'BUILD_CARD', player: game.leaderId, slot: target.slot };

    game.decisionHistory.push({ card, slot: target.slot, built: target.cardType !== 'senator' });
    soloApplyAction(game, action);

    // 3) 建造可能触发科技对子待决（需在下一次迭代解析）；是否继续连动取决于本张牌是否带 replay
    if (isReplay) {
      chain = true;
      continue;
    }
    chain = false;
    if (game.state.pending) continue; // 解析科技对子待决后结束回合
    return;
  }
}

/* ------------------ M8-A / M8-P：Agora / Pantheon 领袖回合 ------------------ */

interface SoloAgoraExt {
  /** 预建 Curia Julia 的「开局立即触发 1 张密谋」，顺延到领袖首个回合结算 */
  preTrigger?: string[];
}

interface SoloPantheonExt {
  /** 已执行过「时代 II 开局」的领袖侧延迟结算（Divine Theatre 领袖化） */
  pantheonAge2Ready?: boolean;
}

/** 领袖侧日志（不携带 action，仅用于展示；主引擎日志仍由 applyAction 生成） */
function pushSoloLog(game: SoloGame, text: string): void {
  const log = game.state.log;
  log.push({ index: log.length, player: game.leaderId, text });
}

/** Pantheon 待决的中间暂存（时代 I 多抽的 1 张需放回堆顶） */
const spareByGame = new WeakMap<SoloGame, PantheonSpare>();

function spareOf(game: SoloGame): PantheonSpare {
  let s = spareByGame.get(game);
  if (!s) {
    s = {};
    spareByGame.set(game, s);
  }
  return s;
}

/** 当前是否轮到领袖处理「Pantheon 待决」 */
export function isLeaderPantheonPending(game: SoloGame): boolean {
  const st = game.state;
  if (st.pending?.kind !== 'pantheon') return false;
  if (st.pending.player !== game.leaderId) return false;
  return st.pending.steps.length > 0;
}

/** 领袖处理一条 Pantheon 待决（神话 token 放神格 / Pantheon 图标调用神明后的选择） */
function resolveLeaderPantheonPending(game: SoloGame): boolean {
  const st = game.state;
  const pend = st.pending;
  if (!pend || pend.kind !== 'pantheon' || pend.player !== game.leaderId) return false;
  const step = pend.steps[0];
  if (!step) return false;
  const a = resolveLeaderPantheonStep(game, step, spareOf(game));
  if (!a) return false;
  soloApplyAction(game, a);
  // 时代 I 多抽的那张放回对应神话组堆顶
  restoreSpareDivinity(game.state, spareOf(game));
  return true;
}

function agoraCtx(game: SoloGame): AgoraCtx {
  return {
    state: game.state,
    leaderId: game.leaderId,
    direction: game.lastDecision?.direction ?? 'left',
    rng: game.rng,
  };
}

/** 当前是否轮到领袖处理「Agora 待决 / 参议院行动」 */
export function isLeaderAgoraPending(game: SoloGame): boolean {
  const st = game.state;
  if (st.phase === 'agoraChoice') {
    return st.pending?.kind === 'agora' && st.pending.player === game.leaderId;
  }
  if (st.phase !== 'playing' || st.current !== game.leaderId) return false;
  const ag = st.agora;
  if (!ag) return false;
  if (ag.ops[0] && ag.ops[0].player === game.leaderId) return true;
  return ag.senateActionsLeft > 0;
}

/**
 * 领袖触发一张「面朝下密谋」（Solo 规则：无需事先准备）。
 * 主引擎的 TRIGGER_CONSPIRACY 只认 prepared 记录，故伪造一条占位记录，
 * 结算后立刻清理占位（不进入弃牌堆、不留准备区），并把手牌中的该密谋移除。
 */
function triggerLeaderConspiracy(game: SoloGame, conspiracyId: string): boolean {
  const st = game.state;
  if (!st.agora || st.agora.triggeredThisTurn) return false;
  const pl = st.players[LEADER_ID];
  if (!pl.agora.conspiracies.includes(conspiracyId)) return false;

  pl.agora.prepared.push({ conspiracyId, cardId: SOLO_CONSPIRACY_PLACEHOLDER });
  game.state = applyAction(st, { type: 'TRIGGER_CONSPIRACY', player: LEADER_ID, conspiracyId });

  const ns = game.state;
  ns.discard = ns.discard.filter((x) => x !== SOLO_CONSPIRACY_PLACEHOLDER);
  ns.players[LEADER_ID].agora.prepared = ns.players[LEADER_ID].agora.prepared.filter(
    (e) => e.cardId !== SOLO_CONSPIRACY_PLACEHOLDER,
  );
  ns.players[LEADER_ID].agora.conspiracies = ns.players[LEADER_ID].agora.conspiracies.filter(
    (x) => x !== conspiracyId,
  );
  return true;
}

/**
 * 时代 II 开局的领袖侧延迟结算（M8-P §3.7）：
 * 通神大剧场（Divine Theatre）的领袖化效果 = 「洗混本局未使用的神话 token，随机抽 1 个 →
 * 打出该神话的堆顶神格」，与 The Gate 的领袖化效果完全一致；而 The Gate 在时代 II 开局时
 * 被放入图板唯一空位、并由主引擎实现同一语义。故此处直接「免费调用门」一次即等价实现。
 */
function maybePantheonAge2Init(game: SoloGame): void {
  const ext = game as SoloGame & SoloPantheonExt;
  if (ext.pantheonAge2Ready) return;
  const st = game.state;
  if (st.age < 2) return;
  ext.pantheonAge2Ready = true;
  if (!game.pantheon || !st.pantheon) return;
  const me = st.players[game.leaderId];
  if (!me.wondersBuilt.includes('divine-theatre')) return;
  const gatePos = st.pantheon.board.findIndex((id, i) => id === 'gate' && st.pantheon!.revealed[i]);
  if (gatePos < 0) return; // 门已被调用 → 效果落空（记录说明见 SOLO_PANTHEON_DATA §3.7）
  pushSoloLog(game, '通神大剧场：免费打出 1 位随机神话的堆顶神格');
  soloApplyAction(game, { type: 'INVOKE_DIVINITY', player: game.leaderId, position: gatePos });
}

/**
 * 进阶领袖回合：base 流程 + Agora 图标（触发密谋 + 第一优先取参议员）+ 参议院行动
 *            + Pantheon（时代 I 神话 token 放图板 / 时代 II·III Pantheon 图标优先调用神明）。
 */
function soloLeaderTurnAdvanced(game: SoloGame): void {
  let guard = 0;
  let chain = false;
  game.state.extraTurn = false;
  const ext = game as SoloGame & SoloAgoraExt;

  while (guard++ < 240) {
    const st = game.state;
    if (st.victory || st.phase === 'gameOver') return;

    // 0) Pantheon 待决（神话 token 选神/放位、调用神明后的目标选择）
    if (isLeaderPantheonPending(game)) {
      if (chain) game.state.extraTurn = true;
      if (!resolveLeaderPantheonPending(game)) return;
      if (isLeaderPantheonPending(game)) continue;
      if (!chain && !game.state.pending && !isLeaderAgoraPending(game)) return;
      continue;
    }

    // 1) Agora 待决 / 参议院行动：每步按 Solo 规则独立决策
    if (isLeaderAgoraPending(game)) {
      const acts = legalActions(st, game.leaderId);
      const a = acts.length ? chooseAgoraAction(agoraCtx(game), acts) : null;
      if (!a) return;
      soloApplyAction(game, a);
      if (isLeaderAgoraPending(game)) continue;
      if (!chain) return; // 参议院动作结算完毕即结束本回合
      if (game.state.pending) continue;
      return;
    }

    // 2) 普通 pending（科技对子取发展标记等）
    if (st.pending) {
      const pid = st.pending.kind === 'startPlayer' ? st.pending.chooser : st.pending.player;
      if (pid !== game.leaderId) return;
      if (chain) game.state.extraTurn = true;
      const a = resolveLeaderPending(game);
      if (!a) return;
      soloApplyAction(game, a);
      if (!chain) return;
      continue;
    }

    if (st.phase !== 'playing') return;
    if (st.current !== game.leaderId) return;

    // 3a) 时代 II 开局的领袖侧延迟结算（通神大剧场）
    maybePantheonAge2Init(game);
    if (game.state.pending || isLeaderAgoraPending(game) || game.state.current !== game.leaderId) {
      chain = false;
      continue;
    }

    // 3b) 主行动
    const card = drawDecision(game);
    game.lastDecision = card;

    // 预建 Curia Julia：开局立即触发 1 张密谋
    if (ext.preTrigger && ext.preTrigger.length) {
      triggerLeaderConspiracy(game, ext.preTrigger.shift()!);
      if (isLeaderAgoraPending(game)) {
        chain = false;
        continue;
      }
    }

    // Agora 图标：随机触发 1 张面朝下密谋
    if (card.agoraIcon) {
      const hand = game.state.players[LEADER_ID].agora.conspiracies;
      if (hand.length > 0 && triggerLeaderConspiracy(game, game.rng.pick(hand))) {
        if (isLeaderAgoraPending(game)) {
          chain = false;
          continue;
        }
      }
    }

    // Pantheon 图标（仅时代 II/III）：第一优先 = 按箭头方向调用第一个可用神明（无视费用）
    if (game.pantheon && card.pantheonIcon && st.age >= 2) {
      const pos = firstAvailableDivinity(game.state, card.direction);
      if (pos !== null) {
        game.decisionHistory.push({ card, slot: -1, built: false });
        soloApplyAction(game, { type: 'INVOKE_DIVINITY', player: game.leaderId, position: pos });
        chain = false;
        if (game.state.pending || isLeaderAgoraPending(game)) continue;
        return;
      }
    }

    // 选牌（Agora 图标：第一优先取参议员，无视费用；Imhotep：领袖色槽位 = 链接符号卡）
    const target = chooseLeaderCard(game, card, card.agoraIcon === true);
    if (!target) return;

    const isReplay = card.replay != null && game.leader.replays.includes(card.replay);
    if (isReplay) game.state.extraTurn = true;

    const action: GameAction =
      target.cardType === 'senator'
        ? { type: 'RECRUIT_SENATOR', player: game.leaderId, slot: target.slot }
        : { type: 'BUILD_CARD', player: game.leaderId, slot: target.slot };

    game.decisionHistory.push({ card, slot: target.slot, built: target.cardType !== 'senator' });
    soloApplyAction(game, action);

    if (isReplay) {
      chain = true;
      continue;
    }
    chain = false;
    if (game.state.pending || isLeaderAgoraPending(game)) continue;
    return;
  }
}

/* --------------------- 领袖侧 pending 自动结算 --------------------- */

function resolveLeaderPending(game: SoloGame): GameAction | null {
  const st = game.state;
  const pend = st.pending;
  if (!pend) return null;
  const me = game.leaderId;

  switch (pend.kind) {
    case 'progressToken': {
      const opts = pend.options ?? st.progressAvailable;
      const pick = opts.length ? game.rng.pick(opts) : st.progressAvailable[0];
      return pick ? { type: 'CHOOSE_PROGRESS_TOKEN', player: me, tokenId: pick } : null;
    }
    case 'discardedCard': {
      const pick = pend.options.length ? game.rng.pick(pend.options) : st.discard[0];
      return pick ? { type: 'CHOOSE_DISCARDED_CARD', player: me, cardId: pick } : null;
    }
    case 'opponentCard': {
      const pick = pend.options.length ? game.rng.pick(pend.options) : null;
      return pick ? { type: 'CHOOSE_OPPONENT_CARD', player: me, cardId: pick } : null;
    }
    case 'startPlayer':
      // 官方规则：若领袖有选择权则先手；此处统一让领袖先手
      return { type: 'CHOOSE_START_PLAYER', player: pend.chooser, next: game.leaderId };
    default:
      return null;
  }
}

/* --------------------- 终局计分修正（Hammurabi +5） --------------------- */

/**
 * 官方规则：Hammurabi 终局 +5 分，但仅当游戏进行到时代 III 末（即非军事 / 科技速胜）。
 * 主引擎的 scoreGame 已设定 victory；此处仅做加法修正，不改动主引擎。
 */
export function soloFinalizeVictory(game: SoloGame): void {
  const st = game.state;
  if (!st.victory || !st.victory.breakdown) return;
  const ld = game.leader;
  if (ld.endBonus && st.victory.type !== 'military' && st.victory.type !== 'science') {
    const b = st.victory.breakdown.find((x: ScoreBreakdown) => x.player === game.leaderId);
    if (b) {
      b.total += ld.endBonus.points;
      if (st.victory.type === 'civilian' || st.victory.type === 'draw') {
        const p0 = st.victory.breakdown.find((x) => x.player === 0);
        const p1 = st.victory.breakdown.find((x) => x.player === 1);
        if (p0 && p1) {
          if (p1.total > p0.total) st.victory = { ...st.victory, type: 'civilian', winner: 1 };
          else if (p0.total > p1.total) st.victory = { ...st.victory, type: 'civilian', winner: 0 };
          else st.victory = { ...st.victory, type: 'draw', winner: null };
        }
      }
    }
  }
}

/* ------------------------------ 对外查询 ------------------------------ */

export function soloCurrentDecision(game: SoloGame): SoloDecisionCardDef | null {
  return game.lastDecision;
}

export function isSoloLeaderTurn(game: SoloGame): boolean {
  const st = game.state;
  return st.phase === 'playing' && st.current === game.leaderId && st.pending == null;
}
