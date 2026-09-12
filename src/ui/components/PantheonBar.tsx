import type { GameAction, PlayerId, ReadableState } from '../../core/types';
import { DIVINITY_BY_ID, GATE_ID } from '../../core/data';
import { invokeCost } from '../../core/engine';

/* ------------------------------------------------------------------
 * Pantheon 图板条：6 个位置的调用费用 / 神格卡，以及双方已调用的神格
 * 仅在启用 Pantheon 时渲染。
 * ------------------------------------------------------------------ */

function costFor(state: ReadableState, p: PlayerId, position: number): number {
  return invokeCost(state, p, position, []);
}

function positionLabel(state: ReadableState, position: number): string {
  const pan = state.pantheon!;
  const id = pan.board[position];
  if (id === null) return '空位';
  if (id === GATE_ID) return 'Pantheon 之门（费用 ×2）';
  if (!pan.revealed[position]) return '未知的神格';
  const div = DIVINITY_BY_ID[id];
  if (!div) return id;
  const myth = { mesopotamian: '美索不达米亚', phoenician: '腓尼基', greek: '希腊', egyptian: '埃及', roman: '罗马' }[
    div.mythology
  ];
  return `${div.zh}（${myth}）`;
}

export function PantheonBar({
  state,
  viewer,
  actions,
  onAct,
}: {
  state: ReadableState;
  viewer: PlayerId;
  actions: GameAction[];
  onAct: (a: GameAction) => void;
}) {
  const pan = state.pantheon;
  if (!pan) return null;

  const invokeActions = new Map<string, GameAction>();
  for (const a of actions) {
    if (a.type === 'INVOKE_DIVINITY') invokeActions.set(String(a.position), a);
  }
  const canInvokeNow = state.phase === 'playing' && state.current === viewer;

  return (
    <section className="panel pantheon-bar" aria-label="Pantheon 图板">
      <h3>Pantheon 图板</h3>
      <div className="pantheon-positions">
        {pan.board.map((id, i) => {
          const invoke = canInvokeNow ? invokeActions.get(String(i)) : undefined;
          const cost = costFor(state, viewer, i);
          const known = id !== null && (pan.revealed[i] || id === GATE_ID);
          const div = known && id !== GATE_ID ? DIVINITY_BY_ID[id] : null;
          return (
            <div className={`pantheon-slot${invoke ? ' invocable' : ''}`} key={i}>
              <div className="pos-title">
                {id === null
                  ? `空位 ${i + 1}`
                  : known
                    ? div
                      ? div.zh
                      : 'Pantheon 之门'
                    : '未知的神格'}
              </div>
              {known && div && <div className="pos-desc">{div.text}</div>}
              {id === GATE_ID && <div className="pos-desc">翻 5 组牌堆顶各 1 张，选 1 免费调用</div>}
              <div className="pos-cost">
                {viewer === 0
                  ? `你 ${cost} / 对手 ${[3, 4, 5, 6, 7, 8][i]}`
                  : `你 ${cost} / 对手 ${[8, 7, 6, 5, 4, 3][i]}`}
              </div>
              {invoke && (
                <button
                  className="btn primary"
                  onClick={() => onAct(invoke)}
                  aria-label={`调用 ${positionLabel(state, i)}`}
                >
                  调用（{cost} 金币）
                </button>
              )}
            </div>
          );
        })}
      </div>
      <div className="pantheon-invoked">
        {([0, 1] as PlayerId[]).map((p) => (
          <span key={p} className="invoked-list">
            {p === 0 ? '玩家一' : '玩家二'}已调用：
            {state.players[p].pan.invoked.length === 0
              ? '无'
              : state.players[p].pan.invoked
                  .map((id) => DIVINITY_BY_ID[id]?.zh ?? id)
                  .join('、')}
          </span>
        ))}
      </div>
    </section>
  );
}
