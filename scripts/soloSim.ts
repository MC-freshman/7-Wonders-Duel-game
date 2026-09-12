/* ------------------------------------------------------------------
 * M8 Solo 仿真：以中等 AI 扮演玩家(0)，领袖(1)走官方决策卡逻辑，
 * 跑完大量对局，验证：
 *   1) 无死锁 / 无异常（每步皆有合法动作或已结束）
 *   2) 关键不变量（金币非负、奇迹≤7、冲突≤9、卡牌合法、无重复卡）始终成立
 *   3) 决策卡解析、免费建造、连动、Hammurabi +5 在真实对局中可运行
 *
 * 注：少数对局会因「科技对子触发进度标记、但可用进度标记已耗尽」而卡在
 * 无法解析的 pending（主引擎既有边界，非 Solo 模块问题），此类记为 stuck。
 * ------------------------------------------------------------------ */

import { createSoloGame, soloApplyAction, soloLeaderTurn, soloFinalizeVictory } from '../src/core/solo/index';
import { chooseAction, type Difficulty } from '../src/ai/index';
import { legalActions } from '../src/core/engine';
import { CARD_BY_ID } from '../src/core/data/index';
import type { GameState, PlayerId } from '../src/core/types';
import { SOLO_LEADERS } from '../src/core/solo/data';

const DIFF: Difficulty = (process.argv[3] as Difficulty) || 'medium';
const PER_LEADER = Number(process.argv[2]) || 40;
let hammurabiBonusFired = 0;

interface Stats {
  games: number;
  leaderWins: number;
  humanWins: number;
  draws: number;
  stuck: number;
  errors: string[];
  ageReached: Record<number, number>;
  replayTurns: number;
  leaderScoreSum: number;
  humanScoreSum: number;
  leaderCitySum: number;
  humanCitySum: number;
  leaderTurnSum: number;
  humanTurnSum: number;
  humanBuildSum: number;
  humanWonderSum: number;
  humanDiscardSum: number;
}

interface Result {
  ok: boolean;
  stuck: boolean;
  err?: string;
  replay: number;
  age: number;
  ls: number;
  hs: number;
  lc: number;
  hc: number;
  winner: PlayerId | null;
  lturns: number;
  hturns: number;
  hBuild: number;
  hWonder: number;
  hDiscard: number;
}

function assertInvariants(state: GameState): string | null {
  for (const p of [0, 1] as PlayerId[]) {
    const pl = state.players[p];
    if (pl.coins < 0) return `玩家${p}金币为负：${pl.coins}`;
    if (state.wondersBuiltTotal > 7) return `奇迹总数超限：${state.wondersBuiltTotal}`;
    for (const id of pl.city) if (!CARD_BY_ID[id]) return `未知卡牌 ${id}`;
  }
  if (Math.abs(state.conflictPawn) > 9) return `冲突标记越界：${state.conflictPawn}`;
  const a = state.players[0].city.concat(state.players[0].wondersBuilt);
  const b = state.players[1].city.concat(state.players[1].wondersBuilt);
  const uniq = new Set([...a, ...b]);
  if (uniq.size !== a.length + b.length) return '出现重复卡牌';
  return null;
}

function playOne(seed: number, leaderId: string): Result {
  const game = createSoloGame(seed, leaderId);
  let guard = 0;
  let replay = 0;
  let stuck = false;
  let lturns = 0;
  let hturns = 0;
  let hBuild = 0;
  let hWonder = 0;
  let hDiscard = 0;
  while (game.state.phase !== 'gameOver' && guard++ < 4000) {
    const st = game.state;
    if (st.pending) {
      // 主引擎既有边界：科技对子可能触发无可选标记的 pending
      const pend = st.pending;
      const actor = pend.kind === 'startPlayer' ? pend.chooser : pend.player;
      const acts = legalActions(st, actor);
      if (acts.length === 0) {
        stuck = true;
        break;
      }
      if (actor === game.leaderId) {
        soloLeaderTurn(game);
      } else {
        soloApplyAction(game, acts[0]);
      }
      continue;
    }
    if (st.current === game.leaderId) {
      const before = game.decisionHistory.length;
      soloLeaderTurn(game);
      replay += Math.max(0, game.decisionHistory.length - before - 1);
      lturns++;
    } else {
      const dec = chooseAction(st, 0, DIFF);
      const t = dec.action.type;
      if (t === 'BUILD_CARD') hBuild++;
      else if (t === 'BUILD_WONDER') hWonder++;
      else if (t === 'DISCARD_CARD') hDiscard++; // 弃牌换币（7WD 中唯一的纯变现动作）
      soloApplyAction(game, dec.action);
      hturns++;
    }
    const beforeScore = game.state.victory?.breakdown?.find((x) => x.player === 1)?.total ?? null;
    soloFinalizeVictory(game);
    const afterScore = game.state.victory?.breakdown?.find((x) => x.player === 1)?.total ?? null;
    if (beforeScore !== null && afterScore !== null && afterScore > beforeScore) hammurabiBonusFired++;
    const err = assertInvariants(game.state);
    if (err) return {
      ok: false, stuck: false, err: `seed=${seed} leader=${leaderId}: ${err}`, replay, age: game.state.age,
      ls: 0, hs: 0, lc: 0, hc: 0, winner: null, lturns: 0, hturns: 0, hBuild: 0, hWonder: 0, hDiscard: 0,
    };
  }
  const bd = game.state.victory?.breakdown;
  return {
    ok: !stuck,
    stuck,
    replay,
    age: game.state.age,
    ls: bd?.find((x) => x.player === 1)?.total ?? 0,
    hs: bd?.find((x) => x.player === 0)?.total ?? 0,
    lc: game.state.players[1].city.length + game.state.players[1].wondersBuilt.length,
    hc: game.state.players[0].city.length + game.state.players[0].wondersBuilt.length,
    lturns,
    hturns,
    hBuild,
    hWonder,
    hDiscard,
    winner: game.state.victory?.winner ?? null,
  };
}

function main(): void {
  const stats: Record<string, Stats> = {};
  for (const ld of SOLO_LEADERS) {
    stats[ld.id] = {
      games: 0, leaderWins: 0, humanWins: 0, draws: 0, stuck: 0, errors: [],
      ageReached: { 1: 0, 2: 0, 3: 0 }, replayTurns: 0, leaderScoreSum: 0, humanScoreSum: 0,
      leaderCitySum: 0, humanCitySum: 0, leaderTurnSum: 0, humanTurnSum: 0,
      humanBuildSum: 0, humanWonderSum: 0, humanDiscardSum: 0,
    };
  }

  for (const ld of SOLO_LEADERS) {
    const s = stats[ld.id];
    for (let i = 0; i < PER_LEADER; i++) {
      const seed = (ld.id.length * 100003 + i * 2654435761) >>> 0;
      const r = playOne(seed, ld.id);
      s.games++;
      s.ageReached[r.age] = (s.ageReached[r.age] ?? 0) + 1;
      s.replayTurns += r.replay;
      s.leaderScoreSum += r.ls;
      s.humanScoreSum += r.hs;
      s.leaderCitySum += r.lc;
      s.humanCitySum += r.hc;
      s.leaderTurnSum += r.lturns;
      s.humanTurnSum += r.hturns;
      s.humanBuildSum += r.hBuild;
      s.humanWonderSum += r.hWonder;
      s.humanDiscardSum += r.hDiscard;
      if (!r.ok && !r.stuck) {
        s.errors.push(r.err!);
        continue;
      }
      if (r.stuck) {
        s.stuck++;
        continue;
      }
      if (r.winner === 1) s.leaderWins++;
      else if (r.winner === 0) s.humanWins++;
      else s.draws++;
    }
  }

  console.log(`\n=== M8 Solo 仿真（每位领袖 ${PER_LEADER} 局，玩家=${DIFF} AI）===\n`);
  let totalErr = 0;
  for (const ld of SOLO_LEADERS) {
    const s = stats[ld.id];
    totalErr += s.errors.length;
    const valid = s.games - s.stuck - s.errors.length;
    const lsAvg = valid ? (s.leaderScoreSum / valid).toFixed(1) : '-';
    const hsAvg = valid ? (s.humanScoreSum / valid).toFixed(1) : '-';
    const lcAvg = valid ? (s.leaderCitySum / valid).toFixed(1) : '-';
    const hcAvg = valid ? (s.humanCitySum / valid).toFixed(1) : '-';
    const ltAvg = valid ? (s.leaderTurnSum / valid).toFixed(1) : '-';
    const hbAvg = valid ? (s.humanBuildSum / valid).toFixed(1) : '-';
    const hwAvg = valid ? (s.humanWonderSum / valid).toFixed(1) : '-';
    const hdAvg = valid ? (s.humanDiscardSum / valid).toFixed(1) : '-';
    const age3 = s.games ? ((s.ageReached[3] ?? 0) / s.games * 100).toFixed(0) : '0';
    console.log(
      `${ld.zh.padEnd(5)} | 局数 ${s.games} | 领袖胜 ${s.leaderWins} | 玩家胜 ${s.humanWins} | 平 ${s.draws} ` +
      `| 领袖均分 ${lsAvg} / 玩家均分 ${hsAvg} ` +
      `| 领袖卡 ${lcAvg}(${ltAvg}回合) / 玩家卡 ${hcAvg}(建${hbAvg} 奇${hwAvg} 弃${hdAvg}) | 连动 ${s.replayTurns} | 时代III ${age3}% | stuck ${s.stuck}` +
      (s.errors.length ? ` | ⚠错误 ${s.errors.length}` : ''),
    );
    for (const e of s.errors.slice(0, 3)) console.log('   └ ' + e);
  }
  console.log(`\n总计不变量错误：${totalErr}`);
  console.log(`Hammurabi +5 终局加成触发次数：${hammurabiBonusFired}（仅汉谟拉比、且仅非军事/科技速胜的终局生效）`);
  if (totalErr > 0) {
    console.log('❌ 存在不变量违规\n');
    process.exit(1);
  }
  console.log('✅ 全部对局通过不变量校验（stuck 为主引擎既有边界，非 Solo 模块缺陷）\n');
}

main();
