/* ------------------------------------------------------------------
 * 联机端到端测试（源码服务器）
 *
 * 起一个真实服务器 + 两个真实 WebSocket 客户端，跑完整对局。
 * 校验逻辑（状态一致 / 无泄漏 / 非行动方被拒 / 可正常结束）全部在
 * ./protoHarness —— 与 protoProd.ts（打正式构建产物）共用同一套，
 * 保证两条链路测的是同一件事。
 *
 * 用法：
 *   npm run proto -- 30              # 30 局
 *   PANTHEON=1 npm run proto -- 20   # Pantheon 扩展
 *   PORT=8090 npm run proto -- 5     # 换端口（默认 8080，便于与正式产物并行）
 * ------------------------------------------------------------------ */

import { startServer } from '../server/index';
import { playOneGame, report, sleep, type Result } from './protoHarness';

const PORT = Number(process.env.PORT ?? 8080);
const GAMES = Number(process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 30);

const results: Result[] = [];
await startServer(PORT, '127.0.0.1');
await sleep(120);

for (let i = 1; i <= GAMES; i++) {
  try {
    results.push(await playOneGame(PORT, i, i <= 3));
  } catch (err) {
    results.push({ ok: false, steps: 0, type: '-', winner: null, error: String(err) });
  }
}

report(results, GAMES);
