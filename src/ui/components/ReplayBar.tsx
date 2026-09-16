import { CARD_BY_ID, PROGRESS_BY_ID, WONDER_BY_ID } from '../../core/data/index';
import type { LogEntry } from '../../core/types';
import { SPEEDS, type ReplayApi } from '../sources/useReplayGame';

/* ------------------------------------------------------------------
 * 复盘控制条：进度拖拽 / 单步 / 播放 / 倍速 / 退出
 * ------------------------------------------------------------------ */

/** 把「下一步动作」翻译成一句人话，让玩家在跳转前就知道要发生什么 */
export function describeNext(a: ReplayApi['nextAction']): string {
  if (!a) return '本局已结束';
  switch (a.type) {
    case 'DRAFT_WONDER':
      return `选择奇迹「${WONDER_BY_ID[a.wonderId]?.zh ?? a.wonderId}」`;
    case 'BUILD_CARD':
      return '建造一张卡';
    case 'DISCARD_CARD':
      return '弃掉一张卡换金币';
    case 'BUILD_WONDER':
      return `用一张牌建造奇迹「${WONDER_BY_ID[a.wonderId]?.zh ?? a.wonderId}」`;
    case 'CHOOSE_PROGRESS_TOKEN':
      return `选择发展标记「${PROGRESS_BY_ID[a.tokenId]?.zh ?? a.tokenId}」`;
    case 'CHOOSE_DISCARDED_CARD':
      return `自弃牌堆免费建造「${CARD_BY_ID[a.cardId]?.zh ?? a.cardId}」`;
    case 'CHOOSE_OPPONENT_CARD':
      return `摧毁对手的「${CARD_BY_ID[a.cardId]?.zh ?? a.cardId}」`;
    case 'CHOOSE_START_PLAYER':
      return `选择由${a.next === 0 ? '玩家一' : '玩家二'}先手`;
    default:
      return '下一步';
  }
}

export function ReplayBar({ replay }: { replay: ReplayApi }) {
  const { index, total, playing, speed, stepEntries, nextAction } = replay;
  const atEnd = index >= total;

  return (
    <div className="panel replay-bar" role="group" aria-label="复盘控制">
      <div className="replay-head">
        <h3>复盘</h3>
        <span className="step-count">
          第 {index} / {total} 步
        </span>
        <div className="spacer" />
        <div className="seg" role="group" aria-label="播放倍速">
          {SPEEDS.map((s) => (
            <button
              key={s}
              className={speed === s ? 'on' : ''}
              onClick={() => replay.setSpeed(s)}
              aria-pressed={speed === s}
            >
              {s}×
            </button>
          ))}
        </div>
        <button className="btn" onClick={replay.exit}>
          退出复盘
        </button>
      </div>

      <div className="replay-transport">
        <button className="btn" onClick={() => replay.step(-1)} disabled={index === 0} title="上一步">
          ◀ 上一步
        </button>
        <button className="btn primary" onClick={replay.toggle} title="播放 / 暂停">
          {playing ? '⏸ 暂停' : atEnd ? '↻ 重播' : '▶ 播放'}
        </button>
        <button className="btn" onClick={() => replay.step(1)} disabled={atEnd} title="下一步">
          下一步 ▶
        </button>
        <input
          className="replay-range"
          type="range"
          min={0}
          max={total}
          step={1}
          value={index}
          onChange={(e) => {
            replay.setSpeed(speed);
            replay.goto(Number(e.target.value));
          }}
          aria-label="复盘进度"
          aria-valuetext={`第 ${index} 步，共 ${total} 步`}
        />
      </div>

      <div className="replay-step">
        {index === 0 ? (
          <span className="hint">开局状态，尚未行动。</span>
        ) : (
          <ul className="replay-entries">
            {stepEntries.map((e: LogEntry) => (
              <li key={e.index}>{e.text}</li>
            ))}
          </ul>
        )}
        {!atEnd && (
          <div className="replay-next">
            下一步：{describeNext(nextAction)}
            {nextAction
              ? `（${
                  replay.solo
                    ? nextAction.player === 0
                      ? '你'
                      : '领袖'
                    : nextAction.player === 0
                      ? '玩家一'
                      : '玩家二'
                }）`
              : ''}
          </div>
        )}
        {atEnd && <div className="replay-next">已到终局。</div>}
      </div>
    </div>
  );
}
