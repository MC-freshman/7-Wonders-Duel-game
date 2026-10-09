/* ------------------------------------------------------------------
 * Astarte 圣库金币可负担性校验（WP-01 回归）
 *
 * 背景：planCost 常规路径的 affordable 此前只看 player.coins，而 payCoins
 * 会优先花费 Astarte 圣库金币、调用神格的费用判断也把圣库算进去——
 * 口径自相矛盾。Pantheon 局（Agora 关）中「手头金币不足但圣库充足」时
 * BUILD_CARD / BUILD_WONDER 会从合法动作里凭空消失。
 *
 * 用法：npm run check:astarte
 * 自证：把 resources.ts 常规路径的 affordable 改回 `player.coins >= total`
 * 后，第 1/2 项必须变红（修复前实测为红）。
 * ------------------------------------------------------------------ */

import { activePlayer, applyAction, costPlanForCard, initialState, legalActions } from '../src/core/engine';
import { Rng } from '../src/core/rng';
import type { GameState, PlayerId } from '../src/core/types';

const failures: string[] = [];

function check(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? `　${detail}` : ''}`);
  if (!ok) failures.push(name);
}

/** 造一个 Pantheon 局的中局状态（随机合法动作推进，落到 playing 且无待决） */
function midGamePantheon(seed: number, steps = 30): GameState {
  let state = initialState(seed, { pantheon: true });
  const rng = new Rng(seed ^ 0x5eed);
  for (let i = 0; i < 800; i++) {
    if (state.victory || state.phase === 'gameOver') return midGamePantheon(seed + 1, steps);
    if (i >= steps && state.phase === 'playing' && !state.pending) return state;
    const actor = activePlayer(state);
    if (actor === null) break;
    const acts = legalActions(state, actor);
    if (!acts.length) break;
    state = applyAction(state, acts[Math.floor(rng.float() * acts.length)]);
  }
  return state;
}

/** 造一个「手头 0 金 + 圣库 12 金」的 Pantheon 中局状态 */
function poorButTreasury(seed: number): { state: GameState; p: PlayerId } {
  const state = midGamePantheon(seed);
  for (const p of [0, 1] as PlayerId[]) {
    state.players[p].coins = 0;
    state.players[p].pan.astarteCoins = 12;
  }
  return { state, p: 0 };
}

/* ---------------- 1. 圣库充足、手头不足：付费建造必须仍在合法动作里 ---------------- */
{
  let found: { seed: number; slot: number; cardId: string; total: number } | null = null;
  for (let seed = 70001; seed < 70400 && !found; seed++) {
    const { state, p } = poorButTreasury(seed);
    for (const a of legalActions(state, p)) {
      if (a.type !== 'BUILD_CARD') continue;
      const plan = costPlanForCard(state, p, state.slots[a.slot].cardId!);
      if (!plan.freeByLink && plan.total > 0) {
        found = { seed, slot: a.slot, cardId: state.slots[a.slot].cardId!, total: plan.total };
        break;
      }
    }
  }
  check(
    '构造到「手头 0 金 + 圣库 12 金」的付费建造局面',
    found !== null,
    found ? `seed=${found.seed} 卡=${found.cardId} 费用=${found.total}金` : '（400 个 seed 内未构造到，脚本需检查）',
  );
  if (found) {
    const { state, p } = poorButTreasury(found.seed);
    const listed = legalActions(state, p).some(
      (a) => a.type === 'BUILD_CARD' && a.slot === found!.slot,
    );
    check('BUILD_CARD 在合法动作列表中（修复前会消失）', listed);

    const after = applyAction(state, { type: 'BUILD_CARD', player: p, slot: found.slot });
    check(
      '实际建造成功且卡入城（支付由 payCoins 圣库优先承担）',
      after.players[p].city.includes(found.cardId),
    );
  }
}

/* ---------------- 2. 奇迹建造同口径 ---------------- */
{
  let found: { seed: number; slot: number; wonderId: string } | null = null;
  for (let seed = 80001; seed < 80400 && !found; seed++) {
    const { state, p } = poorButTreasury(seed);
    for (const a of legalActions(state, p)) {
      if (a.type === 'BUILD_WONDER') {
        found = { seed, slot: a.slot, wonderId: a.wonderId };
        break;
      }
    }
  }
  check(
    '奇迹建造同样把圣库计入可负担（修复前会消失）',
    found !== null,
    found ? `seed=${found.seed} 奇迹=${found.wonderId}` : '（400 个 seed 内未构造到奇迹可建局面）',
  );
  if (found) {
    const { state, p } = poorButTreasury(found.seed);
    const after = applyAction(state, {
      type: 'BUILD_WONDER',
      player: p,
      slot: found.slot,
      wonderId: found.wonderId,
    });
    check('实际建成奇迹', after.players[p].wondersBuilt.includes(found.wonderId));
  }
}

/* ---------------- 3. 基础局（无圣库）不受影响 ---------------- */
{
  const state = initialState(90001, {});
  check('基础局无圣库字段污染', state.players[0].pan.astarteCoins === 0, `astarte=${state.players[0].pan.astarteCoins}`);
}

console.log(failures.length ? `\n❌ ${failures.length} 项未通过：${failures.join('、')}\n` : '\n✅ Astarte 圣库可负担性校验全部通过\n');
if (failures.length) process.exit(1);
