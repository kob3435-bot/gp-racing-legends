// v10 free orientation: no locking, no forced rotation. Both landscape sides and portrait display natively.
// Touch devices in portrait get a dedicated portrait layout (html.portrait + tall chase camera); everything adapts live
// on resize (debounced, with hysteresis so iOS address-bar jitter can't toggle the layout). Desktop is unchanged.
const st = { w: innerWidth, h: innerHeight, portrait: false, coarse: false };
export const orient = st;
export function viewSize() { return st; }
function vv() { const v = window.visualViewport; return v ? { w: Math.round(v.width), h: Math.round(v.height) } : { w: innerWidth, h: innerHeight }; }
export function screenAngle() { const so = screen.orientation; if (so && typeof so.angle === 'number') return ((so.angle % 360) + 360) % 360; const o = window.orientation; return o == null ? 0 : ((+o % 360) + 360) % 360; }
function apply() {
  const { w, h } = vv(), html = document.documentElement;
  const portrait = st.coarse && (st.portrait ? !(w > h * 1.05) : h > w * 1.05);
  const changed = portrait !== st.portrait || w !== st.w || h !== st.h;
  st.w = w; st.h = h; st.portrait = portrait;
  if (html.classList.contains('portrait') !== portrait) html.classList.toggle('portrait', portrait);
  const S = html.style;
  S.setProperty('--vw1', w / 100 + 'px'); S.setProperty('--vh1', h / 100 + 'px'); S.setProperty('--vmin1', Math.min(w, h) / 100 + 'px'); S.setProperty('--vmax1', Math.max(w, h) / 100 + 'px');
  if (changed) window.dispatchEvent(new Event('gp-resize'));
}
export function installOrientation() {
  st.coarse = matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints > 0 && /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent));
  apply();
  let tm = 0; const later = () => { clearTimeout(tm); tm = setTimeout(apply, 150); };
  addEventListener('resize', later); if (window.visualViewport) visualViewport.addEventListener('resize', later);
  addEventListener('orientationchange', later); if (screen.orientation && screen.orientation.addEventListener) screen.orientation.addEventListener('change', later);
  return st;
}
