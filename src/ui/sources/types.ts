import type { GameAction, PlayerId } from '../../core/types';
import type { ReplaySource } from '../../core/replay';
import type { PublicState } from '../../core/visibility';

/* ------------------------------------------------------------------
 * 对战源适配层
 *
 * 本地热座 / 人机 / 联机三种模式对 UI 暴露同一套接口，
 * 差异（谁推进状态、状态从哪来、要不要等网络）全部封在各自的 useXxxGame 里。
 * ------------------------------------------------------------------ */

export type ConnStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error';

export interface OnlineInfo {
  status: ConnStatus;
  code: string | null;
  seat: PlayerId | null;
  present: [boolean, boolean];
  ready: [boolean, boolean];
  started: boolean;
  peerConnected: boolean;
  /** 对手重连截止时间戳（ms），null 表示无需倒计时 */
  peerDeadline: number | null;
  error: string | null;
  /** 各座位是否正由 AI 托管（对手掉线超时后接管，见 N3） */
  aiControlled: [boolean, boolean];
  /** 服务器侧的本局扩展设置（房主 START 时指定，经 ROOM 广播给双方） */
  pantheon: boolean;
  agora: boolean;
  createRoom(): void;
  joinRoom(code: string): void;
  setReady(v: boolean): void;
  /** 开始对局（房主专属）；pantheon / agora 指定扩展 */
  start(pantheon: boolean, agora: boolean): void;
  leave(): void;
}

/** 回放控制项：进度、播放、倍速、跳转 */
export interface ReplayControls {
  /** 当前已应用的动作数（0 = 开局） */
  index: number;
  /** 本局总动作数 */
  total: number;
  playing: boolean;
  speed: number;
  goto(i: number): void;
  step(delta: number): void;
  toggle(): void;
  setSpeed(s: number): void;
  exit(): void;
}

export interface GameApi {
  /** 联机模式下尚未开局时为 null（此时应显示房间大厅） */
  view: PublicState | null;
  actor: PlayerId | null;
  /** AI 正在推演 / 等待对手 */
  thinking: boolean;
  act(a: GameAction): void;
  restart(): void;
  /** 非联机模式为 null */
  online: OnlineInfo | null;
  /** 是否由本端玩家操作（联机时只认自己的座位） */
  interactive: boolean;
  /**
   * 取回本局的可回放数据（seed + 完整日志），用于对局结束后复盘。
   * 返回 null 表示当前拿不到（例如联机对局尚未结束）。
   */
  replay?: () => ReplaySource | null;
}

export type GameMode = 'hotseat' | 'ai' | 'online' | 'solo';
export type { PlayerId };
