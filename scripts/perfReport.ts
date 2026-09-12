/* ------------------------------------------------------------------
 * 性能体检（N6）
 *
 * 在不依赖 Lighthouse 的环境里也能跑：直接读 dist/ 产物，
 * 输出真实体积 / gzip 体积 / 压缩比，并按预算给出通过与否。
 *
 * 预算（对 375px 移动端网络而言很宽松）：
 *   - 首屏 JS ≤ 200 KB gzip（2026-09-11 实测 98.6 KB）
 *   - CSS ≤ 50 KB gzip（2026-09-11 实测 4.3 KB）
 *   - 零图片、零外部字体（音频为程序合成）
 *
 * 完整 Lighthouse 移动端审计已在有 Chrome 的环境验证（2026-09-11，Performance 92）：
 *   ⚠️ 须用 Lighthouse 13+（11.7.1 在 Chrome 152 下报 NO_LCP、类别分 null）；
 *   ⚠️ 本机 npx shim 损坏时，装到隔离目录用 node 直跑 cli/index.js（完整命令见
 *      docs/deploy-verification.md §5）。标准命令：
 *   npx lighthouse@13 http://localhost:8080 --only-categories=performance \
 *     --form-factor=mobile --output=html --output-path=docs/perf/lighthouse-mobile
 * 实测基线：Performance 92 / FCP 1.4s / LCP 2.4s（静态服务器 gzip + immutable 缓存）。
 * ------------------------------------------------------------------ */

import { gzipSync } from 'node:zlib';
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const DIST = join(ROOT, 'dist');

const BUDGET = { jsGzipKb: 200, cssGzipKb: 50 };

function files(dir: string): { path: string; name: string }[] {
  return readdirSync(dir)
    .filter((f) => !statSync(join(dir, f)).isDirectory())
    .map((f) => ({ path: join(dir, f), name: f }));
}

const assets = files(join(DIST, 'assets'));
const rows: { name: string; rawKb: number; gzipKb: number }[] = [];

let jsGzip = 0;
let cssGzip = 0;
for (const a of assets) {
  const raw = readFileSync(a.path);
  const gz = gzipSync(raw).length / 1024;
  const rawKb = raw.length / 1024;
  rows.push({ name: a.name, rawKb, gzipKb: gz });
  if (a.name.endsWith('.js')) jsGzip += gz;
  if (a.name.endsWith('.css')) cssGzip += gz;
}

const serverSize = statSync(join(ROOT, 'dist-server', 'server.mjs')).size / 1024;

console.log('静态产物（dist/）：');
for (const r of rows.sort((a, b) => b.gzipKb - a.gzipKb)) {
  console.log(
    `  ${r.name.padEnd(40)} raw ${r.rawKb.toFixed(1).padStart(7)} KB   gzip ${r.gzipKb.toFixed(1).padStart(6)} KB`,
  );
}
console.log(`  ${'dist-server/server.mjs'.padEnd(40)} raw ${serverSize.toFixed(1).padStart(7)} KB`);
console.log('');

const okJs = jsGzip <= BUDGET.jsGzipKb;
const okCss = cssGzip <= BUDGET.cssGzipKb;
console.log(`首屏 JS 合计 gzip：${jsGzip.toFixed(1)} KB（预算 ≤ ${BUDGET.jsGzipKb} KB）→ ${okJs ? '✓' : '✗'}`);
console.log(`CSS 合计 gzip：${cssGzip.toFixed(1)} KB（预算 ≤ ${BUDGET.cssGzipKb} KB）→ ${okCss ? '✓' : '✗'}`);

if (!okJs || !okCss) {
  console.log('\n未通过体积预算，请检查是否引入了大型依赖。');
  process.exit(1);
}
console.log('\n体积预算通过。');
console.log('注：完整 Lighthouse 审计需在有 Chrome 的环境执行（见文件头注释）。');
