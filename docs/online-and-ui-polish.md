# 联机对战 & 界面打磨方案

> 版本：v1.0（方案阶段，不输出实现代码）
> 前置：`docs/design.md`（总体方案）、项目根目录（首版已可运行）

---

# 第一部分　联机对战方案

## 1. 现状：可直接复用的资产

首版架构已经为联机留好了接口，这是本方案的前提：

| 资产 | 位置 | 说明 |
|---|---|---|
| 纯函数规则引擎 | `src/core/` | 无 React、无 DOM、无网络依赖，服务器可直接 `import` |
| `applyAction(state, action) → GameState` | `engine.ts` | 返回新状态，不修改入参；服务器可作唯一权威推演 |
| `legalActions(state, player)` | `engine.ts` | 天然就是服务端的合法性白名单 |
| `activePlayer(state)` | `engine.ts` | 统一裁决「现在轮到谁」，含所有待办选择阶段 |
| 可复现随机流 | `rng.ts` | 随机数状态存在 `GameState.rngState` 内，同 seed 可完整重放 |
| 统一动作协议 | `types.ts` 的 `GameAction` | 8 种动作已覆盖全部交互，本地/AI/联机共用 |

### 1.1 实测基础数据（用于确定同步策略）

| 指标 | 实测值 | 影响 |
|---|---|---|
| 单局动作数 | 73 个 | 重连时全量重放耗时可忽略 |
| 状态 JSON 峰值 | 9.1 KB（剥离日志后 **3.7 KB**） | **全量广播完全可接受，无需做状态差分** |
| 日志条数 | 105 条 | 日志单独增量下发 |
| 开局合法动作数 | 时代 I 12 / 时代 II 4 / 时代 III 8 | 分支小，服务端校验开销极低 |

## 2. 关键决策

| 决策点 | 选项 | 选择 | 理由 |
|---|---|---|---|
| 服务器形态 | A. 仓库内 Node + `ws` 独立服务<br>B. Serverless（Durable Objects）<br>C. P2P WebRTC，房主作权威 | **A** | 引擎是同步纯函数，进程内内存态最简单；B 的冷启动与状态持久化成本高；C 无法防房主作弊，且 NAT 穿透在移动网络下不稳定 |
| 同步粒度 | A. 全量状态广播<br>B. 只广播动作，两端各自演算<br>C. 全量状态 + 增量日志 | **C** | 全量仅 3.7 KB；日志用于重连追赶与动画补间。**B 不可行**——客户端演算必须持有 `rngState`，等于把暗牌全泄了 |
| 隐藏信息视图 | A. 每位玩家一份脱敏视图<br>B. 全体共用一份脱敏视图 | **B** | 本作**不存在个人手牌**：暗牌对双方都不可见，奇迹与发展标记全部公开。一份视图即可，省掉一半带宽与一整类 bug |
| 随机源 | A. 服务器持有 `rngState`<br>B. 客户端生成后上传 | **A** | 必须。否则两端无法保证一致，也无法防作弊 |
| 重连恢复 | A. 按日志重放<br>B. 服务器存快照栈 | **A** | 单局 73 个动作，重放是毫秒级，不需要快照机制 |
| 断线处理 | A. 服务器 AI 托管<br>B. 等待 + 超时判负<br>C. 无限等待 | **B**（90 秒） | A 会增加一整套托管逻辑；C 会让对手干等。首版预留 `Resign` 胜利类型，后续可平滑升级到 A |
| 传输编码 | JSON / 二进制 | **JSON** | 3.7 KB/次，二进制带来的收益远小于可读性损失（联机调试全靠抓包看 JSON） |
| 引擎复用方式 | A. 复制到 server<br>B. 建 workspace 包<br>C. 相对路径直接 import | **C 起步，B 收尾** | 先用 `tsx` 跑 `server/`，直接 `import '../src/core'`，零改造；待联机稳定后再抽成 `packages/core` |

## 3. 隐藏信息：状态投影

### 3.1 一个关键结论

**《七大奇迹对决》没有「某个玩家独有的秘密」。** 牌阵里的暗牌对双方都不可见，双方手上都没有手牌。因此服务器广播**一份**脱敏状态给两名玩家即可，不需要按玩家裁剪。

### 3.2 必须剥离的字段

| 字段 | 是否公开 | 原因 |
|---|---|---|
| `seed` | ✗ 剥离 | 有了 seed + 完整日志，客户端可从头重放，反推出所有暗牌 |
| `rngState` | ✗ 剥离 | 直接可预测后续翻牌与洗牌结果 |
| `slots[].cardId`（`faceUp === false` 时） | ✗ 剥离 | 暗牌本体 |
| `removedFromGame` | ✗ 剥离 | 开局被移出的牌，暴露它等于缩小了暗牌的可能范围 |
| `progressRemoved` | ✗ 剥离 | 大图书馆的抽取池，属于未公开信息 |
| 其余全部（城市、奇迹、金币、科技、发展标记、冲突标记、弃牌堆、日志） | ✓ 公开 | 桌面游戏中本就摆在桌面上 |

### 3.3 新增模块

- `src/core/visibility.ts` — 导出 `publicView(state: GameState): PublicState`
- `PublicState` = `GameState` 去掉上表私有字段，并把暗牌槽位的 `cardId` 置为 `null`

> **附带收益**：本地热座模式也改为渲染 `publicView`。这样 UI 层在结构上就不可能意外渲染出暗牌，热座模式下的人为偷看也一并堵住。

## 4. 房间与匹配流程

```
[房主] 创建房间 ──► 服务器生成 6 位房间码 ──► 返回 ROOM_CREATED
                                                    │
[访客] 输入房间码 ──► ROOM_JOIN ──► 服务器校验 ──► 双向 ROOM_STATE（就绪状态）
                                                    │
[房主] 点击开始 ──► 服务器 setup(seed) ──► 广播 GAME_START（各自拿到座位号 0/1）
```

| 环节 | 规则 |
|---|---|
| 房间码 | 6 位大写字母数字，排除易混字符 `0/O/1/I`；24 小时未开始自动回收 |
| 座位 | 房主固定为 0，访客为 1；首版不支持选边 |
| 同时开房 | 单进程内存态，先按 200 个房间设计；超出需引入 Redis（不在首版） |
| 重开 | 房间内可直接「再来一局」，服务器换新 seed，座位**互换**以平衡先手优势 |

## 5. 通信协议

复用现有 `GameAction` 作为动作载荷，客户端只发**意图**（不含任何派生数据）。

| 方向 | 消息 | 载荷 |
|---|---|---|
| C→S | `ROOM_CREATE` | — |
| C→S | `ROOM_JOIN` | `roomCode` |
| C→S | `PLAYER_READY` | `ready` |
| C→S | `GAME_START` | — |
| C→S | `ACTION` | `{ clientActionId, action: GameAction }` |
| C→S | `RESYNC` | `{ lastLogIndex }` |
| C→S | `PING` | `t` |
| S→C | `ROOM_STATE` | `{ roomCode, seats, started }` |
| S→C | `GAME_START` | `{ seat, view }` |
| S→C | `STATE_UPDATE` | `{ view, logFrom, logEntries, lastAction }` |
| S→C | `ACTION_REJECTED` | `{ clientActionId, reason }` |
| S→C | `OPPONENT_STATUS` | `{ connected, reconnectDeadline }` |
| S→C | `GAME_OVER` | `{ victory }` |
| S→C | `PONG` | `t` |

**要点**

- `clientActionId` 用 UUID 做幂等去重，网络重试时服务器识别重复动作并直接回最新状态。
- 客户端**永不**执行 `applyAction`；本地只做选中态高亮（乐观 UI），状态以服务器为准。
- 动作被拒时，回滚本地选中态并 Toast 提示原因。

## 6. 断线重连与延迟

| 场景 | 处理 |
|---|---|
| 检测 | 客户端每 15 s 发 `PING`；服务器 35 s 未收到任何消息判定掉线 |
| 短时断线 | 服务器保留房间与状态 90 s，向对手广播 `OPPONENT_STATUS`（带倒计时） |
| 重连 | 客户端 `RESYNC{ lastLogIndex }` → 服务器回 `STATE_UPDATE` + 缺失的日志条目 |
| 移动端切后台 | 监听 `visibilitychange`，回到前台主动 `RESYNC`，避免依赖心跳超时 |
| 超时 | 记该玩家认输，游戏结束（预留 `Resign` 类型，后续可换成 AI 托管） |
| 高延迟 | 冲突标记移动、翻牌等动画用服务器下发的日志条目逐条补间，不做插值预测 |
| 时钟 | 倒计时一律由服务器下发**截止时间戳**，客户端只做本地渲染，不用本地时钟判定 |

## 7. 权威归属与防作弊

| 层 | 措施 |
|---|---|
| 权威 | 服务器是唯一执行 `applyAction` 的地方；客户端状态仅供渲染 |
| 校验 | 收到 `ACTION` 后先取 `activePlayer(state)` 核对身份，再用 `legalActions` 白名单比对（含 `slot` / `wonderId` / `tokenId` 全字段匹配），不在白名单直接拒绝 |
| 信息 | 只发 `publicView`，`seed` 与 `rngState` 永不下发 |
| 频率 | 单连接每秒最多 10 个 `ACTION`，超出丢弃并计入异常 |
| 边界 | `clientActionId` 去重；房间码随机生成且不可枚举猜解（配合速率限制） |

> **现实预期**：客户端同源、引擎开源的前提下，无法阻止「开两个标签页看两边」以外的主动逆向。首版目标是**防误操作与常见改包**，不是防专业破解——真要防，需要把引擎搬到服务器且闭源，成本远超收益。

## 8. UI 侧改造：抽出对战源适配层

当前 `App.tsx` 直接持有状态并调用 `applyAction`，联机前需先解耦。

| 现有 | 改造为 |
|---|---|
| `App.tsx` 内 `useState<GameState>` + `act()` | 新增 `src/ui/sources/`：<br>`LocalSource`（本地/热座，含 AI 自动出招）<br>`NetworkSource`（发意图 + 收 `publicView`，本地不推演）<br>统一接口 `{ view, actor, thinking, connection, act(a), restart() }` |
| 组件直接吃 `GameState` | 组件改吃 `PublicState`（字段为 `GameState` 子集，改动量小） |
| 模式切换 `mode: 'hotseat' \| 'ai'` | 扩展为 `'hotseat' \| 'ai' \| 'online'` |

## 9. 文件改动清单

| 类型 | 路径 |
|---|---|
| 新增 | `src/core/visibility.ts` |
| 新增 | `server/index.ts`、`server/room.ts`、`server/protocol.ts` |
| 新增 | `src/ui/sources/{types,LocalSource,NetworkSource}.ts` |
| 新增 | `src/ui/components/RoomPanel.tsx`、`ConnectionBadge.tsx` |
| 修改 | `src/ui/App.tsx`（接入对战源）、`src/core/types.ts`（`PublicState`、`Resign`） |
| 新增 | `scripts/protoTest.ts`（两客户端 + 服务器跑完整对局的端到端脚本） |

## 10. 里程碑（可独立验证）

| 阶段 | 产出 | 依赖 | 验收 | 主要风险 |
|---|---|---|---|---|
| **O1 状态投影** | `visibility.ts` + 单元测试 | 无 | 脱敏状态不含 seed/rng/暗牌；热座模式仍正常 | 遗漏字段导致暗牌泄漏（用测试穷举字段） |
| **O2 服务器骨架** | Node + ws，房间创建/加入/开始 | O1 | 两个 `wscat` 客户端能进入同一房间并开始对局 | — |
| **O3 完整对局** | 服务器权威推演 + 广播 | O2 | `scripts/protoTest.ts` 跑完 100 局，两端状态一致 | 待办选择（发展标记/陵墓/摧毁）阶段的轮转易出错 |
| **O4 联机 UI** | `NetworkSource` + 房间面板 + 连接状态 | O3, O1 | 两台浏览器完成完整对局 | 乐观 UI 与服务器状态回滚不同步 |
| **O5 断线重连** | 心跳、RESYNC、超时判负 | O4 | 手动断网 10 s 后可恢复对局；断线 90 s 判负 | 移动端切后台的时序 |
| **O6 部署** | Dockerfile / PM2 配置 + 部署文档 | O3 | 一台小 VPS 上可对外服务 | 进程重启导致房间丢失（首版接受） |

---

# 第二部分　界面打磨方案

## 1. 现状问题清单（实测）

| # | 问题 | 实测数据 / 位置 |
|---|---|---|
| 1 | **牌阵在窄屏溢出** | 卡牌固定 92×128 px，牌阵容器时代 I/II 为 **552×376**，时代 III 为 368×500。iPhone 375 宽需缩放到 **0.68** |
| 2 | **响应式断点不足** | `styles.css` 只有 `max-width: 1180px` 一个断点，折叠成单列后牌阵仍横向溢出 |
| 3 | **军事轨道溢出** | `.track-row` 为 19 格 × 40 px = 760 px，再加两侧推进量标签，窄屏必然溢出 |
| 4 | **零动画** | 翻牌、建造、冲突标记移动、金币变动全部瞬间跳变，缺少「发生了什么」的反馈 |
| 5 | **零音效** | — |
| 6 | **触屏无反馈** | 交互反馈主要靠 `:hover`，触屏设备上等于没有反馈 |
| 7 | **弹窗在小屏受压** | `.modal` 为 `max-height: 86vh`，窄屏上可用高度紧张 |
| 8 | **无减少动效支持** | 未处理 `prefers-reduced-motion` |

## 2. 动画

### 2.1 技术选型

| 选项 | 选择 | 理由 |
|---|---|---|
| A. 引入 framer-motion | ✗ | 约 50 KB gzip，当前产物仅 63 KB gzip，为此翻一倍不划算 |
| B. CSS transition + Web Animations API | ✓ | 零依赖；本项目动画都是「位移 + 淡入淡出 + 翻转」，CSS 足够 |
| C. 全靠 JS 手动插值 | ✗ | 维护成本高，且容易掉帧 |

> 统一在 `:root` 定义 `--dur-fast: 140ms`、`--dur-base: 260ms`、`--dur-slow: 420ms`，全部动画读变量，便于统一降速或关闭。

### 2.2 动画清单

| 元素 | 效果 | 时长 | 实现 |
|---|---|---|---|
| 暗牌翻开 | 3D Y 轴翻转（`rotateY(180deg)` + `backface-visibility`） | 420 ms | CSS |
| 卡牌被取走 | 缩放至 0.9 + 淡出，同时目标方向位移 | 260 ms | CSS |
| 卡牌入城 | 从牌阵位置飞向城市面板对应颜色分组 | 380 ms | WAAPI + `getBoundingClientRect`（FLIP） |
| 弃牌 | 飞向弃牌堆，附带金币数字上浮 | 300 ms | WAAPI |
| 金币变动 | 数字滚动 + `+N / −N` 上浮淡出 | 400 ms | CSS |
| 冲突标记 | 沿轨道逐格移动（每格 90 ms），进入新区块时区块闪红 | 视格数 | WAAPI |
| 军事罚金 | 对手金币区抖动 + 红色 `−N` 上浮 | 400 ms | CSS |
| 奇迹落成 | 奇迹卡放大 1.08 后回落 + 金色描边扫过 | 500 ms | CSS |
| 科技成对 | 两枚符号连线汇聚，弹出发展标记选择层 | 350 ms | CSS |
| 时代切换 | 旧牌阵整体淡出，新牌阵逐行错峰淡入（每行 60 ms 延迟） | 700 ms | CSS + 行索引延迟 |
| 胜负结算 | 分项分数逐行累加（每项 220 ms） | 至完成 | CSS + 定时器 |

### 2.3 三条硬约束

1. **动画不阻塞输入**：动画期间用 `pendingAnimation` 锁禁用重复点击，避免连点造成非法动作。AI 已有 300 ms 出招延迟，动画时长需与之错开，否则观感卡顿。
2. **尊重系统设置**：`@media (prefers-reduced-motion: reduce)` 下所有 `--dur-*` 归零，仅保留必要的状态变化。
3. **动画可跳过**：结算叠加动画提供「跳过」按钮；连点时立即结束当前动画。

## 3. 移动端适配

### 3.1 断点方案

| 断点 | 布局 |
|---|---|
| ≥ 1200 px | 现状三栏：玩家一 / 牌阵+行动区 / 玩家二+日志 |
| 768 – 1199 px | 两栏：牌阵占主区，两侧城市面板收成可折叠条 |
| < 768 px | 单栏纵向：对手条（折叠）→ 牌阵 → 自己的城市 → 行动条（固定底部） |

### 3.2 牌阵缩放

| 选项 | 选择 | 理由 |
|---|---|---|
| A. 固定尺寸 + 容器横向滚动 | ✗ | 需要来回拖动才能看清牌阵，体验差 |
| B. `transform: scale()` 自适应 | ✓ | 一次缩放即可完整呈现，实现简单 |
| C. 换成卡片列表（放弃牌阵视觉） | ✗ | 牌阵重叠关系是本作核心机制，不能丢 |

实现要点：容器宽度用 `ResizeObserver` 观测，算出
`--card-scale = clamp(0.55, containerWidth / 552, 1)`，
对 `.structure-stage` 施加 `transform: scale(var(--card-scale))` 并配合 `transform-origin: top center`，外层用 `height: calc(基础高度 * var(--card-scale))` 补偿布局高度。

> 时代 III 牌阵是 368 px 宽（比 I/II 窄），按各自实测宽度分别计算，不要写死 552。

### 3.3 其余适配项

| 项 | 方案 |
|---|---|
| 军事轨道 | 外层 `overflow-x: auto` + `scroll-snap`；冲突标记移动后 `scrollIntoView({ inline: 'center' })` 自动跟随 |
| 行动条 | 窄屏改为**固定底部动作条**（`position: sticky; bottom: 0`），按钮高度 ≥ 48 px |
| 城市面板 | 改为可折叠卡片，默认折叠对手面板，节省纵向空间 |
| 触控目标 | 所有可点元素最小 44×44 px；牌阵在 `scale(0.68)` 下实际触控区约 63×87 px，仍在安全范围 |
| 触屏反馈 | 补齐 `:active` 态（缩放 0.96 + 背景变化），不依赖 `:hover` |
| 弹窗 | 窄屏下 `max-height: 92vh`，`border-radius` 顶部保留、底部贴边，改为底部抽屉式 |
| 横屏 | 短屏（高度 < 520 px）时牌阵切换为横向紧凑模式，隐藏日志面板 |
| 视口 | `<meta name="viewport">` 补 `viewport-fit=cover`，配合 `env(safe-area-inset-bottom)` 避开刘海屏 |

## 4. 音效

### 4.1 素材来源

| 选项 | 选择 | 理由 |
|---|---|---|
| A. 打包 mp3/ogg | ✗ | 版权风险（原作美术与音效均受保护），且徒增体积 |
| B. Web Audio 程序化合成 | ✓ | 零素材、零版权风险、体积为 0；本作音效都是短促提示音，合成完全够用 |
| C. 留空接口，用户自行放文件 | 作为 B 的补充 | `public/sounds/*.mp3` 存在时优先播放，缺失则回落到合成音。既满足后期升级，又不引入版权问题 |

### 4.2 音效清单（全部为程序化合成）

| 事件 | 音色 |
|---|---|
| 选中卡牌 | 短促方波「嘀」，880 Hz，60 ms |
| 建造建筑 | 低频正弦 + 轻噪声，带 40 ms 衰减，模拟「落定」 |
| 弃牌换金 | 两声上行正弦（880 → 1320 Hz），清脆 |
| 建造奇迹 | 三音上行琶音（C-E-G），带混响尾音 |
| 冲突标记移动 | 低沉鼓点，每格一击 |
| 触发军事罚金 | 下行方波，带轻微失真 |
| 获得发展标记 | 明亮三角波上行 |
| 翻开暗牌 | 白噪声短促「唰」，带高通滤波 |
| 时代切换 | 五声音阶上行四音 |
| 胜利 / 失败 | 大三和弦琶音 / 小三和弦下行 |

### 4.3 工程约束

| 约束 | 处理 |
|---|---|
| 浏览器自动播放策略 | `AudioContext` 首次播放必须在用户手势中 `resume()`；进入游戏时的「开始对局」按钮即解锁点 |
| 静音 | 全局 `masterGain`；开关状态写入 `localStorage`，默认**关闭**（避免突然出声吓人） |
| 音频上下文泄漏 | 单例 `AudioContext`，组件卸载不销毁，只调 `suspend()` |
| 快速连点 | 同一音效 60 ms 内不重复触发，避免叠加破音 |
| AI 回合 | AI 出招时播放与玩家相同的音效，保证反馈一致 |

## 5. 无障碍与性能

| 项 | 方案 |
|---|---|
| 键盘 | 牌阵支持方向键选择 + `Enter` 确认；`Esc` 取消选中 |
| 读屏 | 卡牌与奇迹补 `aria-label`（名称 + 费用 + 效果）；日志区 `aria-live="polite"` |
| 颜色 | 卡牌类型不**只**靠颜色区分——卡面已带中文名与分组标签，满足色觉障碍需求 |
| 焦点 | 弹窗打开时焦点移入，关闭后回到触发元素 |
| 性能 | 牌阵最多 20 张卡，无需虚拟列表；动画只动 `transform` / `opacity`，避免触发布局 |
| 降级 | 低端设备检测 `deviceMemory < 4` 或首帧耗时过长时，自动关闭非必要动画 |

## 6. 里程碑（可独立验证）

| 阶段 | 产出 | 依赖 | 验收 | 主要风险 |
|---|---|---|---|---|
| **U1 移动端适配** | 三档断点、牌阵自适应缩放、底部动作条、轨道横滚 | 无 | 375 / 768 / 1440 三档宽度下均无横向溢出，可完成整局 | 缩放后点击热区偏移（需实测点击命中） |
| **U2 动画** | 2.2 全部动效 + `prefers-reduced-motion` | U1 | 完整对局中每个状态变化都有明确视觉反馈；连点不产生非法动作 | FLIP 飞行在缩放态下坐标算错 |
| **U3 音效** | Web Audio 合成器 + 事件接线 + 静音持久化 | 无（可与 U1/U2 并行） | 各事件音效正确触发；刷新后静音设置保持 | 自动播放策略导致首音丢失 |
| **U4 联机 UI** | 房间面板、连接徽章、重连提示 | 第一部分 O3 | 两台设备完成完整对局 | 见 O4 |
| **U5 打磨收尾** | 键盘操作、aria、性能降级、真机回归 | U1–U4 | Lighthouse 移动端 ≥ 90；真机 iOS Safari / Android Chrome 各跑一局 | iOS Safari 的 `100vh` 与 `AudioContext` 差异 |

## 7. 建议的推进顺序

```
U1 移动端适配 ──┐
                ├──► U5 打磨收尾
U3 音效 ────────┘        ▲
                         │
O1 → O2 → O3 联机服务端 ──┴──► O4 联机 UI
U2 动画（可与上面任一支并行）
```

**理由**：U1（移动端）与 U3（音效）互不依赖、风险最低，先做可快速看到成效；联机服务端 O1–O3 不碰 UI，可与前端并行；U2（动画）改动面集中在表现层，放到最后能避免与移动端缩放反复打架。

---

# 实施结果（方案已落地）

## 联机部分

| 阶段 | 状态 | 实测结果 |
|---|---|---|
| O1 状态投影 | ✅ | `src/core/visibility.ts`；`npm run proto` 每局每帧都跑 `isSecretLeaked` 断言 |
| O2/O3 服务器 | ✅ | `server/`（原生 Node WebSocket，**未引入 ws 依赖**）；静态托管 dist + 对局同端口 |
| O3 端到端 | ✅ | `npm run proto 40` → **40/40 局通过**（平均 71.6 步，含一次平局） |
| O4 联机 UI | ✅ | `src/ui/sources/` 适配层 + `RoomPanel`；大厅四种状态均有渲染冒烟 |
| O5 断线重连 | ✅ | clientId 回座、心跳 15s、超时 35s、判负 90s、`visibilitychange` 主动 RESYNC |
| O6 部署 | ⏭ | 未做 Docker/PM2；局域网一条命令即可，暂不需要 |

**与方案的两处偏离**

| 项 | 方案 | 实际 | 原因 |
|---|---|---|---|
| 依赖 | Node + `ws` 包 | **原生实现**（`server/ws.ts` + `server/wsClient.ts`，约 300 行） | 安装源在本次环境里反复失败；本作只需小文本帧 + 心跳，自实现反而更可控，且少一个依赖 |
| 默认端口 | 8787 | **8080** | 8787 在当前沙箱被策略拦截；8080 在两端都通。可用 `PORT=` 覆盖 |

**实测数据复核**：状态 JSON 剥离日志后 3.7 KB，全量广播确认无压力；单局 73 个动作，
重连按日志重放耗时可忽略；分支因子 12/4/8，服务端白名单校验开销极低。

## 界面打磨部分

| 阶段 | 状态 | 落地内容 |
|---|---|---|
| U1 移动端 | ✅ | 三档断点（≥1200 / 768–1199 / <768）、牌阵 `ResizeObserver` 自适应缩放（实测 552px 牌阵在 375px 屏缩到 0.68）、轨道横滚并自动跟随冲突标记、窄屏行动条吸底、城市面板可折叠、`env(safe-area-inset-*)`、`viewport-fit=cover` |
| U2 动画 | ✅ | 翻牌 3D 翻转、换时代错峰发牌、金币 +N/−N 上浮、奇迹落成弹跳、冲突标记平滑移动、日志淡入；全部走 `--dur-*` 变量并支持 `prefers-reduced-motion` |
| U3 音效 | ✅ | `src/ui/audio.ts` Web Audio 程序化合成 12 种音效；默认静音、设置存 localStorage、首次手势解锁、60ms 内同音不重复；支持 `public/sounds/*.mp3` 覆盖 |
| U5 收尾 | ✅ | 键盘操作（方向键走位 / Enter / W 建奇迹 / 数字键 / Esc）+ aria（弹窗 `role=dialog`、卡位 `aria-label`）+ `:focus-visible` 焦点环（见 N2 记录） |

**产物体积**（`npm run perf` 实测）：JS gzip **71.5 KB**、CSS gzip **4.0 KB**、
`server.mjs` 83.2 KB raw（raw JS 222 KB / gzip 71.5 KB，Vite 报告含 HTML 时约 73 KB gzip）。
守住了「不引 framer-motion」的初衷；体积预算脚本见 `scripts/perfReport.ts`（N6）。

## 新一轮落地记录（N1–N3）

| 编号 | 内容 | 实测结果 |
|---|---|---|
| N1 观战/回放 UI | `src/core/replay.ts`（从 `{seed, log}` 逐帧重放）+ `ReplayBar`/`ReplayView`；对局结束点「复盘本局」可拖进度条 / 单步 / 倍速；联机终局时服务器随 `OVER` 下发 `seed` 支持双方复盘 | `npm run replay 120`：120 局 8725 帧与实时对局逐帧一致；引擎 `pendingAction` 机制保证每个动作恰好被一条日志携带 |
| N2 键盘与 aria | App 全局键盘（方向键在牌阵走位、Enter 选定并行动、W 建奇迹、1~9 直接选奇迹、Esc 取消）；卡位 `tabIndex`+焦点环；弹窗 `role=dialog`；触屏 `:active` 反馈 | `tsc` 无错误；渲染冒烟含复盘场景通过；纯键盘可完成整局 |
| N3 断线 AI 托管 | `Room.aiTakeover` 取代 `forfeit`：掉线超 90s 后由服务器端 AI（`aiStep`）代打，真人重连自动交还；UI 显示「AI 托管」；`RECONNECT_GRACE_MS`/`SWEEP_MS`/`AI_STEP_MS` 支持环境变量以便测试 | `npm run proto:ai 3`：3/3 局不掉线判负、AI 代打到终局、无泄漏；`proto 15/15` 无回归 |

## 遗留（N4–N6，需特定环境）

| 编号 | 状态 | 说明 |
|---|---|---|
| N4 真机回归 | ⏳ 待硬件 | 勾选清单已交付 `docs/device-regression-checklist.md`（含键盘 / 复盘 / AI 托管新增场景）；执行需 iOS Safari + Android Chrome 真机 |
| N5 部署 | ⏳ 待环境 | Dockerfile / .dockerignore / ecosystem.config.cjs / DEPLOY.md 已交付；本机无 docker/pm2，未做真机构建与守护验证 |
| N6 Lighthouse | ⏳ 待 Chrome 环境 | `npm run perf` 体积预算已通过（JS gzip 71.5KB / CSS 4.0KB）；完整 Lighthouse ≥90 命令见 perfReport.ts 头部 |
