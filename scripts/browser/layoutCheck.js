/* 布局体检：在浏览器真实视口下测量是否溢出、牌阵是否完整可见、触控目标是否够大 */
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await sleep(400);
  const w = window.innerWidth;
  const h = window.innerHeight;
  const doc = document.documentElement;

  // 判断元素是否被某个横向滚动容器裁剪（轨道这类内容是设计成可横滑的，不算溢出）
  const inScroller = (el) => {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX;
      if (ox === 'auto' || ox === 'scroll') return true;
    }
    return false;
  };

  // 找出所有真正横向溢出视口的元素（排除滚动容器内的）
  const overflowing = [];
  for (const el of document.querySelectorAll('.app *')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0) continue;
    if (r.right > w + 1 || r.left < -1) {
      if (inScroller(el)) continue;
      overflowing.push({
        cls: (el.className || el.tagName).toString().slice(0, 40),
        left: Math.round(r.left),
        right: Math.round(r.right),
      });
    }
  }

  const stage = document.querySelector('.structure-stage');
  const wrap = document.querySelector('.structure-wrap');
  const card = document.querySelector('.card.selectable') || document.querySelector('.card');

  const out = {
    viewport: w + 'x' + h,
    docScrollWidth: doc.scrollWidth,
    viewportWidth: w,
    horizontalOverflow: Math.max(0, doc.scrollWidth - w),
    overflowingCount: overflowing.length,
    overflowingSample: overflowing.slice(0, 6),
    structure: stage
      ? {
          stageWidth: Math.round(stage.getBoundingClientRect().width),
          wrapWidth: wrap ? wrap.clientWidth : null,
          fitsInWrap: wrap ? stage.getBoundingClientRect().width <= wrap.clientWidth + 1 : null,
          height: Math.round(stage.getBoundingClientRect().height),
        }
      : null,
    cardBox: card
      ? {
          width: Math.round(card.getBoundingClientRect().width),
          height: Math.round(card.getBoundingClientRect().height),
        }
      : null,
    scaleTip: (document.querySelector('.scale-tip') || {}).textContent || null,
    panelsCollapsed: document.querySelectorAll('details.collapsible:not([open])').length,
    actionBarSticky: (() => {
      const el = document.querySelector('.panel.actions');
      if (!el) return null;
      return getComputedStyle(el).position;
    })(),
    trackScrollable: (() => {
      const el = document.querySelector('.track-scroll');
      if (!el) return null;
      return el.scrollWidth > el.clientWidth;
    })(),
  };
  return JSON.stringify(out);
})()
