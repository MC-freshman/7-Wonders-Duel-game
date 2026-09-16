/* ------------------------------------------------------------------
 * M8 Solo（官方 Print & Play 2020，Bruno Cathala）数据模型
 *
 * 本文件仅描述「Solo 模式」所需的类型，不触碰主引擎（engine.ts / types.ts）。
 * 所有数值均来自官方 Solo PnP 规则 + Kotlin 转录（bl.ocks.org/erikhuizinga/
 * f9e286dcf1d1a30b8d8301eed4f8085a），拒绝任何猜测。
 * ------------------------------------------------------------------ */

/** 决策卡的连动符号（与领袖的 replays 集合匹配时，领袖获得额外行动） */
export type SoloReplay = 'circle' | 'triangle';

/** 决策卡 / 领袖的颜色（对应 7 Wonders Duel 的 7 种卡色） */
export type SoloCardColor =
  | 'purple' // 紫：行会
  | 'yellow' // 黄：商业
  | 'blue' // 蓝：市政
  | 'grey' // 灰：制造物
  | 'brown' // 棕：原料
  | 'red' // 红：军事
  | 'green'; // 绿：科技

/** 决策卡扫描方向：left = 从牌阵最左列起，right = 从最右列起 */
export type SoloDirection = 'left' | 'right';

export interface SoloLeaderDef {
  id: string;
  /** 英文名（官方） */
  name: string;
  /** 中文名（本作汉化） */
  zh: string;
  /** 领袖卡颜色 = 决策卡空槽位的默认匹配色 */
  cardColor: SoloCardColor;
  /** 该领袖拥有的连动符号集合（决策卡 replay 命中其一即额外行动） */
  replays: SoloReplay[];
  /** 开局即持有的发展标记 id（来自 base 进度池） */
  startProgress: string[];
  /**
   * M8-P：Imhotep 专用——其「颜色」不是某一卡色，而是**可用链接符号建造的卡**
   * （`CardDef.freeLink` 非空）。为 true 时决策卡中一切「领袖色」槽位改按此偏好解析。
   */
  preferLink?: boolean;
  /** 终局加分（仅 Hammurabi：游戏进行到时代 III 末时 +5 分） */
  endBonus?: { points: number; condition: 'afterAge3' };
}

export interface SoloDecisionCardDef {
  direction: SoloDirection;
  primaryColor: SoloCardColor | null;
  secondaryColor: SoloCardColor | null;
  tertiaryColor: SoloCardColor | null;
  /** 连动符号；为 null 时该决策卡不会触发额外行动 */
  replay: SoloReplay | null;
  /**
   * Agora 图标（M8-A）：卡面箭头下方的浅灰方块。
   * 抽到带此图标的决策卡时，领袖先「随机触发 1 张面朝下密谋」，
   * 且本回合第一优选为「从牌阵取 1 张参议员卡（无视费用）」。
   * 数据来源见 docs/rules/SOLO_AGORA_DATA.md §5。
   */
  agoraIcon?: boolean;
  /**
   * Pantheon 图标（M8-P）：卡面箭头下方的万神殿图标。
   * 时代 II/III 抽到这类卡时，领袖第一优先 = 按箭头方向打出**第一个可用神明**（无视费用）；
   * **时代 I 无效**。数据来源见 docs/rules/SOLO_PANTHEON_DATA.md §5.1。
   */
  pantheonIcon?: boolean;
}

/** Solo 模式对局的运行时句柄（与 GameState 解耦，删目录即可整体回退） */
export interface SoloGame {
  state: import('../types').GameState;
  leaderId: import('../types').PlayerId;
  leader: SoloLeaderDef;
  /** 已洗好的决策卡下标序列（耗尽后重洗） */
  deck: number[];
  deckIndex: number;
  /** 本局使用的决策卡池（base 12 张，或 Agora 12 张 = base 保留 7 + Agora 5） */
  decisionCards: SoloDecisionCardDef[];
  /** Solo 专用随机流（独立于主引擎 rngState，保证可重放） */
  rng: import('../rng').Rng;
  /** 当前（刚抽到的）决策卡，供 UI 展示 */
  lastDecision: SoloDecisionCardDef | null;
  /** 决策历史：用于复盘 / 测试断言 */
  decisionHistory: { card: SoloDecisionCardDef; slot: number; built: boolean }[];
  /** M8-A：是否启用 Agora 扩展（启用时决策牌堆为 Agora 版、领袖含 Brutus） */
  agora?: boolean;
  /** M8-P：是否启用 Pantheon 扩展（可与 agora 同时为 true） */
  pantheon?: boolean;
  /**
   * 本局领袖是否由随机抽取决定（`createSoloGame` 未收到 leaderId）。
   * 复盘必须用同一入参重建（随机↔undefined、指定↔id），否则 solo 随机流不同。
   */
  leaderRandom?: boolean;
}
