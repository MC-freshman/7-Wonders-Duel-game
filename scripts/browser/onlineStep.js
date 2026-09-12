/* 联机会话的一次「行动批次」：只有轮到自己时才出手，否则返回等待状态。
 * 结果累积在 window.__oout，便于分批调用。
 */
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const all = (s) => [...document.querySelectorAll(s)];
  const one = (s) => document.querySelector(s);
  const budget = window.__BUDGET || 30;

  if (!window.__oout) {
    window.__oout = { acted: 0, waited: 0, drafts: 0, builds: 0, discards: 0, wonders: 0, choices: 0, finished: false, result: null, errors: [] };
    window.addEventListener('error', (e) => window.__oout.errors.push(String(e.message)));
  }
  const out = window.__oout;

  let used = 0;
  while (used < budget) {
    const title = one('.overlay .modal h2');
    if (title && /胜利|平局|终局计分/.test(title.textContent)) {
      out.finished = true;
      out.result = title.textContent.trim();
      break;
    }

    // 等待对手：本端无可执行动作
    if (!one('.card.selected') && all('.card.selectable').length === 0 && all('.overlay .option').length === 0) {
      out.waited++;
      break;
    }

    const overlayOpts = all('.overlay .option');
    if (overlayOpts.length) {
      overlayOpts[0].click();
      if (one('.offer-row')) out.drafts++;
      else out.choices++;
      out.acted++;
      used++;
      await sleep(60);
      continue;
    }

    const pickOpts = all('.wonder-picker .option').filter((b) => !b.disabled);
    if (pickOpts.length) {
      pickOpts[0].click();
      out.wonders++;
      out.acted++;
      used++;
      await sleep(60);
      continue;
    }

    if (!one('.card.selected')) {
      const cards = all('.card.selectable');
      if (cards.length) {
        cards[0].click();
        used++;
        await sleep(60);
        continue;
      }
    }

    if (one('.card.selected')) {
      const acts = all('.actionbar .btn').filter((b) => !b.disabled);
      const build = acts.find((b) => b.textContent.includes('建造建筑'));
      const discard = acts.find((b) => b.textContent.includes('弃牌换'));
      const target = build || discard;
      if (target) {
        target.click();
        if (target === build) out.builds++;
        else out.discards++;
        out.acted++;
        used++;
        await sleep(60);
        continue;
      }
      const cancel = acts.find((b) => b.textContent.trim() === '取消');
      if (cancel) cancel.click();
    }
    used++;
    await sleep(50);
  }

  return JSON.stringify(out);
})()
