import type { GameState, PlayerId, Slot } from './types';

/* ------------------------------------------------------------------
 * 状态投影：把「完整对局状态」裁剪为「可以安全下发 / 安全渲染」的公开状态
 *
 * 必须剥离的字段：
 *   seed             —— 有了 seed + 完整日志，客户端可从头重放，反推出所有暗牌
 *   rngState         —— 直接可预测后续翻牌与洗牌结果
 *   removedFromGame  —— 开局被移出的牌，暴露它会缩小暗牌的可能范围
 *   progressRemoved  —— 发展标记抽取池，属于未公开信息
 *   slots[].cardId   —— 未翻开的暗牌（含被翻面垫在奇迹下的牌，其身份永久保密）
 *
 * Pantheon 扩展引入了「玩家私有信息」，publicView 因此带 viewer 参数：
 *   - 献祭 token 面值仅持有者可见（对手只能看到枚数）
 *   - 图板上未翻开的神格身份对双方都保密
 *   - 神话牌堆剩余内容保密（仅可推断）
 *   - Enki 卡上的进度 token 是公开信息
 * 本地热座渲染时 viewer = 当前行动玩家；联机广播按座位分别裁剪。
 * ------------------------------------------------------------------ */

export type PublicSlot = Slot;

export type PublicState = Omit<
  GameState,
  'seed' | 'rngState' | 'removedFromGame' | 'progressRemoved'
> & {
  /** 供联机客户端判断自己看到的是哪个座位（观战为 null） */
  viewer?: PlayerId | null;
};

/** 需要剥离的私有字段（供测试穷举校验，防止日后新增字段时被漏掉） */
export const PRIVATE_FIELDS = [
  'seed',
  'rngState',
  'removedFromGame',
  'progressRemoved',
] as const;

export function redactSlot(slot: Slot): PublicSlot {
  // 正面朝上的牌可见；暗牌（含已取走但从未翻开的）一律置空
  return slot.faceUp ? slot : { ...slot, cardId: null };
}

export function publicView(state: GameState, viewer: PlayerId | null = null): PublicState {
  const { seed, rngState, removedFromGame, progressRemoved, ...rest } = state;
  void seed;
  void rngState;
  void removedFromGame;
  void progressRemoved;

  const view: PublicState = {
    ...rest,
    viewer,
    slots: rest.slots.map(redactSlot),
  };

  const pan = state.pantheon;
  if (pan) {
    view.pantheon = {
      ...pan,
      // 牌堆内容保密：只公开各组剩余张数
      decks: {
        mesopotamian: [],
        phoenician: [],
        greek: [],
        egyptian: [],
        roman: [],
      },
      // 未翻开的神格身份保密（保留「有牌」这一事实）
      board: pan.board.map((id, i) => (pan.revealed[i] ? id : id !== null ? '#' : null)),
      // 献祭 token 的槽位公开、面值保密
      age2Tokens: Object.fromEntries(
        Object.entries(pan.age2Tokens).map(([k]) => [k, -1]),
      ) as Record<number, number>,
    };

    // 献祭 token 面值仅持有者可见
    if (viewer !== null) {
      view.players = view.players.map((pl, i) => ({
        ...pl,
        pan: {
          ...pl.pan,
          offerings: i === viewer ? pl.pan.offerings : pl.pan.offerings.map(() => -1),
        },
      })) as typeof view.players;
    } else {
      // 观战视角：双方面值都隐藏
      view.players = view.players.map((pl) => ({
        ...pl,
        pan: { ...pl.pan, offerings: pl.pan.offerings.map(() => -1) },
      })) as typeof view.players;
    }

    // Pantheon 的待决选项是抽自暗牌堆的内容（如 Enki 的 2 枚进度 token、
    // 放神格的 2 张神），只应让做选择的玩家本人看到
    if (view.pending?.kind === 'pantheon' && view.pending.player !== viewer) {
      view.pending = {
        ...view.pending,
        steps: view.pending.steps.map((s) => ({ ...s, options: [] })),
      };
    }
  }

    // Agora：密谋手牌 / 准备区内容 / 压住的进度 token 私密；暗法令 token 身份保密
  if (view.agora) {
    view.players = view.players.map((pl, i) => {
      const own = i === viewer;
      return {
        ...pl,
        agora: {
          senators: pl.agora.senators,
          conspiracies: own ? pl.agora.conspiracies : [],
          prepared: own
            ? pl.agora.prepared
            : pl.agora.prepared.map(() => ({ conspiracyId: '#', cardId: '#' })),
          triggered: pl.agora.triggered,
          tuckedProgress: own ? pl.agora.tuckedProgress : pl.agora.tuckedProgress.map(() => '#'),
        },
      };
    }) as typeof view.players;
    view.agora = {
      ...view.agora,
      senate: {
        ...view.agora.senate,
        chambers: view.agora.senate.chambers.map((ch) => ({
          ...ch,
          decree: ch.decreeFaceUp ? ch.decree : ch.decree ? '#' : '',
          decreeExtra: ch.decreeExtra.map((e) => (e.faceUp ? e : { id: '#', faceUp: false })),
        })),
      },
    };
  }

  // Agora 的待决选项（Conspire 抽到的密谋、免费建造候选等）只让选择者本人看到
  if (view.pending?.kind === 'agora' && view.pending.player !== viewer) {
    view.pending = {
      ...view.pending,
      steps: view.pending.steps.map((s) => ({ ...s, options: [] })),
    };
  }

  return view;
}

/** 当前需要作出选择的玩家（便于客户端直接读取） */
export function isSecretLeaked(view: PublicState): string[] {
  const leaks: string[] = [];
  for (const f of PRIVATE_FIELDS) {
    if (f in view) leaks.push(f);
  }
  for (const s of view.slots) {
    if (!s.faceUp && s.cardId !== null) leaks.push(`slots[${s.index}].cardId`);
  }
  const pan = view.pantheon;
  if (pan) {
    for (const myth of Object.keys(pan.decks) as (keyof typeof pan.decks)[]) {
      if (pan.decks[myth].length > 0) leaks.push(`pantheon.decks.${myth}`);
    }
    pan.board.forEach((id, i) => {
      if (!pan.revealed[i] && id !== null && id !== '#') leaks.push(`pantheon.board[${i}]`);
    });
    Object.entries(pan.age2Tokens).forEach(([k, v]) => {
      if (v !== -1) leaks.push(`pantheon.age2Tokens[${k}]`);
    });
    // 对手的献祭 token 面值不得出现在公开视图
    for (const [i, pl] of view.players.entries()) {
      if (view.viewer === i) continue;
      pl.pan.offerings.forEach((v, j) => {
        if (v !== -1) leaks.push(`players[${i}].pan.offerings[${j}]`);
      });
    }
    // 非选择者（含观战）不得看到 Pantheon 待决选项（抽自暗牌堆）
    if (view.pending?.kind === 'pantheon' && view.pending.player !== view.viewer) {
      view.pending.steps.forEach((s, k) => {
        if ((s.options ?? []).length > 0) leaks.push(`pending.steps[${k}].options`);
      });
    }
  }
  const agora = view.agora;
  if (agora) {
    for (const [i, pl] of view.players.entries()) {
      if (view.viewer === i) continue;
      if (pl.agora.conspiracies.length > 0) leaks.push(`players[${i}].agora.conspiracies`);
      pl.agora.prepared.forEach((e, k) => {
        if (e.conspiracyId !== '#' || e.cardId !== '#') leaks.push(`players[${i}].agora.prepared[${k}]`);
      });
      pl.agora.tuckedProgress.forEach((id, k) => {
        if (id !== '#') leaks.push(`players[${i}].agora.tuckedProgress[${k}]`);
      });
    }
    agora.senate.chambers.forEach((ch, k) => {
      if (ch.decree && !ch.decreeFaceUp && ch.decree !== '#') leaks.push(`agora.chambers[${k}].decree`);
      ch.decreeExtra.forEach((e, j) => {
        if (!e.faceUp && e.id !== '#') leaks.push(`agora.chambers[${k}].decreeExtra[${j}]`);
      });
    });
    if (view.pending?.kind === 'agora' && view.pending.player !== view.viewer) {
      view.pending.steps.forEach((s, k) => {
        if (s.options.length > 0) leaks.push(`pending.steps[${k}].options`);
      });
    }
  }
  return leaks;
}

export type { PlayerId };
