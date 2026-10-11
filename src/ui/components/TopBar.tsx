import { DIFFICULTY_LABEL, type Difficulty } from '../../ai/difficulty';
import type { GameMode } from '../sources/types';
const DIFFS: Difficulty[] = ['easy', 'medium', 'hard'];

export function TopBar(props: {
  mode: GameMode;
  setMode: (m: GameMode) => void;
  difficulty: Difficulty;
  setDifficulty: (d: Difficulty) => void;
  muted: boolean;
  toggleMute: () => void;
  pantheon: boolean;
  setPantheon: (v: boolean) => void;
  agora: boolean;
  setAgora: (v: boolean) => void;
  /** 联机时只有房主能在开局前切换；其余场景锁定 */
  pantheonLocked?: boolean;
  pantheonTitle?: string;
  tag: string;
  onRestart: () => void;
  /** 首页模式选择屏：模式 / 难度 / 扩展已在卡片里选，顶栏只留标题与音效 */
  compact?: boolean;
}) {
  const {
    mode,
    setMode,
    difficulty,
    setDifficulty,
    muted,
    toggleMute,
    pantheon,
    setPantheon,
    agora,
    setAgora,
    pantheonLocked,
    pantheonTitle,
    tag,
    onRestart,
    compact = false,
  } = props;
  /* 模式 / 难度 / 扩展这组控件在首页由卡片承担，故 compact 时整体收起 */
  const controls = (
    <>
      <div className="seg">
        <button className={mode === 'ai' ? 'on' : ''} onClick={() => setMode('ai')}>
          人机对战
        </button>
        <button className={mode === 'hotseat' ? 'on' : ''} onClick={() => setMode('hotseat')}>
          本地热座
        </button>
        <button className={mode === 'online' ? 'on' : ''} onClick={() => setMode('online')}>
          联机对战
        </button>
        <button className={mode === 'solo' ? 'on' : ''} onClick={() => setMode('solo')}>
          单人 Solo
        </button>
      </div>
      <div className="seg">
        {DIFFS.map((d) => (
          <button
            key={d}
            className={difficulty === d ? 'on' : ''}
            disabled={mode !== 'ai'}
            onClick={() => setDifficulty(d)}
          >
            {DIFFICULTY_LABEL[d]}
          </button>
        ))}
      </div>
      <button
        className={`btn${pantheon ? ' on' : ''}`}
        disabled={pantheonLocked}
        title={pantheonTitle ?? '切换后立即开始新对局'}
        onClick={() => setPantheon(!pantheon)}
      >
        {pantheon ? '🏛 万神殿开' : '🏛 万神殿关'}
      </button>
      <button
        className={`btn${agora ? ' on' : ''}`}
        disabled={pantheonLocked}
        title={pantheonTitle ?? '切换后立即开始新对局'}
        onClick={() => setAgora(!agora)}
      >
        🏛 市政广场{agora ? '开' : '关'}
      </button>
    </>
  );

  return (
    <div className="topbar">
      <h1>七大奇迹对决</h1>
      <span className="age-tag">{tag}</span>
      <div className="spacer" />
      {compact ? null : controls}
      <button className="btn" onClick={toggleMute} title="音效开关">
        {muted ? '🔇 音效关' : '🔊 音效开'}
      </button>
      {compact ? null : (
        <button className="btn" onClick={onRestart}>
          新对局
        </button>
      )}
    </div>
  );
}
