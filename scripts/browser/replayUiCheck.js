/* 真实浏览器里验证终局「复盘本局」这条 UI 链路（模式无关，Solo 额外断言只读 SoloBar）。
 * 前置：页面停在终局结算弹窗（playHotseat.js / playSolo.js 打完整局）。
 * 断言的都是可观察事实：进了复盘模式、进度条能前后跳、跳到终局会重现结算面板、
 * 退出回到原界面；Solo 还要求顶条在场且没有领袖选择器。
 */
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const all = (s) => [...document.querySelectorAll(s)];
  const one = (s) => document.querySelector(s);
  const text = (el) => (el ? el.textContent.trim() : '');
  const byText = (sel, want) => all(sel).find((b) => text(b).includes(want));
  const out = { pass: false, notes: [] };

  const btn = byText('.overlay .modal .btn', '复盘本局');
  if (!btn) {
    out.notes.push('未找到「复盘本局」按钮');
    return JSON.stringify(out);
  }
  btn.click();
  await sleep(400);

  out.modeTag = text(one('.age-tag'));
  out.enteredReplay = out.modeTag === '复盘模式';
  out.soloMode = !!one('.solo-bar');
  out.hasSoloBar = !!one('.solo-bar');
  out.readOnlyBar = !!one('.solo-bar') && !one('.solo-bar .solo-pick');
  out.leaderShown = text(one('.solo-bar .solo-leader'));
  out.totalShown = text(one('.replay-bar .step-count'));

  const nums = (s) => {
    const m = /第\s*(\d+)\s*\/\s*(\d+)\s*步/.exec(s || '');
    return m ? [Number(m[1]), Number(m[2])] : [null, null];
  };
  const range = one('.replay-range');
  const goto = async (v) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(range, String(v));
    range.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(250);
    return nums(text(one('.replay-bar .step-count')))[0];
  };

  const [, total] = nums(out.totalShown);
  out.total = total;
  out.atStart = nums(text(one('.replay-bar .step-count')))[0] === 0;

  // 单步前进
  const nextBtn = byText('.replay-bar .btn', '下一步');
  nextBtn.click();
  await sleep(200);
  nextBtn.click();
  await sleep(200);
  out.afterTwoSteps = nums(text(one('.replay-bar .step-count')))[0];
  out.stepEntriesShown = all('.replay-entries li').length > 0;

  // 拖到中段：牌阵与日志都在，且不显示结算面板
  out.midFrame = await goto(Math.floor(total / 2));
  out.midBoard = all('.track-cell').length;
  out.midHasResult = !!one('.overlay .modal h2');

  // 拖到终局：应重现结算画面
  out.endFrame = await goto(total);
  out.endResultTitle = text(one('.overlay .modal h2'));
  out.endHasScoreTable = !!one('.score-table');

  // 再拖回中段（向后跳 = 重放器从种子重建），然后退出复盘
  out.backFrame = await goto(3);
  const exit = byText('.replay-bar .btn', '退出复盘');
  exit.click();
  await sleep(400);
  out.exitedReplay = !one('.replay-bar');
  out.boardAfterExit = all('.track-cell').length;

  out.pass =
    out.enteredReplay &&
    (!out.soloMode || (out.hasSoloBar && out.readOnlyBar)) &&
    out.total > 0 &&
    out.atStart &&
    out.afterTwoSteps === 2 &&
    out.stepEntriesShown &&
    out.midFrame === Math.floor(out.total / 2) &&
    out.midBoard > 0 &&
    !out.midHasResult &&
    out.endFrame === out.total &&
    /胜利|平局|终局计分/.test(out.endResultTitle || '') &&
    out.backFrame === 3 &&
    out.exitedReplay &&
    out.boardAfterExit > 0;

  return JSON.stringify(out);
})()
