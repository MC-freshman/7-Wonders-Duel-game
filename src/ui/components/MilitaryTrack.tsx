import { useEffect, useRef } from 'react';
import { TRACK_ZONES, zoneOf } from '../../core/data/index';
import type { ReadableState } from '../../core/types';

const CELLS: number[] = [];
for (let i = -9; i <= 9; i++) CELLS.push(i);

/** 每个格子的步进（40px 格子 + 6px 间距），与 styles.css 保持一致 */
const PITCH = 46;
const CELL_W = 40;
const PAD = 4;

export function MilitaryTrack({
  state,
  names,
}: {
  state: ReadableState;
  names: [string, string];
}) {
  const pawn = state.conflictPawn;
  const p0 = Math.max(0, pawn);
  const p1 = Math.max(0, -pawn);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pawnRef = useRef<HTMLDivElement>(null);

  // 冲突标记移动后自动滚到可见区域（窄屏轨道需要横向滚动）
  useEffect(() => {
    const el = pawnRef.current;
    const box = scrollRef.current;
    if (!el || !box) return;
    if (box.scrollWidth <= box.clientWidth) return;
    const target = el.offsetLeft - box.clientWidth / 2 + el.offsetWidth / 2;
    box.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
  }, [pawn]);

  return (
    <div className="track">
      <div className="track-scroll" ref={scrollRef}>
        <div className="track-row">
          {CELLS.map((pos) => {
            const cls = ['track-cell'];
            if (pos === 0) cls.push('center');
            else if (pos < 0) cls.push('p1');
            else cls.push('p2');
            if (Math.abs(pos) === 9) cls.push('capital');
            return (
              <div key={pos} className={cls.join(' ')} title={cellTitle(pos)}>
                {Math.abs(pos) === 9 ? '都' : Math.abs(pos)}
              </div>
            );
          })}
          <div
            className="track-pawn"
            ref={pawnRef}
            style={{ left: PAD + (pawn + 9) * PITCH + CELL_W / 2 }}
            title={`冲突标记：${pawn === 0 ? '中立' : pawn > 0 ? `${names[0]}推进 ${pawn}` : `${names[1]}推进 ${-pawn}`}`}
          >
            ⚔
          </div>
        </div>
      </div>
      <div className="track-legend">
        <span className="side p0">
          {names[0]} 推进 {p0}（{zoneOf(p0).points} 分）
        </span>
        <span className="rule">
          进入「兵临城下」对手失 2 金，「深入腹地」失 5 金；抵达首都即军事压制胜利。
        </span>
        <span className="side p1">
          {names[1]} 推进 {p1}（{zoneOf(p1).points} 分）
        </span>
      </div>
      <div className="track-hint">
        区块分档：
        {TRACK_ZONES.slice()
          .reverse()
          .map((z) => `${z.label} ≥${z.startPos} 格（${z.points} 分）`)
          .join('　')}
      </div>
    </div>
  );
}

function cellTitle(pos: number): string {
  if (pos === 0) return '中立格';
  if (Math.abs(pos) === 9) return pos < 0 ? '玩家一的首都' : '玩家二的首都';
  return `距中心 ${Math.abs(pos)} 格`;
}
