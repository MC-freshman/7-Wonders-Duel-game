# M8 Solo 规则取证文档（官方 Print & Play 2020）

> 来源：Repos Production / Asmodee 官方 Solo PnP（Bruno Cathala, 2020）
> 规则全文转录：`https://bl.ocks.org/erikhuizinga/f9e286dcf1d1a30b8d8301eed4f8085a`（玩家社区逐字 Kotlin 转录，与官方 PDF 文本一致）
> 官方 PDF 入口：`https://print-and-play.asmodee.fun/7-wonders-duel/`
>
> 本文件为 M8 实现唯一权威数据源。规则边界一律以本文件为准，不引入任何猜测。

---

## 1. 五位领袖（Leaders）

| id | 中文 | 颜色 | 连动符号 replay | 开局持有发展标记 | 终局加分 |
|----|------|------|----------------|------------------|----------|
| `caesar` | 凯撒 | 紫 purple | 无 | Strategy（战略） | — |
| `hammurabi` | 汉谟拉比 | 黄 yellow | ● circle | Economy（经济） | 游戏进行到时代 III 末时 **+5 分** |
| `cleopatra` | 克娄巴特拉 | 蓝 blue | ▲ triangle | Philosophy（哲学）+ Agriculture（农业） | — |
| `aristotle` | 亚里士多德 | 灰 grey | ● circle | Law（法律）+ Mathematics（数学） | — |
| `bilkis` | 巴尔基斯 | 棕 brown | ● circle + ▲ triangle | Economy（经济） | — |

- **领袖卡颜色** = 决策卡空槽位的默认匹配色（见 §3 解析）。
- **连动（replay）**：当抽到的决策卡的 `replay` 符号 ∈ 该领袖的 `replays` 集合时，领袖立即再行动一回合。

## 2. 12 张决策卡（Decision Cards）

`DecisionCard` 默认值：`direction=RIGHT`、`primaryColor=GREEN`、`secondaryColor=RED`、`tertiaryColor=null`、`replay=null`。

| # | 方向 | 主色 | 次色 | 三色 | 连动 |
|---|------|------|------|------|------|
| 1 | RIGHT | GREEN | RED | (领袖色) | — |
| 2 | RIGHT | GREEN | RED | (领袖色) | — |
| 3 | RIGHT | GREEN | RED | (领袖色) | — |
| 4 | RIGHT | RED | GREEN | (领袖色) | — |
| 5 | RIGHT | RED | GREEN | (领袖色) | — |
| 6 | RIGHT | (领袖色) | RED | GREEN | ▲ triangle |
| 7 | LEFT | GREEN | RED | (领袖色) | — |
| 8 | LEFT | RED | GREEN | (领袖色) | — |
| 9 | LEFT | RED | GREEN | (领袖色) | — |
| 10 | LEFT | RED | GREEN | (领袖色) | — |
| 11 | LEFT | GREEN | RED | (领袖色) | — |
| 12 | LEFT | (领袖色) | GREEN | RED | ● circle |

> 表中「(领袖色)」表示运行时按 §3 解析为领袖卡颜色。

> ⚠️ **勘误（2026-09-10 修订）**：第 6 张卡的 **次色应为 RED**，而不是「(领袖色)」。
> 依据 Kotlin 类默认值 `class DecisionCard(..., secondaryCardColor: CardColors? = CardColors.RED, ...)`：
> 卡片 6 只覆写了 `primaryCardColor = null` / `tertiaryCardColor = GREEN` / `replay = TRIANGLE`，
> **未传 `secondaryCardColor` → 沿用默认 RED**。`src/core/solo/data.ts` 已同步修正（此前误写为 `secondaryColor: null`）。
>
> **卡面排布约定**（官方 base Solo 规则本 Gameplay ① 确认）：三个色格按**箭头方向**顺序排列 ——
> 箭头 ⟶（evaluate **from left to right**）时，从左往右依次是 primary / secondary / tertiary；
> 箭头 ⟵（from right to left）时，从右往左依次是 primary / secondary / tertiary。
> 等价于：**⟶ = 从牌阵最左列起（本作 `direction: 'left'`）；⟵ = 从最右列起（`direction: 'right'`）。**

## 3. 决策卡运行时解析（leaderTurn）

```
primary   = primaryColor   ?? leader.cardColor
secondary = secondaryColor ?? leader.cardColor
tertiary  = tertiaryColor  ?? leader.cardColor
colors    = [primary, secondary, tertiary]
             .filter(age === 3 || it !== PURPLE)   // 非时代 III 时紫色被过滤
```

行动顺序：从指定方向（LEFT=最左列起 / RIGHT=最右列起）扫描当前可拿取的牌：
1. 取第一张匹配 `primary` 色的牌；
2. 否则取第一张匹配 `secondary` 色的牌；
3. 否则取第一张匹配 `tertiary` 色的牌；
4. 否则取该方向第一张可拿取的牌（任意色）。

领袖**免费建造**该牌（不支付费用）；建造时若凑成科技符号对子（pair），按基础规则额外取 1 枚发展标记。

## 4. 颜色 → 本作 CardType 映射

| Solo 颜色 | CardType | 中文 |
|-----------|----------|------|
| purple | guild | 行会 |
| yellow | commercial | 商业 |
| blue | civilian | 市政 |
| grey | manufactured | 制造物 |
| brown | raw | 原料 |
| red | military | 军事 |
| green | scientific | 科技 |

## 5. 开局（Setup）要点

- 时代 I 牌阵同普通对局；玩家面朝牌阵第一行，左侧为玩家城邦、右侧为领袖城邦。
- 给玩家 7 金币，领袖 0 金币。
- 洗混所有奇迹牌，抽 3 张：玩家取 2 张、领袖取 1 张；重复一次 → 玩家持有 4 张未建奇迹，领袖持有 2 张**视为已建成**的奇迹。
- 领袖 2 张预建奇迹的即时效果：
  - 盾 / 剑 → 移动冲突标记；
  - 金币 → 领袖从银行获得对应金币；
  - 破损金币（broken coins）→ 领袖失去对应金币；
  - 发展标记 → 从「开局弃置的发展标记」中随机取 1 枚给领袖；
  - **其余效果忽略**（资源产出、再次行动、拆牌、弃牌回收等不触发）；奇迹的 VP 在终局计入。
- 时代 I **由领袖先手**。

## 6. 对局（Gameplay）要点

- 玩家与领袖交替行动；领袖的每个行动由决策卡决定（见 §3）。
- 若决策卡 `replay` 命中领袖符号 → 领袖立即再行动（重新抽决策卡）。
- 领袖**免费建造**；若凑成科技对子则额外取 1 枚发展标记。
- 时代 II / III 开始时，若领袖有选择权则**领袖先手**（本作实现统一让领袖先手）。
- 终局计分同基础版；Hammurabi 在游戏进行到时代 III 末时额外 **+5 分**。

## 7. 实现映射（src/core/solo/）

- `data.ts`：五位领袖（`SOLO_LEADERS`）与 12 张决策卡（`SOLO_DECISION_CARDS`）逐字录入；`SOLO_COLOR_TO_TYPE` 为 §4 映射。
- `solo.ts`：
  - `createSoloGame(seed, leaderId?)` 完成 §5 开局（复用 `initialState` / `setupAge`）。
  - `soloLeaderTurn` 完成 §3 决策解析 + §6 连动；领袖免费建造通过「调用 `applyAction` 前临时为领袖补足 `plan.total` 金币」实现（详见文件头注释），**零侵入主引擎**。
  - `soloFinalizeVictory` 完成 Hammurabi +5（仅当非军事 / 科技速胜）。
- 删除 `src/core/solo/` 即对局整体回退到无 Solo 状态。
