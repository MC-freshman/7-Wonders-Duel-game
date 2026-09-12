import type { ReplaySource } from '../../core/replay';
import { useReplayGame } from '../sources/useReplayGame';
import { CardStructure } from './CardStructure';
import { MilitaryTrack } from './MilitaryTrack';
import { ResultOverlay } from './Overlays';
import { LogPanel, PlayerPanel } from './PlayerPanel';
import { ReplayBar } from './ReplayBar';

/* ------------------------------------------------------------------
 * 复盘视图
 *
 * 复用正式对局的同一批展示组件，但全部只读：
 *   - 牌阵没有任何可选槽位，点不动
 *   - 不渲染任何待办选择弹窗（回放的是结果，不是决策）
 *   - 走到终局帧时照常显示结算面板
 * ------------------------------------------------------------------ */

const NAMES: [string, string] = ['玩家一', '玩家二'];

export function ReplayView({
  source,
  onExit,
}: {
  source: ReplaySource;
  onExit: () => void;
}) {
  const replay = useReplayGame(source, onExit);
  const view = replay.view;
  if (!view) return <div className="app">载入中…</div>;

  const atEnd = replay.index >= replay.total;
  const names = source.names ?? NAMES;

  return (
    <div className="app">
      <div className="topbar">
        <h1>七大奇迹对决</h1>
        <span className="age-tag">复盘模式</span>
        <div className="spacer" />
        <span className="hint">本局种子 {source.seed}</span>
        <button className="btn" onClick={replay.exit}>
          退出复盘
        </button>
      </div>

      <MilitaryTrack state={view} names={names} />

      <div className="main">
        <details className="collapsible" open>
          <summary>{names[0]}的城市</summary>
          <PlayerPanel state={view} player={0} name={names[0]} active={!view.victory && replay.actor === 0} />
        </details>

        <div className="center-col">
          <CardStructure
            state={view}
            selectableSlots={new Set()}
            selectedSlot={null}
            onPick={() => undefined}
          />
          <ReplayBar replay={replay} />
        </div>

        <div className="right-col">
          <details className="collapsible" open>
            <summary>{names[1]}的城市</summary>
            <PlayerPanel state={view} player={1} name={names[1]} active={!view.victory && replay.actor === 1} />
          </details>
          <LogPanel state={view} />
        </div>
      </div>

      <div className="footer-note">
        复盘中不可操作：进度条上的第 N 步对应日志中的第 N 个动作，画面由种子重放得到，与当时完全一致。
        {view.discard.length > 0 ? `　·　弃牌堆 ${view.discard.length} 张` : ''}
      </div>

      {atEnd && view.victory && (
        <ResultOverlay state={view} names={names} onRestart={() => replay.goto(0)} />
      )}
    </div>
  );
}
