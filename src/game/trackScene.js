import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry } from './trackgeom.js';
import { THEMES } from './themes.js';

// Track environment v2: theme-driven terrain & vegetation, PBR asphalt (noise normal/roughness), bevelled kerbs,
// gravel, instanced crowd with shader animation, marshal posts, brake boards, emissive gantry, optional ocean.
// Built as a generator so the loading screen can show progress between stages.

const TEX = new Map(); // per-session texture cache (cheap re-use between races)
function cached(key, make) { let t = TEX.get(key); if (!t) { t = make(); t.userData.cached = true; TEX.set(key, t); } return t; }
function canvasTex(w, h, draw, repeat = true, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 8;
  return t;
}
export const SPONSORS = ['NOVARA ENERGY', 'TIDECORE OIL', 'BLUEPEAK', 'ARROWLINE', 'GRANITBRAU', 'LIMEFROST', 'SIAM VELOCITY', 'APEX TELECOM', 'HORIZON AIR', 'TITAN TOOLS', 'VORTEX TYRES', 'KITE WATCHES', 'MERIDIAN BANK', 'COBALT MOBILE'];

// tileable value noise field (0..1)
function noiseField(n, seed, octaves = [[8, 0.5], [32, 0.3], [128, 0.2]]) {
  const r = mulberry(seed), out = new Float32Array(n * n);
  for (const [f, amp] of octaves) {
    const g = new Float32Array(f * f); for (let i = 0; i < g.length; i++) g[i] = r();
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const fx = x / n * f, fy = y / n * f, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const a = g[(y0 % f) * f + x0 % f], b = g[(y0 % f) * f + (x0 + 1) % f], c = g[((y0 + 1) % f) * f + x0 % f], d = g[((y0 + 1) % f) * f + (x0 + 1) % f];
      out[y * n + x] += amp * ((a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy);
    }
  }
  return out;
}
function normalFromHeight(h, n, strength) {
  const c = document.createElement('canvas'); c.width = c.height = n; const x = c.getContext('2d');
  const img = x.createImageData(n, n), d = img.data;
  for (let y = 0; y < n; y++) for (let i = 0; i < n; i++) {
    const l = h[y * n + (i - 1 + n) % n], rr = h[y * n + (i + 1) % n], u = h[((y - 1 + n) % n) * n + i], dn = h[((y + 1) % n) * n + i];
    let nx = (l - rr) * strength, ny = (u - dn) * strength, nz = 1; const len = Math.hypot(nx, ny, nz); nx /= len; ny /= len; nz /= len;
    const k = (y * n + i) * 4; d[k] = (nx * 0.5 + 0.5) * 255; d[k + 1] = (ny * 0.5 + 0.5) * 255; d[k + 2] = (nz * 0.5 + 0.5) * 255; d[k + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
}

export function asphaltTexture(wet) {
  return cached('asphalt' + (wet ? 'W' : 'D'), () => canvasTex(512, 512, (x, w, h) => {
    const nf = noiseField(128, 21, [[4, 0.5], [16, 0.5]]);
    x.fillStyle = wet ? '#2b2d31' : '#45474b'; x.fillRect(0, 0, w, h);
    // large-scale patching / repairs
    for (let j = 0; j < 128; j++) for (let i = 0; i < 128; i++) { const v = nf[j * 128 + i]; x.fillStyle = `rgba(${v > 0.5 ? 0 : 255},${v > 0.5 ? 0 : 255},${v > 0.5 ? 0 : 255},${Math.abs(v - 0.5) * 0.12})`; x.fillRect(i * 4, j * 4, 4, 4); }
    const r = mulberry(7);
    for (let i = 0; i < 26000; i++) { const g = 30 + r() * 80 | 0; x.fillStyle = `rgba(${g},${g},${g + 3},${0.25 + r() * 0.35})`; x.fillRect(r() * w, r() * h, 1 + r() * 1.5, 1 + r() * 1.5); }
    // rubbered line (centre-ish band) and tyre marks
    const grd = x.createLinearGradient(0, 0, w, 0);
    grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(0.35, 'rgba(0,0,0,0.10)'); grd.addColorStop(0.5, 'rgba(0,0,0,0.16)'); grd.addColorStop(0.65, 'rgba(0,0,0,0.10)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = grd; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 14; i++) { x.strokeStyle = `rgba(10,10,10,${0.05 + r() * 0.08})`; x.lineWidth = 2 + r() * 3; x.beginPath(); const x0 = w * (0.3 + r() * 0.4); x.moveTo(x0, 0); x.bezierCurveTo(x0 + (r() - 0.5) * 60, h * 0.3, x0 + (r() - 0.5) * 60, h * 0.7, x0, h); x.stroke(); }
    // painted white edge lines (slightly worn)
    x.fillStyle = '#ecebe6'; x.fillRect(6, 0, 11, h); x.fillRect(w - 17, 0, 11, h);
    for (let i = 0; i < 1400; i++) { x.fillStyle = 'rgba(60,60,60,0.35)'; const yy = r() * h; x.fillRect(6 + r() * 11, yy, 1.5, 1.5); x.fillRect(w - 17 + r() * 11, r() * h, 1.5, 1.5); }
  }));
}
function asphaltMaps() {
  return cached('asphaltN', () => {
    const n = 256, h = noiseField(n, 33, [[16, 0.35], [64, 0.35], [256, 0.3]]);
    const t = normalFromHeight(h, n, 2.2);
    // roughness (green channel) packed into a second canvas
    const c = document.createElement('canvas'); c.width = c.height = n; const x = c.getContext('2d'); const img = x.createImageData(n, n);
    const big = noiseField(n, 44, [[4, 0.6], [8, 0.4]]);
    for (let i = 0; i < n * n; i++) { const v = 150 + big[i] * 90 + h[i] * 20; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = Math.min(255, v); img.data[i * 4 + 3] = 255; }
    x.putImageData(img, 0, 0);
    const rt = new THREE.CanvasTexture(c); rt.wrapS = rt.wrapT = THREE.RepeatWrapping;
    t.userData.rough = rt; rt.userData.cached = true;
    return t;
  });
}
function kerbTexture() {
  return cached('kerb', () => canvasTex(64, 256, (x, w, h) => {
    for (let k = 0; k < 2; k++) { x.fillStyle = '#d61f1f'; x.fillRect(0, k * h / 2, w, h / 4); x.fillStyle = '#f4f4f2'; x.fillRect(0, k * h / 2 + h / 4, w, h / 4); }
    const r = mulberry(9); for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(0,0,0,${r() * 0.12})`; x.fillRect(r() * w, r() * h, 2, 2); }
    x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(0, 0, 4, h);
  }));
}
function gravelTexture(color) {
  return cached('gravel' + color, () => canvasTex(256, 256, (x, w, h) => {
    x.fillStyle = color; x.fillRect(0, 0, w, h);
    const r = mulberry(5), c = new THREE.Color(color);
    for (let i = 0; i < 9000; i++) { const k = 0.6 + r() * 0.7; x.fillStyle = `rgb(${c.r * 255 * k | 0},${c.g * 255 * k | 0},${c.b * 255 * k | 0})`; const s = 1 + r() * 2.5; x.beginPath(); x.ellipse(r() * w, r() * h, s, s * 0.7, r() * 3, 0, 6.3); x.fill(); }
  }));
}
function runoffTexture() { // green painted run-off asphalt
  return cached('runoff', () => canvasTex(128, 128, (x, w, h) => {
    x.fillStyle = '#2f7d4c'; x.fillRect(0, 0, w, h); const r = mulberry(4);
    for (let i = 0; i < 3000; i++) { x.fillStyle = `rgba(0,0,0,${r() * 0.18})`; x.fillRect(r() * w, r() * h, 1.5, 1.5); }
    x.fillStyle = '#eeeeea'; x.fillRect(0, 0, 3, h);
  }));
}
function boardTexture() {
  return cached('boards', () => canvasTex(2048, 64, (x, w, h) => {
    const cols = ['#c8102e', '#1546c7', '#111', '#ff7f11', '#14a6b8', '#6a1fb5', '#0e7a3c', '#d4af37'];
    const seg = w / 8;
    for (let i = 0; i < 8; i++) {
      const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, cols[i]); g.addColorStop(1, '#000'); x.fillStyle = cols[i]; x.fillRect(i * seg, 0, seg, h);
      x.fillStyle = 'rgba(255,255,255,0.12)'; x.fillRect(i * seg, 0, seg, h * 0.3);
      x.fillStyle = '#fff'; x.font = 'italic 900 34px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(SPONSORS[i % SPONSORS.length], i * seg + seg / 2, h / 2 + 2);
    }
  }));
}
function grassTexture(theme) {
  return cached('grass' + theme.grass.join(), () => canvasTex(256, 256, (x, w, h) => {
    const a = new THREE.Color(theme.grass[0]), b = new THREE.Color(theme.grass[1]);
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h);
    const r = mulberry(3);
    for (let i = 0; i < 9000; i++) { const k = 0.75 + r() * 0.35; x.fillStyle = `rgba(${210 * k | 0},${230 * k | 0},${200 * k | 0},0.55)`; x.fillRect(r() * w, r() * h, 1.5, 2.5); }
    if (!theme.sand) { x.fillStyle = 'rgba(255,255,255,0.08)'; x.fillRect(0, 0, w / 2, h); } // mowing stripes
    void a; void b;
  }));
}
function crowdTexture() {
  return cached('crowd', () => canvasTex(256, 128, (x, w, h) => {
    x.fillStyle = '#2a2d33'; x.fillRect(0, 0, w, h);
    const r = mulberry(11);
    const cols = ['#e33', '#ff0', '#fff', '#36f', '#f80', '#0c6', '#d4af37', '#c0c', '#111'];
    for (let i = 0; i < 2200; i++) { x.fillStyle = cols[r() * cols.length | 0]; x.fillRect(r() * w, r() * h, 2.5, 3); }
    for (let row = 0; row < 8; row++) { x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(0, row * 16 + 13, w, 3); }
  }));
}
function brakeBoardTexture() {
  return cached('brakeb', () => canvasTex(128, 384, (x, w, h) => {
    ['300', '200', '100'].forEach((t, k) => { x.fillStyle = '#f2f2f2'; x.fillRect(0, k * 128, w, 128); x.fillStyle = '#1546c7'; x.fillRect(6, k * 128 + 6, w - 12, 116); x.fillStyle = '#fff'; x.font = '900 64px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(t, w / 2, k * 128 + 66); });
  }, false));
}

function ribbon(geo, d0f, d1f, yOff, sFrom, sTo, step, vScale, colorFn) {
  const pos = [], uv = [], col = [], idx = [];
  const N = geo.N; let k = 0;
  for (let ii = sFrom; ii <= sTo; ii += step) {
    const i = ((ii % N) + N) % N;
    const d0 = d0f(i), d1 = d1f(i);
    const y = geo.y[i] + yOff;
    pos.push(geo.x[i] + geo.rx[i] * d0, y, geo.z[i] + geo.rz[i] * d0, geo.x[i] + geo.rx[i] * d1, y, geo.z[i] + geo.rz[i] * d1);
    const v = ii * geo.ds / vScale;
    uv.push(0, v, 1, v);
    if (colorFn) { const c = colorFn(i); col.push(c[0], c[1], c[2], c[0], c[1], c[2]); }
    if (k > 0) { const a = (k - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    k++;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  if (colorFn) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// strip with a lateral profile: prof = [[d, y, u], ...] relative offsets (d is multiplied by side)
function profileStrip(geo, side, base, prof, sFrom, sTo, vScale) {
  const pos = [], uv = [], idx = []; const N = geo.N, C = prof.length; let k = 0;
  for (let ii = sFrom; ii <= sTo; ii++) {
    const i = ((ii % N) + N) % N, v = ii * geo.ds / vScale;
    for (const [d, y, u] of prof) { const dd = side * (base + d); pos.push(geo.x[i] + geo.rx[i] * dd, geo.y[i] + y, geo.z[i] + geo.rz[i] * dd); uv.push(u, v); }
    if (k > 0) for (let c = 0; c < C - 1; c++) { const a = (k - 1) * C + c, b = a + C; idx.push(a, a + 1, b, a + 1, b + 1, b); }
    k++;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  return fixWinding(g);
}
function fixWinding(g) { // ensure normals point up
  const n = g.attributes.normal; let sum = 0; for (let i = 0; i < n.count; i++) sum += n.getY(i);
  if (sum < 0) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } g.computeVertexNormals(); }
  return g;
}
function vcol(g, color) { // bake a flat vertex colour (for merged multi-part instanced meshes)
  const c = new THREE.Color(color), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g;
}
function strip(g) { const out = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(out.attributes)) if (!['position', 'normal', 'color'].includes(k)) out.deleteAttribute(k); return out; }
function treeGeometries() {
  const T = '#5a4330';
  const trunk = (r0, r1, h, seg = 5) => { const g = new THREE.CylinderGeometry(r0, r1, h, seg); g.translate(0, h / 2, 0); return vcol(g, T); };
  const jitter = (g, amt, seed) => { const r = mulberry(seed), p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (1 + (r() - 0.5) * amt), p.getY(i) * (1 + (r() - 0.5) * amt), p.getZ(i) * (1 + (r() - 0.5) * amt)); g.computeVertexNormals(); return g; };
  const M = (...gs) => mergeGeometries(gs.map(strip));
  const G = {};
  { // palm: curved trunk + drooping fronds
    const t = new THREE.CylinderGeometry(0.16, 0.28, 8.5, 6, 6); t.translate(0, 4.25, 0);
    const p = t.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i) / 8.5; p.setX(i, p.getX(i) + y * y * 1.3); } t.computeVertexNormals(); vcol(t, '#7a6448');
    const fr = [];
    for (let k = 0; k < 8; k++) { const f = new THREE.ConeGeometry(0.55, 4.2, 4, 1); f.scale(1, 1, 0.12); f.rotateX(Math.PI / 2); f.translate(0, 0, 2.1); f.rotateX(0.35 + (k % 2) * 0.25); f.rotateY(k / 8 * Math.PI * 2); f.translate(1.3, 8.5, 0); fr.push(vcol(f, '#4d7a2c')); }
    G.palm = M(t, ...fr);
  }
  G.pine = M(trunk(0.25, 0.4, 3), vcol(jitter((() => { const g = new THREE.ConeGeometry(3, 6, 8); g.translate(0, 5.5, 0); return g; })(), 0.1, 3), '#2c5326'), vcol((() => { const g = new THREE.ConeGeometry(2.1, 5, 8); g.translate(0, 9, 0); return g; })(), '#2f5a28'));
  G.broadleaf = M(trunk(0.3, 0.45, 3.4), vcol(jitter((() => { const g = new THREE.IcosahedronGeometry(3.4, 1); g.scale(1, 0.85, 1); g.translate(0, 6, 0); return g; })(), 0.22, 5), '#3f6e2c'));
  G.cypress = M(trunk(0.2, 0.3, 1.5), vcol((() => { const g = new THREE.CylinderGeometry(0.15, 1.15, 10, 8, 3); g.translate(0, 6.3, 0); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const y = (p.getY(i) - 1.3) / 10; const bulge = Math.sin(Math.min(1, Math.max(0, y)) * Math.PI) * 0.45; p.setX(i, p.getX(i) * (1 + bulge)); p.setZ(i, p.getZ(i) * (1 + bulge)); } g.computeVertexNormals(); return g; })(), '#26442a'));
  G.olive = M(trunk(0.25, 0.4, 2.2), vcol(jitter((() => { const g = new THREE.IcosahedronGeometry(2.8, 1); g.scale(1.1, 0.6, 1.1); g.translate(0, 3.4, 0); return g; })(), 0.3, 7), '#77825a'));
  G.shrub = vcol(strip(jitter((() => { const g = new THREE.IcosahedronGeometry(1.5, 1); g.scale(1.2, 0.75, 1.2); g.translate(0, 0.8, 0); return g; })(), 0.3, 9)), '#556b34');
  return G;
}

// crowd people: instanced boxes with a shader that makes some of them jump / flash (one draw call per grandstand set)
function crowdMaterial(timeU) {
  const m = new THREE.MeshLambertMaterial({ color: '#ffffff' });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = timeU;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        transformed.y += max(0.0, sin(uTime * (5.0 + ph * 4.0) + ph * 40.0)) * 0.22 * step(0.55, ph);
        transformed.x += sin(uTime * 2.0 + ph * 20.0) * 0.04;`)
      .replace('#include <color_vertex>', `#include <color_vertex>
        vec4 ipos = instanceMatrix[3]; float ph = fract(sin(dot(ipos.xz, vec2(12.9898, 78.233))) * 43758.5453);
        #ifdef USE_INSTANCING_COLOR
        float fl = step(0.985, fract(sin(ph * 91.7 + floor(uTime * 7.0)) * 437.5));
        vColor.xyz = mix(vColor.xyz, vec3(3.0), fl);
        #endif`);
  };
  return m;
}

export function buildTrackScene(geo, opts) { const it = trackSceneStages(geo, opts); let r = it.next(); while (!r.done) r = it.next(); return r.value; }

export function* trackSceneStages(geo, opts) {
  const { quality, weather, night } = opts;
  const theme = opts.theme || THEMES.EUROPEAN;
  const q = quality;
  const group = new THREE.Group();
  const hw = geo.halfW, N = geo.N;
  const wet = weather === 'LIGHT_RAIN' || weather === 'HEAVY_RAIN';
  const KERB = 1.3, RUNOFF = 16, WALL = hw + 21, PAVED = 5;
  const PBR = q >= 1;
  const timeU = { value: 0 };

  const absK = new Float32Array(N);
  for (let i = 0; i < N; i++) { let m = 0; for (let k = -12; k <= 12; k++) m = Math.max(m, Math.abs(geo.kappa[(i + k + N) % N])); absK[i] = m; }
  const isCorner = (i) => absK[i] > 1 / 260;
  yield { p: 0.1, label: 'Paving the asphalt' };

  // ---------------- road ----------------
  let roadMat;
  if (PBR) {
    const nmap = asphaltMaps();
    roadMat = new THREE.MeshStandardMaterial({ map: asphaltTexture(wet), normalMap: nmap, roughnessMap: nmap.userData.rough, roughness: wet ? 0.32 : 1.0, metalness: 0, normalScale: new THREE.Vector2(0.6, 0.6) });
    if (wet) { roadMat.color.setRGB(0.62, 0.64, 0.68); roadMat.envMapIntensity = 1.6; }
  } else {
    roadMat = new THREE.MeshLambertMaterial({ map: asphaltTexture(wet) });
    if (wet) roadMat.color.setRGB(0.7, 0.73, 0.8);
  }
  const roadGeo = fixWinding(ribbon(geo, () => -hw, () => hw, 0.02, 0, N, 1, hw * 2));
  const road = new THREE.Mesh(roadGeo, roadMat);
  road.receiveShadow = true; group.add(road);
  if (wet && !PBR) { const sheen = new THREE.Mesh(road.geometry, new THREE.MeshBasicMaterial({ color: '#8899aa', transparent: true, opacity: 0.12, depthWrite: false })); sheen.position.y = 0.005; group.add(sheen); }

  // kerbs with a bevelled cross-section (rise, flat crest, drop)
  const kerbMat = PBR ? new THREE.MeshStandardMaterial({ map: kerbTexture(), roughness: wet ? 0.25 : 0.55, metalness: 0 }) : new THREE.MeshLambertMaterial({ map: kerbTexture() });
  const KP = [[-0.05, 0.02, 0], [0.2, 0.065, 0.15], [KERB - 0.25, 0.085, 0.8], [KERB, 0.03, 1]];
  const kerbGeos = [];
  let start = -1;
  for (let i = 0; i <= N; i++) {
    const c = i < N && isCorner(i);
    if (c && start < 0) start = i;
    if (!c && start >= 0) { for (const side of [1, -1]) kerbGeos.push(profileStrip(geo, side, hw, KP, start, i, 2.4)); start = -1; }
  }
  if (kerbGeos.length) { const m = new THREE.Mesh(mergeGeometries(kerbGeos), kerbMat); m.receiveShadow = true; group.add(m); kerbGeos.forEach(g => g.dispose()); }

  // run-off: green painted band + gravel traps on the outside of corners
  const runMat = PBR ? new THREE.MeshStandardMaterial({ map: runoffTexture(), roughness: wet ? 0.35 : 0.9 }) : new THREE.MeshLambertMaterial({ map: runoffTexture() });
  const gravMat = PBR ? new THREE.MeshStandardMaterial({ map: gravelTexture(theme.gravel), roughness: 1 }) : new THREE.MeshLambertMaterial({ map: gravelTexture(theme.gravel) });
  const runGeos = [], gravGeos = [];
  for (const side of [1, -1]) {
    runGeos.push(fixWinding(ribbon(geo, (i) => side * (hw + (isCorner(i) ? KERB : 0.0)), (i) => side * (hw + PAVED), 0.012, 0, N, 2, 8)));
    const gravelAt = (i) => Math.sign(geo.kappa[i]) === -side && absK[i] > 1 / 200;
    let st = -1;
    for (let i = 0; i <= N; i += 2) {
      const gz = i < N && gravelAt(i);
      if (gz && st < 0) st = i;
      if (!gz && st >= 0) { gravGeos.push(fixWinding(ribbon(geo, () => side * (hw + PAVED), () => side * (hw + RUNOFF), 0.008, st, i, 2, 10))); st = -1; }
    }
  }
  // the ribbon uv.x spans 0..1 across the strip; rescale so textures are not stretched
  for (const g of gravGeos) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * (RUNOFF - PAVED) / 10); }
  { const m = new THREE.Mesh(mergeGeometries(runGeos), runMat); m.receiveShadow = true; group.add(m); }
  if (gravGeos.length) { const m = new THREE.Mesh(mergeGeometries(gravGeos), gravMat); m.receiveShadow = q >= 2; group.add(m); }

  // barriers: sponsor boards + top rail
  const boardMat = new THREE.MeshLambertMaterial({ map: boardTexture(), side: THREE.DoubleSide });
  const boardGeos = [];
  for (const side of [1, -1]) {
    const pos = [], uv = [], idx = []; let k = 0;
    for (let ii = 0; ii <= N; ii += 3) {
      const i = ii % N, d = side * WALL, y = geo.y[i];
      const px = geo.x[i] + geo.rx[i] * d, pz = geo.z[i] + geo.rz[i] * d;
      pos.push(px, y - 0.3, pz, px, y + 1.1, pz);
      const v = ii * geo.ds / 60; uv.push(v, 0, v, 1);
      if (k > 0) { const a = (k - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      k++;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    boardGeos.push(g);
  }
  group.add(new THREE.Mesh(mergeGeometries(boardGeos), boardMat));
  // start/finish line & grid slots
  const lineMat = new THREE.MeshLambertMaterial({ map: cached('sfline', () => canvasTex(128, 16, (x) => { for (let i = 0; i < 16; i++) for (let j = 0; j < 2; j++) { x.fillStyle = (i + j) % 2 ? '#111' : '#fff'; x.fillRect(i * 8, j * 8, 8, 8); } }, false)) });
  const sfl = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, 1.6), lineMat);
  sfl.rotation.x = -Math.PI / 2; sfl.rotation.z = -Math.atan2(geo.tz[0], geo.tx[0]) + Math.PI / 2;
  sfl.position.set(geo.x[0], geo.y[0] + 0.035, geo.z[0]); group.add(sfl);
  const slots = gridSlots(geo, 24);
  {
    const sg = [];
    for (const sl of slots) {
      const i = ((Math.round(sl.s / geo.ds) % N) + N) % N;
      const o = new THREE.Object3D(); o.rotation.x = -Math.PI / 2; o.rotation.z = -geo.heading[i] + Math.PI / 2;
      o.position.set(geo.x[i] + geo.rx[i] * sl.d, geo.y[i] + 0.04, geo.z[i] + geo.rz[i] * sl.d); o.translateY(-1.1); o.updateMatrix();
      sg.push(new THREE.PlaneGeometry(1.4, 0.18).applyMatrix4(o.matrix));
    }
    group.add(new THREE.Mesh(mergeGeometries(sg), new THREE.MeshBasicMaterial({ color: '#d8d8d8' })));
  }

  // start gantry with emissive (HDR -> bloom) lights
  const gantry = new THREE.Group();
  const gm = new THREE.MeshStandardMaterial({ color: '#1c1e22', roughness: 0.6, metalness: 0.5 });
  for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.5, 8, 0.5), gm); p.position.set(s * (hw + 1.5), 4, 0); gantry.add(p); }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 3.5, 1.4, 0.7), gm); beam.position.y = 7.6; gantry.add(beam);
  const brand = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, 0.9), new THREE.MeshBasicMaterial({ map: cached('gantryb', () => canvasTex(512, 48, (x, w, h) => { x.fillStyle = '#0b0d12'; x.fillRect(0, 0, w, h); x.fillStyle = '#ffd400'; x.font = 'italic 900 30px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('GP RACING LEGENDS · NOVARA ENERGY', w / 2, h / 2 + 1); }, false)) }));
  brand.position.set(0, 8.75, 0.36); gantry.add(brand);
  const lights = [];
  for (let i = 0; i < 5; i++) {
    const lm = new THREE.MeshBasicMaterial({ color: '#2a0000' });
    for (const zz of [-0.37, 0.37]) {
      const l = new THREE.Mesh(new THREE.CircleGeometry(0.32, 16), lm);
      l.position.set((i - 2) * 1.6, 7.6, zz); l.rotation.y = zz > 0 ? 0 : Math.PI; gantry.add(l);
    }
    lights.push(lm);
  }
  gantry.position.set(geo.x[0], geo.y[0], geo.z[0]);
  gantry.rotation.y = Math.atan2(-geo.tx[0], -geo.tz[0]);
  gantry.traverse(o => { if (o.isMesh) o.castShadow = q >= 2; });
  group.add(gantry);
  yield { p: 0.3, label: 'Shaping the landscape' };

  // ---------------- terrain ----------------
  let mnx = 1e9, mxx = -1e9, mnz = 1e9, mxz = -1e9, ysum = 0;
  for (let i = 0; i < N; i++) { mnx = Math.min(mnx, geo.x[i]); mxx = Math.max(mxx, geo.x[i]); mnz = Math.min(mnz, geo.z[i]); mxz = Math.max(mxz, geo.z[i]); ysum += geo.y[i]; }
  const yavg = ysum / N;
  const cx = (mnx + mxx) / 2, cz = (mnz + mxz) / 2;
  const M = 900; mnx -= M; mxx += M; mnz -= M; mxz += M;
  const cell = q >= 2 ? 12 : q === 1 ? 16 : 20;
  const nx = Math.ceil((mxx - mnx) / cell) + 1, nz = Math.ceil((mxz - mnz) / cell) + 1;
  const H = 60, hash = new Map();
  for (let i = 0; i < N; i += 2) { const key = Math.floor(geo.x[i] / H) + ',' + Math.floor(geo.z[i] / H); if (!hash.has(key)) hash.set(key, []); hash.get(key).push(i); }
  const nearest = (x, z, rad = 2) => {
    const gx = Math.floor(x / H), gz = Math.floor(z / H); let bd = 1e18, bi = -1;
    for (let a = -rad; a <= rad; a++) for (let b = -rad; b <= rad; b++) { const l = hash.get((gx + a) + ',' + (gz + b)); if (!l) continue; for (const i of l) { const dd = (geo.x[i] - x) ** 2 + (geo.z[i] - z) ** 2; if (dd < bd) { bd = dd; bi = i; } } }
    return [bi, Math.sqrt(bd)];
  };
  const rnd = mulberry(geo.N * 7 + 13);
  const ph = [rnd() * 6, rnd() * 6, rnd() * 6];
  const amp = theme.hills;
  const hills = (x, z) => (Math.sin(x * 0.004 + ph[0]) * Math.cos(z * 0.0035 + ph[1]) * 0.6 + Math.sin(x * 0.011 + z * 0.009 + ph[2]) * 0.25);
  // coastal: the sea lies beyond the circuit in one direction
  const oceanA = rnd() * Math.PI * 2, odx = Math.cos(oceanA), odz = Math.sin(oceanA);
  let reach = 0; for (let i = 0; i < N; i += 4) reach = Math.max(reach, (geo.x[i] - cx) * odx + (geo.z[i] - cz) * odz);
  const seaY = yavg - 4, shore = reach + 160;
  const gA = new THREE.Color(theme.grass[0]), gB = new THREE.Color(theme.grass[1]), farC = new THREE.Color(theme.far), sandC = new THREE.Color(theme.gravel), tmpC = new THREE.Color();
  const tPos = new Float32Array(nx * nz * 3), tCol = new Float32Array(nx * nz * 3), distArr = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = mnx + i * cell, z = mnz + j * cell; const id = j * nx + i;
    const [bi, dist] = nearest(x, z);
    const near = bi >= 0 ? geo.y[bi] : yavg;
    const dd = bi >= 0 ? dist : 999;
    distArr[id] = dd;
    const far = Math.max(0, Math.min(1, (dd - 60) / 400));
    let h = near * (1 - far) + yavg * far + hills(x, z) * (12 + far * 60) * far * amp;
    let beach = 0;
    if (theme.ocean) {
      const pr = (x - cx) * odx + (z - cz) * odz;
      const t = Math.max(0, Math.min(1, (pr - shore) / 260));
      h = h * (1 - t) + (seaY - 18) * t; beach = Math.max(0, 1 - Math.abs(pr - shore - 120) / 90);
    }
    if (dd < hw + RUNOFF + 10) h = near - 0.25;
    else if (dd < hw + 60) h = Math.min(h, near - 0.25 + (dd - hw - RUNOFF - 10) * 0.05);
    tPos[id * 3] = x; tPos[id * 3 + 1] = h; tPos[id * 3 + 2] = z;
    const v = hills(x * 3.1, z * 2.7) * 0.5 + 0.5;
    tmpC.copy(gA).lerp(gB, v).lerp(farC, far * 0.7);
    if (beach > 0) tmpC.lerp(sandC, beach);
    if (dd < hw + 30 && !theme.sand) tmpC.lerp(gB, 0.25); // freshly mown verge
    tCol[id * 3] = tmpC.r; tCol[id * 3 + 1] = tmpC.g; tCol[id * 3 + 2] = tmpC.b;
  }
  const tIdx = [];
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) { const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1; tIdx.push(a, c, b, b, c, d); }
  const tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.BufferAttribute(tPos, 3)); tg.setAttribute('color', new THREE.BufferAttribute(tCol, 3));
  const tuv = new Float32Array(nx * nz * 2); for (let k = 0; k < nx * nz; k++) { tuv[k * 2] = tPos[k * 3] / 24; tuv[k * 2 + 1] = tPos[k * 3 + 2] / 24; }
  tg.setAttribute('uv', new THREE.BufferAttribute(tuv, 2));
  tg.setIndex(tIdx); tg.computeVertexNormals();
  const terrainMat = new THREE.MeshLambertMaterial({ map: grassTexture(theme), vertexColors: true });
  const terrain = new THREE.Mesh(tg, terrainMat);
  terrain.receiveShadow = q >= 2; group.add(terrain);
  // far ground disc so the horizon never shows a void beyond the terrain patch
  { const fg = new THREE.Mesh(new THREE.CircleGeometry(9000, 32), new THREE.MeshBasicMaterial({ color: farC.clone().multiplyScalar(wet ? 0.6 : 0.85) })); fg.rotation.x = -Math.PI / 2; fg.position.set(cx, yavg - 30, cz); group.add(fg); }
  let ocean = null;
  if (theme.ocean) {
    const om = PBR ? new THREE.MeshStandardMaterial({ color: '#1f5a78', roughness: 0.12, metalness: 0.1, normalMap: asphaltMaps(), normalScale: new THREE.Vector2(0.25, 0.25) }) : new THREE.MeshLambertMaterial({ color: '#2a6688' });
    if (PBR) { om.normalMap = om.normalMap.clone(); om.normalMap.repeat.set(300, 300); om.normalMap.needsUpdate = true; }
    ocean = new THREE.Mesh(new THREE.PlaneGeometry(24000, 24000), om); ocean.rotation.x = -Math.PI / 2;
    ocean.position.set(cx + odx * (shore + 12100), seaY, cz + odz * (shore + 12100)); group.add(ocean);
  }
  const terrainH = (x, z) => { const i = Math.round((x - mnx) / cell), j = Math.round((z - mnz) / cell); if (i < 0 || j < 0 || i >= nx || j >= nz) return yavg; return tPos[(j * nx + i) * 3 + 1]; };
  const terrainD = (x, z) => { const i = Math.round((x - mnx) / cell), j = Math.round((z - mnz) / cell); if (i < 0 || j < 0 || i >= nx || j >= nz) return 999; return distArr[j * nx + i]; };
  yield { p: 0.5, label: 'Planting trees' };

  // ---------------- trees (instanced per species) ----------------
  const TG = treeGeometries();
  const kinds = Object.entries(theme.trees);
  const wsum = kinds.reduce((a, [, w]) => a + w, 0);
  const treeTotal = Math.round([260, 750, 1500, 2600][q] * theme.density);
  const treeMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const dummy = new THREE.Object3D(); const tc = new THREE.Color();
  for (const [kind, w] of kinds) {
    const count = Math.round(treeTotal * w / wsum); if (!count || !TG[kind]) continue;
    const im = new THREE.InstancedMesh(TG[kind], treeMat, count);
    let placed = 0, tries = 0;
    while (placed < count && tries < count * 20) {
      tries++;
      const si = (rnd() * N) | 0; const side = rnd() < 0.5 ? -1 : 1; const dist = WALL + 10 + Math.pow(rnd(), 1.7) * 480;
      const x = geo.x[si] + geo.rx[si] * dist * side + (rnd() - 0.5) * 40, z = geo.z[si] + geo.rz[si] * dist * side + (rnd() - 0.5) * 40;
      if (terrainD(x, z) < WALL + 8) continue;
      const y = terrainH(x, z); if (theme.ocean && y < seaY + 1) continue;
      const s = kind === 'shrub' ? 0.6 + rnd() * 0.9 : 0.75 + rnd() * 0.6;
      dummy.position.set(x, y - 0.2, z); dummy.scale.set(s, s * (0.85 + rnd() * 0.35), s); dummy.rotation.set(0, rnd() * 6.28, 0); dummy.updateMatrix();
      im.setMatrixAt(placed, dummy.matrix);
      tc.setHSL(0.0, 0, 0.8 + rnd() * 0.4); tc.r *= 0.92 + rnd() * 0.16; im.setColorAt(placed, tc);
      placed++;
    }
    im.count = placed; im.computeBoundingSphere(); group.add(im);
  }
  yield { p: 0.7, label: 'Filling the grandstands' };

  // ---------------- grandstands with crowd, pit building, marshal posts ----------------
  let ksum = 0; for (let i = 0; i < N; i++) ksum += geo.kappa[i];
  const infield = ksum > 0 ? 1 : -1;
  const standTexMat = new THREE.MeshLambertMaterial({ map: crowdTexture() });
  const seatMat = new THREE.MeshLambertMaterial({ color: '#3a3f4a' });
  const roofMat = new THREE.MeshStandardMaterial({ color: '#dfe2e6', roughness: 0.5, metalness: 0.6 });
  const concrete = new THREE.MeshLambertMaterial({ color: '#8a8d93' });
  const people = q >= 2;
  const crowdMats = []; const stands = [];
  const PEOPLE_MAX = q >= 3 ? 9000 : 5200;
  const pgeo = new THREE.BoxGeometry(0.42, 0.85, 0.32); pgeo.translate(0, 0.42, 0);
  const crowd = people ? new THREE.InstancedMesh(pgeo, crowdMaterial(timeU), PEOPLE_MAX) : null;
  let pc = 0; const pcols = ['#e53935', '#fdd835', '#fafafa', '#1e88e5', '#fb8c00', '#43a047', '#d4af37', '#8e24aa', '#222', '#00acc1', '#f06292'];
  const addStand = (si, side, len, tiers = 6) => {
    const i = ((si % N) + N) % N;
    const st = new THREE.Group();
    const parts = [];
    for (let t = 0; t < tiers; t++) { const b = new THREE.BoxGeometry(len, 1.6, 2.2); b.translate(0, 0.8 + t * 1.6, t * 2.2); parts.push(b); }
    st.add(new THREE.Mesh(mergeGeometries(parts), people ? seatMat : standTexMat));
    const back = new THREE.Mesh(new THREE.BoxGeometry(len, tiers * 1.6 + 4, 1), concrete); back.position.set(0, (tiers * 1.6 + 4) / 2, tiers * 2.2 + 0.5); st.add(back);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(len + 2, 0.4, tiers * 2.2 + 4), roofMat); roof.position.set(0, tiers * 1.6 + 4, tiers * 1.1); st.add(roof);
    const d = side * (WALL + 3);
    st.position.set(geo.x[i] + geo.rx[i] * d, geo.y[i] - 0.3, geo.z[i] + geo.rz[i] * d);
    st.rotation.y = Math.atan2(geo.rx[i] * side, geo.rz[i] * side);
    group.add(st); st.updateMatrixWorld(true);
    stands.push({ s: i * geo.ds, x: st.position.x, z: st.position.z });
    if (crowd) {
      const r = mulberry(i * 3 + 1);
      for (let t = 0; t < tiers; t++) for (let px = -len / 2 + 0.4; px < len / 2 - 0.3; px += 0.55) {
        if (pc >= PEOPLE_MAX || r() < 0.12) continue;
        dummy.position.set(px + (r() - 0.5) * 0.15, 1.6 + t * 1.6, t * 2.2 + 0.2); dummy.rotation.set(0, Math.PI + (r() - 0.5) * 0.5, 0); dummy.scale.set(1, 0.9 + r() * 0.25, 1); dummy.updateMatrix();
        dummy.matrix.premultiply(st.matrixWorld); crowd.setMatrixAt(pc, dummy.matrix);
        tc.set(pcols[(r() * pcols.length) | 0]); crowd.setColorAt(pc, tc); pc++;
      }
    }
  };
  const standCount = [3, 6, 10, 14][q];
  for (let k = 0; k < 3; k++) addStand(-60 - k * 45, -infield, 42);
  const zones = [];
  for (let i = 0; i < N; i += 5) { if (absK[i] > 1 / 60) zones.push(i); }
  for (let k = 0; k < standCount - 3 && zones.length; k++) { const i = zones[Math.floor((k + 0.5) / (standCount - 3) * zones.length)]; addStand(i - 25, Math.sign(geo.kappa[i]) > 0 ? -1 : 1, 50, 5); }
  if (crowd) { crowd.count = pc; crowd.computeBoundingSphere(); group.add(crowd); crowdMats.push(crowd.material); }
  // pit building on infield side of main straight
  {
    const pitLen = 260, i0 = ((Math.round(-140 / geo.ds) % N) + N) % N;
    const pb = new THREE.Mesh(new THREE.BoxGeometry(pitLen, 9, 14), new THREE.MeshLambertMaterial({ map: cached('pitb', () => canvasTex(1024, 64, (x, w, h) => { x.fillStyle = '#e9ebee'; x.fillRect(0, 0, w, h); for (let i = 0; i < 24; i++) { x.fillStyle = '#26303a'; x.fillRect(i * 42 + 6, 18, 32, 40); x.fillStyle = ['#c8102e', '#1546c7', '#0e7a3c', '#ff7f11'][i % 4]; x.fillRect(i * 42 + 6, 14, 32, 4); } x.fillStyle = '#c8102e'; x.fillRect(0, 0, w, 8); }, false)) }));
    const d = infield * (WALL + 14);
    pb.position.set(geo.x[i0] + geo.rx[i0] * d, geo.y[i0] + 4.2, geo.z[i0] + geo.rz[i0] * d);
    pb.rotation.y = Math.atan2(-geo.tx[i0], -geo.tz[i0]) + Math.PI / 2;
    group.add(pb);
  }
  // marshal posts (instanced hut + flag) every ~300 m, alternating sides
  {
    const hut = mergeGeometries([vcol(strip((() => { const g = new THREE.BoxGeometry(1.6, 2.1, 1.6); g.translate(0, 1.05, 0); return g; })()), '#f07f1a'), vcol(strip((() => { const g = new THREE.BoxGeometry(2.0, 0.18, 2.0); g.translate(0, 2.2, 0); return g; })()), '#f4f4f4'), vcol(strip((() => { const g = new THREE.CylinderGeometry(0.03, 0.03, 2.6, 4); g.translate(0.9, 1.3, 0.9); return g; })()), '#bbbbbb'), vcol(strip((() => { const g = new THREE.BoxGeometry(0.6, 0.4, 0.02); g.translate(1.2, 2.4, 0.9); return g; })()), '#ffd400')]);
    const step = Math.max(40, Math.round(300 / geo.ds)), cnt = Math.floor(N / step);
    const posts = new THREE.InstancedMesh(hut, new THREE.MeshLambertMaterial({ vertexColors: true }), cnt);
    for (let k = 0; k < cnt; k++) { const i = (k * step + 17) % N, side = k % 2 ? 1 : -1, d = side * (WALL + 2.2); dummy.position.set(geo.x[i] + geo.rx[i] * d, geo.y[i] - 0.2, geo.z[i] + geo.rz[i] * d); dummy.scale.set(1, 1, 1); dummy.rotation.set(0, geo.heading[i], 0); dummy.updateMatrix(); posts.setMatrixAt(k, dummy.matrix); }
    posts.computeBoundingSphere(); group.add(posts);
  }
  // brake marker boards (300/200/100) before the heaviest corners, one merged mesh
  {
    const bg = [], tex = brakeBoardTexture();
    let last = -1e9, made = 0;
    for (let i = 0; i < N && made < 10; i++) {
      if (absK[i] > 1 / 70 && absK[(i - 1 + N) % N] <= 1 / 70 && i - last > 400 / geo.ds) {
        last = i; made++;
        const side = Math.sign(geo.kappa[(i + 12) % N]) > 0 ? -1 : 1;
        for (let k = 0; k < 3; k++) {
          const j = ((i - Math.round((100 * (3 - k) - 40) / geo.ds)) % N + N) % N, d = side * (hw + PAVED + 0.8);
          const g = new THREE.PlaneGeometry(0.9, 0.9); const uv = g.attributes.uv; for (let u = 0; u < uv.count; u++) uv.setY(u, (2 - k + uv.getY(u)) / 3);
          const o = new THREE.Object3D(); o.position.set(geo.x[j] + geo.rx[j] * d, geo.y[j] + 0.9, geo.z[j] + geo.rz[j] * d); o.rotation.y = Math.atan2(-geo.tx[j], -geo.tz[j]) + Math.PI; o.updateMatrix();
          g.applyMatrix4(o.matrix); bg.push(g);
          const pole = new THREE.BoxGeometry(0.06, 0.5, 0.06); pole.translate(0, 0.25, 0); pole.applyMatrix4(o.matrix); pole.translate(0, -0.9 + 0.0, 0); bg.push(pole);
        }
      }
    }
    if (bg.length) { const m = new THREE.Mesh(mergeGeometries(bg.map(g => { const gg = g.index ? g.toNonIndexed() : g; for (const a of Object.keys(gg.attributes)) if (!['position', 'normal', 'uv'].includes(a)) gg.deleteAttribute(a); return gg; })), new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide })); group.add(m); }
  }
  // floodlight poles for night races (emissive HDR heads bloom)
  if (night) {
    const poleG = new THREE.CylinderGeometry(0.3, 0.4, 22, 5); poleG.translate(0, 11, 0);
    const headG = new THREE.BoxGeometry(3, 1.4, 1); headG.translate(0, 22, 0);
    const cnt = Math.floor(N / 40);
    const poles = new THREE.InstancedMesh(poleG, new THREE.MeshLambertMaterial({ color: '#444' }), cnt);
    const heads = new THREE.InstancedMesh(headG, new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 4.8, 4.2) }), cnt);
    for (let k = 0; k < cnt; k++) { const i = k * 40, side = k % 2 ? 1 : -1, d = side * (WALL + 2); dummy.position.set(geo.x[i] + geo.rx[i] * d, geo.y[i], geo.z[i] + geo.rz[i] * d); dummy.scale.set(1, 1, 1); dummy.rotation.set(0, geo.heading[i], 0); dummy.updateMatrix(); poles.setMatrixAt(k, dummy.matrix); heads.setMatrixAt(k, dummy.matrix); }
    poles.computeBoundingSphere(); heads.computeBoundingSphere();
    group.add(poles, heads);
  }
  yield { p: 0.85, label: 'Final checks' };
  return {
    group, lights, slots, stands, yBase: yavg, bounds: { mnx, mxx, mnz, mxz }, wall: WALL, kerb: KERB, runoff: RUNOFF, isCorner, absK,
    update(t) { timeU.value = t; if (ocean && ocean.material.normalMap) ocean.material.normalMap.offset.set(t * 0.004, t * 0.002); },
  };
}

// Grid: rows of three, pole position on the inside of turn 1.
export function gridSlots(geo, count) {
  let k1 = 0; for (let i = 0; i < 400 / geo.ds; i++) k1 += geo.kappa[i];
  const inside = k1 >= 0 ? 1 : -1;
  const out = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / 3), col = i % 3;
    const d = inside * geo.halfW * 0.55 * (1 - col);
    out.push({ s: -14 - row * 9 - col * 1.6, d });
  }
  return out;
}

// Racing-line overlay coloured green (throttle) / yellow (lift) / red (brake).
export function buildRacingLine(geo, v, mode) {
  if (mode === 'OFF') return null;
  const N = geo.N; const pos = [], col = [], idx = [];
  const latLim = (i) => v[i];
  let k = 0;
  for (let i = 0; i < N; i += 1) {
    const ahead = v[(i + 6) % N];
    const brake = ahead < v[i] - 0.6;
    const atLimit = !brake && Math.abs(geo.lineK[i]) > 1 / 300 && v[(i + 6) % N] <= v[i] + 0.3;
    let c = [0.1, 0.9, 0.2];
    if (brake) c = [1, 0.12, 0.08]; else if (atLimit) c = [1, 0.82, 0.1];
    const show = mode === 'FULL' || brake || atLimit;
    const x = geo.lineX[i], z = geo.lineZ[i], y = geo.y[i] + 0.05;
    const w = 0.35;
    pos.push(x + geo.rx[i] * -w, y, z + geo.rz[i] * -w, x + geo.rx[i] * w, y, z + geo.rz[i] * w);
    col.push(...c, ...c);
    if (k > 0 && show && (i % 6 < 4)) { const a = (k - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    k++;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide }));
  m.renderOrder = 2;
  return m;
}
