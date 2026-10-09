import type { GameAction, LogEntry, PlayerId, VictoryInfo } from '../src/core/types';
import type { PublicState } from '../src/core/visibility';

/* ------------------------------------------------------------------
 * 联机通信协议
 *
 * 设计原则：
 *   1. 客户端只发「意图」——动作载荷就是本地模式共用的那个 GameAction，
 *      不含任何由客户端推导出来的结果数据。
 *   2. 服务器只发「公开状态」——publicView() 的产物，seed / rngState / 暗牌永不外传。
 *   3. 每个动作带 clientActionId，用于网络重试时的幂等去重。
 * ------------------------------------------------------------------ */

export type ClientMsg =
  | { t: 'ROOM_CREATE'; clientId: string }
  | { t: 'ROOM_JOIN'; code: string; clientId: string }
  | { t: 'READY'; ready: boolean }
  /** 开始对局。房主专属；pantheon 标记是否启用万神殿扩展（经 ROOM 广播给双方） */
  | { t: 'START'; pantheon?: boolean; agora?: boolean }
  /** 再来一局：自动交换先后手 */
  | { t: 'NEW_GAME' }
  | { t: 'ACTION'; id: string; action: GameAction }
  | { t: 'RESYNC'; lastLog: number }
  | { t: 'PING'; ts: number }
  | { t: 'LEAVE' };

export type ConnStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error';

export type ServerMsg =
  | { t: 'HELLO'; serverTime: number }
  /** 房间状态变化（创建/加入/准备/开始） */
  | {
      t: 'ROOM';
      code: string;
      seat: PlayerId | null;
      present: [boolean, boolean];
      ready: [boolean, boolean];
      started: boolean;
      /** 本局是否启用万神殿扩展（由房主在 START 时指定，双方一致） */
      pantheon: boolean;
      /** 本局是否启用 Agora 扩展 */
      agora: boolean;
      /** 各座位是否正由 AI 托管（对手掉线超时后接管） */
      aiControlled: [boolean, boolean];
    }
  /** 对局开始：告知座位号与首帧状态 */
  | { t: 'GAME'; seat: PlayerId; view: PublicState }
  /** 每次动作后的状态推进 */
  | {
      t: 'UPDATE';
      view: PublicState;
      logFrom: number;
      entries: LogEntry[];
      lastAction: GameAction | null;
    }
  /** 动作被服务器拒绝 */
  | { t: 'REJECT'; id: string; reason: string }
  /** 对手连接状态（含重连倒计时截止时间戳） */
  | { t: 'PEER'; connected: boolean; deadline: number | null }
  /**
   * 对局结束。附带 seed 与**完整日志**供客户端复盘重放——
   * 只在终局时下发，此时已无隐藏信息可泄露。
   * 对局中的 UPDATE 视图与增量日志会对动作的私密字段（密谋 id、面朝下神格）
   * 做掩码，复盘必须用本消息携带的完整日志，不能用对局中累积的掩码日志。
   */
  | { t: 'OVER'; victory: VictoryInfo; seed?: number; log?: LogEntry[] }
  | { t: 'PONG'; ts: number }
  | { t: 'ERROR'; reason: string };

/** 房间码：6 位，剔除易混字符 0/O/1/I */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function makeRoomCode(rand: () => number = Math.random): string {
  let s = '';
  for (let i = 0; i < 6; i++) {
    s += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)];
  }
  return s;
}

/**
 * 动作相等性比较：按字段结构化比较（键序无关），作为服务器端的合法性白名单比对手段。
 * 旧实现用 JSON.stringify 整体比较，客户端与服务器构造动作的键序稍有差异
 * （跨版本窗口期 / 第三方客户端）就会把合法动作误判为非法。
 */
export function sameAction(a: GameAction, b: GameAction): boolean {
  if (a.type !== b.type || a.player !== b.player) return false;
  const x = a as unknown as Record<string, unknown>;
  const y = b as unknown as Record<string, unknown>;
  const keys = Object.keys(x);
  if (keys.length !== Object.keys(y).length || keys.some((k) => !(k in y))) return false;
  for (const k of keys) {
    const va = x[k];
    const vb = y[k];
    if (va === vb) continue;
    // 数组字段（INVOKE_DIVINITY.offerings）按内容比较
    if (Array.isArray(va) && Array.isArray(vb) && JSON.stringify(va) === JSON.stringify(vb)) {
      continue;
    }
    return false;
  }
  return true;
}

/** 把客户端动作中的 player 字段强制对齐到其座位，防止冒充对手 */
export function bindAction(action: GameAction, seat: PlayerId): GameAction {
  return { ...action, player: seat } as GameAction;
}

export const HEARTBEAT_MS = 15_000;
export const PEER_TIMEOUT_MS = Number(process.env.PEER_TIMEOUT_MS ?? 35_000);
export const RECONNECT_GRACE_MS = Number(process.env.RECONNECT_GRACE_MS ?? 90_000);
export const ROOM_TTL_MS = 24 * 60 * 60 * 1000;
/**
 * 每秒最多处理的动作数，用于防连点刷包。
 * 40 对真人操作而言绰绰有余，又不会误伤自动化对局与快速出招。
 */
export const ACTION_RATE_LIMIT = 40;
/**
 * AI 托管时的出招间隔（毫秒）。
 * 留一点停顿让对手看清 AI 做了什么，同时远低于每秒 40 次的动作限流。
 * 端到端测试可用环境变量调小以加速。
 */
export const AI_STEP_MS = Number(process.env.AI_STEP_MS ?? 700);
/**
 * 掉线检查 / 房间回收的扫描间隔（毫秒）。
 * 测试里可调小，让「掉线超时 → AI 接管」尽快发生。
 */
export const SWEEP_MS = Number(process.env.SWEEP_MS ?? 5_000);
