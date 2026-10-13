// v8 landscape everywhere on phones/tablets (desktop untouched):
//  - first tap: fullscreen + screen.orientation.lock('landscape-primary') where supported (Android Chrome / PWA)
//  - otherwise, while a touch device reports PORTRAIT (e.g. iOS rotation lock, Safari), the whole #root is rotated
//    90deg with CSS and sized to the visual viewport (handles the iOS address bar + safe areas). DOM hit-testing,
//    native scrolling and inputs work through the transform; JS reads the game size via viewSize().
//  - if the device turns to real landscape, the rotation is removed live (no reload, no pause).
//  - FIXED direction: 90deg clockwise (phone bottom/home side on the right, like standard landscape games).
//    No sensors are used to pick it (v8's gravity choice flipped sides on real phones).
//  - layout only changes on real resize/orientation events, debounced 300 ms; the portrait/landscape decision has
//    hysteresis so iOS address-bar height jitter can never toggle it.
const st = { flip: false, rot: 0, w: innerWidth, h: innerHeight, coarse: false };
export const orient = st;
export function viewSize() { return st; }
function vv() { const v = window.visualViewport; return v ? { w: Math.round(v.width), h: Math.round(v.height) } : { w: innerWidth, h: innerHeight }; }
const dir = 90;
function apply() {
  const { w, h } = vv(), html = document.documentElement;
  // hysteresis: switch only when the aspect clearly crosses (address-bar jitter is a few % of the height)
  const portrait = st.rot ? !(w > h * 1.05) : h > w * 1.05;
  const rot = st.coarse && portrait ? dir : 0;
  const nw = rot ? h : w, nh = rot ? w : h;
  // ONE fixed physical hold: landscape with the front camera on the LEFT (landscape-primary / window.orientation 90).
  // If the browser is in the other landscape (camera on the right), counter-rotate 180deg.
  const flip = !rot && st.coarse && isSecondary();
  const changed = rot !== st.rot || flip !== st.flip || nw !== st.w || nh !== st.h;
  st.rot = rot; st.flip = flip; st.w = nw; st.h = nh;
  const cl = html.classList; // only touch the attribute on a real change (no spurious mutations / style recalcs)
  if (cl.contains('rot') !== !!rot) cl.toggle('rot', !!rot);
  if (cl.contains('flip') !== flip) cl.toggle('flip', flip);
  const S = html.style;
  S.setProperty('--rw', nw + 'px'); S.setProperty('--rh', nh + 'px'); S.setProperty('--pw', w + 'px'); S.setProperty('--ph', h + 'px');
  S.setProperty('--vw1', nw / 100 + 'px'); S.setProperty('--vh1', nh / 100 + 'px'); S.setProperty('--vmin1', Math.min(nw, nh) / 100 + 'px'); S.setProperty('--vmax1', Math.max(nw, nh) / 100 + 'px');
  if (changed) window.dispatchEvent(new Event('gp-resize'));
}
export function installOrientation() {
  st.coarse = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0 && /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  apply();
  let tm = 0; const later = () => { clearTimeout(tm); tm = setTimeout(apply, 300); };
  addEventListener('resize', later); if (window.visualViewport) visualViewport.addEventListener('resize', later);
  addEventListener('orientationchange', later); if (screen.orientation && screen.orientation.addEventListener) screen.orientation.addEventListener('change', later);
  if (!st.coarse) return st;
  const tryLock = async () => {
    try { const d = document.documentElement; if (!document.fullscreenElement && d.requestFullscreen) await d.requestFullscreen({ navigationUI: 'hide' }); } catch { /* not allowed (iOS) */ }
    try { if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape-primary'); } catch { /* unsupported -> CSS rotation keeps landscape */ }
    apply();
  };
  addEventListener('pointerdown', tryLock, { once: true, capture: true });
  return st;
}

// Touch scrolling inside the rotated root: the browser pans along the PHYSICAL axes, so in rotated mode we take
// over (touch-action:none on #root) and scroll the nearest scrollable ancestor along the GAME axes, with momentum.
// A drag beyond a small slop suppresses the click that would otherwise fire on the card under the finger.
function scrollableOf(el, axis) {
  for (let e = el; e && e.id !== 'root' && e !== document.body; e = e.parentElement) {
    const cs = getComputedStyle(e);
    if (axis === 'y' && /(auto|scroll)/.test(cs.overflowY) && e.scrollHeight > e.clientHeight + 1) return e;
    if (axis === 'x' && /(auto|scroll)/.test(cs.overflowX) && e.scrollWidth > e.clientWidth + 1) return e;
  }
  return null;
}
function isSecondary() {
  const so = screen.orientation; if (so && so.type) return so.type === 'landscape-secondary';
  return window.orientation === -90;
}
let drag = null, swallowClick = false;
function toGame(dx, dy) { return st.rot === 90 ? { x: dy, y: -dx } : st.flip ? { x: -dx, y: -dy } : { x: dx, y: dy }; }
addEventListener('touchstart', (e) => {
  if (!(st.rot || st.flip) || e.touches.length !== 1) { drag = null; return; }
  const t = e.touches[0], tg = e.target;
  if (tg.closest && tg.closest('input[type=range], .touch, #gl')) { drag = null; return; } // sliders + steering buttons keep native handling
  drag = { x: t.clientX, y: t.clientY, sx: t.clientX, sy: t.clientY, tg, ey: scrollableOf(tg, 'y'), ex: scrollableOf(tg, 'x'), moved: false, vy: 0, vx: 0, t: performance.now() };
  swallowClick = false;
}, { passive: true, capture: true });
addEventListener('touchmove', (e) => {
  if (!drag || !(st.rot || st.flip)) return;
  const t = e.touches[0], g = toGame(t.clientX - drag.x, t.clientY - drag.y), tot = toGame(t.clientX - drag.sx, t.clientY - drag.sy);
  if (!drag.moved && Math.hypot(tot.x, tot.y) > 8) drag.moved = true;
  if (drag.moved) {
    const now = performance.now(), dt = Math.max(1, now - drag.t);
    if (drag.ey) { drag.ey.scrollTop -= g.y; drag.vy = -g.y / dt; }
    if (drag.ex) { drag.ex.scrollLeft -= g.x; drag.vx = -g.x / dt; }
    drag.t = now; if (e.cancelable) e.preventDefault();
  }
  drag.x = t.clientX; drag.y = t.clientY;
}, { passive: false, capture: true });
addEventListener('touchend', () => {
  if (!drag) return;
  const d = drag; drag = null;
  if (d.moved) {
    swallowClick = true; setTimeout(() => { swallowClick = false; }, 400);
    let vy = d.vy * 16, vx = d.vx * 16; // px per frame
    const step = () => { if (Math.abs(vy) < 0.5 && Math.abs(vx) < 0.5) return; if (d.ey) d.ey.scrollTop += vy; if (d.ex) d.ex.scrollLeft += vx; vy *= 0.94; vx *= 0.94; requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
}, { capture: true });
addEventListener('click', (e) => { if (swallowClick) { swallowClick = false; e.stopPropagation(); e.preventDefault(); } }, true);
