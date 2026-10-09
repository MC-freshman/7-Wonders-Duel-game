import { parseLayout } from '../src/core/layout';
import type { GameState } from '../src/core/types';

for (const age of [1, 2, 3] as const) {
  const slots = parseLayout(age);
  const rows = new Map<number, number>();
  for (const s of slots) rows.set(s.row, (rows.get(s.row) ?? 0) + 1);
  const initial = slots.filter((s) => s.requires.length === 0);
  const faceDown = slots.filter((s) => s.faceDown).length;
  console.log(
    `时代 ${age} | 卡位 ${slots.length} | 各行 ${[...rows.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, c]) => c)
      .join('-')} | 开局可拿 ${initial.length}（全为正面朝上：${initial.every(
      (s) => !s.faceDown,
    )}） | 正面朝下 ${faceDown}`,
  );
  const bad = slots.filter((s) => s.requires.some((r) => r <= s.index));
  if (bad.length) console.log('  !! 依赖方向异常', bad.length);
  const missing = slots.filter((s) => s.requires.length === 0 && s.faceDown);
  if (missing.length) console.log('  !! 开局可拿却正面朝下', missing.length);
}

// Agora 官方加大牌阵（规则书 p.8）：25 / 25 / 23 格，非最底行必须全被压住
console.log('');
const AGORA_ROWS: Record<1 | 2 | 3, string> = { 1: '3-4-5-6-7', 2: '7-6-5-4-3', 3: '2-3-4-5-4-3-2' };
const AGORA_SLOTS: Record<1 | 2 | 3, number> = { 1: 25, 2: 25, 3: 23 };
for (const age of [1, 2, 3] as const) {
  const slots = parseLayout(age, true);
  const rows = new Map<number, number>();
  for (const s of slots) rows.set(s.row, (rows.get(s.row) ?? 0) + 1);
  const rowStr = [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([, c]) => c).join('-');
  const bottomRow = Math.max(...slots.map((s) => s.row));
  const covered = slots.filter((s) => s.row !== bottomRow && s.requires.length === 0);
  const faceDown = slots.filter((s) => s.faceDown).length;
  const okShape = slots.length === AGORA_SLOTS[age] && rowStr === AGORA_ROWS[age];
  const okCover = covered.length === 0;
  const badDir = slots.filter((s) => s.requires.some((r) => r <= s.index));
  console.log(
    `Agora 时代 ${age} | 卡位 ${slots.length}（应 ${AGORA_SLOTS[age]}） | 各行 ${rowStr}（应 ${AGORA_ROWS[age]}） | 正面朝下 ${faceDown} | 非底行未覆盖 ${covered.length} | 依赖方向异常 ${badDir.length}`,
  );
  if (!okShape || !okCover || badDir.length) {
    console.log('  !! Agora 牌阵拓扑与官方规则不符');
    process.exitCode = 1;
  }
}

// 检查卡表数量
import { CARDS, AGE_CARDS, GUILD_CARDS } from '../src/core/data/index';
const counts = [1, 2, 3].map((a) => AGE_CARDS(a as 1 | 2 | 3).length);
console.log(
  `\n卡表：总数 ${CARDS.length} = 时代I ${counts[0]} + 时代II ${counts[1]} + 时代III ${counts[2]} + 行会 ${GUILD_CARDS().length}`,
);

// 连锁符号闭合性检查
const links = new Set(CARDS.filter((c) => c.link).map((c) => c.link!));
const freeLinks = CARDS.filter((c) => c.freeLink).map((c) => ({ name: c.zh, need: c.freeLink! }));
const dangling = freeLinks.filter((f) => !links.has(f.need));
console.log(`连锁：提供符号 ${links.size} 个，需求 ${freeLinks.length} 条，悬空 ${dangling.length} 条`);
if (dangling.length) console.log('  ', dangling);

// 科技符号分布
const sci = new Map<string, string[]>();
for (const c of CARDS.filter((c) => c.science)) {
  sci.set(c.science!, [...(sci.get(c.science!) ?? []), c.zh]);
}
console.log(`科技符号 ${sci.size} 种：`, [...sci.entries()].map(([k, v]) => `${k}(${v.length})`).join(' '));

// 占位：确认 GameState 类型可导入
export type _T = GameState;
