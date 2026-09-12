# 部署产物验证记录（N5 运行时 + N6 Lighthouse）

> 验证日期：2026-09-11
> 验证对象：`dist-server/server.mjs`（`npm run server:build` 产物，2026-09-11 20:43 重建）+
> `dist/`（`npm run build` 产物，同刻）
> 运行方式：`node dist-server/server.mjs`（`PORT=8080`，Node v22.22.2，Windows）
>
> **目的**：DEPLOY.md 原先写明「未做真机启动验证」。本文档记录把**运行时那一半**
> 真验证掉的过程与结果；容器（docker）与 pm2 那一半仍需相应环境，见文末。

---

## 1. 静态托管断言 ✅

| # | 请求 | 期望 | 实测 | 结论 |
|---|---|---|---|---|
| 1 | `GET /` | 200 `text/html` | **200** `text/html; charset=utf-8`（582B） | ✅ |
| 2 | `GET /assets/index-DiSnNcCq.js` | 200 JS | **200** `text/javascript; charset=utf-8`（319,458B） | ✅ |
| 3 | `GET /assets/index-BOYDOetQ.css` | 200 CSS | **200** `text/css; charset=utf-8`（16,746B） | ✅ |
| 4 | `GET /nonexistent-route` | SPA 回落 index.html | **200** `text/html`（582B，与 `/` 相同） | ✅ |
| 5 | `HEAD /` | 200 | **200** | ✅ |

## 2. 路径穿越探测 ✅（9 种变异全部被拦）

用**原始 TCP socket** 发请求（绕过浏览器/HTTP 客户端对 `..` 的归一化），逐个检查响应体内容
（而非只看状态码——本服务器对未知路径一律回落 index.html，所以**只看状态码会误判**）：

| 变体 | 状态码 | 响应体判定 |
|---|---|---|
| `/../../package.json` | 200 | index.html（非泄漏） |
| `/..%2fpackage.json` | 200 | index.html |
| `/%2e%2e%2fpackage.json` | 200 | index.html |
| `/..%2f..%2fpackage.json` | 200 | index.html |
| `/a%2f..%2f..%2fpackage.json` | 200 | index.html |
| `/..%5cpackage.json`（反斜杠） | 200 | index.html |
| `/assets%2f..%2f..%2fpackage.json` | 200 | index.html |
| `/..%2fdist-server%2fserver.mjs`（探兄弟目录） | 200 | index.html |
| `/....//package.json` | 200 | index.html |

判定依据：响应体均含 `<div id="root">` / `<!doctype html>`，**均不含** `"name": "7-wonders-duel-game"`
（package.json 特征）或服务器源码特征。

**为什么是 200 而不是 403**：三层防御里前两层先把路径「洗干净」了——
① WHATWG `new URL()` 在解析阶段就把 `..` 段归一化掉；
② `path.normalize()` 再兜一道；
③ `target.startsWith(DIST)` 只作为最后防线（注意它有**前缀串匹配**的理论弱点：
`…\dist` 也前缀匹配 `…\dist-server`，但配合 join 的行为实际到不了兄弟目录）。
结论：**无泄漏，可接受**；若日后想消除「穿越请求返回 200」的可疑观感，可把
`startsWith(DIST)` 收紧为「resolve 后要求等于 `DIST + sep` 前缀」。

## 3. 联机端到端（打正式产物）✅ 3/3

`npm run proto:prod -- 3` —— 与 `npm run proto` 共用同一套测试装置
（`scripts/protoHarness.ts`），唯一区别是**不起源码服务器**，直接连运行中的
`dist-server/server.mjs`，并有前置断言：把 `dist/index.html` 与服务器响应逐字节比对，
确认测的确实是正式产物（入口资产 `index-DiSnNcCq.js`）。

| 校验项 | 结果 |
|---|---|
| 两端公开状态一致（规约到观战视角后逐字节比较） | ✅ |
| 无隐藏信息泄漏（`isSecretLeaked`：seed / rngState / 暗牌 / 密谋手牌） | ✅ |
| 非行动方动作被服务器拒绝 | ✅ |
| 客户端仅凭公开状态即可算出合法动作 | ✅ |
| 对局正常结束 | ✅ 3/3 局（平均 73.0 步，civilian 胜 3） |

回归对照：同一套装置打**源码服务器**（`npm run proto -- 5`，PORT=8090）5/5 局通过（平均 71.6 步）。

### 顺带修掉测试装置的一个真 bug（竞态）

`playOneGame` 原先只要**任一**客户端的 UPDATE 计数前进就立刻比较两端视图——
另一端可能还停在上一帧，报出「状态不一致」假阳性（本次在正式产物链路 3/3 复现，
差异点 `"current":1` vs `"current":0`）。已改为**两端都推进才比较**（`protoHarness.ts`），
修复后两条链路全绿。源码服务器此前未复现纯属时序运气。

## 4. Lighthouse 移动端性能审计（N6）✅ Performance 92（验收线 ≥90）

> 环境：Chrome 152.0.7977.83（2026-09）+ Lighthouse 13.4.1，`--form-factor=mobile` 模拟节流，
> 页面由正式产物 `dist-server/server.mjs` 提供（非 dev server）。报告归档：
> `docs/perf/lighthouse-mobile.report.html` / `.report.json`。

### 4.1 踩坑：Lighthouse 11 + 新 Chrome 测不出 LCP

先用 `npx lighthouse@11`（11.7.1，2024 年的版本）跑：**NO_LCP 报错**，类别分 `null`
（LCP 权重 25%，报错即整分无）。定位过程：

- 对照实验：同一套 flags 打**本地最小静态页**（纯 HTML 文本）→ LCP 正常测出（score=1）
  ⇒ 排除工具/headless 配置问题；
- 页面最终截图（`final-screenshot`）显示应用渲染完全正常 ⇒ 排除白屏/JS 崩溃；
- UI 无 SVG 无 canvas（两者都不计入 LCP）；
- 结论：**Lighthouse 11.7.1 与 Chrome 152（两年半代差）的兼容问题**。换 Lighthouse 13.4.1 后 LCP 正常测出。

> 本机 `npx` shim 已损坏（`'lighthouse' 不是内部或外部命令`），改用隔离安装 + node 直跑 CLI，见 §5。

### 4.2 首轮结果（80 分）与优化

LH13 首轮 **Performance 80**，未达 ≥90。网络面板一眼定位：

```
Script index-DiSnNcCq.js  transfer=312KB  resource=312KB   ← 服务器没做 gzip！
```

vite 报告该 JS gzip 后 101KB —— 服务器裸传了 3 倍流量，模拟慢速 4G 下仅网络就多吃 ~1.6s。
且静态资产无任何 `Cache-Control`。

**修复（`server/index.ts`，零第三方依赖 `node:zlib`）**：
① 按客户端 `Accept-Encoding` 协商 gzip（dist 产物 raw+gzip 各缓存一份，只压一次）；
② 带内容哈希的 `assets/*` 下发 `Cache-Control: public, max-age=31536000, immutable`，
   入口 html 用 `no-cache` 保证发版即生效；
③ 顺带补 `.mp3` 的 MIME。

### 4.3 优化前后对比（同环境同命令）

| 指标 | 优化前 | 优化后 |
|---|---|---|
| **Performance** | **80** | **92 ✅** |
| First Contentful Paint | 2.6 s | **1.4 s** |
| Largest Contentful Paint | 3.6 s | **2.4 s** |
| Total Blocking Time | 280 ms | 270 ms |
| Speed Index | 2.6 s | **1.5 s** |
| Interactive | 3.6 s | **2.4 s** |
| Cumulative Layout Shift | 0 | 0 |
| 主 JS 传输 | 312 KB | **99 KB** |
| CSS 传输 | 17 KB | **5 KB** |

服务器改动回归：`proto:prod` 4/4、`proto`（源码）4/4、`proto:ai` 1/1 全过。

### 4.4 剩余可优化项（不阻塞）

- `unused-javascript`：估省 50KB / 300ms —— 需要代码分割（React lazy 按模式拆包），留给后续；
- `render-blocking-insight`：CSS 阻塞渲染，CSS 仅 5KB(gzip)，收益有限；
- `max-potential-fid` 320ms：主线程初始化较长，同属代码分割范畴。

## 5. 浏览器真实点击流验证（2026-09-11）✅ 3/3

> 用 puppeteer-core + 本机 Chrome（headless）做**真实鼠标事件**验证，
> 区别于此前 eval 注入的伪点击。脚本：`npm run browser:e2e -- <hotseat|toggles|online> <outFile>`
> （`scripts/browser/e2eClickFlow.cjs`，复用 `playHotseat.js` / `onlineStep.js` 注入片段）。

| 阶段 | 结果 | 关键断言 |
|---|---|---|
| hotseat | ✅ | 73 步完整对局（8 草稿 + 37 建造 + 16 弃牌 + 7 奇迹），终局计分弹窗 + 计分表渲染，0 页面错误 |
| toggles | ✅ | 万神殿/市政广场开关**真实鼠标点击**双向切换；Pantheon 神话 token 弹窗可正常操作；扩展生效的对局可推进；复位干净 |
| online | ✅ | 双 browser context：建房 → 房码加入 → 双方就绪 → 房主开始 → 33 轮交替整局 → **两端都到「终局计分」且一致**，0 页面错误 |

### 顺带揪出 2 个真 bug（均已修复并回归）

1. **热座模式下 Pantheon/Agora 待决弹窗永远没有可选项，对局卡死**
   —— `useLocalGame` 调 `publicView(state)` 漏传 viewer（默认 null），
   `visibility.ts` 把「非待决玩家」的 options 全部清空；热座没有 viewer 概念，
   弹窗渲染出来却无任何选项可点。修复：热座 viewer=当前行动者
   （`activePlayer(state)`，天然覆盖待决/草稿/先手各阶段）；人机模式 viewer 恒为
   玩家 0（AI 回合的私有待决选项不得闪现给人类玩家）。Solo 侧
   `useSoloGame` 原本就传了 viewer=0，不受影响。

2. **正式服务器把 index.html 永久缓存** —— gzip 优化引入的 `staticCache` 对所有
   文件生效，rebuild 后服务器仍吐旧入口（引用已删除的旧哈希 JS → 模块 MIME
   错误 → 白屏），与其下发的 `no-cache` 头自相矛盾。修复：仅 `assets/` 哈希
   文件走缓存，`index.html` 等非哈希文件每次读盘。回归：`proto:prod` 3/3。

### 验证期间发现的测试基建事实（非产品 bug）

- 奇迹选择 overlay 盖住顶栏右侧按钮：真实用户在草稿阶段也点不到扩展开关，
  属模态设计（防止对局中途改扩展），e2e 须等主对局阶段再点；
- 联机建房须等 WS「● 已连接」再点「创建房间」，流程为
  就绪 → 房主开始 → 自动进草稿，e2e 已按真实用户流编排。

## 6. 复现命令

```bash
npm run build && npm run server:build
node dist-server/server.mjs            # 窗口 A（PORT 默认 8080）
npm run proto:prod -- 3                # 窗口 B：联机 e2e（打产物）

# Lighthouse（N6）—— 本机 npx shim 损坏（'lighthouse' 不是内部或外部命令），
# 已改用隔离安装 + node 直跑 CLI；⚠️ 必须用 Lighthouse 13+（11.7.1 在 Chrome 152 下测不出 LCP）
#   npm install lighthouse@latest --prefix C:\Users\wk\.workbuddy\binaries\node\workspace
#   C:\Users\wk\.workbuddy\binaries\node\versions\22.22.2-3\node.exe ^
#     C:\Users\wk\.workbuddy\binaries\node\workspace\node_modules\lighthouse\cli\index.js ^
#     http://localhost:8080 --only-categories=performance --form-factor=mobile ^
#     --output=html --output=json --output-path=docs/perf/lighthouse-mobile ^
#     --chrome-path="C:\Program Files\Google\Chrome\Application\chrome.exe" --quiet
# 浏览器真实点击流（第 5 节；需 puppeteer-core + 本机 Chrome）
#   NODE_PATH=<含 puppeteer-core 的 node_modules> npm run browser:e2e -- hotseat out.json
#   NODE_PATH=... npm run browser:e2e -- toggles out.json
#   NODE_PATH=... npm run browser:e2e -- online  out.json
#   （可选 E2E_DIAG=1 输出逐步诊断；GAME_URL / CHROME_PATH 可覆盖默认值）
```

## 7. 仍待环境（明确做不了，不是不做）

| 项 | 阻塞原因 | 到位后的验收 |
|---|---|---|
| `docker build -t 7-wonders-duel .` + `docker run` | 本机无 docker | 镜像能起、`curl -I` 200、`proto:prod` 通过 |
| `pm2 start ecosystem.config.cjs` | 本机无 pm2 | 进程存活、崩溃自动拉起 |
| N4 真机清单执行（iOS Safari / Android Chrome） | 无 iOS/Android 设备 | `docs/device-regression-checklist.md` 全勾 |
