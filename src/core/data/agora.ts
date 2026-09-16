import type { CardDef, Resource } from '../types';

/* ------------------------------------------------------------------
 * Agora 扩展数据（M7）
 *
 * 来源：docs/rules/AGORA_DATA.md（官方 EN 规则书 + 实物照片互证）。
 * 参议员卡混入时代牌堆（I:5 / II:5 / III:3），招募费用 = 已有参议员数；
 * 7 张政治家的分区按官方可见信息取 左3/中2/右2 近似（见数据表 §8）。
 * ------------------------------------------------------------------ */

/* ------------------------------ 参议院图板 ------------------------------ */

/**
 * 每人可用的影响方块总数（官方 24 枚 = 每人 12，见 docs/rules/AGORA_DATA.md §1）。
 * 引擎据此做供给校验：图板上某方方块已达 12 枚时，任何「放置」都不再执行
 * （官方 Solo 规则同样写明「Leader 面前方块用尽 → 不执行」，AGORA_SOLO_DATA §2.3）。
 */
export const SENATE_CUBE_SUPPLY = 12;

/** 6 个 chamber 的终局分值（月桂徽，实物照片确认，对称） */
export const CHAMBER_SCORES = [1, 2, 3, 3, 2, 1] as const;

/** chamber 相邻关系（线性排布）：0↔1↔2↔3↔4↔5 */
export function adjacentChambers(c: number): number[] {
  const out: number[] = [];
  if (c > 0) out.push(c - 1);
  if (c < 5) out.push(c + 1);
  return out;
}

/** chamber 所属分区：0-1 左区 / 2-3 中区 / 4-5 右区 */
export function districtOf(c: number): 'left' | 'center' | 'right' {
  return c < 2 ? 'left' : c < 4 ? 'center' : 'right';
}

/* ------------------------------ 参议员卡 ------------------------------ */

export type SenatorKind = 'politician' | 'conspirator';
export type District = 'left' | 'center' | 'right';

export interface SenatorDef {
  id: string;
  zh: string;
  kind: SenatorKind;
  /** 政治家的招募分区（密谋者无分区，放任意 chamber） */
  district?: District;
}

/**
 * 13 张参议员：7 政治家（左3/中2/右2 近似分布）+ 6 密谋者。
 * 时代分布 I:5 / II:5 / III:3 —— 由 setup 按 SENATOR_AGE_MIX 洗入。
 */
export const SENATORS: SenatorDef[] = [
  { id: 'sen-pol-l1', zh: '政治家·左 I', kind: 'politician', district: 'left' },
  { id: 'sen-pol-l2', zh: '政治家·左 II', kind: 'politician', district: 'left' },
  { id: 'sen-pol-l3', zh: '政治家·左 III', kind: 'politician', district: 'left' },
  { id: 'sen-pol-c1', zh: '政治家·中 I', kind: 'politician', district: 'center' },
  { id: 'sen-pol-c2', zh: '政治家·中 II', kind: 'politician', district: 'center' },
  { id: 'sen-pol-r1', zh: '政治家·右 I', kind: 'politician', district: 'right' },
  { id: 'sen-pol-r2', zh: '政治家·右 II', kind: 'politician', district: 'right' },
  { id: 'sen-con-1', zh: '密谋者 I', kind: 'conspirator' },
  { id: 'sen-con-2', zh: '密谋者 II', kind: 'conspirator' },
  { id: 'sen-con-3', zh: '密谋者 III', kind: 'conspirator' },
  { id: 'sen-con-4', zh: '密谋者 IV', kind: 'conspirator' },
  { id: 'sen-con-5', zh: '密谋者 V', kind: 'conspirator' },
  { id: 'sen-con-6', zh: '密谋者 VI', kind: 'conspirator' },
];

/** 时代分布：I 5 张 / II 5 张 / III 3 张 */
export const SENATOR_AGE_MIX: Record<1 | 2 | 3, number> = { 1: 5, 2: 5, 3: 3 };

/** 把参议员卡包成 CardDef（无资源费用；招募费用动态 = 已有参议员数） */
export function senatorCardDefs(): CardDef[] {
  return SENATORS.map((s) => ({
    id: s.id,
    name: s.id,
    zh: s.zh,
    type: 'senator' as const,
    age: 1,
    cost: {} as Partial<Record<Resource, number>>,
    senator: { kind: s.kind, district: s.district },
    text: '',
  }));
}

export const SENATOR_BY_ID: Record<string, SenatorDef> = Object.fromEntries(
  SENATORS.map((s) => [s.id, s]),
);

/* ------------------------------ 法令 token（16 枚，每枚唯一） ------------------------------ */

export type DecreeId =
  | 'dec-ignore-yellow'
  | 'dec-ignore-red'
  | 'dec-ignore-green'
  | 'dec-wonder-cheap'
  | 'dec-coin-blue'
  | 'dec-coin-green'
  | 'dec-coin-yellow'
  | 'dec-coin-red'
  | 'dec-coin-wonder'
  | 'dec-trade-brown'
  | 'dec-trade-grey'
  | 'dec-senate-blue2'
  | 'dec-shield-push'
  | 'dec-discard-coin2'
  | 'dec-link-borrow'
  | 'dec-conspire-extra';

export const DECREES: { id: DecreeId; zh: string; text: string }[] = [
  { id: 'dec-ignore-yellow', zh: '豁免·黄', text: '建黄卡时忽略 1 个费用符号（资源或金币）' },
  { id: 'dec-ignore-red', zh: '豁免·红', text: '建红卡时忽略 1 个费用符号（资源或金币）' },
  { id: 'dec-ignore-green', zh: '豁免·绿', text: '建绿卡时忽略 1 个费用符号（资源或金币）' },
  { id: 'dec-wonder-cheap', zh: '奇迹减负', text: '建奇迹少付 1 资源（自选）' },
  { id: 'dec-coin-blue', zh: '蓝卡税收', text: '你或对手每建 1 张蓝卡 → 你得金 = 当前时代数' },
  { id: 'dec-coin-green', zh: '绿卡税收', text: '你或对手每建 1 张绿卡 → 你得金 = 当前时代数' },
  { id: 'dec-coin-yellow', zh: '黄卡税收', text: '你或对手每建 1 张黄卡 → 你得金 = 当前时代数' },
  { id: 'dec-coin-red', zh: '红卡税收', text: '你或对手每建 1 张红卡 → 你得金 = 当前时代数' },
  { id: 'dec-coin-wonder', zh: '奇迹税收', text: '每建 1 座奇迹 → 你得金 = 当前时代数' },
  { id: 'dec-trade-brown', zh: '贸易优惠·棕', text: '买棕资源每单位少 1 金（最低 1）' },
  { id: 'dec-trade-grey', zh: '贸易优惠·灰', text: '买灰资源每单位少 1 金（最低 1）' },
  { id: 'dec-senate-blue2', zh: '参议院雄辩', text: '算参议院行动数时蓝卡数 +2' },
  { id: 'dec-shield-push', zh: '军事推进', text: '+1 盾并立即推进 1 格；失去控制则反向；被夺退 2 格' },
  { id: 'dec-discard-coin2', zh: '弃牌补贴', text: '弃牌换钱时额外 +2 金' },
  { id: 'dec-link-borrow', zh: '外交连锁', text: '可享受对手卡上的连锁符号' },
  { id: 'dec-conspire-extra', zh: '密谋再起', text: '招募密谋者后立即再行动' },
];

export const DEGREE_BY_ID: Record<string, { id: DecreeId; zh: string; text: string }> =
  Object.fromEntries(DECREES.map((d) => [d.id, d]));

/* ------------------------------ 军事 token（4 枚，替换基础版） ------------------------------ */

/** 内侧（兵临城下区）2 枚：放置；外侧（深入腹地区）2 枚：移动+移除。基础版失金罚金停用。 */
export const AGORA_MILITARY_TOKENS: { zone: 1 | 2; kind: 'place' | 'move-remove' }[] = [
  { zone: 1, kind: 'place' },
  { zone: 1, kind: 'place' },
  { zone: 2, kind: 'move-remove' },
  { zone: 2, kind: 'move-remove' },
];

/* ------------------------------ 密谋卡（16 张，复合效果） ------------------------------ */

/** 方块小操作（与军事 token 共用图标语义，官方 p17） */
export type CubeOp =
  | { kind: 'place' } // 放 1 方块（任意 chamber）
  | { kind: 'move' } // 移 1 己方方块到相邻
  | { kind: 'remove' } // 移除对方 1 方块
  | { kind: 'gain-cubes' } // 得金 = 己方参议院方块数
  | { kind: 'drain-cubes' }; // 对方失金 = 其方块数

export type ConspiracyMain =
  | 'discard-opp-blue' // 弃对手 1 蓝
  | 'discard-opp-yellow' // 弃对手 1 黄
  | 'discard-structure2' // 弃结构可用牌 ×2（可连）
  | 'destroy-opp-wonder' // 拆对手已建奇迹回盒（保留已获即时效果）
  | 'free-build-bottom' // 免费建结构末行 1 卡（参议员不可选）
  | 'free-build-removed-1' // 取回开局移除的 Age I 卡免费建 1
  | 'free-build-removed-2' // Age II 版
  | 'free-build-removed-3' // Age III 版
  | 'steal-progress-token' // 偷 1 枚可用进度 token 面朝下压在密谋上（无人能用）
  | 'peek-removed-build' // 偷看移除卡选 1 免费建
  | 'take-removed-progress' // 暗取全部移除进度选 1
  | 'steal-unbuilt-wonder' // 偷对手未建奇迹
  | 'take-half-coins' // 拿对手一半金币（向上取整）
  | 'swap-blue-green' // 换对手 1 蓝/绿（给同色 1 张）
  | 'move-decree' // 挪 1 个法令到另一 chamber 叠放（原 chamber 无法令仍有分且计入霸权）
  | 'steal-raw-manu'; // 偷对手 1 棕/灰卡

export interface ConspiracyDef {
  id: string;
  /** 有实拍名字的 6 张用中文名，其余用效果描述（AGORA_DATA §8） */
  zh: string;
  main?: ConspiracyMain;
  ops: CubeOp[];
  text: string;
}

export const CONSPIRACIES: ConspiracyDef[] = [
  {
    id: 'con-sabotage',
    zh: '蓄意破坏',
    main: 'discard-opp-blue',
    ops: [],
    text: '弃掉对手 1 张蓝卡',
  },
  {
    id: 'con-discard-yellow',
    zh: '勒令停业',
    main: 'discard-opp-yellow',
    ops: [],
    text: '弃掉对手 1 张黄卡',
  },
  {
    id: 'con-turn-of-events',
    zh: '时局突变',
    main: 'discard-structure2',
    ops: [{ kind: 'move' }],
    text: '弃掉结构上可用牌 ×2（可连）+ 移 1 方块到相邻',
  },
  {
    id: 'con-destroy-wonder',
    zh: '拆毁奇观',
    main: 'destroy-opp-wonder',
    ops: [],
    text: '把对手一座已建奇迹拆回盒中（已获即时效果保留）',
  },
  {
    id: 'con-property-fraud',
    zh: '财产欺诈',
    main: 'free-build-bottom',
    ops: [],
    text: '免费建造结构末行的 1 张卡（参议员不可选）',
  },
  {
    id: 'con-reclaim-1',
    zh: '旧案重提 I',
    main: 'free-build-removed-1',
    ops: [],
    text: '取回开局移除的时代 I 卡之一，免费建造 1 张',
  },
  {
    id: 'con-reclaim-2',
    zh: '旧案重提 II',
    main: 'free-build-removed-2',
    ops: [],
    text: '取回开局移除的时代 II 卡之一，免费建造 1 张',
  },
  {
    id: 'con-reclaim-3',
    zh: '旧案重提 III',
    main: 'free-build-removed-3',
    ops: [],
    text: '取回开局移除的时代 III 卡之一，免费建造 1 张',
  },
  {
    id: 'con-obscurantism',
    zh: '蒙昧主义',
    main: 'steal-progress-token',
    ops: [],
    text: '偷 1 枚可用进度 token 面朝下压在本密谋上（无人能用）',
  },
  {
    id: 'con-peek-removed',
    zh: '暗中查看',
    main: 'peek-removed-build',
    ops: [],
    text: '偷看开局移除的卡，选 1 张免费建造',
  },
  {
    id: 'con-take-progress',
    zh: '截取成果',
    main: 'take-removed-progress',
    ops: [],
    text: '暗取全部被移除的进度 token，选 1 枚',
  },
  {
    id: 'con-steal-wonder',
    zh: '夺人之美',
    main: 'steal-unbuilt-wonder',
    ops: [],
    text: '偷走对手一座未建奇迹',
  },
  {
    id: 'con-blackmail',
    zh: '敲诈勒索',
    main: 'take-half-coins',
    ops: [{ kind: 'move' }],
    text: '对手失去一半金币（向上取整）+ 移 1 方块到相邻',
  },
  {
    id: 'con-swap-card',
    zh: '偷梁换柱',
    main: 'swap-blue-green',
    ops: [],
    text: '用你 1 张同色卡换对手 1 张蓝/绿卡',
  },
  {
    id: 'con-move-decree',
    zh: '改写法令',
    main: 'move-decree',
    ops: [],
    text: '把 1 个法令挪到另一 chamber 叠放（原 chamber 无法令仍计分并计入霸权）',
  },
  {
    id: 'con-political-maneuver',
    zh: '政治操盘',
    main: undefined,
    ops: [{ kind: 'place' }, { kind: 'remove' }, { kind: 'move' }],
    text: '放 1 方块 + 移除对方 1 方块 + 移 1 方块到相邻',
  },
];

export const CONSPIRACY_BY_ID: Record<string, ConspiracyDef> = Object.fromEntries(
  CONSPIRACIES.map((c) => [c.id, c]),
);

/* ------------------------------ 参议员行动数分档 ------------------------------ */

/** 政治家招募时的参议院行动数：0-1 蓝→1 / 2-3 蓝→2 / 4+ 蓝→3（dec-senate-blue2 时蓝数+2） */
export function senateActionsFor(blueCount: number): 1 | 2 | 3 {
  if (blueCount >= 4) return 3;
  if (blueCount >= 2) return 2;
  return 1;
}

/* ------------------------------ Agora 新奇迹（2） ------------------------------ */

import type { WonderDef } from '../types';

export const AGORA_WONDERS: WonderDef[] = [
  {
    id: 'curia-julia',
    name: 'Curia Julia',
    zh: '元老院议事室',
    cost: { wood: 1, clay: 1, stone: 1, glass: 1, papyrus: 1 },
    special: 'agora-curia',
    extension: 'agora',
    text: '选择时抽 2 张密谋、选 1 面朝下保留（Organized Crime 则都保留），另一张放牌库顶/底；建成时触发 1 张未准备的密谋（可选）+ 6 金 + 立即再行动',
  },
  {
    id: 'knossos',
    name: 'Knossos',
    zh: '克诺索斯王宫',
    cost: { glass: 1, clay: 1, wood: 1 },
    vp: 3,
    special: 'agora-knossos',
    extension: 'agora',
    text: '选择时放 1 方块到任意 chamber；建成时放 1 方块 + 可移 1 方块到相邻 chamber',
  },
];

/* ------------------------------ Agora 新进度 token（2） ------------------------------ */

export const AGORA_PROGRESS = [
  {
    id: 'corruption',
    name: 'Corruption',
    zh: '腐败',
    extension: 'agora' as const,
    special: 'corruption' as const,
    text: '此后招募所有参议员（政治家 + 密谋者）免费',
  },
  {
    id: 'organized-crime',
    name: 'Organized Crime',
    zh: '有组织犯罪',
    extension: 'agora' as const,
    special: 'organizedCrime' as const,
    text: 'Conspire 时两张密谋都保留，面朝下放面前',
  },
];
