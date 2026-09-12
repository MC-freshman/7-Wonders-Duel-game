/* ------------------------------------------------------------------
 * 联机端到端测试（**正式构建产物**）
 *
 * 与 protoTest.ts 的唯一区别：**不起源码服务器**，而是连接一台已经在运行的
 * dist-server/server.mjs（npm run server:build 的产物）。
 *
 * 背景：此前 `npm run proto` 通过 import { startServer } 直测**源码**，
 * 真正要部署的 dist-server/server.mjs 从未被联机验证过 —— DEPLOY.md 里
 * 「未做真机启动验证」说的就是这件事。本脚本补上这半（容器 / pm2 那半仍需环境）。
 *
 * 用法：
 *   1) npm run build && npm run server:build
 *   2) node dist-server/server.mjs            # 默认 8080
 *   3) npm run proto:prod -- 3                # 跑 3 局
 *
 * 前置断言（防止测错对象）：
 *   把 dist/index.html 与服务器响应逐字节比对 —— 一致才算「在测正式产物」。
 *   若端口上跑的是 vite dev server（含 /@vite/client）会直接报错退出。
 * ------------------------------------------------------------------ */

import { readFile } from 'node:fs/promises';
import { playOneGame, report, type Result } from './protoHarness';

const PORT = Number(process.env.PORT ?? 8080);
const GAMES = Number(process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 3);
const BASE = `http://127.0.0.1:${PORT}`;

/* ------------------------- 前置：确认测的是正式产物 ------------------------- */

let served: string;
try {
  const res = await fetch(`${BASE}/`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  served = await res.text();
} catch (err) {
  console.error(`✗ 无法访问 ${BASE}/ —— 请先启动正式产物服务器：`);
  console.error(`    npm run build && npm run server:build`);
  console.error(`    node dist-server/server.mjs`);
  console.error(`  原因：${String(err)}`);
  process.exit(1);
}

const local = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
if (served !== local) {
  const servedAsset = /assets\/(index-[^"]+\.js)/.exec(served)?.[1] ?? '（无资产引用）';
  const localAsset = /assets\/(index-[^"]+\.js)/.exec(local)?.[1] ?? '（无资产引用）';
  console.error('✗ 端口上跑的不是当前 dist/ 产物，拒绝继续（避免测错对象）：');
  console.error(`    服务器返回的入口资产：${servedAsset}`);
  console.error(`    磁盘 dist/ 的入口资产：${localAsset}`);
  console.error('  若是 vite dev server（含 /@vite/client）请关掉，或换 PORT 指向正式服务。');
  process.exit(1);
}
const asset = /assets\/(index-[^"]+\.js)/.exec(served)?.[1] ?? '?';
console.log(`✓ 已确认在测正式产物：${BASE}/ 与 dist/index.html 一致（入口 ${asset}）`);

/* ------------------------------ 跑对局 ------------------------------ */

const results: Result[] = [];
for (let i = 1; i <= GAMES; i++) {
  try {
    results.push(await playOneGame(PORT, i, i <= 3));
  } catch (err) {
    results.push({ ok: false, steps: 0, type: '-', winner: null, error: String(err) });
  }
}

report(results, GAMES);
