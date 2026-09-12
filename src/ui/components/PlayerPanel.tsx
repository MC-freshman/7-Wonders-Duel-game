import { useEffect, useRef, useState } from 'react';
import { cityCards } from '../../core/resources';
import { CARD_BY_ID, DIVINITY_BY_ID, PROGRESS_BY_ID, WONDER_BY_ID } from '../../core/data/index';
import { CARD_TYPE_LABEL, SCIENCE_LABEL } from '../../core/types';
import type { CardType, ReadableState, PlayerId } from '../../core/types';

/** 金币变动时浮出 +N / −N */
function useCoinDelta(coins: number): { delta: number; key: number } | null {
  const prev = useRef(coins);
  const [flash, setFlash] = useState<{ delta: number; key: number } | null>(null);

  useEffect(() => {
    if (coins === prev.current) return;
    const delta = coins - prev.current;
    prev.current = coins;
    setFlash({ delta, key: Date.now() });
    const t = setTimeout(() => setFlash(null), 900);
    return () => clearTimeout(t);
  }, [coins]);

  return flash;
}

const ORDER: CardType[] = [
  'raw',
  'manufactured',
  'civilian',
  'scientific',
  'commercial',
  'military',
  'guild',
];

const TYPE_COLOR: Record<string, string> = {
  raw: 'var(--c-raw)',
  manufactured: 'var(--c-manufactured)',
  civilian: 'var(--c-civilian)',
  scientific: 'var(--c-scientific)',
  commercial: 'var(--c-commercial)',
  military: 'var(--c-military)',
  guild: 'var(--c-guild)',
};

export function PlayerPanel({
  state,
  player,
  name,
  active,
  onWonderClick,
  selectedWonder,
}: {
  state: ReadableState;
  player: PlayerId;
  name: string;
  active: boolean;
  onWonderClick?: (wonderId: string) => void;
  selectedWonder?: string | null;
}) {
  const p = state.players[player];
  const cards = cityCards(state, player);
  const science = Object.entries(p.science).filter(([, n]) => (n ?? 0) > 0);
  const flash = useCoinDelta(p.coins);

  return (
    <div className={`panel player-panel${active ? ' active' : ''}`}>
      <div className="player-head">
        <span className="name">{name}</span>
        <span className="coins">
          ◉ {p.coins}
          {flash && (
            <span key={flash.key} className={`coin-delta ${flash.delta > 0 ? 'plus' : 'minus'}`}>
              {flash.delta > 0 ? `+${flash.delta}` : flash.delta}
            </span>
          )}
        </span>
        {active && <span style={{ color: 'var(--accent)', fontSize: 12 }}>行动中</span>}
      </div>

      {ORDER.map((type) => {
        const list = cards.filter((c) => c.type === type);
        if (list.length === 0) return null;
        return (
          <div className="city-group" key={type}>
            <span className="label" style={{ background: TYPE_COLOR[type] }}>
              {CARD_TYPE_LABEL[type]} {list.length}
            </span>
            <div className="chips">
              {list.map((c, i) => (
                <span className="chip" key={`${c.id}-${i}`} title={c.text}>
                  {c.zh}
                  {c.vp ? ` ${c.vp}分` : ''}
                  {c.shields ? ` 盾${c.shields}` : ''}
                </span>
              ))}
            </div>
          </div>
        );
      })}

      {science.length > 0 && (
        <div className="city-group">
          <span className="label" style={{ background: 'var(--c-scientific)' }}>
            科技 {science.length} 种
          </span>
          <div className="chips">
            {science.map(([sym, n]) => (
              <span className="chip" key={sym}>
                {SCIENCE_LABEL[sym as keyof typeof SCIENCE_LABEL]}
                {(n as number) > 1 ? `×${n}` : ''}
              </span>
            ))}
          </div>
        </div>
      )}

      {p.progressTokens.length > 0 && (
        <div className="city-group">
          <span className="label" style={{ background: 'var(--c-scientific)' }}>
            发展标记
          </span>
          <div className="tokens">
            {p.progressTokens.map((id, i) => (
              <span className="token" key={`${id}-${i}`} title={PROGRESS_BY_ID[id]?.text}>
                {PROGRESS_BY_ID[id]?.zh}
              </span>
            ))}
          </div>
        </div>
      )}

      {state.pantheon && (
        <div className="city-group">
          <span className="label" style={{ background: 'var(--c-purple, #7c5cbf)' }}>
            万神殿
          </span>
          <div className="tokens">
            {/* 已调用的神格（公开信息） */}
            {p.pan.invoked.map((id, i) => (
              <span className="token" key={`div-${id}-${i}`} title={DIVINITY_BY_ID[id]?.text}>
                {DIVINITY_BY_ID[id]?.zh ?? id}
              </span>
            ))}
            {/* 神话 token 计数（神秘主义计分相关） */}
            {p.pan.mythologyTokens.length > 0 && (
              <span className="token" title="持有神话 token（神秘主义：每枚与献祭 token 配对计 2 分）">
                神话 ×{p.pan.mythologyTokens.length}
              </span>
            )}
            {/* Astarte 圣库金币 */}
            {p.pan.astarteCoins > 0 && (
              <span className="token" title="Astarte 圣库：这些金币可像普通金币一样支付，但不参与 3 枚 = 1 分的计分">
                圣库 ◉{p.pan.astarteCoins}
              </span>
            )}
            {/* 献祭 token：自己的显示面值，对手只显示枚数（面值 -1 表示不可见） */}
            {p.pan.offerings.length > 0 && (
              <span
                className="token"
                title={
                  p.pan.offerings.some((v) => v < 0)
                    ? `持有 ${p.pan.offerings.length} 枚献祭 token（面值保密）`
                    : '献祭 token：调用神格时的一次性折扣，可叠加使用'
                }
              >
                献祭{' '}
                {p.pan.offerings.some((v) => v < 0)
                  ? `×${p.pan.offerings.length}`
                  : p.pan.offerings.map((v) => `−${v}`).join('/')}
              </span>
            )}
          </div>
        </div>
      )}

      <div className="city-group">
        <span className="label" style={{ background: 'var(--accent)' }}>
          奇迹 {p.wondersBuilt.length}/{p.wondersBuilt.length + p.wondersUnbuilt.length}
        </span>
        <div className="wonder-row">
          {p.wondersBuilt.map((id, i) => (
            <span
              className="wonder built"
              key={`b-${id}-${i}`}
              title={`${WONDER_BY_ID[id]?.zh}：${WONDER_BY_ID[id]?.text}`}
            >
              {WONDER_BY_ID[id]?.zh}
              {WONDER_BY_ID[id]?.vp ? ` ${WONDER_BY_ID[id]!.vp}分` : ''}
            </span>
          ))}
          {p.wondersUnbuilt.map((id, i) => (
            <span
              className={`wonder${onWonderClick ? ' clickable' : ''}${
                selectedWonder === id ? ' built' : ''
              }`}
              key={`u-${id}-${i}`}
              title={`${WONDER_BY_ID[id]?.zh}：${WONDER_BY_ID[id]?.text}`}
              onClick={onWonderClick ? () => onWonderClick(id) : undefined}
            >
              {WONDER_BY_ID[id]?.zh}
            </span>
          ))}
        </div>
      </div>

      {cards.length === 0 && <div className="empty">尚无建筑</div>}
    </div>
  );
}

export function ProgressTray({ ids, title }: { ids: string[]; title: string }) {
  return (
    <div className="city-group">
      <span className="label" style={{ background: 'var(--c-scientific)' }}>
        {title}
      </span>
      <div className="tokens">
        {ids.length === 0 && <span className="empty">无</span>}
        {ids.map((id) => (
          <span className="token" key={id} title={PROGRESS_BY_ID[id]?.text}>
            {PROGRESS_BY_ID[id]?.zh}
          </span>
        ))}
      </div>
    </div>
  );
}

export function LogPanel({ state }: { state: ReadableState }) {
  return (
    <div className="panel">
      <h3>对局日志</h3>
      <div className="log">
        {state.log
          .slice()
          .reverse()
          .map((e) => (
            <div key={e.index} className={e.player === null ? '' : `p${e.player}`}>
              {e.text}
            </div>
          ))}
      </div>
    </div>
  );
}

export { CARD_BY_ID };
