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

export class Post {
  constructor(renderer) {
    this.renderer = renderer; this.enabled = true; this.scene = null; this.camera = null; this.preset = null;
    this.t = 0; this.frame = 0; this._op = -1; this._fl = -1;
    const root = this.root = document.createElement('div'); root.id = 'fxo';
    root.innerHTML = '<div class="sl"></div><div class="flash"></div>';
    this.sl = root.firstChild; this.fl = root.lastChild;
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
