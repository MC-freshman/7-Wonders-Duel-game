import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createSoloGame,
  soloApplyAction,
  soloLeaderTurn,
  soloFinalizeVictory,
  isLeaderAgoraPending,
  isLeaderPantheonPending,
} from '../../core/solo/index';
import type { SoloDecisionCardDef, SoloGame, SoloLeaderDef } from '../../core/solo/index';
import { publicView } from '../../core/visibility';
import type { GameAction } from '../../core/types';
import { sfx } from '../audio';
import { playSfxFor } from './useLocalGame';
import type { GameApi } from './types';

/* ------------------------------------------------------------------
 * M8 Solo（单人）数据源
 *
 * 与热座 / 人机不同：这里的「对手」是算法化的领袖，不是被操作的一方。
 * 因而本 hook：
 *   1) 自己持有 SoloGame 句柄（含独立的决策随机流），状态推进全在本端；
 *   2) 玩家（座位 0）行动后，自动连续驱动领袖回合，直到重新轮到玩家；
 *   3) 对外仍暴露与其它模式一致的 GameApi，UI 无需分支即可复用版图 / 覆盖层。
 * ------------------------------------------------------------------ */

export interface SoloInfo {
  /** 本局领袖 */
  leader: SoloLeaderDef;
  /** 领袖刚抽到的决策卡（展示用，让玩家能看懂领袖为何这样走） */
  lastDecision: SoloDecisionCardDef | null;
  /** 决策牌堆张数（base 12 / Pantheon 12 / Agora 12 / 合体 12） */
  deckSize: number;
  /** 本轮剩余未抽的决策卡（抽满即重洗） */
  deckLeft: number;
  pantheon: boolean;
  agora: boolean;
}

export interface SoloApi extends GameApi {
  solo: SoloInfo;
}

/** 当前是否轮到领袖行动（含领袖的待决） */
function leaderMustAct(g: SoloGame): boolean {
  const st = g.state;
  if (st.victory || st.phase === 'gameOver') return false;
  if (isLeaderAgoraPending(g) || isLeaderPantheonPending(g)) return true;
  if (st.pending) {
    const actor = st.pending.kind === 'startPlayer' ? st.pending.chooser : st.pending.player;
    return actor === g.leaderId;
  }
  return st.current === g.leaderId && (st.phase === 'playing' || st.phase === 'wonderDraft');
}

export function useSoloGame(
  enabled: boolean,
  pantheon: boolean,
  agora: boolean,
  leaderId: string | null,
): SoloApi {
  const gameRef = useRef<SoloGame | null>(null);
  const finalizedRef = useRef(false);
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e9));
  const [tick, setTick] = useState(0);
  const bump = useCallback(() => setTick((n) => n + 1), []);

  /* 建局 / 重建：扩展开关、领袖选择、种子任一变化都开新局 */
  useEffect(() => {
    if (!enabled) {
      gameRef.current = null;
      return;
    }
    gameRef.current = createSoloGame(seed, leaderId ?? undefined, { pantheon, agora });
    finalizedRef.current = false;
    bump();
  }, [enabled, seed, leaderId, pantheon, agora, bump]);

  /** 终局修正（Hammurabi +5 等）只结算一次 */
  const maybeFinalize = useCallback(() => {
    const g = gameRef.current;
    if (!g || finalizedRef.current) return;
    if (!g.state.victory) return;
    soloFinalizeVictory(g);
    finalizedRef.current = true;
  }, []);

  /** 连续驱动领袖回合，直到重新轮到玩家 / 终局 */
  const drive = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    let guard = 0;
    let lastSig = '';
    while (guard++ < 120 && leaderMustAct(g)) {
      soloLeaderTurn(g);
      const sig = `${g.state.log.length}|${g.state.current}|${g.state.phase}|${
        g.state.pending?.kind ?? '-'
      }|${g.state.victory ? 1 : 0}|${g.decisionHistory.length}`;
      if (sig === lastSig) break; // 无进展 → 停手，避免死循环
      lastSig = sig;
    }
    maybeFinalize();
    bump();
  }, [bump, maybeFinalize]);

  /* 轮到领袖 → 稍作停顿后一次性推演完（给玩家看清上一步的机会）。
     thinking 由 leaderMustAct 直接推导，避免「停顿期间短暂显示等待」的闪烁。 */
  useEffect(() => {
    const g = gameRef.current;
    if (!enabled || !g) return;
    if (g.state.victory || g.state.phase === 'gameOver') return;
    if (!leaderMustAct(g)) return;
    const t = setTimeout(drive, 420);
    return () => clearTimeout(t);
  }, [enabled, tick, drive]);

  const act = useCallback(
    (a: GameAction) => {
      sfx.unlock();
      const g = gameRef.current;
      if (!g) return;
      const before = g.state.log.length;
      soloApplyAction(g, a);
      playSfxFor(g.state, before); // 其中已含终局音效
      if (g.state.victory) maybeFinalize();
      bump();
    },
    [bump, maybeFinalize],
  );

  const restart = useCallback(() => {
    setSeed(Math.floor(Math.random() * 1e9));
  }, []);

  const g = gameRef.current;
  if (!g) {
    // 未启用时返回占位对象；App 只在 mode === 'solo' 时使用本 hook 的返回值
    return {
      view: null,
      actor: null,
      thinking: false,
      act,
      restart,
      online: null,
      interactive: true,
      solo: {
        leader: { id: '', name: '', zh: '', cardColor: 'green', replays: [], startProgress: [] },
        lastDecision: null,
        deckSize: 0,
        deckLeft: 0,
        pantheon,
        agora,
      },
    };
  }

  return {
    view: publicView(g.state, 0),
    actor: g.state.victory ? null : g.state.current,
    thinking: leaderMustAct(g),
    act,
    restart,
    online: null,
    interactive: true,
    solo: {
      leader: g.leader,
      lastDecision: g.lastDecision,
      deckSize: g.decisionCards.length,
      deckLeft: g.deck.length - g.deckIndex,
      pantheon: !!g.pantheon,
      agora: !!g.agora,
    },
  };
}
