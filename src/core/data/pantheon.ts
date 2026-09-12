import type { CardDef, Mythology, Resource, WonderDef } from '../types';

/* ------------------------------------------------------------------
 * Pantheon 扩展数据
 * 依据：docs/rules/PANTHEON_DATA.md（官方规则书 + 用户实物核对，2026-09-03）
 * ------------------------------------------------------------------ */

export const MYTHOLOGIES: Mythology[] = [
  'mesopotamian',
  'phoenician',
  'greek',
  'egyptian',
  'roman',
];

/** 图板 6 个位置的调用费用（位置 0 = 玩家 0 首都端） */
export const BOARD_POSITION_COSTS: [number, number][] = [
  [3, 8],
  [4, 7],
  [5, 6],
  [6, 5],
  [7, 4],
  [8, 3],
];

/** 时代 I 结构上放神话 token 的槽位（face-down 的暗牌位） */
export const AGE1_TOKEN_SLOTS = [2, 4, 10, 11, 12];
/** 时代 II 结构上放献祭 token 的槽位 */
export const AGE2_TOKEN_SLOTS = [7, 9, 16];

/** 献祭 token 面值池（3 枚） */
export const OFFERING_VALUES = [-4, -3, -2];

/** 门卡 id（放在图板空位上的特殊「神格」） */
export const GATE_ID = 'gate';

/* ------------------------------ 神格 ------------------------------ */

export type DivinityEffect =
  | { kind: 'coins'; amount: number } // Tanit：立即获得金币
  | { kind: 'vp'; amount: number } // Aphrodite：终局固定分（被动）
  | { kind: 'shields'; amount: number } // Mars：移动冲突棋子
  | { kind: 'science'; symbol: 'law' } // Ishtar：视为 1 个「法」符号（被动）
  | { kind: 'enki' } // 从 Enki 卡上的 2 枚进度 token 选 1
  | { kind: 'nisaba' } // 蛇 token 附着对手绿卡
  | { kind: 'astarte' } // 7 金入圣库（防抢可花）
  | { kind: 'baal' } // 偷对手 1 棕/灰卡
  | { kind: 'hades' } // 从弃牌堆免费建 1 张
  | { kind: 'zeus' } // 弃结构上任意 1 张牌（含其上 token）
  | { kind: 'anubis' } // 拆一座已建奇迹（双方皆可）
  | { kind: 'isis' } // 从弃牌堆选 1 张用于免费建奇迹
  | { kind: 'ra' } // 抢对手 1 座未建奇迹
  | { kind: 'minerva' } // 放 Minerva 棋子到军事轨道
  | { kind: 'neptune' } // 弃 1 枚军事 token 不生效，再生效另 1 枚
  | { kind: 'gate' }; // 翻 5 组牌堆顶各 1 张，选 1 免费调用

export interface DivinityDef {
  id: string;
  name: string;
  zh: string;
  mythology: Mythology;
  effect: DivinityEffect;
  text: string;
}

export const DIVINITIES: DivinityDef[] = [
  {
    id: 'enki',
    name: 'Enki',
    zh: '恩基',
    mythology: 'mesopotamian',
    effect: { kind: 'enki' },
    text: '翻开时：从开局移除的发展标记中随机抽 2 枚面朝上放在卡上；调用时选 1 枚获得，另 1 枚回盒',
  },
  {
    id: 'ishtar',
    name: 'Ishtar',
    zh: '伊什塔尔',
    mythology: 'mesopotamian',
    effect: { kind: 'science', symbol: 'law' },
    text: '视为 1 个「法」科技符号',
  },
  {
    id: 'nisaba',
    name: 'Nisaba',
    zh: '尼沙巴',
    mythology: 'mesopotamian',
    effect: { kind: 'nisaba' },
    text: '把蛇 token 放到对手一张绿卡上，视为你拥有该卡的科学符号',
  },
  {
    id: 'astarte',
    name: 'Astarte',
    zh: '阿斯塔蒂',
    mythology: 'phoenician',
    effect: { kind: 'astarte' },
    text: '从银行取 7 金币放到卡上：不会被抢走，但可以正常花费；终局每剩余 1 金币 1 分',
  },
  {
    id: 'baal',
    name: 'Baal',
    zh: '巴力',
    mythology: 'phoenician',
    effect: { kind: 'baal' },
    text: '偷走对手城中一张棕卡或灰卡，加入你的城市',
  },
  {
    id: 'tanit',
    name: 'Tanit',
    zh: '塔尼特',
    mythology: 'phoenician',
    effect: { kind: 'coins', amount: 12 },
    text: '立即获得 12 金币',
  },
  {
    id: 'aphrodite',
    name: 'Aphrodite',
    zh: '阿佛洛狄忒',
    mythology: 'greek',
    effect: { kind: 'vp', amount: 9 },
    text: '9 分',
  },
  {
    id: 'hades',
    name: 'Hades',
    zh: '哈迪斯',
    mythology: 'greek',
    effect: { kind: 'hades' },
    text: '从弃牌堆选一张卡免费建造（不触发都市化）',
  },
  {
    id: 'zeus',
    name: 'Zeus',
    zh: '宙斯',
    mythology: 'greek',
    effect: { kind: 'zeus' },
    text: '把结构上任意一张牌（明/暗均可）弃入弃牌堆，其上的标记一并弃掉',
  },
  {
    id: 'anubis',
    name: 'Anubis',
    zh: '阿努比斯',
    mythology: 'egyptian',
    effect: { kind: 'anubis' },
    text: '弃掉一座奇迹下垫的卡（己方或对手均可）；已产生的即时效果保留，该奇迹可再次建造',
  },
  {
    id: 'isis',
    name: 'Isis',
    zh: '伊西斯',
    mythology: 'egyptian',
    effect: { kind: 'isis' },
    text: '从弃牌堆选一张卡，用它免费建造你的一座奇迹',
  },
  {
    id: 'ra',
    name: 'Ra',
    zh: '拉',
    mythology: 'egyptian',
    effect: { kind: 'ra' },
    text: '抢走对手一座未建造的奇迹（你因此可建到 5 座，全场仍限 7 座）',
  },
  {
    id: 'mars',
    name: 'Mars',
    zh: '玛尔斯',
    mythology: 'roman',
    effect: { kind: 'shields', amount: 2 },
    text: '2 面战争盾',
  },
  {
    id: 'minerva',
    name: 'Minerva',
    zh: '密涅瓦',
    mythology: 'roman',
    effect: { kind: 'minerva' },
    text: '把 Minerva 棋子放到军事轨道任意格；冲突棋子进入该格时立即停下并弃掉 Minerva',
  },
  {
    id: 'neptune',
    name: 'Neptune',
    zh: '尼普顿',
    mythology: 'roman',
    effect: { kind: 'neptune' },
    text: '选 1 枚军事 token 弃掉且不生效；再选 1 枚军事 token 生效后弃掉',
  },
];

/** 门卡（占图板空位；费用 = 所在格 ×2） */
export const GATE_TEXT = '翻开每组神话牌堆顶各 1 张，选 1 张免费调用，其余盖回；费用 = 所在格 ×2';

export const DIVINITY_BY_ID: Record<string, DivinityDef> = Object.fromEntries(
  DIVINITIES.map((d) => [d.id, d]),
);

/* ------------------------------ 大殿卡 ------------------------------ */

/**
 * 5 座大殿：时代 III 替代行会（随机 3 弃 2 混入）。
 * 持有对应神话 token → 免费建造（token 不弃）；终局按 1/2/3 座计 5/12/21 分。
 */
export const TEMPLES: CardDef[] = [
  {
    id: 'temple-mesopotamian',
    name: 'Mesopotamian Grand Temple',
    zh: '美索不达米亚大殿',
    type: 'guild',
    guild: true,
    age: 3,
    temple: true,
    mythology: 'mesopotamian',
    extension: 'pantheon',
    cost: { wood: 3, glass: 1, papyrus: 1 },
    freeLink: 'myth:mesopotamian',
    text: '持有「美索不达米亚」神话 token 可免费建造；大殿计分见终局（1/2/3 座 = 5/12/21 分）',
  },
  {
    id: 'temple-egyptian',
    name: 'Egyptian Grand Temple',
    zh: '埃及大殿',
    type: 'guild',
    guild: true,
    age: 3,
    temple: true,
    mythology: 'egyptian',
    extension: 'pantheon',
    cost: { clay: 3, glass: 1, papyrus: 1 },
    freeLink: 'myth:egyptian',
    text: '持有「埃及」神话 token 可免费建造；大殿计分见终局',
  },
  {
    id: 'temple-greek',
    name: 'Greek Grand Temple',
    zh: '希腊大殿',
    type: 'guild',
    guild: true,
    age: 3,
    temple: true,
    mythology: 'greek',
    extension: 'pantheon',
    cost: { stone: 3, glass: 1, papyrus: 1 },
    freeLink: 'myth:greek',
    text: '持有「希腊」神话 token 可免费建造；大殿计分见终局',
  },
  {
    id: 'temple-roman',
    name: 'Roman Grand Temple',
    zh: '罗马大殿',
    type: 'guild',
    guild: true,
    age: 3,
    temple: true,
    mythology: 'roman',
    extension: 'pantheon',
    cost: { clay: 1, stone: 1, glass: 2, papyrus: 1 },
    freeLink: 'myth:roman',
    text: '持有「罗马」神话 token 可免费建造；大殿计分见终局',
  },
  {
    id: 'temple-phoenician',
    name: 'Phoenician Grand Temple',
    zh: '腓尼基大殿',
    type: 'guild',
    guild: true,
    age: 3,
    temple: true,
    mythology: 'phoenician',
    extension: 'pantheon',
    cost: { wood: 1, stone: 1, glass: 1, papyrus: 2 },
    freeLink: 'myth:phoenician',
    text: '持有「腓尼基」神话 token 可免费建造；大殿计分见终局',
  },
];

/** 大殿计分：拥有的座数 → 分值 */
export function templeScore(count: number): number {
  if (count >= 3) return 21;
  if (count === 2) return 12;
  if (count === 1) return 5;
  return 0;
}

/* ------------------------------ 新奇迹 ------------------------------ */

export const PANTHEON_WONDERS: WonderDef[] = [
  {
    id: 'sanctuary',
    name: 'The Sanctuary',
    zh: '圣堂',
    cost: { papyrus: 1, glass: 1, stone: 2 },
    special: 'pantheon-sanctuary',
    extension: 'pantheon',
    text: '你调用 Pantheon 的费用 −2 金币；立即再行动一回合；无分数',
  },
  {
    id: 'divine-theatre',
    name: 'The Divine Theatre',
    zh: '通神大剧场',
    cost: { papyrus: 2, glass: 1, wood: 1 },
    vp: 2,
    special: 'pantheon-theatre',
    extension: 'pantheon',
    text: '翻开任一神话组的全部卡，选 1 位神格免费调用，其余按任意顺序叠回组顶；2 分',
  },
];

/* ------------------------------ 神话 token ------------------------------ */

/** 10 枚 = 5 神话 × 2 */
export const MYTH_TOKEN_POOL: Mythology[] = [...MYTHOLOGIES, ...MYTHOLOGIES];

export const RESOURCE_LABEL_LONG: Record<Resource, string> = {
  wood: '木材',
  stone: '石材',
  clay: '陶土',
  glass: '玻璃',
  papyrus: '纸草',
};
