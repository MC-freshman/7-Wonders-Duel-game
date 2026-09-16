/* ------------------------------------------------------------------
 * Solo 复盘逐帧校验（M8 遗留项的验收脚本）
 *
 * 复盘的正确性只有一种说法能成立：**重放第 i 帧 == 实况第 i 帧**，对每一帧都成立。
 * 只看终局不够——随机流一旦在中途分叉，画面就会静默错位（这正是本功能曾经的根因）。
 *
 * 做法：用与 UI 完全相同的控制流（`leaderMustAct` + `soloLeaderTurn`）打完整局，
 * 每应用一个玩家动作就把「实况状态」与「从 seed 重放到该帧的 SoloRunner 状态」
 * 逐字段比对（JSON 全等，含 rngState 与整条日志）。
 *
 * 用法：npm run replay:solo -- [每形态局数]
 *   覆盖 base / Pantheon / Agora / 合体 四形态，每局随机领袖 + AI 玩家。
 * ------------------------------------------------------------------ */

import { chooseAction, type Difficulty } from '../src/ai/index';
import { createSoloRunner, replayLength } from '../src/core/replay';
import type { ReplaySource, SoloReplayMeta, SoloRunner } from '../src/core/replay';
import { legalActions } from '../src/core/engine';
import {
  createSoloGame,
  leaderMustAct,
  soloApplyAction,
  soloFinalizeVictory,
  soloLeaderTurn,
} from '../src/core/solo/index';
import { SOLO_LEADERS } from '../src/core/solo/data';
import { soloAgoraLeaders } from '../src/core/solo/agora/index';
import { soloPantheonLeaders } from '../src/core/solo/pantheon/index';
import type { SoloGame } from '../src/core/solo/types';

const DIFF: Difficulty = (process.argv[3] as Difficulty) || 'medium';
const GAMES = Number(process.argv[2]) || 3;

const FORMS: { zh: string; pantheon: boolean; agora: boolean }[] = [
  { zh: 'base', pantheon: false, agora: false },
  { zh: 'Pantheon', pantheon: true, agora: false },
  { zh: 'Agora', pantheon: false, agora: true },
  { zh: '合体', pantheon: true, agora: true },
];

function leaderPool(pantheon: boolean, agora: boolean) {
  let pool = [...SOLO_LEADERS];
  if (pantheon) pool = soloPantheonLeaders(pool);
  if (agora) pool = soloAgoraLeaders(pool);
  return pool;
}

const canon = (g: SoloGame) => JSON.stringify(g.state);

/** 帧号口径与 `SoloRunner` / 主链路一致：日志里的动作总数（领袖与玩家都计帧） */
const frameCount = (g: SoloGame) => replayLength(g.state.log);

/** 与 `useSoloGame` 一致的单步驱动：领袖连跑 → 玩家（或其 pending）走一步 */
function stepLive(game: SoloGame, check: (label: string) => void): void {
  let guard = 0;
  while (leaderMustAct(game) && guard++ < 120) {
    soloLeaderTurn(game);
    check('领袖段后');
  }
  const st = game.state;
  if (st.victory || st.phase === 'gameOver') return;
  if (st.pending) {
    const pend = st.pending;
    const actor = pend.kind === 'startPlayer' ? pend.chooser : pend.player;
    const acts = legalActions(st, actor);
    if (acts.length === 0) throw new Error(`玩家侧 pending 无可解动作（actor=${actor}）`);
    soloApplyAction(game, acts[0]);
    check('玩家待决后');
    return;
  }
  soloApplyAction(game, chooseAction(st, 0, DIFF).action);
  check('玩家动作后');
}

function sourceOf(
  game: SoloGame,
  seed: number,
  pantheon: boolean,
  agora: boolean,
): ReplaySource & { solo: SoloReplayMeta } {
  return {
    seed,
    log: game.state.log,
    options: { pantheon, agora },
    solo: {
      leaderId: game.leaderId,
      leader: game.leader.id,
      leaderRandom: game.leaderRandom === true,
    },
  };
}

function runnerAt(source: ReplaySource & { solo: SoloReplayMeta }, n: number): SoloRunner {
  const r = createSoloRunner(source);
  r.seek(n);
  return r;
}

function playOne(seed: number, form: (typeof FORMS)[number], randomLeader: boolean): number {
  const pool = leaderPool(form.pantheon, form.agora);
  const game = createSoloGame(
    seed,
    randomLeader ? undefined : pool[seed % pool.length].id,
    { pantheon: form.pantheon, agora: form.agora },
  );
  const leader = game.leader;

  /* ⚠️ 主引擎 `applyAction` 每次 `structuredClone`，`state.log` 是**每帧新数组**；
     重放器必须以「当前帧的 log」构造，持旧引用会永远看到 0 个动作。 */
  const freshRunner = () => createSoloRunner(sourceOf(game, seed, form.pantheon, form.agora));

  // 第 0 帧：建局完成、领袖尚未先手
  let runner = freshRunner();
  if (runner.seek(0).leader.id !== leader.id) throw new Error(`${leader.zh}：第 0 帧领袖不符`);
  if (canon(runner.game) !== canon(game)) throw new Error(`${leader.zh}：第 0 帧与实况不一致`);

  let frames = 0;
  let guard = 0;
  /* 比对必须下推到**每一个** `soloApplyAction` 之后：玩家的一手可能拆成多条动作
     （建造 → 选发展标记），且领袖回应插在动作之间，只在整步后比对会漏掉中途画面。 */
  let liveFinalized = false;
  const check = (label: string) => {
    frames = frameCount(game);
    // 与 `useSoloGame.maybeFinalize` 同机施加（该修正非幂等，且复盘器在末帧也会做）
    if (game.state.victory && !liveFinalized) {
      soloFinalizeVictory(game);
      liveFinalized = true;
    }
    runner = freshRunner();
    runner.seek(frames);
    if (canon(runner.game) !== canon(game)) {
      throw new Error(`${leader.zh} seed=${seed}：${label}（第 ${frames} 帧）与实况不一致`);
    }
  };
  while (!game.state.victory && game.state.phase !== 'gameOver' && guard++ < 4000) {
    const before = game.state.log.length;
    stepLive(game, check);
    if (game.state.log.length === before) throw new Error(`${leader.zh}：实况无进展（可能卡死）`);
  }
  if (!game.state.victory && game.state.phase !== 'gameOver') throw new Error(`${leader.zh}：未到终局`);

  // rewind 路径（同一个重放器上向后跳）：复盘进度条来回拖
  const live = canon(game);
  const midway = Math.floor(frames / 2);
  const frozen = sourceOf(game, seed, form.pantheon, form.agora);
  const replayedMid = canon(runnerAt(frozen, midway).game);
  const scrub = createSoloRunner(frozen);
  scrub.seek(midway);
  const midGot = canon(scrub.game);
  scrub.seek(frames);
  scrub.seek(midway);
  if (canon(scrub.game) !== midGot) {
    throw new Error(`${leader.zh} seed=${seed}：回跳到第 ${midway} 帧结果不稳定`);
  }
  if (midGot !== replayedMid) {
    throw new Error(`${leader.zh} seed=${seed}：回跳后与全新重放不一致`);
  }
  scrub.seek(frames);
  if (canon(scrub.game) !== live) {
    throw new Error(`${leader.zh} seed=${seed}：回跳后再前进与实况终局不一致`);
  }
  return frames;
}

function main(): void {
  console.log(`\n=== Solo 复盘逐帧校验（${GAMES} 局/形态，玩家=${DIFF} AI）===\n`);
  let failed = 0;
  let totalFrames = 0;
  for (const form of FORMS) {
    for (let i = 0; i < GAMES; i++) {
      const randomLeader = i % 2 === 0;
      const seed = ((i + 1) * 2654435761 + form.zh.length * 100003) >>> 0;
      try {
        const frames = playOne(seed, form, randomLeader);
        totalFrames += frames;
        console.log(
          `✓ ${form.zh.padEnd(8)} ${randomLeader ? '随机领袖' : '指定领袖'} seed=${seed} 逐帧一致（${frames} 帧）`,
        );
      } catch (e) {
        failed++;
        console.log(`✗ ${form.zh} seed=${seed}：${(e as Error).message}`);
      }
    }
  }
  console.log(
    failed
      ? `\n❌ ${failed} 局复盘与实况分叉（共比对 ${totalFrames} 帧）\n`
      : `\n✅ 全部通过：${FORMS.length * GAMES} 局 / ${FORMS.length} 形态，累计逐帧比对 ${totalFrames} 帧\n`,
  );
  if (failed) process.exit(1);
}

main();
