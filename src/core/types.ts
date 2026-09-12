/* ------------------------------------------------------------------
 * 《七大奇迹对决》领域类型定义
 * 纯数据描述，不依赖任何 UI / 网络 / AI。
 * ------------------------------------------------------------------ */

export type Resource = 'wood' | 'stone' | 'clay' | 'glass' | 'papyrus';

export const RESOURCES: Resource[] = ['wood', 'stone', 'clay', 'glass', 'papyrus'];

export const RESOURCE_LABEL: Record<Resource, string> = {
  wood: '木',
  stone: '石',
  clay: '泥',
  glass: '玻',
  papyrus: '纸',
};

/** 7 种科技符号（Law 仅由「法律」发展标记提供） */
export type ScienceSymbol =
  | 'writing' // 书卷
  | 'wheel' // 齿轮
  | 'math' // 天平
  | 'chemistry' // 药瓶
  | 'astronomy' // 浑天仪
  | 'sundial' // 日晷
  | 'law'; // 法律

export const SCIENCE_LABEL: Record<ScienceSymbol, string> = {
  writing: '书',
  wheel: '轮',
  math: '衡',
  chemistry: '药',
  astronomy: '星',
  sundial: '晷',
  law: '法',
};

export type CardType =
  | 'raw' // 棕：原料
  | 'manufactured' // 灰：加工品
  | 'civilian' // 蓝：市政
  | 'scientific' // 绿：科技
  | 'commercial' // 黄：商业
  | 'military' // 红：军事
  | 'guild' // 紫：行会
  | 'senator'; // Agora：参议员（招募费用 = 已有参议员数）

export const CARD_TYPE_LABEL: Record<CardType, string> = {
  raw: '原料',
  manufactured: '加工',
  civilian: '市政',
  scientific: '科技',
  commercial: '商业',
  military: '军事',
  guild: '行会',
  senator: '参议院',
};

/** vpPer / coinsPer 的统计目标 */
export type CountTarget =
  | 'raw'
  | 'manufactured'
  | 'civilian'
  | 'scientific'
  | 'commercial'
  | 'military'
  | 'wonder'
  | 'progress'
  | 'brownGrey' // 船主行会：棕 + 灰，取较多的一方
  | 'coins3'; // 钱庄行会：每 3 金币 1 分

export interface CardDef {
  id: string;
  name: string;
  zh: string;
  type: CardType;
  age: 1 | 2 | 3;
  /** 是否行会卡（时代 III 混入，setup 时随机 3 张） */
  guild?: boolean;
  /** Pantheon 大殿卡：替代行会，计分 5/12/21；freeLink 指向神话 token */
  temple?: boolean;
  mythology?: string;
  /** Agora 参议员卡：kind 决定招募分支，district 为政治家的分区 */
  senator?: { kind: 'politician' | 'conspirator'; district?: 'left' | 'center' | 'right' };
  /** 所属扩展（基础卡无此字段；数据池过滤用） */
  extension?: 'pantheon' | 'agora';
  /** 资源费用 */
  cost?: Partial<Record<Resource, number>>;
  /** 金币费用 */
  coinCost?: number;
  /** 提供的连锁符号 */
  link?: string;
  /** 持有对应 link 的卡时可免费建造 */
  freeLink?: string;
  /** 固定产出 */
  produces?: Partial<Record<Resource, number>>;
  /** 每回合任选一种产出（不计入贸易价格） */
  producesOneOf?: Resource[];
  /** 将指定资源的购买价固定为 1 金币 */
  trades?: Resource[];
  /** 建造时立即获得金币 */
  coins?: number;
  /** 建造时按数量获得金币 */
  coinsPer?: { target: CountTarget; amount: number };
  /** 终局按数量计分 */
  vpPer?: { target: CountTarget; amount: number };
  vp?: number;
  shields?: number;
  science?: ScienceSymbol;
  special?: string;
  text: string;
}

export type WonderSpecial =
  | 'extra-turn'
  | 'take-progress-discard'
  | 'take-discards'
  | 'pantheon-sanctuary' // 调用 Pantheon 费用 −2（被动）；建成再行动
  | 'pantheon-theatre' // 建成：翻一神话组选 1 神免费调用
  | 'agora-curia' // 选时抽 2 密谋选 1；建成：触发密谋（可选）+6 金+再行动
  | 'agora-knossos'; // 选时放 1 方块；建成：放 1+移 1（可选）+3 分

export interface WonderDef {
  id: string;
  name: string;
  zh: string;
  cost: Partial<Record<Resource, number>>;
  coins?: number;
  /** 对手失去的金币 */
  destroyCoins?: number;
  /** 摧毁对手某类建筑 */
  destroyCard?: 'raw' | 'manufactured';
  shields?: number;
  vp?: number;
  producesOneOf?: Resource[];
  special?: WonderSpecial;
  /** 所属扩展 */
  extension?: 'pantheon' | 'agora';
  text: string;
}

export type ProgressSpecial =
  | 'gain-trade-costs'
  | 'shield-bonus'
  | 'extra-turn'
  | 'free-link-bonus'
  | 'poliorcetics' // 每推进 1 格冲突棋子，对手失去 1 金币
  | 'engineering' // 有连锁符号的卡可以 1 金币建造（无需持有前置）
  | 'mysticism' // 终局每枚神话 / 献祭 token 计 2 分
  | 'corruption' // Agora：此后招募所有参议员免费
  | 'organizedCrime'; // Agora：Conspire 时两张都保留

export interface ProgressTokenDef {
  id: string;
  name: string;
  zh: string;
  /** 所属扩展 */
  extension?: 'pantheon' | 'agora';
  coins?: number;
  vp?: number;
  vpPer?: { target: CountTarget; amount: number };
  science?: ScienceSymbol;
  /** 建造折扣：奇迹 / 市政建筑各减 2 个资源 */
  discount?: 'wonder' | 'civilian';
  special?: ProgressSpecial;
  text: string;
}

/* ----------------------------- 对局状态 ----------------------------- */

export type PlayerId = 0 | 1;

/* ----------------------------- Pantheon 扩展 ----------------------------- */

/** 五大神话组 */
export type Mythology = 'mesopotamian' | 'phoenician' | 'greek' | 'egyptian' | 'roman';

export const MYTHOLOGY_LABEL: Record<Mythology, string> = {
  mesopotamian: '美索不达米亚',
  phoenician: '腓尼基',
  greek: '希腊',
  egyptian: '埃及',
  roman: '罗马',
};

/**
 * 神格调用时的目标选择类型。
 * options 为字符串化的选项（卡 id / 奇迹 id / 图板位置序号 / 牌组名）。
 */
export type InvokeEffect =
  | 'enki' // 从 Enki 卡上的 2 枚进度 token 选 1
  | 'nisaba' // 蛇 token 放对手一张绿卡
  | 'baal' // 偷对手一张棕/灰卡
  | 'hades' // 从弃牌堆免费建 1 张
  | 'zeus' // 弃结构上任意一张牌（含其上的 token）
  | 'anubis' // 拆一座已建奇迹（双方均可选）
  | 'isis' // 从弃牌堆选 1 张用于免费建奇迹
  | 'isisWonder' // Isis 第二步：选哪座奇迹
  | 'ra' // 抢对手一座未建奇迹
  | 'minerva' // 放 Minerva 棋子到军事轨道
  | 'neptuneDiscard' // 选 1 枚军事 token 弃掉（不生效）
  | 'neptuneApply' // 选另 1 枚军事 token 生效
  | 'gate' // 门：翻每组牌堆顶各 1 张，选 1 免费调用
  | 'theatreDeck' // 通神大剧场：选一神话组
  | 'theatrePick'; // 通神大剧场：从翻开的组内选 1 神免费调用

/** 参议院……不对，是 Pantheon 图板状态（M6） */
export interface PantheonState {
  /** 6 个位置上的神格 id（null = 空；门以 'gate' 表示） */
  board: (string | null)[];
  /** 该位置的神格是否已翻开（时代 II 开局全部翻开） */
  revealed: boolean[];
  /** 5 组神格牌堆（数组头 = 牌堆顶）——私密信息，publicView 剥离 */
  decks: Record<Mythology, string[]>;
  /** 时代 I 结构上被揭开时拾取的神话 token 由玩家持有（见 PlayerPantheonState） */
  /** 时代 I 结构槽位 → 神话 token（面朝下放在暗牌上，公开信息：位置可见） */
  age1Tokens: Record<number, Mythology>;
  /** 时代 II 结构槽位 → 献祭 token 数值（**私密**：仅持有者可见面值） */
  age2Tokens: Record<number, number>;
  /** Agora 前的 4 枚军事 token 状态化（Neptune 需要）：2/2/5/5 */
  military: { fine: number; used: boolean }[];
  /** Minerva 棋子在军事轨道上的位置（-9..9），null = 未放置/已弃 */
  minerva: number | null;
  /** 蛇 token（Nisaba）附着的对手绿卡 */
  snake: { cardId: string; owner: PlayerId } | null;
  /** Enki 卡面上放着的进度 token（公开，最多 2） */
  enkiProgress: string[];
}

export interface PlayerPantheonState {
  /** 持有的神话 token */
  mythologyTokens: Mythology[];
  /** 持有的献祭 token 面值（**私密**） */
  offerings: number[];
  /** 已调用的神格 id */
  invoked: string[];
  /** Astarte 圣库金币（防抢但可花费） */
  astarteCoins: number;
}

/* ----------------------------- Agora 扩展 ----------------------------- */

export interface ChamberState {
  /** 双方的参议院影响方块数 */
  cubes: [number, number];
  /** 控制者（严格多数；平局为 null） */
  controller: PlayerId | null;
  /** 放置的法令 token id */
  decree: string;
  /** 法令是否面朝上（符号与 chamber 法令区匹配则开局即明置） */
  decreeFaceUp: boolean;
  /** 被密谋「挪法令」叠放过来的额外法令（原 chamber 无法令仍计分/计入霸权） */
  decreeExtra: { id: string; faceUp: boolean }[];
}

export interface SenateState {
  chambers: ChamberState[];
  /** 未上场的法令 token 牌库 */
  decreeDeck: string[];
  /** 密谋卡牌库（16 张洗牌） */
  conspiracyDeck: string[];
}

export interface PlayerAgoraState {
  /** 已招募的参议员卡 id（公开） */
  senators: string[];
  /** 手中的密谋卡（**私密**，Conspire 保留） */
  conspiracies: string[];
  /** 准备区：已盖牌的密谋（conspiracyId 与垫卡 cardId 均**私密**） */
  prepared: { conspiracyId: string; cardId: string }[];
  /** 已触发的密谋卡 id（公开） */
  triggered: string[];
  /** 被蒙昧主义等压住的进度 token（**私密**，无人能用） */
  tuckedProgress: string[];
}

/** Agora 的一条待决选择（可排队） */
export type AgoraStep =
  | { kind: 'conspiratorChoose'; options: string[] } // ['place' | 'conspire']
  | { kind: 'conspireKeep'; options: string[] } // 抽到的 2 张密谋选 1 保留
  | { kind: 'conspireDiscard'; options: string[] } // 另一张放牌库顶/底 ['top','bottom']
  | { kind: 'pickChamber'; options: string[]; purpose: 'place' | 'moveFrom' | 'remove' } // 参议院操作的目标 chamber
  | { kind: 'pickBuild'; options: string[] } // 免费建造：从候选卡 id 中选 1
  | { kind: 'pickOppCard'; options: string[]; cardType: 'blue' | 'yellow' | 'raw' | 'manufactured' } // 弃/偷对手的某类卡
  | { kind: 'pickOppWonder'; options: string[]; mode: 'destroy' | 'steal' } // 拆/偷对手奇迹
  | { kind: 'pickProgress'; options: string[]; mode: 'steal' | 'fromRemoved' } // 偷进度 / 从移除池选
  | { kind: 'pickWonderGive'; options: string[] } // 偷梁换柱：选自己给出的卡
  | { kind: 'pickDecreeMove'; options: string[] } // 挪法令：先选来源 chamber，再选目标
  | { kind: 'pickTrigger'; options: string[] } // 立即触发 1 张手中密谋（['skip'] 可跳过）
  | { kind: 'optMoveOrSkip'; options: string[] } // 可选移动：['skip'] 占位，实际移动走 SENATE_MOVE
  ;

/** 参议院待执行的小操作队列（招募政治家 / 密谋 / 军事 token / Knossos 共用） */
export interface SenateOp {
  player: PlayerId;
  op:
    | { kind: 'place'; district?: 'left' | 'center' | 'right' | 'any' }
    | { kind: 'move'; optional?: boolean }
    | { kind: 'remove' };
}

export type Phase =
  | 'wonderDraft'
  | 'playing'
  | 'chooseStartPlayer'
  | 'chooseProgressToken'
  | 'chooseDiscardedCard'
  | 'chooseOpponentCard'
  | 'pantheonChoice'
  | 'agoraChoice'
  | 'gameOver';

/** 牌阵中的一个槽位 */
export interface Slot {
  index: number;
  cardId: string | null;
  /** 是否已翻开（正面朝上） */
  faceUp: boolean;
  /** 是否已取走 */
  taken: boolean;
  /** 需要这两张牌被取走后本槽才可拿取 */
  requires: number[];
  /** 所在行（0 为最上） */
  row: number;
  /** 行内字符位置，用于换算横向坐标 */
  col: number;
}

/** Pantheon 的一条待决选择（可排队） */
export type PantheonStep =
  | { kind: 'placeDivinitySelect'; options: string[] } // 神话 token：从 2 张中选 1 神
  | { kind: 'placeDivinityPosition'; divinityId: string; options?: string[] } // 再选图板空位（options 为空位 id，仅本人可见）
  | {
      kind: 'invokePick';
      divinityId: string; // 触发来源神格（门/剧场中转为所选神）
      effect: InvokeEffect;
      options: string[];
      /** 跨步骤的中间值（Isis 选中的卡 / 剧场选中的牌组名） */
      payload?: string;
    };

/** 等待玩家作出的选择 */
export type PendingChoice =
  | { kind: 'progressToken'; player: PlayerId; count: number; /** 大图书馆：从弃置的发展标记中抽 3 */ fromDiscard?: boolean; options?: string[] }
  | { kind: 'discardedCard'; player: PlayerId; options: string[] }
  | { kind: 'opponentCard'; player: PlayerId; options: string[]; cardType: 'raw' | 'manufactured' }
  | { kind: 'startPlayer'; chooser: PlayerId }
  | { kind: 'pantheon'; player: PlayerId; steps: PantheonStep[]; payload?: string }
  | { kind: 'agora'; player: PlayerId; steps: AgoraStep[]; payload?: string };

export interface PlayerState {
  id: PlayerId;
  /** 已建造的建筑卡 id */
  city: string[];
  /** 已建造的奇迹 */
  wondersBuilt: string[];
  /** 尚未建造的奇迹 */
  wondersUnbuilt: string[];
  /** 建造各奇迹时垫入的时代卡（Anubis 需要） */
  wonderCards: Record<string, string>;
  coins: number;
  /** 科技符号计数 */
  science: Partial<Record<ScienceSymbol, number>>;
  /** 已获得的发展标记 */
  progressTokens: string[];
  /** 已触发过的最高军事区块（0-3），用于只触发一次罚金 */
  militaryZone: number;
  /** Pantheon 私有区（非 Pantheon 对局时字段全空） */
  pan: PlayerPantheonState;
  /** Agora 私有区（非 Agora 对局时字段全空） */
  agora: PlayerAgoraState;
}

export interface LogEntry {
  index: number;
  player: PlayerId | null;
  text: string;
  action?: GameAction;
}

export type GameAction =
  | { type: 'DRAFT_WONDER'; player: PlayerId; wonderId: string }
  | { type: 'BUILD_CARD'; player: PlayerId; slot: number }
  | { type: 'DISCARD_CARD'; player: PlayerId; slot: number }
  | { type: 'BUILD_WONDER'; player: PlayerId; slot: number; wonderId: string }
  | { type: 'CHOOSE_PROGRESS_TOKEN'; player: PlayerId; tokenId: string }
  | { type: 'CHOOSE_DISCARDED_CARD'; player: PlayerId; cardId: string }
  | { type: 'CHOOSE_OPPONENT_CARD'; player: PlayerId; cardId: string }
  | { type: 'CHOOSE_START_PLAYER'; player: PlayerId; next: PlayerId }
  /** Pantheon：时代 I 神话 token——把选中的神格面朝下放到指定空位 */
  | { type: 'PLACE_DIVINITY'; player: PlayerId; divinityId: string; position: number }
  /** Pantheon：时代 II/III 调用神格（offerings = 使用的献祭 token 面值列表） */
  | { type: 'INVOKE_DIVINITY'; player: PlayerId; position: number; offerings?: number[] }
  /** Pantheon：神格效果 / 门 / 通神大剧场的通用选择结算 */
  | { type: 'CHOOSE_PANTHEON'; player: PlayerId; choice: string }
  /* ------------------------------ Agora ------------------------------ */
  /** 拿取参议员卡并招募（费用 = 已有参议员数；政治家/密谋者分支见后续步骤） */
  | { type: 'RECRUIT_SENATOR'; player: PlayerId; slot: number }
  /** 参议院行动：放置 1 方块（政治家限定分区；其余来源任意） */
  | { type: 'SENATE_PLACE'; player: PlayerId; chamber: number }
  /** 参议院行动：把 1 己方方块移到相邻 chamber */
  | { type: 'SENATE_MOVE'; player: PlayerId; from: number; to: number }
  /** 参议院行动：移除对方 1 方块（军事 token / 政治操盘） */
  | { type: 'SENATE_REMOVE'; player: PlayerId; chamber: number }
  /** 准备密谋：从手中选 1 张密谋 + 结构上任取 1 张牌盖在其下（零费用，结束回合） */
  | { type: 'PREPARE_CONSPIRACY'; player: PlayerId; conspiracyId: string; slot: number }
  /** 回合开始触发 1 张已准备的密谋（每回合限 1 次） */
  | { type: 'TRIGGER_CONSPIRACY'; player: PlayerId; conspiracyId: string }
  /** Agora 密谋 / 奇迹 / 军事 token 的通用选择结算 */
  | { type: 'CHOOSE_AGORA'; player: PlayerId; choice: string };

export interface GameStateOptions {
  pantheon?: boolean;
  agora?: boolean;
}

export interface VictoryInfo {
  /** resign：对手掉线超时判负（联机专用）；political：政治霸权（控制全部 6 chamber） */
  type: 'military' | 'science' | 'civilian' | 'draw' | 'resign' | 'political';
  winner: PlayerId | null;
  breakdown?: ScoreBreakdown[];
}

export interface ScoreBreakdown {
  player: PlayerId;
  military: number;
  buildings: number;
  wonders: number;
  progress: number;
  coins: number;
  /** Pantheon：大殿 / 神格 / Astarte 剩金 / 神秘主义 */
  pantheon: number;
  /** Agora：控制的 chamber 分值 */
  agora: number;
  total: number;
  blueVp: number;
}

export interface GameState {
  seed: number;
  /** mulberry32 随机流状态 */
  rngState: number;
  phase: Phase;
  age: 1 | 2 | 3;
  /** 当前行动玩家 */
  current: PlayerId;
  players: [PlayerState, PlayerState];
  slots: Slot[];
  /** 本时代已取走卡数 */
  structureRemaining: number;
  /** 冲突标记：正数 = 玩家 0 占优（逼近玩家 1 首都），范围 -9..9 */
  conflictPawn: number;
  /** 版图上可用的发展标记 */
  progressAvailable: string[];
  /** setup 时被移出游戏的发展标记（大图书馆 / Enki 用） */
  progressRemoved: string[];
  discard: string[];
  /** setup 时从各时代移除的卡（不进弃牌堆） */
  removedFromGame: string[];
  /** 奇迹选择阶段：当前可选的 4 张 */
  wonderOffer: string[];
  /** 奇迹选择阶段：本轮已选次数，决定轮到谁 */
  wonderDraftStep: number;
  /** 待玩家处理的选择 */
  pending: PendingChoice | null;
  /** 建造奇迹后需要再次行动 */
  extraTurn: boolean;
  /** 已建造奇迹总数（上限 7） */
  wondersBuiltTotal: number;
  /** 本时代最后一张牌是谁取的（平局时由其决定下时代先手） */
  lastActive: PlayerId;
  /** Pantheon 扩展状态（未启用时为 null） */
  pantheon: PantheonState | null;
  /** Agora 扩展状态（未启用时为 null） */
  agora: AgoraState | null;
  log: LogEntry[];
  victory: VictoryInfo | null;
}

/** Agora 扩展状态 */
export interface AgoraState {
  senate: SenateState;
  /** 参议院小操作队列（招募政治家 / 密谋 ops / 军事 token / Knossos） */
  ops: SenateOp[];
  /** 招募政治家后剩余的参议院行动数（放/移合并计次） */
  senateActionsLeft: number;
  /** 招募中的政治家分区（决定其 place 操作的限制） */
  politicianDistrict: 'left' | 'center' | 'right' | null;
  /** 本回合是否已触发过密谋（每回合限 1） */
  triggeredThisTurn: boolean;
  /** 参议院小操作队列清空后是否结束回合（主动作已消耗时为 true；回合开始触发的密谋为 false） */
  endTurnAfterOps: boolean;
  /** Agora 军事 token（替换基础罚金逻辑） */
  military: { zone: 1 | 2; kind: 'place' | 'move-remove'; used: boolean }[];
  /** 13 张参议员的出场顺序池（按 5/5/3 依次进入各时代牌堆） */
  senatorPool: string[];
}

/**
 * 引擎只读函数所需的最小状态切片。
 * PublicState（已剥离私有字段）与完整 GameState 都满足它，
 * 因此本地与联机可以共用 activePlayer / legalActions / 费用计算。
 */
export type ReadableState = Pick<
  GameState,
  | 'victory'
  | 'phase'
  | 'age'
  | 'current'
  | 'pending'
  | 'wonderDraftStep'
  | 'slots'
  | 'structureRemaining'
  | 'players'
  | 'progressAvailable'
  | 'conflictPawn'
  | 'discard'
  | 'wonderOffer'
  | 'extraTurn'
  | 'wondersBuiltTotal'
  | 'lastActive'
  | 'pantheon'
  | 'agora'
  | 'log'
>;

/* ----------------------------- 查询结果 ----------------------------- */

export interface CostPlan {
  /** 需要的资源 */
  need: Partial<Record<Resource, number>>;
  /** 自产可满足的部分 */
  covered: Partial<Record<Resource, number>>;
  /** 需要向银行购买的部分 */
  toBuy: Partial<Record<Resource, number>>;
  /** 各资源单价 */
  unitPrice: Partial<Record<Resource, number>>;
  /** 购买资源花费 */
  buyCost: number;
  /** 卡牌本身的金币费用 */
  coinCost: number;
  /** 总花费 */
  total: number;
  /** 是否连锁免费 */
  freeByLink: boolean;
  affordable: boolean;
}
