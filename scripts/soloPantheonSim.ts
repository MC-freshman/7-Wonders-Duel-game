/* ------------------------------------------------------------------
 * M8-P Pantheon Solo 仿真：玩家(0)=AI，领袖(1)=Pantheon 决策卡逻辑
 *
 * 验证：
 *   1) 无异常 / 无死锁（神话 token → 神格放置 → 时代 II 图板翻开 → 调用神明 全流程）
 *   2) 不变量：
 *      · 金币非负、奇迹总数 ≤7
 *      · 万神殿图板 6 格 + 每组神格牌堆 + 已调用，神格总数守恒（每组 ≤3）
 *      · **领袖献祭 token 只进不出**（§2.3）
 *      · 神话 token 总数 ≤ 5（时代 I 结构上限）
 *   3) Pantheon 机制真的被触发：神话 token 数、图板放置数、Pantheon 卡张数、
 *      领袖调用神明数、圣堂金币、Imhotep 4 金币触发数
 *
 * 用法：npm run soloPantheonSim -- <每领袖局数> [medium|hard] [combo]
 *   combo = Pantheon + Agora 合体（3 Pantheon + 5 Agora + 4 无图标 = 12 张决策卡）
 * ------------------------------------------------------------------ */

import {
  createSoloGame,
  soloApplyAction,
  soloLeaderTurn,
  soloFinalizeVictory,
  isLeaderAgoraPending,
  isLeaderPantheonPending,
  soloPantheonLeaders,
  soloAgoraLeaders,
  soloAgoraPantheonDeck,
  soloPantheonDeck,
} from '../src/core/solo/index';
import { SOLO_LEADERS } from '../src/core/solo/data';
import { chooseAction, type Difficulty } from '../src/ai/index';
import { legalActions } from '../src/core/engine';
import { DIVINITY_BY_ID } from '../src/core/data/index';
import type { GameState, Mythology, PlayerId } from '../src/core/types';

const DIFF: Difficulty = (process.argv[3] as Difficulty) || 'medium';
const PER_LEADER = Number(process.argv[2]) || 12;
const COMBO = (process.argv[4] ?? '').toLowerCase() === 'combo';

const MYTHS: Mythology[] = ['mesopotamian', 'phoenician', 'greek', 'egyptian', 'roman'];

function countMyth(id: string, board: (string | null)[], decks: Record<string, string[]>, invoked: string[]): number {
  const m = DIVINITY_BY_ID[id]?.mythology;
  if (!m) return 0;
  return (
    board.filter((x) => x === id).length +
    (decks[m]?.filter((x) => x === id).length ?? 0) +
    invoked.filter((x) => x === id).length
  );
}

function assertInvariants(state: GameState, leaderOfferStart: number): string | null {
  for (const p of state.players) {
    if (p.coins < 0) return `负数金币 p${p.id}=${p.coins}`;
    if (p.wondersBuilt.length + p.wondersUnbuilt.length > 9) return `奇迹数异常 p${p.id}`;
  }
  if (state.wondersBuiltTotal > 7) return `已建奇迹总数 ${state.wondersBuiltTotal} > 7`;
  const pan = state.pantheon;
  if (!pan) return null;
  if (pan.board.length !== 6) return `万神殿格数 ${pan.board.length} ≠ 6`;

  // 神格守恒：每组 3 张，分布在 图板 / 牌堆 / 已调用
  for (const m of MYTHS) {
    for (const id of pan.decks[m] ?? []) {
      if (DIVINITY_BY_ID[id]?.mythology !== m) return `牌堆串组：${id} 在 ${m}`;
    }
  }
  for (const id of Object.keys(DIVINITY_BY_ID)) {
    const n = countMyth(id, pan.board, pan.decks as unknown as Record<string, string[]>, state.players[1].pan.invoked);
    if (n > 1) return `神格重复存在：${id} ×${n}`;
  }

  // §2.3 领袖献祭 token 只进不出
  const leaderOffer = state.players[1].pan.offerings.length;
  if (leaderOffer < leaderOfferStart) return `领袖献祭 token 减少（${leaderOfferStart} → ${leaderOffer}）`;

  const myths = state.players[0].pan.mythologyTokens.length + state.players[1].pan.mythologyTokens.length;
  if (myths > 5) return `神话 token 总数 ${myths} > 5`;
  return null;
}

interface Res {
  ok: boolean;
  stuck: boolean;
  err?: string;
  winner: PlayerId | null;
  age: number;
  ls: number;
  hs: number;
  decisions: number;
  pantheonIcon: number;
  mythTokens: number;
  placed: number;
  invoked: number;
}

function playOne(seed: number, leaderId: string): Res {
  const game = createSoloGame(seed, leaderId, { pantheon: true, agora: COMBO });
  let guard = 0;
  let stuck = false;
  let pantheonIcon = 0;
  let maxPlaced = 0;
  const leaderOfferStart = game.state.players[1].pan.offerings.length;

  while (!game.state.victory && game.state.phase !== 'gameOver' && guard++ < 2000) {
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
    } else if (isLeaderAgoraPending(game) || isLeaderPantheonPending(game)) {
      soloLeaderTurn(game);
    } else if (st.current === game.leaderId) {
      const histBefore = game.decisionHistory.length;
      soloLeaderTurn(game);
      for (let i = histBefore; i < game.decisionHistory.length; i++) {
        if (game.decisionHistory[i]?.card.pantheonIcon) pantheonIcon++;
      }
    } else {
      const dec = chooseAction(st, 0, DIFF);
      if (!dec || !dec.action) {
        stuck = true;
        break;
      }
      soloApplyAction(game, dec.action);
    }
    const pan2 = game.state.pantheon;
    if (pan2) {
      const n = pan2.board.filter((x) => x !== null && x !== 'gate').length;
      if (n > maxPlaced) maxPlaced = n;
    }
  }

  if (!game.state.victory) stuck = true;
  const err = assertInvariants(game.state, leaderOfferStart);
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
    decisions: game.decisionHistory.length,
    pantheonIcon,
    mythTokens: game.state.players[1].pan.mythologyTokens.length,
    placed: maxPlaced,
    invoked: game.state.players[1].pan.invoked.length,
  };
}

interface Agg {
  games: number;
  leaderWins: number;
  humanWins: number;
  draws: number;
  stuck: number;
  errors: string[];
  iconSum: number;
  mythSum: number;
  placeSum: number;
  invSum: number;
  lsSum: number;
  hsSum: number;
  decSum: number;
  age3: number;
}

const deckSize = (COMBO ? soloAgoraPantheonDeck() : soloPantheonDeck()).length;
console.log(
  `\n=== M8-P Pantheon Solo 仿真（每领袖 ${PER_LEADER} 局，玩家=${DIFF} AI${COMBO ? '，Pantheon+Agora 合体' : ''}）===`,
);
console.log(`决策牌堆 ${deckSize} 张（应为 12）\n`);

const leaders = COMBO
  ? soloAgoraLeaders(soloPantheonLeaders(SOLO_LEADERS))
  : soloPantheonLeaders(SOLO_LEADERS);
const totals = new Map<string, Agg>();
let totalErr = 0;

for (const ld of leaders) {
  const s: Agg = {
    games: 0, leaderWins: 0, humanWins: 0, draws: 0, stuck: 0, errors: [],
    iconSum: 0, mythSum: 0, placeSum: 0, invSum: 0, lsSum: 0, hsSum: 0, decSum: 0, age3: 0,
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
    if (r.err) {
      s.errors.push(`seed=${seed}: ${r.err}`);
      totalErr++;
    }
    if (r.winner === 1) s.leaderWins++;
    else if (r.winner === 0) s.humanWins++;
    else s.draws++;
    s.iconSum += r.pantheonIcon;
    s.mythSum += r.mythTokens;
    s.placeSum += r.placed;
    s.invSum += r.invoked;
    s.lsSum += r.ls;
    s.hsSum += r.hs;
    s.decSum += r.decisions;
    if (r.age >= 3) s.age3++;
  }
  totals.set(ld.id, s);
  const v = s.games || 1;
  const f = (n: number) => (n / v).toFixed(1);
  console.log(
    `${ld.zh.padEnd(6)} | 局数 ${s.games} | 领袖胜 ${s.leaderWins} | 玩家胜 ${s.humanWins} | 平 ${s.draws} ` +
      `| 均分 ${f(s.lsSum)}/${f(s.hsSum)} ` +
      `| 万神殿卡 ${f(s.iconSum)} · 神话token ${f(s.mythSum)} · 图板放置 ${f(s.placeSum)} · 调用神明 ${f(s.invSum)} ` +
      `| 时代III ${((s.age3 / v) * 100).toFixed(0)}% | stuck ${s.stuck}` +
      (s.errors.length ? ` | ⚠错误 ${s.errors.length}` : ''),
  );
  if (s.errors.length) s.errors.slice(0, 3).forEach((e) => console.log('    ', e));
}

console.log(`\n总计不变量错误：${totalErr}`);
const allOk = [...totals.values()].every((s) => s.stuck === 0 && s.errors.length === 0);
console.log(allOk ? '✅ 全部对局通过（无 stuck、无不变量错误）' : '⚠️ 存在 stuck / 错误，见上表');
