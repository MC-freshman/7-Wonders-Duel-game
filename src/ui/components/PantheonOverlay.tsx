import type { GameAction, InvokeEffect, Mythology, PantheonStep, PlayerId, ReadableState } from '../../core/types';
import { CARD_BY_ID, DIVINITY_BY_ID, WONDER_BY_ID } from "../../core/data";
import type { PendingChoice } from '../../core/types';

/* ------------------------------------------------------------------
 * Pantheon 选择弹窗：处理神格放置 / 调用目标 / 门 / 通神大剧场等队列
 * ------------------------------------------------------------------ */

const MYTHOLOGY_ZH: Record<Mythology, string> = {
  mesopotamian: '美索不达米亚',
  phoenician: '腓尼基',
  greek: '希腊',
  egyptian: '埃及',
  roman: '罗马',
};

interface LabeledOption {
  value: string;
  title: string;
  desc?: string;
}

function optionLabel(
  effect: InvokeEffect | 'placeDivinitySelect',
  value: string,
  state: ReadableState,
): LabeledOption {
  switch (effect) {
    case 'placeDivinitySelect': {
      const div = DIVINITY_BY_ID[value];
      return { value, title: div?.zh ?? value, desc: div?.text };
    }
    case 'enki': {
      const t = state.pantheon ? undefined : undefined;
      void t;
      return { value, title: '进度 token', desc: '获得该发展标记，另一枚回盒' };
    }
    case 'nisaba': {
      const card = CARD_BY_ID[value];
      return {
        value,
        title: card?.zh ?? value,
        desc: card ? `蛇 token 附着该绿卡（符号：${card.science ?? ''}）` : undefined,
      };
    }
    case 'baal':
    case 'hades': {
      const card = CARD_BY_ID[value];
      return { value, title: card?.zh ?? value, desc: card?.text };
    }
    case 'zeus': {
      const slotIndex = Number(value);
      const cardId = state.slots[slotIndex]?.cardId ?? null;
      const card = cardId ? CARD_BY_ID[cardId] : null;
      return {
        value,
        title: card ? `弃掉「${card.zh}」` : `弃掉槽位 ${slotIndex + 1} 的牌`,
        desc: '其上的神话 / 献祭 token 一并弃掉',
      };
    }
    case 'anubis': {
      const w = WONDER_BY_ID[value];
      return { value, title: `拆掉「${w?.zh ?? value}」`, desc: '已获效果保留，可重建' };
    }
    case 'ra': {
      const w = WONDER_BY_ID[value];
      return { value, title: `抢走未建的「${w?.zh ?? value}」`, desc: '加入你的未建奇迹' };
    }
    case 'minerva': {
      const pos = Number(value);
      return { value, title: `军事轨道第 ${pos} 格`, desc: '冲突棋子进入该格时停下并弃掉 Minerva' };
    }
    case 'gate': {
      const div = DIVINITY_BY_ID[value];
      return { value, title: div?.zh ?? value, desc: div?.text };
    }
    case 'theatreDeck': {
      const myth = value as Mythology;
      return { value, title: MYTHOLOGY_ZH[myth], desc: '翻开该组的全部神格，选 1 位免费调用' };
    }
    case 'theatrePick': {
      const div = DIVINITY_BY_ID[value];
      return { value, title: div?.zh ?? value, desc: div?.text };
    }
    default:
      return { value, title: value };
  }
}

export function PantheonOverlay({
  pend,
  state,
  onAct,
}: {
  pend: Extract<PendingChoice, { kind: 'pantheon' }>;
  state: ReadableState;
  onAct: (a: GameAction) => void;
}) {
  const step: PantheonStep | undefined = pend.steps[0];
  if (!step) return null;
  const p: PlayerId = pend.player;
  const who = p === 0 ? '玩家一' : '玩家二';

  let title = '';
  let desc = '';
  let effectForLabel: InvokeEffect | 'placeDivinitySelect' = 'placeDivinitySelect';
  let options: string[] = [];

  if (step.kind === 'placeDivinitySelect') {
    title = '神话 token：选择要召唤的神格';
    desc = '选中的神格将面朝下放到 Pantheon 图板的任意空位。';
    effectForLabel = 'placeDivinitySelect';
    options = step.options;
  } else if (step.kind === 'placeDivinityPosition') {
    title = '选择 Pantheon 图板的位置';
    desc = '离你首都越近，之后调用该神格越便宜。';
    const positions: LabeledOption[] = [];
    state.pantheon?.board.forEach((id, i) => {
      if (id !== null) return;
      const costs = state.pantheon
        ? undefined
        : undefined;
      void costs;
      const c = costAt(state, p, i);
      positions.push({ value: String(i), title: `位置 ${i + 1}`, desc: `你的调用费用：${c} 金币` });
    });
    return (
      <div className="overlay">
        <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
          <h2>{title}</h2>
          <p className="desc">{desc}</p>
          <div className="option-grid">
            {positions.map((o) => (
              <button
                className="option"
                key={o.value}
                onClick={() =>
                  onAct({
                    type: 'PLACE_DIVINITY',
                    player: p,
                    divinityId: step.divinityId,
                    position: Number(o.value),
                  })
                }
              >
                <div className="t">{o.title}</div>
                <div className="d">{o.desc}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  } else {
    title = invokePickTitle(step);
    desc = '选择一项执行。';
    effectForLabel = step.effect;
    options = step.options;
  }

  return (
    <div className="overlay">
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        <p className="desc">{desc}</p>
        <div className="option-grid">
          {options.map((value, i) => {
            const o = optionLabel(effectForLabel, value, state);
            return (
              <button
                className="option"
                key={`${value}-${i}`}
                onClick={() => onAct({ type: 'CHOOSE_PANTHEON', player: p, choice: value })}
              >
                <div className="t">{o.title}</div>
                {o.desc && <div className="d">{o.desc}</div>}
              </button>
            );
          })}
        </div>
        <p className="desc">轮到 {who} 选择。</p>
      </div>
    </div>
  );
}

function invokePickTitle(step: Extract<PantheonStep, { kind: 'invokePick' }>): string {
  const god = DIVINITY_BY_ID[step.divinityId]?.zh ?? step.divinityId;
  switch (step.effect) {
    case 'enki':
      return 'Enki：选择 1 枚进度 token';
    case 'nisaba':
      return 'Nisaba：选择对手的一张绿卡';
    case 'baal':
      return 'Baal：选择对手的一张棕 / 灰卡';
    case 'hades':
      return 'Hades：从弃牌堆选择一张免费建造';
    case 'zeus':
      return 'Zeus：选择结构上要弃掉的牌';
    case 'anubis':
      return 'Anubis：选择要拆掉的奇迹';
    case 'ra':
      return 'Ra：选择要抢走的未建奇迹';
    case 'minerva':
      return 'Minerva：选择棋子放置位置';
    case 'neptuneDiscard':
      return 'Neptune：选择弃掉（不生效）的军事 token';
    case 'neptuneApply':
      return 'Neptune：选择生效的军事 token';
    case 'gate':
      return 'Pantheon 之门：选择免费调用的神格';
    case 'theatreDeck':
      return '通神大剧场：选择要翻开的神话组';
    case 'theatrePick':
      return '通神大剧场：选择免费调用的神格';
    default:
      return god;
  }
}

function costAt(state: ReadableState, p: PlayerId, position: number): number {
  const pan = state.pantheon;
  if (!pan) return 0;
  const base = [3, 4, 5, 6, 7, 8][position] ?? 0;
  const mirrored = [8, 7, 6, 5, 4, 3][position] ?? 0;
  const cost = p === 0 ? base : mirrored;
  return state.players[p].wondersBuilt.includes('sanctuary') ? Math.max(0, cost - 2) : cost;
}
