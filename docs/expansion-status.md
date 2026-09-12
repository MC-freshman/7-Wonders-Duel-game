# 扩展实施状态（Pantheon / Agora / Solo）

## 后续路线图（2026-09-05 制定，详细方案见下文「路线图」）

| 里程碑 | 内容 | 依赖 | 预估 | 状态 |
|---|---|---|---|---|
| M8 | Agora Solo（**架构已定：方案 B 外挂隔离**——`src/core/solo/` 独立模块，零侵入现有引擎/协议/UI，删目录即回退；数据表已备 `docs/rules/SOLO_AGORA_DATA.md`） | M7 + base Solo 卡面资料 | 2 轮 | ✅ 已完成（2026-09-10，引擎 + 仿真验收） |
| M9 | AI Agora 策略调优（评估函数 + 行为规则；验收：合体 medium ≥80%） | M7 | 1 轮 | ✅ 已完成（2026-09-05，合体 medium 88% / hard>medium 75%） |
| M10 | 合体慢局根因专项（aiStep 全链路打点 → 定位 → 修复；验收：接管 ×10） | M7 | 1 轮 | ✅ 已完成（2026-09-05） |
| M11 | 测试补全（renderSmoke Agora 场景 + bench JSON 基线） | M9 | 1 轮 | ✅ 已完成（2026-09-05） |
| M12 | 数据近似项校正（等 13 卡全家福 / 图板扫描件） | — | 0.5 轮 | 挂起 |
| M13 | 部署与真机（N4/N5/N6） | — | 1-2 轮 | 🟡 **N5 运行时 + N6 已收口（2026-09-11，见 deploy-verification.md）**；docker `build` / pm2 / N4 真机执行仍待环境 |

启动顺序建议：M10 → M8 → M9 → M11。

> 更新时间：2026-09-10 · 对应里程碑体系 M6（Pantheon）/ M7（Agora）/ **M8（Solo：base + Agora + Pantheon + 单人 UI 全部完成）**
> 数据源：`docs/rules/{SOLO_DATA,SOLO_AGORA_DATA,SOLO_PANTHEON_DATA}.md`

## 总览

| 里程碑 | 内容 | 状态 |
|---|---|---|
| M6 Pantheon | 数据→引擎→脱敏→UI→AI→联机→回归 | ✅ 全部完成（2026-09-04） |
| M7 Agora | 数据→引擎→脱敏/联机→UI→AI/回归 | ✅ 全部完成（A/B/C/D/E 全绿，2026-09-05） |
| M8 Solo | base Solo + Agora Solo + Pantheon Solo + 单人模式 UI | ✅ 全部完成（2026-09-10） |

## M8 Solo 各子项状态（2026-09-10）

| 子项 | 内容 | 状态 |
|---|---|---|
| M8-base 数据 | `docs/rules/SOLO_DATA.md` + `src/core/solo/data.ts`（5 领袖 12 决策卡 + 颜色→卡型映射） | ✅ |
| M8-base 引擎 | `src/core/solo/solo.ts`：`createSoloGame` / `soloApplyAction` / `soloLeaderTurn` / `soloFinalizeVictory`；领袖「免费建造」用「临时补金 + structuredClone 净额为 0」技巧 | ✅ |
| M8-A Agora Solo | `src/core/solo/agora/{data,agora,index}.ts`：Brutus 领袖 + 5 张 Agora 替换决策卡 + 密谋/参议员/法令领袖化；`soloLeaderTurnAgora` | ✅ |
| M8-P Pantheon Solo | `src/core/solo/pantheon/{data,pantheon,index}.ts`：3 领袖（Caligula/Sappho/Imhotep）+ 3 张 Pantheon 替换卡（⚠️ 推导值，见 `SOLO_PANTHEON_DATA.md` §5.1）+ 时代 I 神话放置 / 时代 II·III 调神 / 神明·奇迹领袖化 | ✅ |
| M8 组合 | `SoloOptions{pantheon?,agora?}` 正交；决策牌堆恒等式 `3 Pantheon + 5 Agora + 4 无图标 = 12`；领袖池 9 位 | ✅ |
| M8-UI 单人模式 | `src/ui/sources/useSoloGame.ts`（玩家/领袖回合分离、420ms 间隔驱动）+ `src/ui/components/SoloBar.tsx`（领袖身份 / 决策卡 / 牌堆进度 / 领袖选择器）+ 顶栏「单人 Solo」入口 | ✅ |
| M8-回归 | `soloSim` / `soloAgoraSim` / `soloPantheonSim`（含 combo）；renderSmoke 新增「单人 Solo 顶条」「Solo Pantheon 待决弹窗」 | ✅ |

## M7 各子项状态

| 子项 | 内容 | 状态 |
|---|---|---|
| M7-A 数据 | `src/core/data/agora.ts`：13 参议员（7 政治家左3/中2/右2 近似 + 6 密谋者）、16 密谋卡、16 法令 token、4 军事 token、chamber 分值 1,2,3,3,2,1、2 新奇迹（Curia Julia / Knossos）、2 新进度 token（corruption / organized-crime） | ✅ |
| M7-B 引擎 | RECRUIT_SENATOR（动态费用 = 已有参议员数，Corruption 免费）、政治家行动数分档（0-1 蓝→1 / 2-3→2 / 4+→3，参议院雄辩 +2）、密谋者二选一（放方块 / Conspire）、PREPARE / TRIGGER_CONSPIRACY、参议院 ops 队列（放/移/移除）、政治霸权立即胜、终局 chamber 计分、16 法令效果（豁免/税收/贸易/连锁借用/军事推进等）、军事 token（±3 放置 / ±6 移+移，替换基础罚金）、参议员混堆 I:5 / II:5 / III:3（等量基础卡额外移出） | ✅ |
| M7-C 脱敏/联机 | publicView：对手密谋手牌 / 准备区内容 / 压住 token 剥离，暗法令置 '#'，pending agora 选项按座位脱敏；isSecretLeaked 加断言；协议 START/ROOM 加 agora；房间按座位 updateMsgs（沿用 M6）；npm 脚本 `sim:a / replay:a / bench:a / proto:a / proto:ai:a`，合体用 `AGORA=1 PANTHEON=1` | ✅ |
| M7-D UI | SenateBar（6 chamber：方块/控制/法令/分值 + 放置/移动/移除入口）、AgoraOverlay（全部 11 类待决步骤）、顶栏「市政广场」开关（本地切换重开、联机房主开局前设置）、PlayerPanel 万神殿分组（M6） | ✅ 基础完成 |
| M7-E AI/回归 | AI 时间硬墙 + 顶层动作收敛已落地（chooseAction 单步上限 medium 1.2s / hard 4s，超时降级并标记 `degraded`）；扩展模式搜索预算按单节点成本缩减（合体 /8、单扩展 /4，实测合体单节点 ~0.8ms）；AI 能合法走完全部模式、不再冻结服务器；`bench:a` 已跑通。**遗留已闭环（2026-09-05）**：① Agora 策略已补齐（合体 medium vs 随机 88%）；② 合体接管「慢局」已根治（RECRUIT_SENATOR 合法性/执行分叉） | ✅ |

## 回归实测（2026-09-10，Solo 全部完成后）

| 项 | 结果 |
|---|---|
| `npx tsc --noEmit -p tsconfig.json` | ✅ 0 错误 |
| `npm run check` | ✅ 牌阵 / 卡表 / 连锁 全过（73 卡 = I23+II23+III20+行会7，悬空链 0） |
| `npm run smoke` | ✅ 18 个用例全过（含新增「单人 Solo 顶条」「Solo Pantheon 待决弹窗」） |
| sim：base 40 / Pantheon 20 / Agora 20 / 合体 20 | ✅ 全过（无死锁、无泄漏、无不变量违规） |
| replay：base / Pantheon / Agora 各 5 | ✅ 全过（seed 逐帧重放一致） |
| `soloSim 3`（base Solo，5 领袖） | ✅ 0 stuck、0 不变量错误 |
| `soloAgoraSim 3`（Agora Solo，6 领袖） | ✅ 0 stuck、0 不变量错误 |
| `soloPantheonSim 3 medium`（8 领袖） | ✅ 0 stuck、0 不变量错误（神话 token 1.0-1.7、图板放置 5.0、调用神明 1.7-4.3） |
| `soloPantheonSim:combo`（12 局，9 领袖，Pantheon+Agora） | ✅ 0 stuck、0 不变量错误 |
| `npm run build` | ✅ 前端 + 服务端产物均生成 |
| `npm run perf` | ✅ 体积预算通过 |

> 说明：Solo 仿真中「领袖胜率远高于玩家 medium AI」属 fan 扩展的固有难度
> （与 base Solo 早期观察一致），**不是 bug**——不变量检查才是验收标准。

## 回归实测（2026-09-04，当前代码）

| 项 | 结果 |
|---|---|
| `npx tsc --noEmit` | 0 错误 |
| sim：base 120 / Pantheon 120 / Agora 150 / 合体 60 | ✅ 全过（无死锁、无泄漏、无不变量违规） |
| replay（seed 逐帧重放）：四模式各 30-40 局 | ✅ 全过 |
| proto 联机 e2e：base / Pantheon / Agora / 合体 各 6-8 局 | ✅ 全过（状态一致、无泄漏、非行动方被拒） |
| proto:ai 掉线接管：base / Pantheon / Agora 3/3 | ✅；**合体偶发**（见遗留 1） |
| renderSmoke 渲染冒烟 | ✅ |
| 构建 | ✅ JS gzip 92.6KB（合体后体积 +11KB） |
| AI bench | base / Pantheon / Agora / 合体均已跑通；合体 medium 单步峰值 222ms、hard 2673ms（时间墙内）。合体下 AI 胜率偏低（medium vs 随机 50%），属"无 Agora 策略"已知遗留 |

## 遗留问题（按优先级）

1. ~~合体模式 proto:ai 接管偶发"慢局"~~ **已根治（2026-09-05）**：打点定位为 RECRUIT_SENATOR 合法性与执行分叉——legalActions 未检查招募费用，随机客户端缺钱时反复选中"必然被拒"的招募动作，每步仅产生占位日志（与 M6 INVOKE 符号 bug 同模式）。修复：legalActions 中招募动作加费用检查。验收：合体接管 ×10 全 3/3（此前 ~1/6 失败）。打点代码保留（`AI_PROBE=1` env 门控，慢段 >1.5s 落盘 aiProbe.log）。
2. ~~AI 无 Agora 策略~~ **已完成（2026-09-05）**：evaluate() 增加 Agora 项（chamber 分值加权 cube 差、控制数差、霸权 4+ 指数加压、参议员/密谋资源价值）；实测合体 medium vs 随机 50%→88%、hard>medium 75%、base 模式无回归（medium 100%）。后续可继续精调权重。
3. ~~renderSmoke 缺 Agora 场景~~ **已完成（2026-09-05）**：参议院条 + 3 类 Agora 弹窗（密谋者二选一 / Conspire 保留 / 免费建造）确定性场景全部通过；bench 增加 `--json=` 输出，四模式基线落盘 `docs/ai-baseline/{base,agora,pantheon,combo}.json`。
4. bench:a（AI 强度基准）未跑。
5. 近似项（数据表 §8 已标注）：政治家分区 左3/中2/右2；chamber 印刷符号未知 → 法令面朝概率 1/16 模拟。

## 回归实测（2026-09-11，部署 / 性能收口 X1+X2+X3）

> 明细全部落盘 `docs/deploy-verification.md`。要点：

| 项 | 结果 |
|---|---|
| `server:build` 产物重建 + `node dist-server/server.mjs` 起服 | ✅（此前 dist-server 是 09-05 陈旧产物） |
| 静态托管断言（`/`、`/assets/*`、SPA 回落、HEAD） | ✅ 全 200 且 Content-Type 正确 |
| **路径穿越**：原始 socket 9 种变异（`..`/`%2e%2e`/`%5c`/探 `dist-server` 兄弟目录） | ✅ 全部回落 index.html，无泄漏 |
| **`proto:prod`（新）：联机 e2e 打正式产物**（含 dist/index.html 逐字节一致性前置断言） | ✅ 4/4（72.3 步均值）；`proto` 源码链路 4/4 同绿 |
| **静态服务器优化**：gzip 协商 + assets immutable 缓存（`node:zlib`，零依赖） | ✅ 主 JS 传输 312KB→99KB |
| **N6 Lighthouse 移动端**（Chrome 152 + Lighthouse 13.4.1） | ✅ **Performance 92**（优化前 80；FCP 2.6→1.4s、LCP 3.6→2.4s） |
| `proto:ai` 掉线→AI 托管 | ✅ 1/1 |
| N4 真机清单 | 🟡 已补「单人 Solo」9 项（3A.1–3A.9）；执行仍需 iOS/Android 设备 |

> 过程中发现并修复：① 测试装置竞态（只等一端 UPDATE 就比对两端视图，曾误报「状态不一致」，
> 终局帧必现）→ 改为两端都推进再比对；② **Lighthouse 11.7.1 + Chrome 152 的 NO_LCP 兼容问题**
> （类别分直接 null，最小页对照实验定位）→ 升 Lighthouse 13 解决。

## 测试入口速查

```bash
npm run sim:a        # Agora 随机对局（--agora 参数均可加于 sim/replay/bench/proto）
AGORA=1 PANTHEON=1 npx tsx scripts/simulate.ts 60   # 合体
npm run proto:a      # Agora 联机 e2e
npm run proto:ai:a   # Agora 掉线接管（AI_DEBUG=1 看诊断）
npm run proto:prod   # ⭐ 联机 e2e 打「正式产物」dist-server/server.mjs（需先起服）
AI_DEBUG=1 PORT=8123 npx tsx scripts/protoAiTakeover.ts  # 自定义端口

# ── Solo（M8）：base / Agora / Pantheon / 合体 ──
npm run soloSim -- 3                                  # base Solo
npm run soloAgoraSim -- 3                             # Agora Solo
npm run soloPantheonSim -- 3 medium                   # Pantheon Solo
npm run soloPantheonSim:combo                         # Pantheon + Agora 合体（12 局）
# 第二个参数可用 easy|medium|hard 指定玩家 AI 难度
```
