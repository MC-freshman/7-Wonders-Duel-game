import { useCallback, useEffect, useRef, useState } from 'react';
import { activePlayer, applyAction, initialState } from '../../core/engine';
import type { ReplaySource } from '../../core/replay';
import { publicView } from '../../core/visibility';
import type { GameAction, GameState, PlayerId } from '../../core/types';
import { chooseAction, type Difficulty } from '../../ai';
import { sfx } from '../audio';
import type { GameApi } from './types';

/* ------------------------------------------------------------------
 * 本地热座 / 人机：状态就在本端，applyAction 直接推进
 * ------------------------------------------------------------------ */

export function useLocalGame(
  enabled: boolean,
  mode: 'hotseat' | 'ai',
  difficulty: Difficulty,
  pantheon = false,
  agora = false,
): GameApi {
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e9));
  const [state, setState] = useState<GameState>(() => initialState(seed, { pantheon, agora }));
  /** 供 effect 读取「当前种子」而不把 seed 放进依赖（否则重开会多触发一次） */
  const seedRef = useRef(seed);
  seedRef.current = seed;

  const actor = activePlayer(state);
  const aiTurn = enabled && mode === 'ai' && actor === 1 && !state.victory;

  /* 渲染视角（publicView 的 viewer）：
     - 热座：跟随当前行动者 —— Pantheon/Agora 的待决选项抽自暗牌堆，publicView
       只对「待决玩家本人」保留 options；此前漏传 viewer 导致热座下弹窗永远没有
       可选项、对局卡死（真实浏览器点击流验证时发现）。
     - 人机：屏幕前只有玩家 0，恒以玩家 0 视角渲染 —— AI 回合的私有待决选项
       （神格 2 选 1、密谋等）不得闪现给人类玩家。 */
  const viewer: PlayerId | null = mode === 'ai' ? 0 : actor;

  /* 扩展开关变化 → 立即按新设置重开一局。
     放在 effect 里而不是 restart() 内，是为了避开「setState 后同一帧调 restart 时
     闭包仍持有旧开关值」的陷阱（曾导致万神殿/市政广场开关与实况相反）；
     同时必须把 pantheon 与 agora 一起传入 initialState，否则会丢掉其中一个扩展。 */
  useEffect(() => {
    setState(initialState(seedRef.current, { pantheon, agora }));
  }, [pantheon, agora]);

  useEffect(() => {
    if (!aiTurn) return;
    const t = setTimeout(() => {
      const before = state.log.length;
      const { action } = chooseAction(state, 1, difficulty);
      const next = applyAction(state, action);
      setState(next);
      playSfxFor(next, before);
    }, 300);
    return () => clearTimeout(t);
  }, [aiTurn, state, difficulty]);

  const act = useCallback((a: GameAction) => {
    sfx.unlock();
    setState((prev) => {
      const before = prev.log.length;
      const next = applyAction(prev, a);
      playSfxFor(next, before);
      return next;
    });
  }, []);

  const restart = useCallback(() => {
    const s = Math.floor(Math.random() * 1e9);
    setSeed(s);
    setState(initialState(s, { pantheon, agora }));
  }, [pantheon, agora]);

  /** 复盘数据：种子 + 完整日志 + 开局选项。回放时从种子重放即可还原任意一帧 */
  const replay = useCallback(
    (): ReplaySource => ({
      seed,
      log: state.log,
      names: ['玩家一', '玩家二'],
      options: { pantheon, agora },
    }),
    [seed, state.log, pantheon, agora],
  );

  return {
    view: publicView(state, viewer),
    actor,
    thinking: aiTurn,
    act,
    restart,
    online: null,
    interactive: true,
    replay,
  };
}

/** 根据新产生的日志条目播放对应音效 */
export function playSfxFor(next: GameState, fromLog: number): void {
  const entries = next.log.slice(fromLog);
  const text = entries.map((e) => e.text).join(' ');
  if (text.includes('时代') && text.includes('开始')) return void sfx.play('age');
  for (const e of entries) {
    const t = e.text;
    if (t.startsWith('建造奇迹')) sfx.play('wonder');
    else if (t.startsWith('建造')) sfx.play('build');
    else if (t.startsWith('弃掉')) sfx.play('discard');
    else if (t.startsWith('翻开')) sfx.play('reveal');
    else if (t.startsWith('获得发展标记')) sfx.play('token');
    else if (t.includes('对手失去')) sfx.play('fine');
    else if (t.startsWith('摧毁')) sfx.play('fine');
    else if (t.includes('进入「')) sfx.play('shield');
  }
  if (next.victory) sfx.play(next.victory.winner === 0 || next.victory.type === 'draw' ? 'win' : 'lose');
}
