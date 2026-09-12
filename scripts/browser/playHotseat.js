/* 真实浏览器里用本地热座推进对局。
 * 每次调用只走 window.__BUDGET 步（默认 50），结果累积在 window.__out，
 * 便于分批调用、避免单次 eval 超时。
 */
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const all = (s) => [...document.querySelectorAll(s)];
  const one = (s) => document.querySelector(s);
  const budget = window.__BUDGET || 50;

  if (!window.__out) {
    window.__out = {
      steps: 0,
      drafts: 0,
      builds: 0,
      discards: 0,
      wonderBuilds: 0,
      choices: 0,
      finished: false,
      winnerText: null,
      logLines: 0,
      errors: [],
    };
    window.addEventListener('error', (e) => window.__out.errors.push(String(e.message)));
    // 首次调用时切到本地热座
    const hot = all('.seg button').find((b) => b.textContent.includes('本地热座'));
    if (hot) hot.click();
    await sleep(250);
  }
  const out = window.__out;

  let rnd = (out.steps + 1) * 7919;
  const rand = () => {
    rnd = (rnd * 1103515245 + 12345) & 0x7fffffff;
    return rnd / 0x7fffffff;
  };

  let used = 0;
  while (used < budget) {
    // 终局弹窗：压制胜利没有计分表，统一用标题判定
    const resultTitle = one('.overlay .modal h2');
    if (resultTitle && /胜利|平局|终局计分/.test(resultTitle.textContent)) {
      out.finished = true;
      out.winnerText = resultTitle.textContent.trim();
      out.hasScoreTable = !!one('.score-table');
      break;
    }

    const overlayOpts = all('.overlay .option');
    if (overlayOpts.length) {
      overlayOpts[Math.floor(rand() * overlayOpts.length)].click();
      if (one('.offer-row')) out.drafts++;
      else out.choices++;
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
    }

    if (one('.card.selected')) {
      const acts = all('.actionbar .btn').filter((b) => !b.disabled);
      const build = acts.find((b) => b.textContent.includes('建造建筑'));
      const discard = acts.find((b) => b.textContent.includes('弃牌换'));
      const wonder = acts.find((b) => b.textContent.includes('建造奇迹'));
      if (wonder && rand() < 0.3) {
        wonder.click();
        await sleep(60);
        const opts = all('.wonder-picker .option').filter((b) => !b.disabled);
        if (opts.length) {
          opts[0].click();
          out.wonderBuilds++;
          out.steps++;
          used++;
          await sleep(45);
          continue;
        }
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
      const cancel = acts.find((b) => b.textContent.trim() === '取消');
      if (cancel) cancel.click();
    }

    used++;
    await sleep(45);
  }

  out.logLines = all('.log div').length;
  const snapshot = { ...out, errors: out.errors.slice(0, 5) };
  return JSON.stringify(snapshot);
})()
