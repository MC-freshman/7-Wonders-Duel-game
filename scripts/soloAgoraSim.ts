/* ------------------------------------------------------------------
 * M8-A Agora Solo 仿真：玩家(0)=AI，领袖(1)=Agora 决策卡逻辑
 *
 * 验证：
 *   1) 无异常 / 无死锁（参议员、阴谋、参议院行动全流程可跑通）
 *   2) 不变量：金币非负、参议院方块每人 ≤12、6 个议厅、奇迹总数 ≤7
 *   3) Agora 机制真的被触发：参议员招募数、密谋触发数、
 *      各领袖控制议厅数分布
 *
 * 用法：npm run soloAgoraSim -- <每领袖局数> [medium|hard]
 * ------------------------------------------------------------------ */

import {
  createSoloGame,
  soloApplyAction,
  soloLeaderTurn,
  soloFinalizeVictory,
  isLeaderAgoraPending,
  soloAgoraLeaders,
} from '../src/core/solo/index';
import { SOLO_LEADERS } from '../src/core/solo/data';
import { chooseAction, type Difficulty } from '../src/ai/index';
import { legalActions } from '../src/core/engine';
import type { GameState, PlayerId } from '../src/core/types';

const DIFF: Difficulty = (process.argv[3] as Difficulty) || 'medium';
const PER_LEADER = Number(process.argv[2]) || 12;

interface Res {
  ok: boolean;
  stuck: boolean;
  err?: string;
  winner: PlayerId | null;
  age: number;
  ls: number;
  hs: number;
  senators: number;
  triggered: number;
  leaderChambers: number;
  leaderCubes: number;
  decisions: number;
  agoraIconDrawn: number;
}

function assertInvariants(state: GameState): string | null {
  for (const p of state.players) {
    if (p.coins < 0) return `负数金币 p${p.id}=${p.coins}`;
    if (p.wondersBuilt.length + p.wondersUnbuilt.length > 8) return `奇迹数异常 p${p.id}`;
  }
  if (state.wondersBuiltTotal > 7) return `已建奇迹总数 ${state.wondersBuiltTotal} > 7`;
  if (state.agora) {
    if (state.agora.senate.chambers.length !== 6) return `议厅数 ${state.agora.senate.chambers.length} ≠ 6`;
    for (let i = 0; i < 6; i++) {
      for (const pid of [0, 1] as PlayerId[]) {
        const n = state.agora.senate.chambers[i].cubes[pid];
        if (n < 0) return `负方块 ch${i} p${pid}`;
      }
    }
    for (const pid of [0, 1] as PlayerId[]) {
      const total = state.agora.senate.chambers.reduce((s, ch) => s + ch.cubes[pid], 0);
      if (total > 12) return `p${pid} 参议院方块 ${total} > 12`;
    }
  }
  return null;
}

function playOne(seed: number, leaderId: string): Res {
  const game = createSoloGame(seed, leaderId, { agora: true });
  let guard = 0;
  let stuck = false;
  let agoraIconDrawn = 0;

  // 统计
  let triggered = 0;
  const seenTriggered = new Set<string>();

  while (!game.state.victory && game.state.phase !== 'gameOver' && guard++ < 1500) {
    const st = game.state;
    if (st.pending) {
      const actor = st.pending.kind === 'startPlayer' ? st.pending.chooser : st.pending.player;
      const acts = legalActions(st, actor);
      if (acts.length === 0) {
        stuck = true;
        break;
      }
      if (actor === game.leaderId) soloLeaderTurn(game);
      else soloApplyAction(game, acts[0]);
      continue;
    }
    if (isLeaderAgoraPending(game)) {
      const before = game.state.players[1].agora.triggered.length;
      soloLeaderTurn(game);
      if (game.state.players[1].agora.triggered.length > before) triggered++;
      continue;
    }
    if (st.current === game.leaderId) {
      const before = game.state.players[1].agora.triggered.length;
      const histBefore = game.decisionHistory.length;
      soloLeaderTurn(game);
      if (game.decisionHistory.length > histBefore && game.decisionHistory[histBefore]?.card.agoraIcon) {
        agoraIconDrawn++;
      }
      if (game.state.players[1].agora.triggered.length > before) triggered++;
    } else {
      const dec = chooseAction(st, 0, DIFF);
      if (!dec || !dec.action) {
        stuck = true;
        break;
      }
      soloApplyAction(game, dec.action);
    }
    // 记录引擎自己触发的密谋
    for (const t of game.state.players[1].agora.triggered) {
      if (!seenTriggered.has(t)) seenTriggered.add(t);
    }
  }

  // 兜底：未走到终局即视为 stuck（可捕获「不消耗牌阵的失控循环」）
  if (!game.state.victory) stuck = true;
  const err = assertInvariants(game.state);
  soloFinalizeVictory(game);
  const bd = game.state.victory?.breakdown;
  return {
    ok: !stuck && !err,
    stuck,
    err: err ?? undefined,
    winner: game.state.victory?.winner ?? null,
    age: game.state.age,
    ls: bd?.find((x) => x.player === 1)?.total ?? 0,
    hs: bd?.find((x) => x.player === 0)?.total ?? 0,
    senators: game.state.players[1].agora.senators.length,
    triggered: Math.max(triggered, seenTriggered.size),
    leaderChambers: (() => {
      if (!game.state.agora) return 0;
      let n = 0;
      for (let c = 0; c < 6; c++) {
        const ch = game.state.agora.senate.chambers[c];
        if (ch.cubes[1] > ch.cubes[0]) n++;
      }
      return n;
    })(),
    leaderCubes: game.state.agora
      ? game.state.agora.senate.chambers.reduce((s2, ch) => s2 + ch.cubes[1], 0)
      : 0,
    decisions: game.decisionHistory.length,
    agoraIconDrawn,
  };
}

interface Agg {
  games: number;
  leaderWins: number;
  humanWins: number;
  draws: number;
  stuck: number;
  errors: string[];
  senSum: number;
  trigSum: number;
  chamSum: number;
  cubeSum: number;
  iconSum: number;
  lsSum: number;
  hsSum: number;
  age3: number;
}

console.log(`\n=== M8-A Agora Solo 仿真（每领袖 ${PER_LEADER} 局，玩家=${DIFF} AI）===\n`);

const leaders = soloAgoraLeaders(SOLO_LEADERS);
const totals = new Map<string, Agg>();
let totalErr = 0;

for (const ld of leaders) {
  const s: Agg = {
    games: 0, leaderWins: 0, humanWins: 0, draws: 0, stuck: 0, errors: [],
    senSum: 0, trigSum: 0, chamSum: 0, cubeSum: 0, iconSum: 0, lsSum: 0, hsSum: 0, age3: 0,
  };
  for (let i = 0; i < PER_LEADER; i++) {
    const seed = 1000 + i * 37;
    let r: Res;
    try {
      r = playOne(seed, ld.id);
    } catch (e) {
      s.errors.push(`seed=${seed}: ${(e as Error).message}`);
      totalErr++;
      continue;
    }
    s.games++;
    if (r.stuck) s.stuck++;
    if (r.err) { s.errors.push(`seed=${seed}: ${r.err}`); totalErr++; }
    if (r.winner === 1) s.leaderWins++;
    else if (r.winner === 0) s.humanWins++;
    else s.draws++;
    s.senSum += r.senators;
    s.trigSum += r.triggered;
    s.chamSum += r.leaderChambers;
    s.cubeSum += r.leaderCubes;
    s.iconSum += r.agoraIconDrawn;
    s.lsSum += r.ls;
    s.hsSum += r.hs;
    if (r.age >= 3) s.age3++;
  }
  totals.set(ld.id, s);
  const v = s.games || 1;
  const f = (n: number) => (n / v).toFixed(1);
  console.log(
    `${ld.zh.padEnd(5)} | 局数 ${s.games} | 领袖胜 ${s.leaderWins} | 玩家胜 ${s.humanWins} | 平 ${s.draws} ` +
      `| 均分 ${f(s.lsSum)}/${f(s.hsSum)} ` +
      `| 参议员 ${f(s.senSum)} 张 · 密谋 ${f(s.trigSum)} 次 · Agora卡 ${f(s.iconSum)} 张 · 方块 ${f(s.cubeSum)} · 控厅 ${f(s.chamSum)}/6 ` +
      `| 时代III ${(s.age3 / v * 100).toFixed(0)}% | stuck ${s.stuck}` +
      (s.errors.length ? ` | ⚠错误 ${s.errors.length}` : ''),
  );
  if (s.errors.length) s.errors.slice(0, 3).forEach((e) => console.log('    ', e));
}

console.log(`\n总计不变量错误：${totalErr}`);
const allOk = [...totals.values()].every((s) => s.stuck === 0 && s.errors.length === 0);
console.log(allOk ? '✅ 全部对局通过（无 stuck、无不变量错误）' : '⚠️ 存在 stuck / 错误，见上表');
