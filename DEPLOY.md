# 七大奇迹对决 · 自托管部署镜像

产物自带 `dist/`（前端）与 `dist-server/server.mjs`（零依赖服务器），
镜像只需 Node 18 运行时，不含源码与 `node_modules`。

## Docker

```bash
# 1. 构建镜像（先确保已执行过 npm run build + npm run server:build）
docker build -t 7-wonders-duel .

# 2. 前台跑一次（验证）
docker run --rm -p 8080:8080 7-wonders-duel

# 3. 常驻运行
docker run -d --name 7wd --restart unless-stopped -p 8080:8080 7-wonders-duel
```

- 端口可用 `-e PORT=9000` 覆盖。
- 进程崩溃由 Docker 自动拉起；容器重启会丢失房间（首版接受，见迁移说明 §9）。
- 镜像仅约几十 MB（alpine + Node + 两份产物），可反复重建。

## PM2（本机进程守护，无需容器）

```bash
npm install -g pm2
pm2 start ecosystem.config.cjs     # 名称 7-wonders-duel，fork 单实例
pm2 save                           # 记住进程表，开机自启需再 pm2 startup
pm2 logs 7-wonders-duel
```

- 崩溃自动重启（`restart_delay` 3s），内存超过 300MB 自动重启。
- `PORT` 在 `ecosystem.config.cjs` 的 `env` 中改。

> **验证状态（2026-09-11 实测）**
>
> - ✅ **运行期已验证**：`node dist-server/server.mjs` 真机起服后——
>   `/` 与 `/assets/*` 均 200 且 Content-Type 正确、未知路径 SPA 回落 index.html、
>   **9 种路径穿越变体全部被拦**（原始 socket 绕过客户端归一化逐个测过）；
>   联机端到端 `npm run proto:prod -- 3` **3/3 局通过**（两端状态一致 / 无隐藏信息泄漏 /
>   非行动方动作被拒 / 对局正常结束）。明细见 `docs/deploy-verification.md`。
> - ✅ **静态优化已内置**：按 `Accept-Encoding` 协商 gzip（主 JS 312KB→99KB）+
>   哈希资产 `immutable` 长缓存；index.html 不缓存（每次读盘，与 no-cache 语义一致，
>   修复过"rebuild 后仍吐旧入口导致白屏"）。Lighthouse 移动端 **Performance 92**
>   （优化前 80），报告在 `docs/perf/lighthouse-mobile.report.html`。
> - ✅ **真实浏览器点击流 3/3**（2026-09-11，puppeteer + Chrome）：热座整局、
>   扩展开关真实点击、双窗口联机整局（两端终局一致）；顺带修复热座模式
>   Pantheon/Agora 弹窗无选项的卡死 bug（`useLocalGame` 漏传 viewer）。明细见
>   `docs/deploy-verification.md` 第 5 节。
> - ✅ **发布包已验证**：`release/7-wonders-duel-v0.1.0.zip` 解压到干净目录以
>   发布形态起服（PORT=8095）→ 入口与资产 200 正常下发。
> - ⏳ **容器与 pm2 待环境**：本机无 docker / pm2，`docker build` 与 `pm2 start` 两步
>   需到有相应环境的机器上按上述命令跑一遍（验收标准不变：
>   `curl -I http://<host>:8080/` 返回 200 + 联机跑一局正常，即 `npm run proto:prod`）。
