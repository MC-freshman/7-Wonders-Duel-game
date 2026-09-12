import {
  AGE1_TOKEN_SLOTS,
  AGE2_TOKEN_SLOTS,
  AGE_CARDS,
  AGORA_MILITARY_TOKENS,
  AGORA_WONDERS,
  ALL_PROGRESS_TOKENS,
  DECREES,
  DIVINITY_BY_ID,
  GATE_ID,
  GUILD_CARDS,
  MYTH_TOKEN_POOL,
  OFFERING_VALUES,
  PANTHEON_WONDERS,
  SENATOR_AGE_MIX,
  SENATORS,
  TEMPLES,
  WONDERS,
} from './data/index';
import { buildSlots } from './layout';
import { makeRng, Rng } from './rng';
import type { AgoraState, GameState, GameStateOptions, Mythology, PlayerId, PlayerState } from './types';
import { CONSPIRACIES } from './data/agora';

/* ------------------------------------------------------------------
 * 开局设置
 * ------------------------------------------------------------------ */

export const WONDER_DRAFT_ORDER: PlayerId[] = [
  // 第一轮：先手 1 → 后手 2 → 先手取最后 1
  0, 1, 1, 0,
  // 第二轮：改由后手先选
  1, 0, 0, 1,
];

function emptyPlayer(id: PlayerId): PlayerState {
  return {
    id,
    city: [],
    wondersBuilt: [],
    wondersUnbuilt: [],
    wonderCards: {},
    coins: 7,
    science: {},
    progressTokens: [],
    militaryZone: 0,
    pan: { mythologyTokens: [], offerings: [], invoked: [], astarteCoins: 0 },
    agora: { senators: [], conspiracies: [], prepared: [], triggered: [], tuckedProgress: [] },
  };
}

export function initialState(seed: number, opts: GameStateOptions = {}): GameState {
  const rng = makeRng(seed);
  const progressPool = opts.pantheon || opts.agora
    ? ALL_PROGRESS_TOKENS.filter((t) => opts.pantheon || !t.extension || t.extension === 'agora').map((t) => t.id)
    : ALL_PROGRESS_TOKENS.filter((t) => !t.extension).map((t) => t.id);
  const wonderPool = [
    ...WONDERS.map((w) => w.id),
    ...(opts.pantheon ? PANTHEON_WONDERS.map((w) => w.id) : []),
    ...(opts.agora ? AGORA_WONDERS.map((w) => w.id) : []),
  ];
  const progress = rng.sample(progressPool, 5);
  const wonderOffer = rng.sample(wonderPool, 4);

  const pantheon = opts.pantheon
    ? {
        board: [null, null, null, null, null, null] as (string | null)[],
        revealed: [false, false, false, false, false, false],
        decks: {
          mesopotamian: [],
          phoenician: [],
          greek: [],
          egyptian: [],
          roman: [],
        } as Record<Mythology, string[]>,
        age1Tokens: {} as Record<number, Mythology>,
        age2Tokens: {} as Record<number, number>,
        military: [
          { fine: 2, used: false },
          { fine: 2, used: false },
          { fine: 5, used: false },
          { fine: 5, used: false },
        ],
        minerva: null,
        snake: null,
        enkiProgress: [] as string[],
      }
    : null;

  /* Agora：参议院图板 + 参议员池 + 密谋牌库 */
  let agora: AgoraState | null = null;
  if (opts.agora) {
    // 法令 token：16 抽 6，每 chamber 1 枚。图板上各 chamber 的印刷符号未知（数据表 §8），
    // 以每枚 1/16 概率视为「符号匹配 → 面朝上」，其余面朝下、被方块触碰时翻开。
    const decreeShuffled = rng.shuffle(DECREES.map((d) => d.id));
    const chambers = decreeShuffled.slice(0, 6).map((id) => ({
      cubes: [0, 0] as [number, number],
      controller: null as PlayerId | null,
      decree: id,
      decreeFaceUp: rng.float() < 1 / 16,
      decreeExtra: [] as { id: string; faceUp: boolean }[],
    }));
    agora = {
      senate: {
        chambers,
        decreeDeck: decreeShuffled.slice(6),
        conspiracyDeck: rng.shuffle(
          CONSPIRACIES.map((c) => c.id),
        ),
      },
      ops: [],
      senateActionsLeft: 0,
      politicianDistrict: null,
      triggeredThisTurn: false,
      endTurnAfterOps: false,
      military: AGORA_MILITARY_TOKENS.map((t) => ({ ...t, used: false })),
      senatorPool: rng.shuffle(SENATORS.map((s) => s.id)),
    };
  }

  return {
    seed,
    rngState: rng.state,
    phase: 'wonderDraft',
    age: 1,
    current: 0,
    players: [emptyPlayer(0), emptyPlayer(1)],
    slots: [],
    structureRemaining: 20,
    conflictPawn: 0,
    progressAvailable: progress,
    progressRemoved: progressPool.filter((id) => !progress.includes(id)),
    discard: [],
    removedFromGame: [],
    wonderOffer,
    wonderDraftStep: 0,
    pending: null,
    extraTurn: false,
    wondersBuiltTotal: 0,
    lastActive: 0,
    pantheon,
    agora,
    log: [
      {
        index: 0,
        player: null,
        text:
          opts.pantheon && opts.agora
            ? `开局：随机种子 ${seed}（Pantheon + Agora 扩展）`
            : opts.pantheon
              ? `开局：随机种子 ${seed}（Pantheon 扩展）`
              : opts.agora
                ? `开局：随机种子 ${seed}（Agora 扩展）`
                : `开局：随机种子 ${seed}`,
      },
    ],
    victory: null,
  };
}

/** 为指定时代铺牌阵；就地修改传入的 state */
export function setupAge(state: GameState, age: 1 | 2 | 3, rng: Rng): void {
  const deck = AGE_CARDS(age).map((c) => c.id);
  // Agora：参议员混入牌堆（I:5 / II:5 / III:3），等量基础卡额外移出以保持牌阵规模
  const nSenators = state.agora ? SENATOR_AGE_MIX[age] : 0;
  const removed = rng.sample(deck, 3 + nSenators);
  let ids = deck.filter((id) => !removed.includes(id));
  state.removedFromGame.push(...removed);
  if (state.agora) {
    ids = ids.concat(state.agora.senatorPool.splice(0, nSenators));
  }

  if (age === 3) {
    if (state.pantheon) {
      // Pantheon：3 座大殿替代 3 张行会（5 抽 3，其余 2 张移出游戏）
      const temples = rng.sample(
        TEMPLES.map((c) => c.id),
        3,
      );
      ids = ids.concat(temples);
      const unused = TEMPLES.map((c) => c.id).filter((id) => !temples.includes(id));
      state.removedFromGame.push(...unused);
    } else {
      const guilds = rng.sample(
        GUILD_CARDS().map((c) => c.id),
        3,
      );
      ids = ids.concat(guilds);
      const unused = GUILD_CARDS().map((c) => c.id).filter((id) => !guilds.includes(id));
      state.removedFromGame.push(...unused);
    }
  }

  ids = rng.shuffle(ids);
  const slots = buildSlots(age);
  slots.forEach((s, i) => {
    s.cardId = ids[i] ?? null;
  });
  state.age = age;
  state.slots = slots;
  state.structureRemaining = slots.filter((s) => s.cardId !== null).length;

  if (!state.pantheon) return;
  const pan = state.pantheon;

  if (age === 1) {
    // 5 枚神话 token（10 抽 5）随机放到指定暗牌位上
    const tokens = rng.sample(MYTH_TOKEN_POOL, AGE1_TOKEN_SLOTS.length);
    pan.age1Tokens = {};
    AGE1_TOKEN_SLOTS.forEach((slotIndex, i) => {
      pan.age1Tokens[slotIndex] = tokens[i] as Mythology;
    });
    // Age I 开始：5 组神格牌堆洗好
    const byMyth: Record<string, string[]> = {};
    for (const d of Object.keys(DIVINITY_BY_ID)) {
      const myth = DIVINITY_BY_ID[d].mythology;
      (byMyth[myth] ??= []).push(d);
    }
    for (const myth of Object.keys(byMyth) as Mythology[]) {
      pan.decks[myth] = rng.shuffle(byMyth[myth]);
    }
  }

  if (age === 2) {
    // 3 枚献祭 token 随机放到指定暗牌位上
    const offers = rng.shuffle(OFFERING_VALUES.slice());
    pan.age2Tokens = {};
    AGE2_TOKEN_SLOTS.forEach((slotIndex, i) => {
      pan.age2Tokens[slotIndex] = offers[i];
    });
    // 翻开图板上全部神格
    pan.revealed = pan.board.map((id) => id !== null);
    // 门放进唯一空位
    const empty = pan.board.findIndex((id) => id === null);
    if (empty >= 0) {
      pan.board[empty] = GATE_ID;
      pan.revealed[empty] = true;
    }
    // Enki 已在场 → 立即从移除池抽 2 枚进度 token 放卡上
    if (pan.board.includes('enki')) {
      pan.enkiProgress = rng.sample(state.progressRemoved, Math.min(2, state.progressRemoved.length));
    }
  }
}
