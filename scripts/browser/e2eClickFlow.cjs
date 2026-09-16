/* 7WD 真实浏览器点击流验证（puppeteer-core + 本机 Chrome）。
 * 用法：node scripts/browser/e2eClickFlow.cjs <hotseat|toggles|online|solo> [outFile]
 *   hotseat   —— 本地热座整局（默认无扩展）
 *   toggles   —— 扩展开关真实鼠标点击断言 + agora 开启后对局推进
 *   online    —— 双窗口联机一局（两个独立 browser context：建房/加入/就绪/开始 → 整局 → 两端终局一致）
 *   solo      —— 单人 Solo 整局 → 点「复盘本局」→ 进度条前/后跳 + 终局重现 + 退出复盘
 * 依赖：puppeteer-core（NODE_PATH 指向含 puppeteer-core 的 node_modules）+ 本机 Chrome。
 * 环境变量：GAME_URL（默认 http://localhost:8080）、CHROME_PATH（默认本机安装路径）、E2E_DIAG=1（输出诊断日志）。
 * 复用同目录 playHotseat.js / onlineStep.js 的页面注入片段。
 *
 * 关键经验（headless 真实点击流的坑，改动注入脚本前必读）：
 *  - 奇迹选择 overlay（.overlay）盖住顶栏右侧按钮 → 真实鼠标点击会被挡，须等主对局阶段再点；
 *  - 跳过 overlay 前必须等 .overlay .option 渲染完成，否则点击批全程点空；
 *  - headless 下 rAF 轮询可能饿死，waitForFunction 一律显式 polling；
 *  - 主对局常驻隐藏 .overlay 容器，判定须用可见性而非存在性；
 *  - 联机建房须等 .conn-connected 再点「创建房间」，且必须走 就绪→房主开始 对局流程。
 */
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const GAME_DIR = path.join(__dirname, '..', '..');
const URL = process.env.GAME_URL || 'http://localhost:8080';
const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SNIPPET_DIR = __dirname;

const phase = process.argv[2];
const outFile = process.argv[3];
if (!phase || !outFile) {
  console.error('usage: node scripts/browser/e2eClickFlow.cjs <hotseat|toggles|online> <outFile>');
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* 诊断日志：E2E_DIAG=1 时落盘 UTF-8，绕开 shell 重定向编码问题。 */
const diagEnabled = process.env.E2E_DIAG === '1';
const LOGF = path.join(require('os').tmpdir(), 'e2e_clickflow_diag.log');
const diag = (msg) => {
  if (!diagEnabled) return;
  try { fs.appendFileSync(LOGF, `${new Date().toISOString().slice(11, 19)} [${phase}] ${msg}\n`, 'utf8'); } catch {}
};
diag(`===== start phase=${phase} =====`);

async function launch() {
  return puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
}

/**
 * 首页模式卡片：真实鼠标点击选中，返回选中态与该卡就地展开的参数文本。
 * 走 elementHandle.click()（真鼠标事件）而非 el.click()，才能验证整张卡片的命中区。
 */
async function pickHomeCard(page, label) {
  const ready = await page
    .waitForFunction(() => !!document.querySelector('.home-grid .home-pick'), {
      timeout: 8000,
      polling: 200,
    })
    .then(() => true)
    .catch(() => false);
  if (!ready) return { found: false, clicked: false, selected: false, paramText: '' };
  const handle = await page.evaluateHandle((want) => {
    const btns = [...document.querySelectorAll('.home-grid .home-pick')];
    return btns.find((b) => b.textContent.includes(want)) || null;
  }, label);
  const el = handle.asElement();
  if (!el) return { found: true, clicked: false, selected: false, paramText: '' };
  await el.click();
  await sleep(150);
  const state = await page.evaluate((want) => {
    const card = document.querySelector('.home-card.on');
    const param = card ? card.querySelector('.home-param') : null;
    return {
      clicked: true,
      selected: !!card && card.textContent.includes(want),
      paramText: param ? param.textContent.trim() : '',
    };
  }, label);
  diag(`pickHomeCard ${label}: selected=${state.selected} param=${state.paramText.slice(0, 24)}`);
  return { found: true, ...state };
}

/** 注入 scripts/browser 的 IIFE 片段并返回解析后的 JSON 结果。 */
async function evalSnippet(page, file, budget) {
  const src = fs.readFileSync(path.join(SNIPPET_DIR, file), 'utf8');
  if (budget) await page.evaluate((b) => { window.__BUDGET = b; }, budget);
  const raw = await page.evaluate(src);
  return JSON.parse(raw);
}

/** 收集页面错误。 */
async function armErrorTrap(page) {
  await page.evaluate(() => {
    window.__errs = window.__errs || [];
    window.addEventListener('error', (e) => window.__errs.push(String(e.message)));
    window.addEventListener('unhandledrejection', (e) =>
      window.__errs.push('rej:' + String(e.reason && e.reason.message || e.reason)),
    );
  });
}

function topbarButton(page, text) {
  return page.evaluateHandle(
    (t) => [...document.querySelectorAll('.topbar button')].find((b) => b.textContent.includes(t)),
    text,
  );
}

/** 首屏「开始屏」：本地三模式（人机/热座/Solo）不再自动开局，须真实鼠标点击才开始。
 *  返回是否成功进入对局（以牌阵 track-cell 出现为准）。 */
async function startGame(page) {
  const clickable = await page
    .waitForFunction(
      () => {
        const b = document.querySelector('.start-panel .start-btn');
        if (!b || b.disabled) return false;
        const r = b.getBoundingClientRect();
        if (r.width === 0) return false;
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return hit === b || b.contains(hit);
      },
      { timeout: 10000, polling: 200 },
    )
    .then(() => true)
    .catch(() => false);
  diag('startGame: clickable=' + clickable);
  if (!clickable) return false;
  const h = await page.$('.start-panel .start-btn');
  if (!h) return false;
  await h.click();
  const board = await page
    .waitForFunction(() => !!document.querySelector('.track-cell'), { timeout: 10000, polling: 200 })
    .then(() => true)
    .catch(() => false);
  diag('startGame: board=' + board);
  return board;
}

/* ---------------- 热座整局 ---------------- */
async function runHotseat() {
  const browser = await launch();
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(URL, { waitUntil: 'networkidle2' });
  await armErrorTrap(page);
  const home = await pickHomeCard(page, '本地热座');
  const began = await startGame(page);

  let out = null;
  let batches = 0;
  const MAX_BATCH = 40;
  while (batches < MAX_BATCH) {
    out = await evalSnippet(page, 'playHotseat.js', 50);
    batches++;
    if (out.finished) break;
    if (out.errors && out.errors.length) break;
    await sleep(150);
  }

  const errs = await page.evaluate(() => window.__errs || []);
  const replay = out && out.finished && (out.winnerText || out.hasResult)
    ? JSON.parse(await page.evaluate(fs.readFileSync(path.join(SNIPPET_DIR, 'replayUiCheck.js'), 'utf8')))
    : { pass: false, notes: ['未到达可复盘的终局'] };
  const result = {
    phase: 'hotseat',
    began,
    home,
    batches,
    ...out,
    replay,
    pageErrors: errs.slice(0, 10),
    pass: !!(began && home && home.selected && out && out.finished && out.winnerText && replay.pass && !errs.length),
  };
  fs.writeFileSync(outFile, JSON.stringify(result, null, 2), 'utf8');
  console.log(result.pass ? 'HOTSEAT_PASS' : 'HOTSEAT_FAIL');
  await browser.close();
  return result.pass ? 0 : 1;
}

/* ---------------- 扩展开关 ---------------- */
async function runToggles() {
  const browser = await launch();
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(URL, { waitUntil: 'networkidle2' });
  await armErrorTrap(page);

  const steps = [];
  const readLabel = (t) =>
    page.evaluate((x) => {
      const b = [...document.querySelectorAll('.topbar button')].find((el) => el.textContent.includes(x));
      return b ? b.textContent.trim() : null;
    }, t);
  const waitLabel = (t, pattern, timeout = 5000) =>
    page
      .waitForFunction(
        (x, re) => {
          const b = [...document.querySelectorAll('.topbar button')].find((el) => el.textContent.includes(x));
          return b ? new RegExp(re).test(b.textContent) : false;
        },
        { timeout, polling: 200 },
        t,
        pattern.source,
      )
      .then(() => true)
      .catch(() => false);
  /** 等待 topbar 按钮可被真实命中（未被 overlay 挡、未禁用）。 */
  const waitClickable = (t, timeout = 15000) =>
    page
      .waitForFunction(
        (x) => {
          const b = [...document.querySelectorAll('.topbar button')].find((el) => el.textContent.includes(x));
          if (!b || b.disabled) return false;
          const r = b.getBoundingClientRect();
          if (r.width === 0) return false;
          const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          return hit === b || b.contains(hit);
        },
        { timeout, polling: 250 },
        t,
      )
      .then(() => true)
      .catch(() => false);
  /** 真实鼠标点击 topbar 按钮（先等可命中）。 */
  const clickBtn = async (t) => {
    const ok = await waitClickable(t);
    if (!ok) return false;
    const h = await topbarButton(page, t);
    await h.asElement().click();
    return true;
  };
  /** 跳过当前可见 overlay（奇迹选择）：先等选项渲染，再跑注入批；直到无可见 overlay。 */
  const skipOverlay = async () => {
    const anyVisible = () =>
      [...document.querySelectorAll('.overlay')].some((el) => {
        const cs = getComputedStyle(el);
        return cs.display !== 'none' && cs.visibility !== 'hidden' && el.getClientRects().length > 0;
      });
    for (let i = 0; i < 8; i++) {
      if (!(await page.evaluate(anyVisible))) return true;
      // 等草稿选项渲染（5s 内出现才跳；没出现说明 overlay 非草稿类，也跳一批兜底）
      await page
        .waitForFunction(() => !!document.querySelector('.overlay .option'), { timeout: 5000, polling: 200 })
        .catch(() => {});
      const before = await evalSnippet(page, 'playHotseat.js', 40);
      diag(`skipOverlay#${i}: steps=${before.steps} drafts=${before.drafts} choices=${before.choices} errors=${JSON.stringify((before.errors || []).slice(0, 3))}`);
      await sleep(200);
    }
    const desc = await page.evaluate(() =>
      [...document.querySelectorAll('.overlay')]
        .filter((el) => {
          const cs = getComputedStyle(el);
          return cs.display !== 'none' && cs.visibility !== 'hidden' && el.getClientRects().length > 0;
        })
        .map((el) => (el.textContent || '').slice(0, 100).replace(/\s+/g, ' '))
        .join(' || '),
    );
    diag('skipOverlay FAILED, visible overlay: ' + (desc || '(none)'));
    return !(await page.evaluate(anyVisible));
  };

  // 0) 首屏应为「首页模式选择屏」（不自动开局）→ 点「本地热座」卡片 → 点「开始对局」→ 跳过首局奇迹选择
  const noAutoStart = await page.evaluate(
    () => !document.querySelector('.track-cell') && !!document.querySelector('.start-panel .start-btn'),
  );
  diag('toggles: noAutoStart=' + noAutoStart);
  steps.push({ step: 'first paint is start screen (no auto-start)', ok: noAutoStart });
  const homePick = await pickHomeCard(page, '本地热座');
  const switched = homePick.selected;
  diag('toggles: switched=' + switched);

  // 0b) 首页「开局设置」里的扩充开关：真实点击后摘要行应立即反映万神殿已开
  const extHandle = await page.evaluateHandle(() => {
    const btns = [...document.querySelectorAll('.home-ext .btn')];
    return btns.find((b) => b.textContent.includes('万神殿')) || null;
  });
  const extEl = extHandle.asElement();
  if (extEl) await extEl.click();
  await sleep(200);
  const homeExt = await page.evaluate(() => {
    const p = document.querySelector('.start-panel .desc');
    return { clicked: !!document.querySelector('.home-ext .btn.on'), summary: p ? p.textContent.trim() : '' };
  });
  diag(`toggles: homeExt clicked=${homeExt.clicked} summary=${homeExt.summary.slice(0, 40)}`);
  steps.push({
    step: 'home extension toggle (real click, summary updates)',
    ok: homeExt.clicked && /万神殿/.test(homeExt.summary),
    ...homeExt,
  });
  // 复位回「关」再开局：后续对局内的顶栏双向断言以「关」为起点
  if (extEl) {
    await extEl.click();
    await sleep(200);
  }
  const homeExtOff = await page.evaluate(() => ({
    on: !!document.querySelector('.home-ext .btn.on'),
    summary: (document.querySelector('.start-panel .desc') || {}).textContent || '',
  }));
  steps.push({ step: 'home extension toggle back off', ok: !homeExtOff.on, ...homeExtOff });

  const began = await startGame(page);
  diag('toggles: began=' + began);
  steps.push({ step: 'start game (real click)', ok: began });
  const firstSkip = await skipOverlay();
  diag('toggles: firstSkip=' + firstSkip);

  // 1) 万神殿双向（真实鼠标点击；每次切换触发新对局，先跳过其奇迹选择）
  let before = await readLabel('万神殿');
  const c1 = await clickBtn('万神殿');
  diag(`toggles: c1=${c1}`);
  let okOn = await waitLabel('万神殿', /开/);
  let after = await readLabel('万神殿');
  steps.push({ step: 'pantheon on (real click)', before, after, ok: c1 && okOn && /关/.test(before) && /开/.test(after) });
  const g1 = await skipOverlay();
  diag('toggles: g1=' + g1);
  before = after;
  const c2 = await clickBtn('万神殿');
  diag(`toggles: c2=${c2}`);
  let okOff = await waitLabel('万神殿', /关/);
  let back = await readLabel('万神殿');
  steps.push({ step: 'pantheon off (real click)', before, after: back, ok: c2 && okOff && /关/.test(back) });
  const g2 = await skipOverlay();
  diag('toggles: g2=' + g2);

  // 2) 市政广场开启（真实鼠标点击）
  before = await readLabel('市政广场');
  const c3 = await clickBtn('市政广场');
  diag(`toggles: c3=${c3}`);
  const okAgo = await waitLabel('市政广场', /开/);
  after = await readLabel('市政广场');
  steps.push({ step: 'agora on (real click)', before, after, ok: c3 && okAgo && /关/.test(before) && /开/.test(after) });
  const g3 = await skipOverlay();
  diag('toggles: g3=' + g3);

  // 3) agora 开启的对局里推进 12 步（扩展挂上后引擎不崩、UI 可推进）
  const early = await evalSnippet(page, 'playHotseat.js', 12);
  diag(`toggles: early steps=${early.steps}`);

  // 4) 动态复位：只把仍为「开」的开关点回「关」（点击会触发新对局，须跳过其奇迹选择）
  const resetOne = async (label) => {
    if (/开/.test((await readLabel(label)) ?? '')) {
      await clickBtn(label);
      const ok = await waitLabel(label, /关/);
      await skipOverlay();
      return ok;
    }
    return true;
  };
  const resetP = await resetOne('万神殿');
  const resetA = await resetOne('市政广场');
  const finalLabels = {
    pantheon: await readLabel('万神殿'),
    agora: await readLabel('市政广场'),
  };
  diag(`toggles: resetP=${resetP} resetA=${resetA} final=${JSON.stringify(finalLabels)}`);

  const errs = await page.evaluate(() => window.__errs || []);
  const allOk = steps.every((s) => s.ok) && switched && firstSkip && g1 && g2 && g3
    && early.steps > 0 && !(early.errors || []).length && !errs.length
    && resetP && resetA && /关/.test(finalLabels.pantheon) && /关/.test(finalLabels.agora);
  const result = {
    phase: 'toggles',
    steps,
    switched,
    skips: { first: firstSkip, g1, g2, g3 },
    earlyRun: { steps: early.steps, drafts: early.drafts, builds: early.builds, errors: (early.errors || []).slice(0, 5) },
    finalLabels,
    pageErrors: errs.slice(0, 10),
    pass: allOk,
  };
  fs.writeFileSync(outFile, JSON.stringify(result, null, 2), 'utf8');
  console.log(result.pass ? 'TOGGLES_PASS' : 'TOGGLES_FAIL');
  await browser.close();
  return result.pass ? 0 : 1;
}

/* ---------------- 双窗口联机 ---------------- */
async function runOnline() {
  const browser = await launch();
  const ctxA = await browser.createBrowserContext();
  const ctxB = await browser.createBrowserContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  await a.setViewport({ width: 1280, height: 900 });
  await b.setViewport({ width: 1280, height: 900 });
  await a.goto(URL, { waitUntil: 'networkidle2' });
  await b.goto(URL, { waitUntil: 'networkidle2' });
  await armErrorTrap(a);
  await armErrorTrap(b);

  const diagA = (m) => diag('online/A: ' + m);
  const diagB = (m) => diag('online/B: ' + m);

  /** 首页点「联机对战」卡片 → 直接进大厅（顶栏在首页是收起的，不能依赖它切模式） */
  const gotoOnline = async (page) => {
    const pick = await pickHomeCard(page, '联机对战');
    diag(`gotoOnline: found=${pick.found} clicked=${pick.clicked}`);
    await page
      .waitForFunction(() => !!document.querySelector('.room-actions, .conn-connected, .conn-disconnected'), {
        timeout: 8000,
        polling: 250,
      })
      .then(() => true)
      .catch(() => false);
    await sleep(300);
  };
  const waitBodyMatch = (page, re, timeout) =>
    page
      .waitForFunction((src) => new RegExp(src).test(document.body.textContent || ''), { timeout, polling: 250 }, re.source)
      .then(() => true)
      .catch(() => false);

  // A：创建房间，从 .room-code strong 提取房码
  await gotoOnline(a);
  // 等 WS 建连（● 已连接）再创建，避免「连接未就绪时点创建被吞」
  const aConn = await a
    .waitForFunction(() => !!document.querySelector('.conn-connected'), { timeout: 8000, polling: 200 })
    .then(() => true)
    .catch(() => false);
  diagA(`connected=${aConn}`);
  await a.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('创建房间'));
    btn && btn.click();
  });
  diagA('clicked 创建房间');
  const gotCode = await a
    .waitForFunction(() => {
      const el = document.querySelector('.room-code strong');
      return el && /^[A-Z0-9]{6}$/.test(el.textContent || '');
    }, { timeout: 8000, polling: 250 })
    .then(() => true)
    .catch(() => false);
  const code = await a.evaluate(() => {
    const el = document.querySelector('.room-code strong');
    return el ? el.textContent : null;
  });
  diagA(`code=${code} gotCode=${gotCode}`);
  if (!code) throw new Error('failed to obtain room code');

  // B：输入房码并加入
  await gotoOnline(b);
  const bConn = await b
    .waitForFunction(() => !!document.querySelector('.conn-connected'), { timeout: 8000, polling: 200 })
    .then(() => true)
    .catch(() => false);
  diagB(`connected=${bConn}`);
  await b.evaluate((c) => {
    const input = document.querySelector('.code-input, input[placeholder*="房间"], input');
    if (input) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, c);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }, code);
  await sleep(150);
  await b.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === '加入');
    btn && btn.click();
  });
  diagB(`clicked 加入 code=${code}`);
  const bJoined = await waitBodyMatch(b, /已就位/, 8000);
  diagB(`joined=${bJoined}`);

  // 双方点「我准备好了」
  const ready = async (page, tag) => {
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('我准备好了'));
      btn && btn.click();
    });
    diag(`${tag}: clicked 我准备好了`);
  };
  await ready(a, 'online/A');
  await ready(b, 'online/B');
  await sleep(300);

  // 房主点「开始对局」（对手就位后按钮解禁）
  const startOk = await a
    .waitForFunction(() => {
      const btn = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('开始对局'));
      return btn && !btn.disabled;
    }, { timeout: 8000, polling: 250 })
    .then(() => true)
    .catch(() => false);
  diagA(`start enabled=${startOk}`);
  await a.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('开始对局'));
    btn && btn.click();
  });

  // 等两端都进入对局（奇迹草稿 overlay 出现）
  const aIn = await waitBodyMatch(a, /奇迹选择|第 1 \/ 8/, 10000);
  const bIn = await waitBodyMatch(b, /奇迹选择|第 1 \/ 8/, 10000);
  diagA(`inGame=${aIn}`);
  diagB(`inGame=${bIn}`);

  // 交替推进直到终局
  const out = { a: null, b: null, rounds: 0 };
  const MAX_ROUNDS = 80;
  for (let r = 0; r < MAX_ROUNDS; r++) {
    out.a = await evalSnippet(a, 'onlineStep.js', 30);
    out.b = await evalSnippet(b, 'onlineStep.js', 30);
    out.rounds = r + 1;
    if (out.a.finished || out.b.finished) break;
    if ((out.a.errors || []).length || (out.b.errors || []).length) break;
    await sleep(120);
  }
  // 终局帧到达有先后：给未看到结果的一端补跑机会
  const flush = async (page, side) => {
    for (let i = 0; i < 10; i++) {
      if (out[side].finished) return;
      out[side] = await evalSnippet(page, 'onlineStep.js', 10);
      await sleep(150);
    }
  };
  await flush(a, 'a');
  await flush(b, 'b');
  out.rounds += 0;
  diagA(`finished=${out.a.finished} result=${out.a.result} acted=${out.a.acted}`);
  diagB(`finished=${out.b.finished} result=${out.b.result} acted=${out.b.acted}`);

  const errsA = await a.evaluate(() => window.__errs || []);
  const errsB = await b.evaluate(() => window.__errs || []);

  const sameResult =
    out.a.finished && out.b.finished && out.a.result !== null && out.a.result === out.b.result;
  const result = {
    phase: 'online',
    code,
    aInGame: aIn,
    bInGame: bIn,
    rounds: out.rounds,
    a: { ...out.a, errors: (out.a.errors || []).slice(0, 5) },
    b: { ...out.b, errors: (out.b.errors || []).slice(0, 5) },
    pageErrorsA: errsA.slice(0, 10),
    pageErrorsB: errsB.slice(0, 10),
    pass: !!(sameResult && !errsA.length && !errsB.length),
  };
  fs.writeFileSync(outFile, JSON.stringify(result, null, 2), 'utf8');
  console.log(result.pass ? 'ONLINE_PASS' : 'ONLINE_FAIL');
  await browser.close();
  return result.pass ? 0 : 1;
}

/* ---------------- 单人 Solo 整局 + 复盘 ---------------- */
async function runSolo() {
  const browser = await launch();
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await armErrorTrap(page);

  /** 兜底重开：领袖回合僵死于 2026-09-16 已修（`actor` 改用 `activePlayer`），仍记录 stalls 以便复发时立刻可见 */
  let out = null;
  let stalls = 0;
  let began = false;
  let home = null;
  let batches = 0;
  const MAX_ATTEMPT = 3;
  for (let attempt = 1; attempt <= MAX_ATTEMPT && !(out && out.finished); attempt++) {
    await page.goto(URL, { waitUntil: 'networkidle2' });
    // 新交互：先在首页点模式卡片（领袖选择器就地展开在该卡内），再点「开始对局」
    if (!home) home = await pickHomeCard(page, '单人 Solo');
    began = (await startGame(page)) || began;
    if (!began) break;
    let stuck = 0;
    let lastSteps = -1;
    await page.evaluate(() => {
      delete window.__out;
    });
    while (batches < attempt * 80) {
      out = await evalSnippet(page, 'playSolo.js', 40);
      batches++;
      if (out.finished) break;
      if (out.errors && out.errors.length) break;
      // 「一批下去玩家一步都没走」= 页面停在无法操作的画面
      stuck = out.steps > lastSteps ? 0 : stuck + 1;
      lastSteps = out.steps;
      if (stuck >= 4) {
        stalls++;
        console.log(`SOLO_STALL attempt=${attempt} steps=${out.steps} leaderBusy=${out.leaderBusy}`);
        break;
      }
      await sleep(150);
    }
  }

  const replay = out && out.finished && out.hasReplayBtn
    ? JSON.parse(await page.evaluate(fs.readFileSync(path.join(SNIPPET_DIR, 'replayUiCheck.js'), 'utf8')))
    : { pass: false, notes: ['未到达可复盘的终局'] };

  const errs = await page.evaluate(() => window.__errs || []);
  const result = {
    phase: 'solo',
    began,
    home,
    batches,
    stalls,
    ...out,
    replay,
    pageErrors: errs.slice(0, 10),
    pass: !!(
      began &&
      home &&
      home.selected &&
      home.paramText.includes('对手领袖') &&
      out &&
      out.finished &&
      out.hasReplayBtn &&
      replay &&
      replay.pass &&
      !errs.length
    ),
  };
  fs.writeFileSync(outFile, JSON.stringify(result, null, 2), 'utf8');
  console.log(result.pass ? 'SOLO_PASS' : 'SOLO_FAIL');
  await browser.close();
  return result.pass ? 0 : 1;
}

(async () => {
  try {
    diag('entering dispatcher');
    if (phase === 'hotseat') process.exit(await runHotseat());
    else if (phase === 'toggles') process.exit(await runToggles());
    else if (phase === 'online') process.exit(await runOnline());
    else if (phase === 'solo') process.exit(await runSolo());
    else { console.error('unknown phase'); process.exit(2); }
  } catch (e) {
    diag('FATAL: ' + e.message + ' | ' + String(e.stack).split('\n')[1]);
    fs.writeFileSync(outFile, JSON.stringify({ phase, fatal: e.message, stack: String(e.stack).slice(0, 2000) }, null, 2), 'utf8');
    console.error('FATAL', e.message);
    process.exit(1);
  }
})();
