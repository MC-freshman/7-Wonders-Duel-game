import type { GameAction, PlayerId } from '../../core/types';
import type { AgoraStep } from '../../core/types';
import { CARD_BY_ID, CONSPIRACY_BY_ID, DEGREE_BY_ID, PROGRESS_BY_ID, WONDER_BY_ID } from '../../core/data';

/* ------------------------------------------------------------------
 * Agora 选择弹窗：处理 pending(kind='agora') 的全部步骤类型
 * ------------------------------------------------------------------ */

interface LabeledOption {
  value: string;
  title: string;
  desc?: string;
}

function labelFor(step: AgoraStep, value: string): LabeledOption {
  switch (step.kind) {
    case 'conspiratorChoose': {
      if (value === 'place') return { value, title: '放置 1 方块', desc: '放到任意 chamber' };
      if (value === 'conspire') return { value, title: 'Conspire', desc: '抽 2 张密谋、选 1 面朝下保留' };
      if (value === 'skip') return { value, title: '跳过' };
      const c = CONSPIRACY_BY_ID[value];
      return { value, title: c ? `立即触发「${c.zh}」` : value, desc: c?.text };
    }
    case 'conspireKeep': {
      const c = CONSPIRACY_BY_ID[value];
      return { value, title: c ? `保留「${c.zh}」` : value, desc: c?.text };
    }
    case 'conspireDiscard': {
      return value === 'top'
        ? { value, title: '放回牌库顶' }
        : { value, title: '放回牌库底' };
    }
    case 'pickBuild': {
      const card = CARD_BY_ID[value];
      return { value, title: card ? `建造「${card.zh}」` : value, desc: card?.text };
    }
    case 'pickOppCard': {
      const card = CARD_BY_ID[value];
      const verb =
        step.kind === 'pickOppCard' ? '' : '';
      void verb;
      return { value, title: card ? `「${card.zh}」` : value, desc: card?.text };
    }
    case 'pickOppWonder': {
      const w = WONDER_BY_ID[value];
      return {
        value,
        title: w ? `${step.mode === 'destroy' ? '拆掉' : '夺走'}「${w.zh}」` : value,
        desc: w?.text,
      };
    }
    case 'pickProgress': {
      const t = PROGRESS_BY_ID[value];
      return {
        value,
        title: t ? `${step.mode === 'steal' ? '偷走' : '选取'}「${t.zh}」` : value,
        desc: t?.text,
      };
    }
    case 'pickWonderGive': {
      const card = CARD_BY_ID[value];
      return { value, title: card ? `给出「${card.zh}」` : value, desc: card?.text };
    }
    case 'pickDecreeMove': {
      return { value, title: `第 ${Number(value) + 1} 议厅` };
    }
    case 'pickTrigger': {
      const c = CONSPIRACY_BY_ID[value];
      return { value, title: c ? `触发「${c.zh}」` : '跳过', desc: c?.text };
    }
    case 'optMoveOrSkip': {
      return { value, title: '跳过移动' };
    }
    default:
      return { value, title: value };
  }
}

function stepTitle(step: AgoraStep): { title: string; desc: string } {
  switch (step.kind) {
    case 'conspiratorChoose':
      return { title: '密谋者：选择行动', desc: '放置 1 方块，或 Conspire 抽密谋' };
    case 'conspireKeep':
      return { title: 'Conspire：选择要保留的密谋', desc: '选中的面朝下保留，另一张放回牌库' };
    case 'conspireDiscard':
      return { title: '另一张密谋放回哪里？', desc: '' };
    case 'pickBuild':
      return { title: '选择要建造/弃掉的卡', desc: '' };
    case 'pickOppCard':
      return { title: '选择对手的一张卡', desc: '' };
    case 'pickOppWonder':
      return { title: '选择对手的一座奇迹', desc: '' };
    case 'pickProgress':
      return { title: '选择一枚进度 token', desc: '' };
    case 'pickWonderGive':
      return { title: '选择你给出的同色卡', desc: '' };
    case 'pickDecreeMove':
      return { title: '选择议厅', desc: '' };
    case 'pickTrigger':
      return { title: '元老院议事室：立即触发一张密谋？', desc: '' };
    case 'optMoveOrSkip':
      return { title: '可选：移动 1 方块到相邻议厅', desc: '' };
    default:
      return { title: '做出选择', desc: '' };
  }
}

export function AgoraOverlay({
  pend,
  onAct,
}: {
  pend: { player: PlayerId; steps: AgoraStep[]; payload?: string };
  onAct: (a: GameAction) => void;
}) {
  const step = pend.steps[0];
  if (!step) return null;
  const p: PlayerId = pend.player;
  const who = p === 0 ? '玩家一' : '玩家二';
  const { title, desc } = stepTitle(step);
  // pickChamber 的 SENATE_PLACE/MOVE/REMOVE 动作由 SenateBar 生成，这里只处理 CHOOSE_AGORA 类
  if (step.kind === 'pickChamber') return null;

  const options = step.options.map((v) => labelFor(step, v));

  return (
    <div className="overlay">
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        <p className="desc">
          {who} · {desc}
        </p>
        <div className="option-grid">
          {options.map((o) => (
            <button
              className="option"
              key={o.value}
              onClick={() => onAct({ type: 'CHOOSE_AGORA', player: p, choice: o.value })}
            >
              <div className="t">{o.title}</div>
              {o.desc && <div className="d">{o.desc}</div>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** 玩家面板里的密谋手牌 / 准备区展示（供 PlayerPanel 调用） */
export function conspiracyLabel(id: string): string {
  return CONSPIRACY_BY_ID[id]?.zh ?? '未知密谋';
}

export function decreeLabel(id: string): string {
  return DEGREE_BY_ID[id]?.zh ?? id;
}
