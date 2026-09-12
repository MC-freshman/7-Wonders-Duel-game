import { CARD_BY_ID, PROGRESS_BY_ID, WONDER_BY_ID } from '../../core/data/index';
import { CARD_TYPE_LABEL, RESOURCE_LABEL } from '../../core/types';
import type { GameAction, ReadableState, PlayerId, Resource } from '../../core/types';
import { CardView } from './CardView';
import { PantheonOverlay } from './PantheonOverlay';
import { AgoraOverlay } from './AgoraOverlay';

function wonderCostText(id: string): string {
  const w = WONDER_BY_ID[id];
  if (!w) return '';
  return Object.entries(w.cost)
    .map(([r, n]) => `${RESOURCE_LABEL[r as Resource]}×${n}`)
    .join(' ');
}

export function ChoiceOverlay({
  state,
  onAct,
}: {
  state: ReadableState;
  onAct: (a: GameAction) => void;
}) {
  const pend = state.pending;
  if (!pend) return null;

  if (pend.kind === 'progressToken') {
    const ids = pend.options ?? state.progressAvailable;
    return (
      <div className="overlay">
        <div className="modal" role="dialog" aria-modal="true" aria-label="选择发展标记">
          <h2>选择发展标记</h2>
          <p className="desc">
            {pend.fromDiscard
              ? '大图书馆：从开局弃置的发展标记中抽取 3 枚，选择 1 枚使用。'
              : '集齐一对相同科技符号，从版图上选取 1 枚发展标记。'}
          </p>
          <div className="option-grid">
            {ids.map((id) => {
              const t = PROGRESS_BY_ID[id];
              return (
                <button
                  className="option"
                  key={id}
                  onClick={() => onAct({ type: 'CHOOSE_PROGRESS_TOKEN', player: pend.player, tokenId: id })}
                >
                  <div className="t">{t?.zh}</div>
                  <div className="d">{t?.text}</div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  if (pend.kind === 'discardedCard') {
    return (
      <div className="overlay">
        <div className="modal" role="dialog" aria-modal="true" aria-label="选择弃牌堆中的建筑免费建造">
          <h2>摩索拉斯陵墓</h2>
          <p className="desc">从弃牌堆中任选一张，免费建造到你的城中。</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {pend.options.map((id, i) => (
              <button
                className="option"
                key={`${id}-${i}`}
                style={{ padding: 6 }}
                aria-label={`免费建造 ${CARD_BY_ID[id]?.zh ?? id}`}
                onClick={() => onAct({ type: 'CHOOSE_DISCARDED_CARD', player: pend.player, cardId: id })}
              >
                <CardView cardId={id} faceUp />
              </button>
            ))}
          </div>
          {pend.options.length === 0 && <div className="empty">弃牌堆为空</div>}
        </div>
      </div>
    );
  }

  if (pend.kind === 'opponentCard') {
    return (
      <div className="overlay">
        <div className="modal" role="dialog" aria-modal="true" aria-label="摧毁对手建筑">
          <h2>摧毁对手的{CARD_TYPE_LABEL[pend.cardType === 'raw' ? 'raw' : 'manufactured']}建筑</h2>
          <p className="desc">选择一张对手已建造的建筑，将其移入弃牌堆。</p>
          <div className="option-grid">
            {pend.options.map((id, i) => (
              <button
                className="option"
                key={`${id}-${i}`}
                onClick={() => onAct({ type: 'CHOOSE_OPPONENT_CARD', player: pend.player, cardId: id })}
              >
                <div className="t">{CARD_BY_ID[id]?.zh}</div>
                <div className="d">{CARD_BY_ID[id]?.text}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (pend.kind === 'pantheon') {
    // Pantheon 的选择队列由专门的 PantheonOverlay 呈现
    return <PantheonOverlay pend={pend} state={state} onAct={onAct} />;
  }

  if (pend.kind === 'agora') {
    // Agora 的选择队列由专门的 AgoraOverlay 呈现
    return <AgoraOverlay pend={pend} onAct={onAct} />;
  }

  if (pend.kind !== 'startPlayer') return null;

  return (
    <div className="overlay">
      <div className="modal" role="dialog" aria-modal="true" aria-label="选择下一时代的先手">
        <h2>选择下一时代的先手</h2>
        <p className="desc">
          由{state.pending && 'chooser' in state.pending && state.pending.chooser === 0 ? '玩家一' : '玩家二'}
          决定谁先行动。
        </p>
        <div className="option-grid">
          {([0, 1] as PlayerId[]).map((next) => (
            <button
              className="option"
              key={next}
              onClick={() => onAct({ type: 'CHOOSE_START_PLAYER', player: pend.chooser, next })}
            >
              <div className="t">{next === 0 ? '玩家一先手' : '玩家二先手'}</div>
              <div className="d">由被选中的玩家先拿牌</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ResultOverlay({
  state,
  names,
  onRestart,
  onReplay,
}: {
  state: ReadableState;
  names: [string, string];
  onRestart: () => void;
  /** 有复盘数据时才有此项，点击后进入逐帧回放 */
  onReplay?: () => void;
}) {
  const v = state.victory;
  if (!v) return null;

  const title =
    v.type === 'military'
      ? '军事压制胜利'
      : v.type === 'science'
        ? '科技压制胜利'
        : v.type === 'draw'
          ? '平局'
          : '终局计分';

  const winnerText =
    v.winner === null ? '双方共享胜利' : `${names[v.winner]} 获胜`;

  const reason =
    v.type === 'military'
      ? '冲突标记进入对方首都，游戏立即结束。'
      : v.type === 'science'
        ? '集齐 6 种不同科技符号，游戏立即结束。'
        : v.type === 'draw'
          ? '总分与市政分均相同。'
          : '时代 III 结束，按总分判定（同分则比较市政建筑分）。';

  return (
    <div className="overlay">
      <div className="modal" role="dialog" aria-modal="true" aria-label="对局结果">
        <h2>{title}</h2>
        <p className="desc">
          {winnerText}｜{reason}
        </p>
        {v.breakdown && (
          <table className="score-table">
            <thead>
              <tr>
                <th>项目</th>
                <th>{names[0]}</th>
                <th>{names[1]}</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ['军事', 'military'],
                  ['建筑', 'buildings'],
                  ['奇迹', 'wonders'],
                  ['发展标记', 'progress'],
                  ['金币', 'coins'],
                ] as const
              ).map(([label, key]) => (
                <tr key={key}>
                  <td>{label}</td>
                  <td>{v.breakdown![0][key]}</td>
                  <td>{v.breakdown![1][key]}</td>
                </tr>
              ))}
              <tr className="total">
                <td>总分</td>
                <td>{v.breakdown[0].total}</td>
                <td>{v.breakdown[1].total}</td>
              </tr>
              <tr>
                <td>市政分（平局时用）</td>
                <td>{v.breakdown[0].blueVp}</td>
                <td>{v.breakdown[1].blueVp}</td>
              </tr>
            </tbody>
          </table>
        )}
        <div style={{ marginTop: 16 }}>
          <button className="btn primary" onClick={onRestart}>
            再来一局
          </button>
          {onReplay && (
            <button className="btn" onClick={onReplay}>
              复盘本局
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export { wonderCostText };
