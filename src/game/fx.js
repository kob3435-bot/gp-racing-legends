import * as THREE from 'three';
import { puffTexture, starTexture } from './toon.js';

// Pooled point-sprite particles (no per-frame allocations). One draw call per system.
function softTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.45, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); return t;
}
let SOFT = null;
const VS = `attribute float aSize; attribute vec4 aColor; uniform float uScale; varying vec4 vColor;
void main(){ vColor = aColor; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * uScale / max(0.5, -mv.z); gl_Position = projectionMatrix * mv; }`;
const FS = `uniform sampler2D map; varying vec4 vColor; void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vColor.rgb * t.rgb, vColor.a * t.a); if (gl_FragColor.a < 0.004) discard; }`;

export class Particles {
  constructor(max, { additive = false, map = null } = {}) {
    SOFT = SOFT || softTexture();
    this.max = Math.max(1, max); this.head = 0; this.alive = 0;
    const n = this.max;
    this.p = new Float32Array(n * 3); this.v = new Float32Array(n * 3); this.life = new Float32Array(n); this.maxLife = new Float32Array(n);
    this.s0 = new Float32Array(n); this.s1 = new Float32Array(n); this.c = new Float32Array(n * 3); this.a0 = new Float32Array(n); this.drag = new Float32Array(n); this.grav = new Float32Array(n);
    this.size = new Float32Array(n); this.col = new Float32Array(n * 4);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.p, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({ uniforms: { map: { value: map || SOFT }, uScale: { value: 600 } }, vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false; this.points.renderOrder = 5;
    this.geo = g;
  }
  emit(x, y, z, vx, vy, vz, life, s0, s1, r, gg, b, a, drag = 1, grav = 0) {
    const i = this.head; this.head = (this.head + 1) % this.max;
    const i3 = i * 3;
    this.p[i3] = x; this.p[i3 + 1] = y; this.p[i3 + 2] = z; this.v[i3] = vx; this.v[i3 + 1] = vy; this.v[i3 + 2] = vz;
    this.life[i] = life; this.maxLife[i] = life; this.s0[i] = s0; this.s1[i] = s1; this.c[i3] = r; this.c[i3 + 1] = gg; this.c[i3 + 2] = b; this.a0[i] = a; this.drag[i] = drag; this.grav[i] = grav;
  }
  update(dt, scale) {
    this.mat.uniforms.uScale.value = scale;
    let alive = 0;
    for (let i = 0; i < this.max; i++) {
      const i3 = i * 3, i4 = i * 4;
      if (this.life[i] <= 0) { this.size[i] = 0; this.col[i4 + 3] = 0; continue; }
      alive++;
      this.life[i] -= dt;
      const t = 1 - Math.max(0, this.life[i]) / this.maxLife[i];
      const dr = Math.exp(-this.drag[i] * dt);
      this.v[i3] *= dr; this.v[i3 + 1] = this.v[i3 + 1] * dr - this.grav[i] * dt; this.v[i3 + 2] *= dr;
      this.p[i3] += this.v[i3] * dt; this.p[i3 + 1] += this.v[i3 + 1] * dt; this.p[i3 + 2] += this.v[i3 + 2] * dt;
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      this.col[i4] = this.c[i3]; this.col[i4 + 1] = this.c[i3 + 1]; this.col[i4 + 2] = this.c[i3 + 2];
      this.col[i4 + 3] = this.a0[i] * (t < 0.12 ? t / 0.12 : (1 - t) * (1 - t) / 0.77);
    }
    this.alive = alive;
    if (alive || this.wasAlive) { this.geo.attributes.position.needsUpdate = true; this.geo.attributes.aSize.needsUpdate = true; this.geo.attributes.aColor.needsUpdate = true; }
    this.wasAlive = alive > 0;
  }
  dispose() { this.geo.dispose(); this.mat.dispose(); }
}

// Effects manager: owns the pools and offers semantic emitters.
export class FX {
  constructor(scene, quality) {
    const q = quality;
    this.q = q;
    const n = [140, 700, 1500, 2600][q];
    // v3: shape-based anime sprites (cartoon puffs, four-point star sparks)
    this.smoke = new Particles(n, { map: puffTexture() }); this.glow = new Particles(Math.round(n * 0.5), { additive: true, map: starTexture() });
    scene.add(this.smoke.points, this.glow.points);
    this.rate = [0.25, 0.6, 1, 1.4][q];
    this.acc = new Map();
  }
  // probabilistic emission helper (rate per second scaled by quality)
  n(key, perSec, dt) { const a = (this.acc.get(key) || 0) + perSec * this.rate * dt; const k = Math.floor(a); this.acc.set(key, a - k); return k; }
  tyreSmoke(p, vx, vz, strength = 1) {
    this.smoke.emit(p.x + (Math.random() - 0.5) * 0.2, p.y + 0.15, p.z + (Math.random() - 0.5) * 0.2, vx * 0.25 + (Math.random() - 0.5), 0.6 + Math.random() * 0.6, vz * 0.25 + (Math.random() - 0.5), 1.4 + Math.random(), 0.5, 3.2 * strength, 0.82, 0.82, 0.84, 0.32 * strength, 1.6, -0.3);
  }
  dust(p, vx, vz) {
    this.smoke.emit(p.x + (Math.random() - 0.5) * 0.6, p.y + 0.2, p.z + (Math.random() - 0.5) * 0.6, vx * 0.3 + (Math.random() - 0.5) * 2, 0.8 + Math.random() * 1.2, vz * 0.3 + (Math.random() - 0.5) * 2, 1.6 + Math.random() * 0.8, 0.8, 4.5, 0.62, 0.52, 0.38, 0.45, 1.2, 0.2);
  }
  spray(p, vx, vz, wet) {
    this.smoke.emit(p.x + (Math.random() - 0.5) * 0.3, p.y + 0.2, p.z + (Math.random() - 0.5) * 0.3, vx * 0.55 + (Math.random() - 0.5) * 1.5, 0.6 + Math.random() * 1.2, vz * 0.55 + (Math.random() - 0.5) * 1.5, 0.7 + Math.random() * 0.5, 0.35, 2.6, 0.78, 0.8, 0.84, 0.22 * wet, 2.2, 1.5);
  }
  sparks(p, vx, vz) {
    for (let k = 0; k < 3; k++) this.glow.emit(p.x, p.y + 0.03, p.z, vx * 0.8 + (Math.random() - 0.5) * 4, 0.6 + Math.random() * 2.2, vz * 0.8 + (Math.random() - 0.5) * 4, 0.25 + Math.random() * 0.25, 0.09, 0.03, 3.2, 1.6, 0.5, 1, 0.8, 9.8);
  }
  flame(p, vx, vz) {
    for (let k = 0; k < 4; k++) this.glow.emit(p.x, p.y, p.z, vx * 0.9 + (Math.random() - 0.5) * 0.6, 0.2 + Math.random() * 0.3, vz * 0.9 + (Math.random() - 0.5) * 0.6, 0.08 + Math.random() * 0.07, 0.22, 0.06, k < 2 ? 3.5 : 1.0, k < 2 ? 1.3 : 1.2, k < 2 ? 0.3 : 3.0, 0.9, 3, 0);
  }
  burst(p, color = [0.6, 0.5, 0.4], count = 20) { for (let k = 0; k < count * this.rate; k++) this.smoke.emit(p.x, p.y + 0.3, p.z, (Math.random() - 0.5) * 6, Math.random() * 3, (Math.random() - 0.5) * 6, 1.5 + Math.random(), 1, 5, color[0], color[1], color[2], 0.5, 1.5, 0.5); }
  update(dt, scale) { this.smoke.update(dt, scale); this.glow.update(dt, scale); }
  dispose() { this.smoke.dispose(); this.glow.dispose(); }
}

// Confetti for the podium (normal blending, coloured flakes with flutter).
export class Confetti {
  constructor(scene, count = 900) {
    this.pts = new Particles(count); scene.add(this.pts.points); this.t = 0;
    this.cols = [[1, 0.1, 0.1], [1, 0.85, 0.1], [1, 1, 1], [0.1, 0.5, 1], [0.1, 0.9, 0.4], [1, 0.4, 0.8]];
  }
  update(dt, scale, origin) {
    this.t += dt;
    const n = this.t < 4 ? 120 : 30;
    for (let k = 0; k < n * dt * 4; k++) {
      const c = this.cols[(Math.random() * this.cols.length) | 0];
      this.pts.emit(origin.x + (Math.random() - 0.5) * 8, origin.y + 6 + Math.random() * 2, origin.z + (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 2, -0.5 - Math.random(), (Math.random() - 0.5) * 2, 3 + Math.random() * 2, 0.07, 0.07, c[0], c[1], c[2], 1, 0.6, 0.6);
    }
    this.pts.update(dt, scale);
  }
  dispose() { this.pts.dispose(); }
}
