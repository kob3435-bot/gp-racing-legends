// v8 landscape everywhere on phones/tablets (desktop untouched):
//  - first tap: fullscreen + screen.orientation.lock('landscape') where supported (Android Chrome / PWA)
//  - otherwise, while a touch device reports PORTRAIT (e.g. iOS rotation lock, Safari), the whole #root is rotated
//    90deg with CSS and sized to the visual viewport (handles the iOS address bar + safe areas). DOM hit-testing,
//    native scrolling and inputs work through the transform; JS reads the game size via viewSize().
//  - if the device turns to real landscape, the rotation is removed live (no reload, no pause).
//  - which way to rotate follows gravity (deviceorientation gamma) so the picture is upright however it's held.
const st = { rot: 0, w: innerWidth, h: innerHeight, coarse: false };
export const orient = st;
export function viewSize() { return st; }
function vv() { const v = window.visualViewport; return v ? { w: Math.round(v.width), h: Math.round(v.height) } : { w: innerWidth, h: innerHeight }; }
let dir = 90;
function apply() {
  const { w, h } = vv(), html = document.documentElement;
  const rot = st.coarse && h > w ? dir : 0;
  const nw = rot ? h : w, nh = rot ? w : h;
  const changed = rot !== st.rot || nw !== st.w || nh !== st.h;
  st.rot = rot; st.w = nw; st.h = nh;
  html.classList.toggle('rot', !!rot); html.classList.toggle('rot-ccw', rot === -90);
  const S = html.style;
  S.setProperty('--rw', nw + 'px'); S.setProperty('--rh', nh + 'px'); S.setProperty('--pw', w + 'px'); S.setProperty('--ph', h + 'px');
  S.setProperty('--vw1', nw / 100 + 'px'); S.setProperty('--vh1', nh / 100 + 'px'); S.setProperty('--vmin1', Math.min(nw, nh) / 100 + 'px'); S.setProperty('--vmax1', Math.max(nw, nh) / 100 + 'px');
  if (changed) window.dispatchEvent(new Event('gp-resize'));
}
export function installOrientation() {
  st.coarse = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0 && /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  apply();
  addEventListener('resize', apply); if (window.visualViewport) { visualViewport.addEventListener('resize', apply); visualViewport.addEventListener('scroll', apply); }
  addEventListener('orientationchange', () => setTimeout(apply, 60));
  if (!st.coarse) return st;
  // upright whichever way the phone is held sideways (hysteresis so it doesn't flip-flop)
  addEventListener('deviceorientation', (e) => { if (e.gamma == null) return; const nd = e.gamma < -40 ? -90 : e.gamma > 40 ? 90 : dir; if (nd !== dir) { dir = nd; apply(); } });
  const tryLock = async () => {
    try { const d = document.documentElement; if (!document.fullscreenElement && d.requestFullscreen) await d.requestFullscreen({ navigationUI: 'hide' }); } catch { /* not allowed (iOS) */ }
    try { if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape'); } catch { /* unsupported -> CSS rotation keeps landscape */ }
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
let drag = null, swallowClick = false;
function toGame(dx, dy) { return st.rot === 90 ? { x: dy, y: -dx } : st.rot === -90 ? { x: -dy, y: dx } : { x: dx, y: dy }; }
addEventListener('touchstart', (e) => {
  if (!st.rot || e.touches.length !== 1) { drag = null; return; }
  const t = e.touches[0], tg = e.target;
  if (tg.closest && tg.closest('input[type=range], .touch, #gl')) { drag = null; return; } // sliders + steering buttons keep native handling
  drag = { x: t.clientX, y: t.clientY, sx: t.clientX, sy: t.clientY, tg, ey: scrollableOf(tg, 'y'), ex: scrollableOf(tg, 'x'), moved: false, vy: 0, vx: 0, t: performance.now() };
  swallowClick = false;
}, { passive: true, capture: true });
addEventListener('touchmove', (e) => {
  if (!drag || !st.rot) return;
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
