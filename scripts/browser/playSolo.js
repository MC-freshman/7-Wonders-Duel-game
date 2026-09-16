/* 真实浏览器里打完整局「单人 Solo」（本地模式，人类只操作座位 0）。
 * 与 playHotseat.js 同一套批处理骨架，差别在两处：
 *  1) 模式由**首页卡片**选定（`e2eClickFlow` 的 pickHomeCard 在点「开始对局」前完成），
 *     本片段不再点顶栏 —— 对局中重复切模式会重开一局；
 *  2) 领袖回合由 `useSoloGame` 自己按 420ms 节奏推演，页面此刻没有可点元素，
 *     循环必须「等」而不是「点」——故统计 leaderBusy 以便确认确实在等领袖。
 * 每次调用只走 window.__BUDGET 步，结果累积在 window.__out，避免单次 eval 超时。
 */
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const all = (s) => [...document.querySelectorAll(s)];
  const one = (s) => document.querySelector(s);
  const text = (el) => (el ? el.textContent.trim() : '');
  const budget = window.__BUDGET || 50;

  if (!window.__out) {
    window.__out = {
      steps: 0,
      builds: 0,
      discards: 0,
      wonderBuilds: 0,
      choices: 0,
      leaderBusy: 0,
      soloBarSeen: false,
      decisionSeen: false,
      finished: false,
      winnerText: null,
      hasReplayBtn: false,
      errors: [],
    };
    window.addEventListener('error', (e) => window.__out.errors.push(String(e.message)));
  }
  const out = window.__out;

  let rnd = (out.steps + 1) * 7919;
  const rand = () => {
    rnd = (rnd * 1103515245 + 12345) & 0x7fffffff;
    return rnd / 0x7fffffff;
  };

  let used = 0;
  while (used < budget) {
    if (one('.solo-bar')) out.soloBarSeen = true;
    if (one('.solo-bar .solo-decision')) out.decisionSeen = true;

    // 终局弹窗：压制胜利没有计分表，统一用标题判定
    const resultTitle = one('.overlay .modal h2');
    if (resultTitle && /胜利|平局|终局计分/.test(text(resultTitle))) {
      out.finished = true;
      out.winnerText = text(resultTitle);
      out.hasReplayBtn = all('.overlay .modal .btn').some((b) => text(b).includes('复盘本局'));
      break;
    }

    const overlayOpts = all('.overlay .option');
    if (overlayOpts.length) {
      overlayOpts[Math.floor(rand() * overlayOpts.length)].click();
      out.choices++;
      out.steps++;
      used++;
      await sleep(45);
      continue;
    }

    const pickOpts = all('.wonder-picker .option').filter((b) => !b.disabled);
    if (pickOpts.length) {
      pickOpts[0].click();
      out.wonderBuilds++;
      out.steps++;
      used++;
      await sleep(45);
      continue;
    }

    if (!one('.card.selected')) {
      const cards = all('.card.selectable');
      if (cards.length) {
        cards[Math.floor(rand() * cards.length)].click();
        used++;
        await sleep(45);
        continue;
      }
      // 无可点牌：多半是领袖回合（或它在 420ms 停顿中），等下一轮
      out.leaderBusy++;
      used++;
      await sleep(120);
      continue;
    }

    const acts = all('.actionbar .btn').filter((b) => !b.disabled);
    const build = acts.find((b) => text(b).includes('建造建筑'));
    const discard = acts.find((b) => text(b).includes('弃牌换'));
    const wonder = acts.find((b) => text(b).includes('建造奇迹'));
    if (wonder && rand() < 0.3) {
      wonder.click();
      await sleep(60);
      continue;
    }
    const target = build || discard;
    if (target) {
      target.click();
      if (target === build) out.builds++;
      else out.discards++;
      out.steps++;
      used++;
      await sleep(45);
      continue;
    }
    const cancel = acts.find((b) => text(b) === '取消');
    if (cancel) cancel.click();

    used++;
    await sleep(45);
  }

  const snapshot = { ...out, errors: out.errors.slice(0, 5) };
  return JSON.stringify(snapshot);
})()
