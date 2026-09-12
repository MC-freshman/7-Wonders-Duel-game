import type { GameAction, PlayerId, ReadableState } from '../../core/types';
import { CHAMBER_SCORES, DEGREE_BY_ID, districtOf } from '../../core/data';

/* ------------------------------------------------------------------
 * Agora 参议院条：6 个 chamber 的方块 / 控制 / 法令，以及双方参议员概况
 * 仅在启用 Agora 时渲染。viewer 用于标识己方方块（行动入口由 legalActions 驱动）。
 * ------------------------------------------------------------------ */

const DISTRICT_LABEL = { left: '左区', center: '中区', right: '右区' } as const;

export function SenateBar({
  state,
  viewer,
  onAct,
  canAct,
}: {
  state: ReadableState;
  viewer: PlayerId;
  onAct: (a: GameAction) => void;
  /** 是否轮到本端行动（仅行动方可点参议院操作） */
  canAct: boolean;
}) {
  const ag = state.agora;
  if (!ag) return null;

  const heads = ag.ops.length > 0 ? ag.ops : null;
  const myTurnOps = heads && heads[0].player === viewer;
  const recruit = ag.senateActionsLeft > 0;

  return (
    <section className="panel agora-bar" aria-label="参议院">
      <h3>🏛 参议院{recruit ? ` · 剩余 ${ag.senateActionsLeft} 次行动` : ''}</h3>
      <div className="agora-chambers">
        {ag.senate.chambers.map((ch, i) => {
          const ctrl = ch.controller;
          const decreeText =
            ch.decree === '' && ch.decreeExtra.length === 0
              ? '（无法令）'
              : ch.decreeFaceUp || ch.decree === ''
                ? [
                    ch.decree ? DEGREE_BY_ID[ch.decree]?.zh : '',
                    ...ch.decreeExtra.filter((e) => e.faceUp).map((e) => DEGREE_BY_ID[e.id]?.zh ?? ''),
                  ]
                    .filter(Boolean)
                    .join('＋')
                : '未知的法令';
          const myPlace =
            myTurnOps && heads![0].op.kind === 'place'
              ? !heads![0].op.district || heads![0].op.district === 'any' || districtOf(i) === heads![0].op.district
              : recruit && (!ag.politicianDistrict || districtOf(i) === ag.politicianDistrict);
          const clickable = canAct && !!myPlace;
          return (
            <div key={i} className={`agora-chamber${ctrl === viewer ? ' mine' : ''}${ctrl !== null ? ` ctrl-${ctrl}` : ''}`}>
              <div className="ch-head">
                <span className="ch-name">
                  {i + 1} 号 · {DISTRICT_LABEL[districtOf(i)]}
                </span>
                <span className="ch-score">{CHAMBER_SCORES[i]}分</span>
              </div>
              <div className="ch-cubes">
                <span className={ctrl === 0 ? 'cube p0 lead' : 'cube p0'}>■{ch.cubes[0]}</span>
                <span className={ctrl === 1 ? 'cube p1 lead' : 'cube p1'}>■{ch.cubes[1]}</span>
              </div>
              <div className="ch-decree" title={decreeText}>
                📜 {decreeText}
              </div>
              {clickable && (
                <button
                  className="btn tiny"
                  onClick={() => onAct({ type: 'SENATE_PLACE', player: viewer, chamber: i })}
                  aria-label={`放置方块到第 ${i + 1} 议厅`}
                >
                  放置方块
                </button>
              )}
            </div>
          );
        })}
      </div>
      {myTurnOps && (
        <p className="desc">
          待执行参议院操作：
          {heads!
            .map((h) => (h.op.kind === 'place' ? '放置' : h.op.kind === 'move' ? '移动' : '移除'))
            .join(' → ')}
          （移动 / 移除的入口在各议厅内）
        </p>
      )}
      {myTurnOps && heads![0].op.kind === 'move' && (
        <MoveButtons state={state} viewer={viewer} onAct={onAct} optional={heads![0].op.optional === true} />
      )}
      {myTurnOps && heads![0].op.kind === 'remove' && (
        <RemoveButtons state={state} viewer={viewer} onAct={onAct} />
      )}
    </section>
  );
}

function MoveButtons({
  state,
  viewer,
  onAct,
  optional,
}: {
  state: ReadableState;
  viewer: PlayerId;
  onAct: (a: GameAction) => void;
  optional: boolean;
}) {
  const ag = state.agora!;
  const pairs: { from: number; to: number }[] = [];
  ag.senate.chambers.forEach((ch, i) => {
    if (ch.cubes[viewer] > 0) {
      if (i > 0) pairs.push({ from: i, to: i - 1 });
      if (i < 5) pairs.push({ from: i, to: i + 1 });
    }
  });
  return (
    <div className="agora-ops">
      {pairs.map(({ from, to }) => (
        <button
          key={`${from}-${to}`}
          className="btn tiny"
          onClick={() => onAct({ type: 'SENATE_MOVE', player: viewer, from, to })}
        >
          移动：{from + 1} → {to + 1}
        </button>
      ))}
      {optional && (
        <button className="btn tiny" onClick={() => onAct({ type: 'CHOOSE_AGORA', player: viewer, choice: 'skip' })}>
          跳过
        </button>
      )}
    </div>
  );
}

function RemoveButtons({
  state,
  viewer,
  onAct,
}: {
  state: ReadableState;
  viewer: PlayerId;
  onAct: (a: GameAction) => void;
}) {
  const ag = state.agora!;
  const foe = (1 - viewer) as PlayerId;
  return (
    <div className="agora-ops">
      {ag.senate.chambers.map((ch, i) =>
        ch.cubes[foe] > 0 ? (
          <button
            key={i}
            className="btn tiny"
            onClick={() => onAct({ type: 'SENATE_REMOVE', player: viewer, chamber: i })}
          >
            移除对手：{i + 1} 号议厅
          </button>
        ) : null,
      )}
    </div>
  );
}
