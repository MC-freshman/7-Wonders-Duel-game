import { CHAMBER_SCORES } from '../core/data/index';
import { CARD_BY_ID, PROGRESS_BY_ID, WONDER_BY_ID, zoneOf } from '../core/data/index';
import { activePlayer, applyAction, legalActions } from '../core/engine';
import { Rng } from '../core/rng';
import { cityCards, production, tradePrice } from '../core/resources';
import type { GameAction, GameState, PlayerId, ScienceSymbol } from '../core/types';

/* ------------------------------------------------------------------
 * AI 对手
 *
 * 决策输入：完整 GameState。其中「牌阵中正面朝下的牌」与「开局被移除的牌」
 * 属于隐藏信息 —— 困难难度会先做一次「确定化」采样（把暗牌随机替换成
 * 未知牌池中的牌）再搜索，避免 AI 直接偷看暗牌。
 *
 * 评估函数考虑：即时分数、军事位置、科技进度（含压制威胁）、资源自给率、
 * 金币、连锁潜力、奇迹可行性、以及对手的即时威胁。
 * ------------------------------------------------------------------ */

export type Difficulty = 'easy' | 'medium' | 'hard';

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: '简单',
  medium: '中等',
  hard: '困难',
};

interface AiConfig {
  depth: number;
  /** 对暗牌做几次确定化采样后取平均 */
  samples: number;
  /** 随机扰动幅度，制造低级失误 */
  noise: number;
  /** 直接随机出招的概率 */
  blunder: number;
  budget: number;
}

const CONFIG: Record<Difficulty, AiConfig> = {
  easy: { depth: 1, samples: 1, noise: 8, blunder: 0.22, budget: 300 },
  medium: { depth: 2, samples: 1, noise: 2, blunder: 0.04, budget: 6000 },
  hard: { depth: 3, samples: 2, noise: 0, blunder: 0, budget: 24000 },
};

/* ------------------------------ 评估 ------------------------------ */

const WIN = 1e6;

function distinctScience(state: GameState, p: PlayerId): number {
  return Object.values(state.players[p].science).filter((n) => (n ?? 0) > 0).length;
}

function pairsOf(state: GameState, p: PlayerId): number {
  return Object.values(state.players[p].science).reduce(
    (sum, n) => sum + Math.floor((n ?? 0) / 2),
    0,
  );
}

/** 粗略估算终局分数（比完整 scoreGame 轻量，适合放在搜索叶子节点） */
function estimateVp(state: GameState, p: PlayerId): number {
  const player = state.players[p];
  let vp = 0;
  for (const id of player.city) vp += CARD_BY_ID[id]?.vp ?? 0;
  for (const id of player.wondersBuilt) vp += WONDER_BY_ID[id]?.vp ?? 0;
  for (const id of player.progressTokens) {
    const t = PROGRESS_BY_ID[id];
    vp += t?.vp ?? 0;
    if (t?.vpPer?.target === 'progress') vp += player.progressTokens.length * t.vpPer.amount;
  }
  vp += Math.floor(player.coins / 3);
  const sign = p === 0 ? 1 : -1;
  vp += zoneOf(Math.max(0, sign * state.conflictPawn)).points;
  return vp;
}

/** 资源自给率：手中常用资源越齐，越不依赖昂贵的贸易 */
function resourceScore(state: GameState, p: PlayerId): number {
  const prod = production(state, p);
  let score = 0;
  for (const r of ['wood', 'stone', 'clay', 'glass', 'papyrus'] as const) {
    score += Math.min(prod[r], 2) * 1.2;
  }
  // 依赖贸易的代价：对手产得越多，我买得越贵
  const foe = (1 - p) as PlayerId;
  let exposure = 0;
  for (const r of ['wood', 'stone', 'clay', 'glass', 'papyrus'] as const) {
    if (prod[r] === 0) exposure += tradePrice(state, p, r) * 0.25;
  }
  void foe;
  return score - exposure;
}

/** 连锁潜力：下一时代能免费建造多少张 */
function chainPotential(state: GameState, p: PlayerId): number {
  const owned = new Set(cityCards(state, p).map((c) => c.link).filter(Boolean));
  const nextAge = Math.min(3, state.age + 1) as 1 | 2 | 3;
  let n = 0;
  for (const card of Object.values(CARD_BY_ID)) {
    if (card.age !== nextAge) continue;
    if (card.freeLink && owned.has(card.freeLink)) n += 1;
  }
  return n;
}

/** 奇迹可行性：未建奇迹里有多少是「资源缺口小」的 */
function wonderFeasibility(state: GameState, p: PlayerId): number {
  const prod = production(state, p);
  let best = 0;
  for (const id of state.players[p].wondersUnbuilt) {
    const w = WONDER_BY_ID[id];
    if (!w) continue;
    let gap = 0;
    for (const [r, n] of Object.entries(w.cost)) {
      gap += Math.max(0, (n as number) - (prod[r as keyof typeof prod] ?? 0));
    }
    const value = (w.vp ?? 0) + (w.shields ?? 0) * 1.5 + (w.coins ?? 0) * 0.2;
    best = Math.max(best, value - gap * 1.2);
  }
  return best;
}

function evaluate(state: GameState, p: PlayerId): number {
  if (state.victory) {
    if (state.victory.winner === null) return 0;
    return state.victory.winner === p ? WIN : -WIN;
  }
  const foe = (1 - p) as PlayerId;
  const me = state.players[p];

  let s = 0;
  s += estimateVp(state, p) - estimateVp(state, foe);

  // 军事：位置 + 压制威胁
  const sign = p === 0 ? 1 : -1;
  const mine = Math.max(0, sign * state.conflictPawn);
  const theirs = Math.max(0, -sign * state.conflictPawn);
  s += mine * 1.1 - theirs * 1.4;
  if (mine >= 6) s += 8; // 距离军事压制仅 3 格
  if (theirs >= 6) s -= 12; // 自己濒临被压制

  // 科技：6 种即胜，越接近越危险
  const mySci = distinctScience(state, p);
  const foeSci = distinctScience(state, foe);
  s += mySci * 3.5 - foeSci * 4.5;
  if (mySci >= 5) s += 10;
  if (foeSci >= 5) s -= 16;
  s += (pairsOf(state, p) - pairsOf(state, foe)) * 2;

  s += (me.coins - state.players[foe].coins) * 0.4;
  s += resourceScore(state, p) - resourceScore(state, foe) * 0.8;
  s += chainPotential(state, p) * 0.8;
  s += wonderFeasibility(state, p) * 0.5;
  s += me.progressTokens.length * 1.5;

  // Agora：参议院控制（按 chamber 分值加权）/ 政治霸权临近 / 参议员与密谋资源
  if (state.agora) {
    const ag = state.agora;
    let myChambers = 0;
    let foeChambers = 0;
    let chamberPull = 0;
    ag.senate.chambers.forEach((ch, i) => {
      const diff = ch.cubes[p] - ch.cubes[foe];
      chamberPull += diff * CHAMBER_SCORES[i] * 0.7;
      if (ch.controller === p) myChambers += 1;
      else if (ch.controller === foe) foeChambers += 1;
    });
    s += chamberPull;
    s += (myChambers - foeChambers) * 2.5;
    // 霸权临近：控制 4+ 时指数加压（全 6 立即胜）；对手同样威胁要重点防守
    if (myChambers >= 4) s += (myChambers - 3) * 12;
    if (foeChambers >= 4) s -= (foeChambers - 3) * 18;
    // 参议员：招募费递增，早拿便宜且解锁参议院行动
    s += me.agora.senators.length * 1.2;
    s -= state.players[foe].agora.senators.length * 0.8;
    // 密谋：手牌是潜在爆发资源，准备区随时可触发
    s += me.agora.conspiracies.length * 1.5 + me.agora.prepared.length * 2;
    s -= (state.players[foe].agora.prepared.length) * 1.2;
  }

  return s;
}

/* ------------------------------ 隐藏信息处理 ------------------------------ */

/**
 * 确定化：把牌阵中正面朝下的牌替换为未知牌池中的随机牌。
 * 未知牌池 = 本时代全部卡（时代 III 含行会）－ 双方城市 － 弃牌堆 － 明牌。
 */
function determinize(state: GameState, rng: Rng): GameState {
  const out = structuredClone(state) as GameState;
  const known = new Set<string>();
  for (const p of [0, 1] as PlayerId[]) {
    out.players[p].city.forEach((id) => known.add(id));
  }
  out.discard.forEach((id) => known.add(id));
  out.removedFromGame.forEach((id) => known.add(id));
  for (const slot of out.slots) {
    if (slot.cardId && slot.faceUp) known.add(slot.cardId);
  }

  const pool: string[] = [];
  for (const card of Object.values(CARD_BY_ID)) {
    if (card.age !== out.age) continue;
    if (card.guild && out.age !== 3) continue;
    if (known.has(card.id)) continue;
    pool.push(card.id);
  }
  const shuffled = rng.shuffle(pool);
  let i = 0;
  for (const slot of out.slots) {
    if (slot.faceUp || slot.taken) continue;
    slot.cardId = shuffled[i++] ?? slot.cardId;
  }
  out.rngState = rng.state;
  return out;
}

/* ------------------------------ 搜索 ------------------------------ */

/** 深层节点的动作裁剪：建奇迹时只考虑第一个可用槽位，控制分支 */
function pruneActions(actions: GameAction[], depth: number): GameAction[] {
  if (depth === 0) return actions;
  const seen = new Set<string>();
  const out: GameAction[] = [];
  for (const a of actions) {
    if (a.type === 'BUILD_WONDER') {
      const key = `w:${a.wonderId}`;
      if (seen.has(key)) continue;
      seen.add(key);
    }
    out.push(a);
  }
  return out;
}

interface SearchResult {
  score: number;
  nodes: number;
}

function search(
  state: GameState,
  me: PlayerId,
  depth: number,
  alpha: number,
  beta: number,
  counter: { nodes: number; budget: number; deadline?: number },
): SearchResult {
  counter.nodes += 1;
  if (
    state.victory ||
    depth === 0 ||
    counter.nodes > counter.budget ||
    // 时间硬墙：每 64 节点查一次墙钟，杜绝罕见局面下的同步计算爆炸
    (counter.deadline !== undefined && (counter.nodes & 63) === 0 && Date.now() > counter.deadline)
  ) {
    return { score: evaluate(state, me), nodes: counter.nodes };
  }

  const actor = activePlayer(state);
  if (actor === null) return { score: evaluate(state, me), nodes: counter.nodes };

  const actions = pruneActions(legalActions(state, actor), depth);
  if (actions.length === 0) return { score: evaluate(state, me), nodes: counter.nodes };

  const maximizing = actor === me;
  let best = maximizing ? -Infinity : Infinity;
  let a = alpha;
  let b = beta;

  // 先试「建造」，通常比「弃牌」更有价值，利于剪枝
  const ordered = actions.slice().sort((x, y) => rank(x) - rank(y));

  for (const action of ordered) {
    const next = applyAction(state, action);
    const { score } = search(next, me, depth - 1, a, b, counter);
    if (maximizing) {
      if (score > best) best = score;
      if (best > a) a = best;
    } else {
      if (score < best) best = score;
      if (best < b) b = best;
    }
    if (b <= a) break;
    if (counter.nodes > counter.budget) break;
  }
  return { score: best, nodes: counter.nodes };
}

function rank(a: GameAction): number {
  if (a.type === 'BUILD_CARD') return 0;
  if (a.type === 'BUILD_WONDER') return 1;
  if (a.type === 'CHOOSE_PROGRESS_TOKEN') return 2;
  return 3;
}

/* ------------------------------ 对外接口 ------------------------------ */

export interface AiDecision {
  action: GameAction;
  score: number;
  nodes: number;
  /** 时间硬墙触发：本次决策未完成全部评估，返回的是已评估最优（或随机兜底） */
  degraded?: boolean;
}

export function chooseAction(
  state: GameState,
  me: PlayerId,
  difficulty: Difficulty,
): AiDecision {
  const cfg = CONFIG[difficulty];
  const rng = new Rng((state.rngState ^ (me === 0 ? 0x9e3779b9 : 0x85ebca6b)) >>> 0);

  let actions = legalActions(state, me);
  if (actions.length === 0) {
    throw new Error('AI 在无合法动作时被调用');
  }
  if (actions.length === 1) return { action: actions[0], score: 0, nodes: 0 };

  // 顶层动作收敛：Agora 的 PREPARE_CONSPIRACY（手牌 × 槽数）等会让动作集膨胀，
  // 采样上限保证单步耗时可控；建造 / 招募类动作全保留
  const MAX_TOP = 48;
  if (actions.length > MAX_TOP) {
    const keepTypes = new Set(['BUILD_CARD', 'BUILD_WONDER', 'RECRUIT_SENATOR']);
    const kept = actions.filter((a) => keepTypes.has(a.type));
    const rest = actions.filter((a) => !keepTypes.has(a.type));
    const keep = Math.max(8, MAX_TOP - kept.length);
    const stride = rest.length / keep;
    const sampled: typeof rest = [];
    for (let i = 0; i < keep; i++) sampled.push(rest[Math.floor(i * stride)]);
    actions = [...kept, ...sampled];
  }

  if (cfg.blunder > 0 && rng.float() < cfg.blunder) {
    return { action: rng.pick(actions), score: 0, nodes: 0 };
  }

  // 扩展模式下单节点成本（structuredClone 状态更大）显著上升：实测合体 ~0.8ms/节点，
  // 预算必须与单节点成本匹配，否则每步都打满时间墙（AI 全程降级 + 心跳占满事件循环）
  const budgetScale = state.agora && state.pantheon ? 8 : state.agora || state.pantheon ? 4 : 1;
  const budget = Math.max(500, Math.floor(cfg.budget / budgetScale));
  // 时间硬墙：无论预算如何，同步计算绝不允许冻结事件循环（联机服务器同一进程）
  const t0 = Date.now();
  const timeBudget = difficulty === 'hard' ? 4000 : 1200;
  const counter = { nodes: 0, budget, deadline: t0 + timeBudget };
  const totals = new Map<number, number>();
  let expired = false;

  // 困难难度会对暗牌做多次采样再取平均，避免为「幻想中的牌面」过度优化
  for (let s = 0; s < cfg.samples; s++) {
    const base = cfg.samples > 1 ? determinize(state, rng) : state;
    for (let i = 0; i < actions.length; i++) {
      const next = applyAction(base, actions[i]);
      const { score } = search(next, me, cfg.depth - 1, -Infinity, Infinity, counter);
      totals.set(i, (totals.get(i) ?? 0) + score / cfg.samples);
      if (counter.nodes > counter.budget) break;
    }
    if (counter.nodes > counter.budget || Date.now() - t0 > timeBudget) {
      expired = true;
      break;
    }
  }

  let bestIdx = 0;
  let bestScore = -Infinity;
  if (!expired) {
    for (let i = 0; i < actions.length; i++) {
      const noise = cfg.noise > 0 ? (rng.float() - 0.5) * cfg.noise : 0;
      const total = (totals.get(i) ?? evaluate(applyAction(state, actions[i]), me)) + noise;
      if (total > bestScore) {
        bestScore = total;
        bestIdx = i;
      }
    }
  } else {
    // 降级：只从已评估的动作里挑最优；一个都没评完就随机兜底
    for (const [i, total] of totals) {
      if (total > bestScore) {
        bestScore = total;
        bestIdx = i;
      }
    }
    if (bestScore === -Infinity) {
      return { action: rng.pick(actions), score: 0, nodes: counter.nodes, degraded: true };
    }
  }

  // 确定化只用于评估，真实动作必须作用在原始状态上
  return {
    action: actions[bestIdx],
    score: bestScore,
    nodes: counter.nodes,
    ...(expired ? { degraded: true } : {}),
  };
}

/** 供 UI 展示的简短说明 */
export function describeAction(state: GameState, action: GameAction): string {
  switch (action.type) {
    case 'DRAFT_WONDER':
      return `选择奇迹「${WONDER_BY_ID[action.wonderId]?.zh}」`;
    case 'BUILD_CARD':
      return `建造「${CARD_BY_ID[state.slots[action.slot]?.cardId ?? '']?.zh}」`;
    case 'DISCARD_CARD':
      return `弃掉「${CARD_BY_ID[state.slots[action.slot]?.cardId ?? '']?.zh}」换金币`;
    case 'BUILD_WONDER':
      return `用一张牌建造奇迹「${WONDER_BY_ID[action.wonderId]?.zh}」`;
    case 'CHOOSE_PROGRESS_TOKEN':
      return `获得发展标记「${PROGRESS_BY_ID[action.tokenId]?.zh}」`;
    case 'CHOOSE_DISCARDED_CARD':
      return `自弃牌堆免费建造「${CARD_BY_ID[action.cardId]?.zh}」`;
    case 'CHOOSE_OPPONENT_CARD':
      return `摧毁对手的「${CARD_BY_ID[action.cardId]?.zh}」`;
    case 'CHOOSE_START_PLAYER':
      return `选择由${action.next === 0 ? '玩家一' : '玩家二'}先手`;
    case 'PLACE_DIVINITY':
      return `将神格放到 Pantheon 图板`;
    case 'INVOKE_DIVINITY':
      return `调用 Pantheon 图板上的神格`;
    case 'CHOOSE_PANTHEON':
      return `执行 Pantheon 效果选择`;
    case 'RECRUIT_SENATOR':
      return `招募参议员`;
    case 'SENATE_PLACE':
      return `参议院：放置方块`;
    case 'SENATE_MOVE':
      return `参议院：移动方块`;
    case 'SENATE_REMOVE':
      return `参议院：移除对手方块`;
    case 'PREPARE_CONSPIRACY':
      return `准备密谋`;
    case 'TRIGGER_CONSPIRACY':
      return `触发密谋`;
    case 'CHOOSE_AGORA':
      return `执行 Agora 效果选择`;
  }
}

export type { ScienceSymbol };
