import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { activePlayer } from '../../core/engine';
import {
  createSoloRunner,
  entriesForStep,
  replayLength,
  replayTo,
  type ReplaySource,
  type SoloRunner,
  type SoloRunInfo,
} from '../../core/replay';
import { publicView } from '../../core/visibility';
import type { GameAction, GameState, LogEntry } from '../../core/types';
import type { GameApi, ReplayControls } from './types';

/* ------------------------------------------------------------------
 * 复盘 / 观战：把「种子 + 动作日志」当作一个只读的对战源
 *
 * 不保存任何中间快照——每次跳转都从 initialState(seed) 重放前 N 个动作。
 * 单局约 70 个动作，重放耗时在毫秒级，换来的是任意跳转都能得到精确的历史画面。
 *
 * Solo 源例外：领袖回合要按实况同一节奏交替重演，故持有一个 `SoloRunner`
 * 增量推进（向后跳时它自己从 seed 重建），避免每帧整体重放。
 * ------------------------------------------------------------------ */

/** 每一步之间的基础间隔（毫秒），再按倍速缩放 */
const STEP_MS = 900;
export const SPEEDS = [0.5, 1, 2, 4] as const;

export interface ReplayApi extends GameApi, ReplayControls {
  /** 本步产生的日志条目（说明这一步发生了什么） */
  stepEntries: LogEntry[];
  /** 下一步要执行的动作，供 UI 做「即将发生」提示 */
  nextAction: GameAction | null;
  /** Solo 复盘时的顶条信息（领袖 / 决策卡 / 牌堆），其它模式为 null */
  solo: SoloRunInfo | null;
}

export function useReplayGame(source: ReplaySource, onExit: () => void): ReplayApi {
  const total = useMemo(() => replayLength(source.log), [source]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<number>(1);

  /* 自动播放：到底自动停 */
  useEffect(() => {
    if (!playing) return;
    if (index >= total) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setIndex((i) => i + 1), STEP_MS / speed);
    return () => clearTimeout(t);
  }, [playing, index, total, speed]);

  const runnerRef = useRef<SoloRunner | null>(null);
  const runnerSrcRef = useRef<ReplaySource | null>(null);
  if (source.solo && runnerSrcRef.current !== source) {
    runnerSrcRef.current = source;
    runnerRef.current = createSoloRunner(source);
  }

  const frame = useMemo((): { state: GameState; solo: SoloRunInfo | null } => {
    const runner = runnerRef.current;
    if (runner) return { state: (runner.seek(index), runner.game.state), solo: runner.info() };
    return { state: replayTo(source, index), solo: null };
  }, [source, index]);

  const state = frame.state;
  const view = useMemo(() => publicView(state), [state]);
  const actor = activePlayer(state);

  const stepEntries = useMemo(() => entriesForStep(source.log, index), [source, index]);

  const nextAction = useMemo(() => {
    if (index >= total) return null;
    let seen = 0;
    for (const e of source.log) {
      if (e.action) {
        seen += 1;
        if (seen === index + 1) return e.action;
      }
    }
    return null;
  }, [source, index, total]);

  const goto = useCallback(
    (i: number) => {
      setIndex(Math.max(0, Math.min(i, total)));
    },
    [total],
  );

  const step = useCallback(
    (d: number) => {
      setPlaying(false);
      goto(index + d);
    },
    [goto, index],
  );

  const toggle = useCallback(() => {
    setPlaying((p) => {
      // 已在末尾时按播放，则从头开始
      if (!p && index >= total) setIndex(0);
      return !p;
    });
  }, [index, total]);

  const setSpeedSafe = useCallback((s: number) => setSpeed(s), []);
  const exit = useCallback(() => {
    setPlaying(false);
    onExit();
  }, [onExit]);

  return {
    view,
    actor,
    thinking: false,
    act: () => undefined,
    restart: () => setIndex(0),
    online: null,
    interactive: false,
    index,
    total,
    playing,
    speed,
    goto,
    step,
    toggle,
    setSpeed: setSpeedSafe,
    exit,
    stepEntries,
    nextAction,
    solo: frame.solo,
  };
}
