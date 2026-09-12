import type { ReactNode } from 'react';
import { CARD_BY_ID } from '../../core/data/index';
import { RESOURCE_LABEL, SCIENCE_LABEL } from '../../core/types';
import type { Resource } from '../../core/types';

const TYPE_COLOR: Record<string, string> = {
  raw: 'var(--c-raw)',
  manufactured: 'var(--c-manufactured)',
  civilian: 'var(--c-civilian)',
  scientific: 'var(--c-scientific)',
  commercial: 'var(--c-commercial)',
  military: 'var(--c-military)',
  guild: 'var(--c-guild)',
};

export function Res({ r, n }: { r: Resource; n?: number }) {
  return (
    <span className={`res r-${r}`}>
      {RESOURCE_LABEL[r]}
      {n && n > 1 ? n : ''}
    </span>
  );
}

function CostLine({ cost, coinCost }: { cost?: Partial<Record<Resource, number>>; coinCost?: number }) {
  const parts: ReactNode[] = [];
  for (const [r, n] of Object.entries(cost ?? {})) {
    parts.push(<Res key={r} r={r as Resource} n={n as number} />);
  }
  if (coinCost) parts.push(<span key="coin" className="sym-coin">{coinCost}金</span>);
  if (parts.length === 0) return <div className="card-cost">免费</div>;
  return <div className="card-cost">{parts}</div>;
}

/** 卡面摘要：名字 / 效果 / 费用 */
export function cardSummary(cardId: string): { name: string; color: string; body: ReactNode; cost: ReactNode } {
  const card = CARD_BY_ID[cardId];
  if (!card) return { name: '?', color: '#888', body: null, cost: null };

  const bits: ReactNode[] = [];
  if (card.produces) {
    bits.push(
      <div key="p">
        {Object.entries(card.produces).map(([r, n]) => (
          <Res key={r} r={r as Resource} n={n as number} />
        ))}
      </div>,
    );
  }
  if (card.producesOneOf) {
    bits.push(
      <div key="po">
        任选{' '}
        {card.producesOneOf.map((r) => (
          <Res key={r} r={r} />
        ))}
      </div>,
    );
  }
  if (card.trades) {
    bits.push(
      <div key="t">
        买价 1 金：
        {card.trades.map((r) => (
          <Res key={r} r={r} />
        ))}
      </div>,
    );
  }
  if (card.shields) bits.push(<div key="s" className="sym-shield">{'盾'.repeat(card.shields)} ×{card.shields}</div>);
  if (card.science) bits.push(<div key="sc"><span className="sym-science">{SCIENCE_LABEL[card.science]}</span></div>);
  if (card.coins) bits.push(<div key="c">{card.coins} 金币</div>);
  if (card.coinsPer) bits.push(<div key="cp">按数量得金</div>);
  if (card.vp) bits.push(<div key="v"><span className="sym-vp">{card.vp} 分</span></div>);
  if (card.vpPer) bits.push(<div key="vp">终局计分</div>);

  return {
    name: card.zh,
    color: TYPE_COLOR[card.type] ?? '#888',
    body: bits,
    cost: <CostLine cost={card.cost} coinCost={card.coinCost} />,
  };
}

interface Props {
  cardId: string | null;
  faceUp: boolean;
  selected?: boolean;
  selectable?: boolean;
  dim?: boolean;
  onClick?: () => void;
  title?: string;
}

export function CardView({ cardId, faceUp, selected, selectable, dim, onClick, title }: Props) {
  if (!cardId || !faceUp) {
    return <div className="card facedown" title={title ?? '暗牌'} />;
  }
  const s = cardSummary(cardId);
  const cls = [
    'card',
    selectable ? 'selectable' : '',
    selected ? 'selected' : '',
    dim ? 'dim' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={cls}
      onClick={onClick}
      title={title ?? CARD_BY_ID[cardId]?.text}
      style={{ borderColor: s.color }}
    >
      <div className="card-name" style={{ background: s.color }}>
        {s.name}
      </div>
      <div className="card-body">{s.body}</div>
      {s.cost}
    </div>
  );
}
