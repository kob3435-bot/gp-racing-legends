// v3 "post": the anime look needs no render-target chain. The scene renders straight to the canvas
// (MSAA from the context on MEDIUM+), and screen effects are cheap DOM overlays composited by the browser:
// anime speed lines (pre-drawn radial wedges, 4 frames cycled) and impact / overtake flash frames.
function drawSpeedLines(w, h, seed) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
  let r = seed * 9301 + 49297; const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  const cx = w / 2, cy = h * 0.46, R = Math.hypot(w, h) * 0.6;
  for (let i = 0; i < 90; i++) {
    const a = rnd() * Math.PI * 2, inner = (0.42 + rnd() * 0.28) * R, wd = 0.004 + rnd() * 0.011;
    x.fillStyle = rnd() < 0.82 ? 'rgba(255,255,255,0.9)' : 'rgba(30,24,56,0.55)';
    x.beginPath(); x.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner * 0.75);
    x.lineTo(cx + Math.cos(a - wd) * R, cy + Math.sin(a - wd) * R * 0.75); x.lineTo(cx + Math.cos(a + wd) * R, cy + Math.sin(a + wd) * R * 0.75); x.fill();
  }
  return c;
}

// v6: manga focus lines (dense radial wedges with a clean oval centre) for boosts / overtakes
function drawFocusLines(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
  let r = 7; const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  const cx = w / 2, cy = h * 0.5, R = Math.hypot(w, h) * 0.62;
  for (let i = 0; i < 220; i++) {
    const a = (i / 220) * Math.PI * 2 + rnd() * 0.02, inner = (0.5 + rnd() * 0.22) * R, wd = 0.002 + rnd() * 0.006;
    x.fillStyle = i % 5 === 0 ? 'rgba(255,255,255,0.75)' : 'rgba(18,12,36,0.85)';
    x.beginPath(); x.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner * 0.62);
    x.lineTo(cx + Math.cos(a - wd) * R, cy + Math.sin(a - wd) * R * 0.62); x.lineTo(cx + Math.cos(a + wd) * R, cy + Math.sin(a + wd) * R * 0.62); x.fill();
  }
  return c;
}
// impact frame: hard black/white starburst (shown for ~2 frames, like an anime hit frame)
function drawImpact(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, w, h);
  const cx = w / 2, cy = h * 0.48, R = Math.hypot(w, h);
  x.fillStyle = '#120c24';
  for (let i = 0; i < 64; i++) { const a = (i / 64) * Math.PI * 2, wd = 0.035 + (i % 3) * 0.012; x.beginPath(); x.moveTo(cx + Math.cos(a) * h * 0.18, cy + Math.sin(a) * h * 0.18); x.lineTo(cx + Math.cos(a - wd) * R, cy + Math.sin(a - wd) * R); x.lineTo(cx + Math.cos(a + wd) * R, cy + Math.sin(a + wd) * R); x.fill(); }
  return c;
}
// lens-flare ghosts + god-ray fan around the sun (pre-drawn once; moved with transforms only)
function drawRays(s) {
  const c = document.createElement('canvas'); c.width = c.height = s; const x = c.getContext('2d'); const m = s / 2;
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + (i % 2) * 0.1, wd = 0.05 + (i % 3) * 0.035;
    const g = x.createRadialGradient(m, m, 0, m, m, m); g.addColorStop(0, 'rgba(255,240,200,0.55)'); g.addColorStop(1, 'rgba(255,220,160,0)');
    x.fillStyle = g; x.beginPath(); x.moveTo(m, m); x.arc(m, m, m, a - wd, a + wd); x.closePath(); x.fill();
  }
  const g = x.createRadialGradient(m, m, 0, m, m, m * 0.22); g.addColorStop(0, 'rgba(255,255,240,0.95)'); g.addColorStop(1, 'rgba(255,230,180,0)'); x.fillStyle = g; x.fillRect(0, 0, s, s);
  return c;
}

import { viewSize } from '../orient.js';
export class Post {
  constructor(renderer) {
    this.renderer = renderer; this.enabled = true; this.scene = null; this.camera = null; this.preset = null;
    this.t = 0; this.frame = 0; this._op = -1; this._fl = -1;
    const root = this.root = document.createElement('div'); root.id = 'fxo';
    root.innerHTML = '<div class="rays"></div><div class="ghosts"><i></i><i></i><i></i><i></i></div><div class="sl"></div><div class="focus"></div><div class="impact"></div><div class="flash"></div>';
    this.sl = root.querySelector('.sl'); this.fl = root.querySelector('.flash');
    this.rays = root.querySelector('.rays'); this.ghosts = root.querySelector('.ghosts'); this.fo = root.querySelector('.focus'); this.im = root.querySelector('.impact');
    const fc = drawFocusLines(640, 360); fc.className = 'slf'; this.fo.appendChild(fc);
    const ic = drawImpact(480, 270); ic.className = 'slf'; this.im.appendChild(ic);
    const rc = drawRays(512); this.rays.appendChild(rc);
    this._fo = -1; this._sun = ''; this.imT = 0;
    this.frames = [0, 1, 2, 3].map(k => { const cv = drawSpeedLines(640, 360, k + 1); cv.className = 'slf'; cv.style.opacity = k ? 0 : 1; this.sl.appendChild(cv); return cv; });
    (renderer.domElement.parentNode || document.body).appendChild(root);
  }
  configure(preset, scene, camera) { this.preset = preset; this.scene = scene; this.camera = camera; }
  setScene(scene, camera) { this.scene = scene; this.camera = camera; }
  resize() {}
  // per-frame look: speed lines amount (0..1) and flash (0..1); other v2 keys are ignored
  setLook({ lines = 0, flash = 0, time = 0 } = {}) {
    const op = Math.round(Math.min(1, lines) * 40) / 40;
    if (op !== this._op) { this.sl.style.opacity = op; this._op = op; }
    if (op > 0 && time - this.t > 0.06) { this.t = time; this.frames[this.frame].style.opacity = 0; this.frame = (this.frame + 1) % 4; this.frames[this.frame].style.opacity = 1; }
    const fl = Math.round(Math.min(1, flash) * 30) / 30;
    if (fl !== this._fl) { this.fl.style.opacity = fl; this._fl = fl; }
  }
  // manga focus lines amount (0..1): boosts / slipstream / overtakes
  focus(a) { const v = Math.round(Math.min(1, a) * 20) / 20; if (v !== this._fo) { this._fo = v; this.fo.style.opacity = v; } }
  // 2-frame impact flash (black/white starburst) + brief canvas contrast punch
  impact() {
    this.im.style.opacity = 0.85; clearTimeout(this.imT);
    this.imT = setTimeout(() => { this.im.style.opacity = 0; }, 70);
  }
  // sun screen position (0..1) and visibility (0..1): god-ray fan + flare ghosts along the sun->centre axis
  sun(x, y, vis) {
    const k = vis > 0.02 ? `${Math.round(x * 400)},${Math.round(y * 400)},${Math.round(vis * 20)}` : '0';
    if (k === this._sun) return; this._sun = k;
    if (vis <= 0.02) { this.rays.style.opacity = 0; this.ghosts.style.opacity = 0; return; }
    const { w: W, h: H } = viewSize(), sx = x * W, sy = y * H;
    this.rays.style.opacity = (0.55 * vis).toFixed(2); this.rays.style.transform = `translate(${sx}px,${sy}px) translate(-50%,-50%)`;
    this.ghosts.style.opacity = (0.8 * vis).toFixed(2);
    const g = this.ghosts.children, dx = W / 2 - sx, dy = H / 2 - sy;
    for (let i = 0; i < g.length; i++) { const f = [0.45, 0.8, 1.25, 1.6][i]; g[i].style.transform = `translate(${sx + dx * f}px,${sy + dy * f}px) translate(-50%,-50%)`; }
  }
  render() { if (this.scene && this.camera) this.renderer.render(this.scene, this.camera); }
  dispose() {}
}

// Dynamic resolution: nudges the render scale to hold the target frame rate.
export class DynRes {
  constructor(target = 58) { this.target = target; this.scale = 1; this.acc = 0; this.frames = 0; this.cool = 0; this.min = 0.6; }
  update(dt) {
    this.acc += dt; this.frames++; this.cool -= dt;
    if (this.acc < 0.75) return null;
    const fps = this.frames / this.acc; this.acc = 0; this.frames = 0;
    if (this.cool > 0) return null;
    let s = this.scale;
    if (fps < this.target * 0.88 && s > this.min) s = Math.max(this.min, s - (fps < this.target * 0.6 ? 0.15 : 0.08));
    else if (fps > this.target * 1.08 && s < 1) s = Math.min(1, s + 0.05);
    if (s !== this.scale) { this.scale = s; this.cool = 1.2; return s; }
    return null;
  }
}
