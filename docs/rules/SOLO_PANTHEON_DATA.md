# M8-P Pantheon Solo 扩展资料取证文档

> **来源（唯一权威）**：CloakedBartender《7 Wonders: Duel Pantheon Solo》fan 扩展
> — 与 Agora Solo 同一作者的姊妹扩展（BGG filepage 见 `SOLO_AGORA_DATA.md` §6，
> 同批 `cryptozoic/luckyplayershop` 「Download rules」镜像 5 份 PDF 之一）。
> 规则本全文（2 页）已逐页文本化（含文本层原件与扫描件两版交叉比对，内容逐行一致）。
>
> **性质说明**：Pantheon Solo 是**社区 fan-made 扩展**，非 Repos 官方出品。官方仅有
> ① base Solo PnP（2020，见 `SOLO_DATA.md`）② Pantheon 扩展本体规则（2016 官方）。
> 本文件为 M8-P 实现唯一数据源；规则边界一律以本文件为准，不引入任何猜测。
>
> **依赖**：7 Wonders Duel 基础版 + **Pantheon 扩展** + 官方 base Solo PnP 三者齐备方可游玩。
> **兼容**：可与 Agora Solo（另一 fan 扩展）组合，见 §4。

---

## 0. 组件构成

| 组件 | 数量 | 说明 |
|------|------|------|
| 领袖卡 | **3** | Caligula / Sappho / Imhotep（全部来自 Pantheon 扩展的发展标记体系） |
| 决策卡（更新） | **3** | 带 **Pantheon 图标**的替换卡，替换 base 3 张 |
| 神话 token / 献祭 token / 神格牌堆 | — | 直接复用 Pantheon 扩展本体组件，无新增 |

**规则本原文（Setup）**：
> "Set up the Pantheon components and the structures for Age I and II as described in the
> Pantheon rulebook. **Replace 3 of the Decision cards** of 7 Wonders Duel Solo with their
> updated equivalents from this expansion. **Include the 3 Leaders from this expansion** when
> you select your opponent."

**注意**：本扩展只搭 **Age I 与 Age II** 两副牌阵（Age III 沿用基础 + Pantheon 常规流程，
因为 Pantheon 扩展本身时代 III 不使用神话 token，改为大殿）。

---

## 1. 三位 Pantheon 领袖（卡面 + 规则本逐条核对 ✅）

连动符号：`◉` = circle、`▲` = triangle。

| id | 名称 | 中文 | 卡色（决策卡偏好） | 连动符号 | 开局发展标记 | 备注 |
|----|------|------|-------------------|----------|--------------|------|
| `caligula` | Caligula | 卡利古拉 | **yellow 黄** | `◉` | Poliorcetics（攻城术） | |
| `sappho` | Sappho | 萨福 | **purple 紫 = Temples（大殿）** | `◉` | Mysticism（神秘学）+ Philosophy（哲学） | 见下注 1 |
| `imhotep` | Imhotep | 伊姆霍特普 | **链接符号卡**（非某色） | `◉` + `▲` | Engineering（工程学）+ Urbanism（都市化） | 见下注 2 |

> **注 1（Sappho 的紫色）**：规则本「7 Wonders: Duel Solo Print & Play Leader changes」明确：
> *"Caesar's purple card preference now regards **Temples**."* —— 即 Pantheon 启用后，
> **凡「偏好紫卡」的领袖（Caesar 与 Sappho），其紫色偏好一律理解为「大殿 Grand Temple」**
> （Pantheon 时代 III 用 5 座大殿替代行会）。实现映射见 §5.2。

> **注 2（Imhotep 的「链接符号卡」）**：规则本：
> *"= Cards that can be constructed with a Linking symbol."*
> 即其偏好色 = **任何「费用以链接符号计价」的卡**（本作 `CardDef.freeLink` 非空）。
> 叠加能力：*"The combination of Engineering and Urbanism grants Imhotep **4 coins** every time
> he plays a card with a Linking symbol cost. **Contrary to standard rules, he gets the coins
> even if he doesn't have the Linking symbol in his city.**"*
> ——注意与官方常规规则的区别：官方 Urbanism 要求「该链接符号出现在自己城中」才有金币；
> 此处 Imhotep **无条件获得**（即使城中无对应链接符号）。

**卡色 = 决策卡空槽位的默认匹配色**（与 base Solo 一致）。

---

## 2. 与 base Solo 的差异（`The Leader's turn`）

> 除非本文件另有说明，base Solo PnP 的全部规则继续适用。

### 2.1 时代 I：神话 token → 神格放置（新增流程）⭐

规则本原文：
> *"If the Leader gains a **Mythology token** during Age I, take the top **Divinity card** from
> that Mythology. Look for the **first empty space in the Pantheon in the direction indicated by
> the arrow on the Decision card**, and place the Divinity card **face down** in that space."*

即：领袖在时代 I 每次取得神话 token（无论来源：牌阵 token、军事推进等），
**不**按官方常规「翻开神格牌堆顶并立即调用」，而是：

1. 从该神话对应牌堆取**堆顶 1 张神格**；
2. 按**当前决策卡的箭头方向**，在万神殿（Pantheon 图板 6 格）上找**第一个空位**；
3. 把该神格牌**面朝下**放入该空位（等同于「预留」，不调用、不付费用）。

> 官方常规规则下时代 I 的神话 token 是「翻牌堆顶 → 立即调用或放回」；Solo 侧改为
> 「按箭头方向塞进万神殿空位并盖着」。这一点是本扩展的核心差异之一。

### 2.2 时代 II / III：Pantheon 图标决策卡（新增）⭐

规则本原文：
> *"Some of the Decision cards now display a **Pantheon icon** under the arrow. When you draw one
> of these cards **during Age II or III**, the Leader's **1st choice is to play a Divinity**.
> They play the **first available Divinity in the direction indicated by the arrow**. The Leader
> **disregards any cost for the Divinity**. If there are no more Divinities available, follow the
> regular preferred card choices on the Decision card."*
>
> *"The Pantheon icon has **no effect** on the Leader's choice **during Age I**."*

即：
1. **时代 II/III** 抽到带 Pantheon 图标的决策卡 → 领袖**第一优先** = 打出一位神明；
2. 神明选择 = 按**箭头方向**找**第一个可用的神明**（万神殿上可调用、非空的格子）；
3. **无视调用费用**（主引擎 `invokeDivinity` 的正常费用为 `BOARD_POSITION_COSTS[pos]`）；
4. 若无可用神明 → 回到决策卡常规颜色优先序（primary → secondary → tertiary → 方向首张）；
5. **时代 I 时该图标无效**（时代 I 由 §2.1 流程处理神话 token）。

### 2.3 献祭 token

规则本原文：
> *"The Leader **can gain offering tokens during Age II, but will not use them**."*

即：领袖照常可能获得献祭 token（本作 `offering` 机制），但**永不消费**（不参与召唤费用回收），
实现时应把领袖的献祭 token 置为「只进不出」或直接不产生其消费动作。

### 2.4 Caesar 的紫卡偏好改写（跨领袖统一规则）

见 §1 注 1：Pantheon 启用时，**所有**紫色偏好均指大殿（Temples），不只 Sappho，也包括 Caesar。

---

## 3. Pantheon 神明 / 奇迹领袖化效果全表 ⭐

> 规则本原文（`Divinity & Wonders reference`）：
> *"When the Leader plays a Divinity or receives a Wonder from the Pantheon expansion, use the
> following guidelines to handle their effect. **Two of the Egyptian Divinities also include
> guidelines for how to handle their effect when you play them.** For all other Divinities, you
> follow the rules as described in the Pantheon rulebook when you play them."*
>
> ——所以下表中「**领袖打出该神明时的效果**」与「**你打出该神明时的效果**」需分别实现；
> 未列出的神明 = 完全沿用 Pantheon 官方规则本（但需按领袖无费用 / 无卡牌的特点做适配）。

### 3.1 美索不达米亚（Mesopotamian）

| 神明 | 领袖打出时 | 你打出时 |
|------|-----------|---------|
| **Enki** 恩基 | 把卡上的 **2 枚发展标记洗混，随机给领袖 1 枚** | 按官方规则（从 2 枚中选 1） |
| **Ishtar** 伊什塔尔 | 领袖获得 **1 个「法(law)」科技符号**；若因此凑成**一对法符号** → 按常规给领袖 1 枚发展标记 | 同官方 |
| **Nisaba** 尼沙巴 | **洗混你的绿卡，随机取 1 张**，领袖把**蛇 token** 放到该卡上；若因此凑成**一对科技符号** → 按常规给领袖 1 枚发展标记 | 同官方 |

### 3.2 腓尼基（Phoenician）

| 神明 | 领袖打出时 | 你打出时 |
|------|-----------|---------|
| **Astarte** 阿斯塔蒂 | 因领袖**从不付费**，Astarte 对其**终局固定值 7 分**（不是「卡上剩余金币 = 分数」）。可用 7 枚金币压在卡上作记 | 同官方（7 金入圣库，终局每剩余 1 金 1 分） |
| **Baal** 巴力 | **洗混你的棕卡 + 灰卡，随机取 1 张**放入领袖城邦 | 同官方 |
| **Tanit** 塔尼特 | 从银行给领袖 **12 金币** | 同官方（自己得 12 金） |

### 3.3 希腊（Greek）

| 神明 | 领袖打出时 | 你打出时 |
|------|-----------|---------|
| **Aphrodite** 阿佛洛狄忒 | 若游戏在**时代 III 后**结束，给领袖 **9 分** | 同官方 |
| **Hades** 哈迪斯 | **不改变顺序地翻开弃牌堆**；用决策卡按领袖偏好选 1 张（如同在牌阵上选）。**箭头决定方向**：`⟶` = 从前往后 / `⟵` = 从后往前 | 同官方（自己从弃牌堆免费建 1 张） |
| **Zeus** 宙斯 | 用决策卡选 1 张**弃掉**：从**顶行**开始、按**箭头方向**评估；**反转**领袖偏好序 = 第 1 选 = 任何非绿/非红/非其偏好色的卡，第 2 选 = 决策卡第 3 偏好，第 3 选 = 第 2 偏好…… | 同官方（自己弃结构上任意 1 张） |

### 3.4 埃及（Egyptian）★ 含「你打出时」的额外指引

| 神明 | 领袖打出时 | 你打出时（额外指引） |
|------|-----------|---------------------|
| **Anubis** 阿努比斯 | **洗混你已建的奇迹，随机取 1 座弃回盒**，并弃掉其下垫的卡；其余奇迹**放回原位** | 你想拆领袖的奇迹时：把该奇迹卡**面朝下翻**——领袖**不再从其获得任何收益**（不再移除，只是失效） |
| **Isis** 伊西斯 | **洗混领袖的奇迹（含面朝下的），随机取 1 座**；若该奇迹开局时给过领袖收益 → **再给一次**。因领袖建奇迹无需卡牌，**不从弃牌堆取卡**。若该奇迹在时代 III 后给分，领袖**仍只得一次分** | 同官方 |
| **Ra** 拉 | **洗混你的未建奇迹，随机取 1 座给领袖**，视为**立即建造**并按开局规则给领袖即时收益 | 你打 Ra 时：**把领袖的奇迹全部视为「未建」** |

### 3.5 罗马（Roman）

| 神明 | 领袖打出时 | 你打出时 |
|------|-----------|---------|
| **Mars** 玛尔斯 | 领袖获得 **2 盾** | 同官方 |
| **Minerva** 密涅瓦 | 把 **Minerva 棋子放到「军事棋子右边一格」**（注意：官方是「任意格」） | 同官方 |
| **Neptune** 尼普顿 | ① 若领袖自己一侧还有军事 token → **移除最便宜那枚**（不生效）；② 然后若**你**一侧还有军事 token → 移除最贵那枚，**你失去等额金币**；③ 若领袖一侧已无军事 token → **什么都不做** | 同官方 |

### 3.6 门卡（The Gate）

| 卡 | 领袖打出时 |
|----|-----------|
| **The Gate** 门 | 洗混**本局未使用的**神话 token，随机抽 1 个 → 领袖打出**该神话的堆顶神格**（等同于官方 The Gate 效果） |

### 3.7 Pantheon 奇迹领袖化

| 奇迹 | 领袖侧效果 |
|------|-----------|
| **The Sanctuary** 圣堂 | 领袖**每次打出神格卡得 2 金币**（官方是「你调用 Pantheon 费用 −2 + 立即再行动」，领袖侧改为被动产金币） |
| **The Divine Theatre** 通神大剧场 | 洗混**本局未使用的**神话 token，随机抽 1 个 → 领袖打出**该神话的堆顶神格**；**若游戏在时代 III 后结束，该奇迹值 2 分** |

---

## 4. 与 Agora Solo 组合时的要点

来自 `SOLO_AGORA_DATA.md` §3（Agora 规则本原文）：
> *"Use the updated Decision cards from the Pantheon Solo expansion and this expansion combined
> (you should have **3 cards with the Pantheon icon, 5 with the Agora icon and 4 without an icon**).
> Choose an opponent from the 5 base game Leaders, the 3 Pantheon leaders and the 1 Agora Leader."*

- **决策牌堆**：3 张 Pantheon 图标 + 5 张 Agora 图标 + 4 张无图标 = **12 张**。
- **领袖候选池**：base 5 + Pantheon 3（Caligula / Sappho / Imhotep）+ Agora 1（Brutus）= **9 位**。
- 行动判定同时遵循 base Solo + **两个扩展各自的附加规则**。
- 注意 §2.2 与 `SOLO_AGORA_DATA.md` §2.2 的冲突处理：同一张决策卡**不会**同时带两种图标
  （牌堆三类互斥），故「第一优先」不会打架。

---

## 5. 数据缺口与实现映射

### 5.1 ⚠️ 3 张 Pantheon 替换决策卡：采用**推导值**（应用户授权）

> **状态**：卡面原件**仍未取得**。用户明确授权「缺拍的部分由你补齐，编或者找资料都可以」
> → 本实现采用**推导值**并在此完整留痕，供日后拿到原件时一次性校正。
>
> **已确证**：这 3 张卡**带 Pantheon 图标**（图形与 Agora 图标不同，样式见规则本 p1）；
> 卡片总数 = 套装 20 张中的 3 张；规则本称其为 base 卡的 *"updated equivalents"*。
>
> **推导规则（4 条依据，全部可核）**：
> 1. **同 base 替换机制**：规则本 *"Replace 3 of the Decision cards … with their updated equivalents"*
>    → 3 张替换卡在「箭头方向 + 三色格」上与其所替换的 base 卡**完全一致**，仅多 Pantheon 图标。
> 2. **牌堆恒等式**：组合时须满足 `3 Pantheon + 5 Agora + 4 无图标 = 12`（§4 规则本原文）
>    → Pantheon 替换的 base 下标必须与 Agora 的 `[0,3,6,7,10]` **不相交**。
> 3. **保留连动卡**：base 两张连动卡（#6 `▲` / #12 `●`）必须留下，否则 Pantheon Solo 失去连动机制。
> 4. **分布均衡**：三个方向/配色族各取 1 —— `GR-right` / `RG-right` / `RG-left`。
>
> **最终取值**（`src/core/solo/pantheon/data.ts`）：替换 base `#2 (idx1)` / `#5 (idx4)` / `#10 (idx9)`，
> 三者均无连动符号、仅 `pantheonIcon: true`：
>
> | Pantheon 卡 | 箭头 | 方向 | 主色 | 次色 | 对应 base 卡 |
> |---|---|---|---|---|---|
> | P1 | ⟵ | `right` | green | red | #2「GR● RIGHT」 |
> | P2 | ⟵ | `right` | red | green | #5「RG● RIGHT」 |
> | P3 | ⟶ | `left` | red | green | #10「RG● LEFT」 |
>
> 保留的 4 张无图标卡 = **#3 / #6 / #9 / #12**（含两张连动卡）。
>
> **⏳ 待校正**：Pantheon Solo 的 cards PDF（与 `7_wonders_duel_agora_solo_cards_v1.2.pdf`
> 同系列、同作者，文件名类似 `7_wonders_duel_pantheon_solo_cards_v1.x.pdf`）
> 从 BGG filepage（CloakedBartender 的 Pantheon Solo 条目）下载后放入 `docs/rules/`，
> 即可按 §5.1 表格逐张替换。**若原件与上表不符，只需改 `SOLO_PANTHEON_DECISION_CARDS`
> 与 `SOLO_PANTHEON_REPLACED_BASE_INDEXES` 两处，引擎无需改动。**
>
> **影响评估**：推导值只影响「领袖走得像不像原作者设计」的**拟真度**，
> **不影响规则正确性**——决策卡的选择流程、Pantheon 图标触发逻辑、牌堆张数恒等式均按规则本实现，
> 且不变量仿真（`soloPantheonSim`）在推导值下 0 错误。

### 5.2 实现映射（`src/core/solo/pantheon/`，方案 B 隔离模块）— ✅ 已落地

| 文件 | 内容 | 状态 |
|------|---------|------|
| `src/core/solo/pantheon/data.ts` | 3 位 Pantheon 领袖（§1）+ 3 张 Pantheon 替换决策卡（§5.1 推导值）+ `soloPantheonDeck()` / `soloPantheonLeaders()` / `soloAgoraPantheonDeck()` | ✅ |
| `src/core/solo/pantheon/pantheon.ts` | `arrowOrder` / `firstEmptyPantheonSlot` / `firstAvailableDivinity` / `leaderPrefs` / `resolveLeaderPantheonStep` / `restoreSpareDivinity` / `leaderIsisPick` / `PantheonSpare` | ✅ |
| `src/core/solo/pantheon/index.ts` | 子模块出口（删目录即回退） | ✅ |
| `scripts/soloPantheonSim.ts` | 仿真校验台（对照 `soloAgoraSim.ts` 结构），`npm run soloPantheonSim -- <n> [medium\|hard] [combo]` | ✅ |

**`SoloOptions` 扩展**：新增 `pantheon?: boolean`（与 `agora?: boolean` 正交，可同时为 true）—— ✅ 已落地。

**领袖能力实现要点**：
- `CardDef.freeLink` 非空 = 「可链接建造」的卡（Imhotep 偏好 + 4 金币判定用）；
- Sappho / Caesar 的紫卡偏好 → 主引擎把大殿 type 记为 `'guild'`，`SOLO_COLOR_TO_TYPE.purple = 'guild'`
  天然命中大殿，**无需额外分支**（见 `data.ts` 注）；
- Imhotep 的 4 金币**无条件**发放（不受「城中是否有该链接符号」限制）。

**主引擎复用**：万神殿图板 / 神格牌堆 / 神话 token / 大殿 / 2 张 Pantheon 奇迹
全部来自主引擎 M6 的 Pantheon 实现（`src/core/data/pantheon.ts` + `engine.ts`），
Solo 侧只负责「按 Pantheon Solo 规则挑动作」并复用 `applyAction` / `invokeCost`。

---

## 6. 取证过程留痕

| 来源 | 结果 |
|------|------|
| luckyplayershop「Download rules」Google Drive 镜像（5 份 PDF） | ✅ Pantheon Solo 规则本 2 页全文（文本层 + 扫描件两版交叉比对一致） |
| 同批 base Solo 官方 PnP（2 页） | ✅ 交叉校验现有 `SOLO_DATA.md` / `data.ts` |
| 官方产品套装图 1920×1920 | ✅ 9 领袖卡面 + 20 决策卡总览（3 位 Pantheon 领袖规格已核对） |
| Pantheon Solo **cards PDF** | ❌ **未取得** → §5.1 改用推导值（用户授权），待原件校正 |
| BGG filepage（自动下载尝试） | ❌ Cloudflare 托管式人机验证，需用户在自己浏览器下载（同 Agora Solo 经历） |
