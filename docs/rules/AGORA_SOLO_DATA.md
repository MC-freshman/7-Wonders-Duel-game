# Agora Solo 扩展 · 数据核对表（M8-A 数据源）

> 主源 = **Agora Solo rulebook v1.2**（4 页，文本层完好，
> `docs/rules/7_wonders_duel_agora_solo_rulebook_printable_v1.2.pdf`，全文已提取至 `_solo_text.txt`）。
> ⚠️ **硬依赖缺口**：Agora Solo 是 base「7 Wonders Duel Solo Print & Play」的附加规则，
> **base Solo 规则书不在本地**——Leader 决策卡偏好顺序、军事 token 之外的 Solo 行动规则、
> 胜负判定等都在 base Solo 规则里。M8-B 开工前必须补齐（官方 Repos 免费下载或用户提供）。

> ✅ **2026-09-10 更新：全部缺口已解除。** 权威文档已迁至
> **`docs/rules/SOLO_AGORA_DATA.md`**（与 base 的 `SOLO_DATA.md` 并列），其中已补齐：
> ① base Solo 12 张决策卡的 (primary/secondary/tertiary) + direction（Kotlin 权威转录）；
> ② **Agora 5 张替换决策卡的卡面**（`7_wonders_duel_agora_solo_cards_v1.2.pdf` p1，用户提供）；
> ③ 9 位领袖全量卡面核对（含 Agora 的 Brutus）；
> ④ 箭头 ⟶/⟵ 与「from left to right / right to left」的对应关系（官方 base Solo 规则本 ①）。
> 本文档保留作历史核对记录，**以新文档为准**。

## 1. 组件与设置（v1.2 p1）

| 项 | 数据 |
|---|---|
| 依赖 | 7W Duel + Agora + **7W Duel Solo PnP**（base Solo） |
| 设置 | 按 base Solo 准备；按 Agora 规则摆 Agora 组件与三个时代牌阵；**替换 base Solo 的 5 张 Decision cards** 为本扩展更新版；Leader 得 1 套 12 影响方块 |

## 2. Leader 回合 · Agora 附加规则（v1.2 p2）

Decision cards 带旗帜图标（5/12 张，合体时 5 Agora + 3 Pantheon + 4 无图标）时：

1. **触发密谋**：Leader 有面朝下密谋 → 随机挑 1 张触发。**Leader 无需准备密谋**（拿到即算已准备）。
2. **首选动作 = 从结构拿参议员（黑白皆可），忽略参议员费用**；结构无参议员 → 按 Decision card 常规偏好走。

### 政治家（白）参议院行动判定（逐个行动独立判定，评估方向 = 决策箭头）

| 序 | 规则 |
|---|---|
| 1 | 在该政治家标注的**分区**内：给 Leader 未控制的**第一个** chamber 加 1 Leader 方块；若 Leader 已控制该分区两 chamber → 2 |
| 2 | **移动**：从「任一方控制且双方方块差 >1 的第一个 chamber」取 1 个 Leader 方块，移到「无人控制或 Leader 差 1 的第一个 chamber」（**可非相邻**）；无可行 → 3 |
| 3 | 按评估方向给第一个 chamber 加 1 Leader 方块；Leader 面前方块用尽 → 不执行 |

### 密谋者（黑）

| 条件 | 行动 |
|---|---|
| 玩家控制 ≥4 chamber 且 Leader 有剩余方块 | 按箭头给 Leader 未控制的第一个 chamber 加 1 方块 |
| 否则 | **Conspire**：抽牌库顶 2 张 → 洗匀 → 随机 1 张面朝下给 Leader；另一张按箭头放牌库顶（箭头右）或底（箭头左）。Leader 有 Organized Crime → 两张都给 |

## 3. Agora Leader：Brutus（v1.2 p2）

- 开局自带 **Organized Crime** 进度 token
- 决策卡偏好 = **蓝卡**
- Decision card 带 replay 图标时**立即再行动一回合**

## 4. 合体（Pantheon Solo + Agora Solo）

Decision cards = 3 Pantheon 图标 + 5 Agora 图标 + 4 无图标；对手 Leader 可选 5 base + 3 Pantheon + 1 Agora（共 9 位）。行动判定遵循 base Solo + 两个扩展的附加规则。

## 5. 法令 token（Leader 控制时的收益，v1.2 p3）

| 法令 | Leader 侧效果 |
|---|---|
| 豁免·黄 | **Leader 建造卡片从不付费**（资源+金币全免） |
| 豁免·红 | 无效果 |
| 豁免·绿 | 无效果 |
| 奇迹减负 | **Leader 建奇迹从不付资源** |
| 蓝卡税收 | 你或 Leader 每建 1 张该色卡 → Leader 得金 = 当前时代 |
| 奇迹税收 | 同上（奇迹）；**Leader 经密谋（或 Pantheon 神格）偷走的奇迹视为已建造**（触发收益） |
| 贸易优惠·棕/灰 | 无效果 |
| 参议院雄辩 | Leader 的蓝卡数 +2（算参议院行动数时） |
| 军事推进 | Leader +1 盾并推进 1 格（朝你首都） |
| 弃牌补贴 | **Leader 永不执行弃牌动作**（改按决策卡其他偏好） |
| 外交连锁 | Leader 有 Urbanism token 时，其每次建造「连锁费在你城里存在」的卡 → +4 金；否则无效果 |
| 密谋再起 | Leader 招募密谋者后立即再行动；与决策卡 replay 同回合只加 1 次 |

### 涉及 Leader 的密谋特例

| 密谋 | Leader 侧效果 |
|---|---|
| 偷梁换柱 | 取你**最高分**蓝卡给 Leader；再取 Leader **最低分**蓝卡给你；若 Leader 拿到的卡低于其已有任一蓝卡 → 原样退回（动作无效化）。**Leader 不换绿卡** |
| 改写法令 | 按箭头从你控制的第一个 chamber 取法令，压到 Leader 控制的第一个 chamber 法令下；你无控制 → 从无人控制的第一个 chamber 取；Leader 无控制 → 不执行 |
| 密谋针对 Leader 的奇迹 | **忽略 constructed/unconstructed 限定**（Leader 的已建/未建奇迹都可成为目标） |

### Agora 奇迹（Leader 侧开局效果）

| 奇迹 | Leader 开局效果 |
|---|---|
| Curia Julia | +6 金；抽牌库顶 1 张密谋**立即触发**；Organized Crime → 抽 2 张只触发第一张 |
| Knossos | 从 Leader 方块取 2 枚放**中间两个 chamber**（2、3 号）；终局 3 分 |

## 6. 密谋/军事 token 的 Leader 侧结算（v1.2 p4；复合效果从左到右）

| 操作 | Leader 侧规则 |
|---|---|
| 放置 | 按箭头给 Leader 未控制的**第一个** chamber 加 1 方块 |
| 移动 | 从「任一方控制且差 >1 的第一个 chamber」取 Leader 方块，移到「无人控制或 Leader 差 1 的第一个 chamber」（**可非相邻**）；无可行 → 不执行 |
| 移除 | 按箭头从「你控制且差 1、或无人控制」的第一个 chamber 拿走**你的** 1 方块；无 → 从你有方块的第一个 chamber 拿 |
| 得金 | Leader 得金 = **其**参议院方块数 |
| 失金 | 你失金 = **你**参议院的方块数 |
| 蒙昧主义 | 你有进度 token → 洗匀随机 1 张面朝下压密谋；否则按箭头从版图拿第一个可用进度；再无 → 从开局移除的进度 token 里随机 1 张 |
| 蓄意破坏 | 弃你**最高分**蓝卡（并列随机） |
| 弃黄 | 弃你**最高分**黄卡（并列随机） |
| 时局突变 | **结构剩 >1 张才执行**；按箭头为 Leader 选卡但**反转偏好**：第 1 选择 = 非绿/非红/非其偏好色的任一卡，第 2 = 决策卡第 3 偏好，第 3 = 决策卡第 2 偏好，末位 = 决策卡第 1 偏好；执行后结构仍 >1 张 → **再执行一次** |
| 拆毁奇观 | 洗你已建奇迹随机 1 座回盒；弃其垫卡；**其余奇迹放回原位** |
| 财产欺诈 | 按箭头评估结构末行，按 Leader 偏好选卡（**忽略参议员**） |
| 旧案重提 | Age I 取 3 张 / II 取 6 张 / III 取 9 张（各时代移除卡 3 张）；按时代降序排（当前时代在左）；从左到右按 Leader 偏好选 1 免费建；其余回盒 |
| 截取成果 | 洗全部开局移除进度 token，随机 1 张给 Leader |
| 夺人之美 | 洗你未建奇迹随机 1 座给 Leader，**立即视为已建造**并结算开局效果 |
| 敲诈 | 取你**一半**金币（向上取整）给 Leader |
| 偷棕/灰 | 洗你的棕/灰卡随机 1 张进 Leader 城 |

## 7. 唯一近似项 / 开放问题

| # | 项 | 说明 |
|---|---|---|
| 1 | **base Solo 规则书缺失**（硬依赖） | Leader 决策卡偏好顺序、军事 token solo 行为、胜负判定等均在 base Solo PnP 规则里；需官方下载或用户提供，M8-B 前必须补齐 |
| 2 | 政治家分区 | Solo 规则「indicated section」沿用 Agora 主规则的政治家分区标注（左3/中2/右2 近似同前） |
| 3 | 决策卡的具体 12 张内容 | base Solo PnP + 本扩展 5 张替换卡的完整文本未在本 PDF 中（依赖 base Solo 资料） |
| 4 | 「evaluated direction（决策箭头）」的左右语义 | 每张决策卡的箭头方向是印在卡上的随机属性——需 base Solo 卡面资料确定每张的方向；实现时可先按卡 id 随机固定方向并在数据表标注 |

## 8. base Solo 规则语义摘要（官方博客/新闻源，2026-09-05 网络检索；待官方 PDF 核对）

| 规则点 | 内容 |
|---|---|
| 对手 | 5 位 Leader：Caesar(黄) / Aristotle(灰) / Hammurabi(紫) / Bilkis(蓝) / Cleopatra(棕)，各带专属能力 |
| 设置 | 玩家蛇形抽 4 奇迹，Leader 抽 2 奇迹且**视为已建成**（开局效果立即结算：军事/金币/进度 token） |
| 决策卡 | 12 张暗牌堆，每回合 Leader 行动开始翻 1 张；牌堆耗尽 → 重洗用过的 |
| 选牌偏好 | Leader 取结构上第一个可用卡，**优先与其颜色相同的卡**；评估方向由卡上箭头决定 |
| 免费 | Leader 建卡**永远免费**（无视资源）；但玩家仍需向 Leader 城购买缺资源 |
| 再行动 | 决策卡与 Leader 卡上符号一致 → Leader 立即再行动一回合 |
| 卡边框 | 决策卡边框标示上下方向（读卡方向） |
| 先手 | Age I Leader 永远先手；Age II/III Leader 可选择先手 |
| 胜负 | 与常规一致：军事/科学/终局计分（Blue 卡平局规则沿用） |

### 仍缺（需卡片实物照/官方 PDF）

1. 12 张决策卡的**具体偏好序列与箭头方向**（含 Agora 替换的 5 张：其中 5 张带 Agora 图标）；
2. 5 位 Leader 卡的**具体特殊能力文本**（仅知颜色与大致风格）；
3. 军事 token 在 Solo 下的具体行为（推断 = 常规推进 + Leader 侧罚金语义，待核）。
拿到资料后补齐本表即可开工 M8-B（建议用户提供决策卡/Leader 卡照片或官方 PDF）。
