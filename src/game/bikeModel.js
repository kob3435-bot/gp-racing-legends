import * as THREE from 'three';
import { toonify, addOutlines, toonMat } from './toon.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Procedural GP bike + rider (v2). Local frame: forward = -Z, up = +Y, right = +X; ground contact at y = 0.
// Bodywork is lofted from superellipse cross-sections; the rider uses analytic 2-bone IK for arms and legs.
// detail: 0 = LOW (Lambert, coarse), 1 = MEDIUM (PBR), 2 = HIGH/ULTRA (clear-coat paint, finer meshes).

const R = 0.3;            // wheel radius incl. tyre
const FRONT_Z = -0.74, REAR_Z = 0.72;
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _q = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0);

// ---------- textures ----------
const texCache = new Map();
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function toTex(c, srgb = true) { const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }
function carbonTexture() {
  if (texCache.has('carbon')) return texCache.get('carbon');
  const [c, x] = canvas(64, 64);
  for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
    const g = x.createLinearGradient(i * 8, j * 8, i * 8 + 8, j * 8 + 8);
    const a = (i + j) % 2 ? ['#2a2c30', '#141518'] : ['#141518', '#2a2c30'];
    g.addColorStop(0, a[0]); g.addColorStop(1, a[1]); x.fillStyle = g; x.fillRect(i * 8, j * 8, 8, 8);
  }
  const t = toTex(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 6); texCache.set('carbon', t); return t;
}
// Wraps around a loft: u = around (right side at u=.25, top .5, left .75), v = along (canvas top = rear).
function liveryTexture(colors, num, sponsor) {
  const W = 1024, H = 768; const [c, x] = canvas(W, H);
  x.fillStyle = colors[0]; x.fillRect(0, 0, W, H);
  // accent sweep on both sides + top spine
  x.fillStyle = colors[1];
  for (const u of [0.25, 0.75]) { const cx = u * W; x.beginPath(); x.moveTo(cx - 150, H); x.lineTo(cx - 60, H); x.lineTo(cx + 130, 0); x.lineTo(cx + 40, 0); x.fill(); }
  x.fillRect(0.47 * W, 0, 0.06 * W, H);
  x.fillStyle = colors[2] || '#111';
  for (const u of [0.25, 0.75]) { const cx = u * W; x.beginPath(); x.moveTo(cx - 60, H); x.lineTo(cx - 40, H); x.lineTo(cx + 150, 0); x.lineTo(cx + 130, 0); x.fill(); }
  x.fillRect(0, 0, W, 0.06 * H); // tail tip
  x.fillRect(0.0, 0, 0.12 * W, H); x.fillRect(0.88 * W, 0, 0.12 * W, H); // belly
  // pinstripes
  x.strokeStyle = 'rgba(255,255,255,0.55)'; x.lineWidth = 3;
  x.beginPath(); x.moveTo(0.465 * W, 0); x.lineTo(0.465 * W, H); x.moveTo(0.535 * W, 0); x.lineTo(0.535 * W, H); x.stroke();
  // sponsor + number on both sides (rotated so they read correctly from each side)
  const side = (u, rot) => {
    x.save(); x.translate(u * W, 0.5 * H); x.rotate(rot);
    if (sponsor) { x.fillStyle = colors[2] && colors[2] !== colors[0] ? '#ffffff' : '#111'; x.font = 'italic 900 54px Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(sponsor, -40, -6); }
    x.fillStyle = '#ffffff'; x.beginPath(); x.ellipse(170, 6, 58, 50, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#111'; x.font = 'italic 900 70px Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(num), 170, 10);
    x.restore();
  };
  side(0.25, Math.PI / 2); side(0.75, -Math.PI / 2);
  return toTex(c);
}
function suitTexture(colors, num) {
  const [c, x] = canvas(256, 256);
  x.fillStyle = colors[0]; x.fillRect(0, 0, 256, 256);
  x.fillStyle = colors[1]; x.fillRect(48, 0, 30, 256); x.fillRect(178, 0, 30, 256); // side panels
  x.fillStyle = colors[2] || '#111'; x.fillRect(0, 0, 256, 26); x.fillRect(0, 230, 256, 26);
  x.fillStyle = '#ffffff'; x.font = 'italic 900 64px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(num), 128, 128);
  return toTex(c);
}
function helmetTexture(h, num) {
  const [c, x] = canvas(512, 256);
  x.fillStyle = h[0]; x.fillRect(0, 0, 512, 256);
  x.fillStyle = h[1];
  x.beginPath(); x.moveTo(0, 90); x.bezierCurveTo(130, 40, 380, 40, 512, 90); x.lineTo(512, 130); x.bezierCurveTo(380, 80, 130, 80, 0, 130); x.fill();
  x.fillStyle = h[2];
  for (let i = 0; i < 10; i++) { x.beginPath(); x.moveTo(i * 56, 0); x.lineTo(i * 56 + 22, 0); x.lineTo(i * 56 - 6, 70); x.lineTo(i * 56 - 28, 70); x.fill(); }
  x.fillRect(0, 150, 512, 8);
  x.fillStyle = h[1]; x.font = 'italic 900 52px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(num), 128, 205); x.fillText(String(num), 384, 205);
  return toTex(c);
}
function numberTexture(num) {
  const key = 'num' + num; if (texCache.has(key)) return texCache.get(key);
  const [c, x] = canvas(128, 128);
  x.fillStyle = '#fff'; x.beginPath(); x.ellipse(64, 64, 60, 54, 0, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#111'; x.font = 'italic 900 78px Arial Black, Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(num), 64, 68);
  const t = toTex(c); texCache.set(key, t); return t;
}

// ---------- materials ----------
const matCache = new Map();
function mat(kind, color, detail, extra = {}) {
  const key = kind + color + detail + JSON.stringify(extra);
  if (matCache.has(key)) return matCache.get(key);
  let m;
  if (detail === 0) m = new THREE.MeshLambertMaterial({ color, ...extra });
  else if (kind === 'paint' && detail >= 2) m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.32, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.06, ...extra });
  else {
    const p = { paint: [0.3, 0.2], metal: [0.25, 1], chrome: [0.08, 1], gold: [0.28, 1], ti: [0.22, 1], rubber: [0.92, 0], plastic: [0.55, 0], carbon: [0.35, 0.3], visor: [0.04, 1], leather: [0.6, 0] }[kind] || [0.5, 0];
    m = new THREE.MeshStandardMaterial({ color, roughness: p[0], metalness: p[1], ...extra });
  }
  matCache.set(key, m); return m;
}

// ---------- geometry helpers ----------
// sections: [z, yCentre, halfWidth, topHalfHeight, bottomHalfHeight, exponent]
function loft(sections, around, opts = {}) {
  const pos = [], uv = [], idx = [];
  const n = sections.length, a0 = opts.from ?? 0, a1 = opts.to ?? 1, open = a0 !== 0 || a1 !== 1;
  for (let s = 0; s < n; s++) {
    const [z, yc, w, t, b, e = 2.6] = sections[s];
    for (let j = 0; j <= around; j++) {
      const u = a0 + (a1 - a0) * j / around; const a = (u - 0.25) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      const x = w * Math.sign(ca) * Math.pow(Math.abs(ca), 2 / e);
      const y = yc + (sa >= 0 ? t : b) * Math.sign(sa) * Math.pow(Math.abs(sa), 2 / e);
      pos.push(x, y, z); uv.push(u, 1 - s / (n - 1));
    }
  }
  const row = around + 1;
  for (let s = 0; s < n - 1; s++) for (let j = 0; j < around; j++) {
    const a = s * row + j, b = a + 1, c = a + row, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  g.computeVertexNormals();
  // the loft winds clockwise seen from the front -> flip if normals point inwards
  const p = g.attributes.position, nn = g.attributes.normal; let out = 0;
  for (let i = 0; i < p.count; i += 7) out += p.getX(i) * nn.getX(i) + (p.getY(i) - sections[Math.floor(i / row)][1]) * nn.getY(i);
  if (out < 0) { for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; } g.setIndex(idx); g.computeVertexNormals(); }
  if (open) g.userData.open = true;
  return g;
}
function tyreGeometry(halfW, seg, detail) {
  // rounded tyre cross-section revolved around the axle
  const pts = [];
  const rIn = R - 0.085, steps = detail >= 2 ? 10 : 6;
  pts.push(new THREE.Vector2(rIn, -halfW * 0.8));
  for (let i = 0; i <= steps; i++) { const a = -Math.PI / 2 + Math.PI * i / steps; pts.push(new THREE.Vector2(R - 0.045 + Math.cos(a) * 0.045, Math.sin(a) * halfW)); }
  pts.push(new THREE.Vector2(rIn, halfW * 0.8));
  const g = new THREE.LatheGeometry(pts, seg); g.rotateZ(Math.PI / 2); return g;
}
function limbGeo(r0, r1, len, seg) { const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1); const cap = new THREE.SphereGeometry(r0, seg, Math.max(3, seg / 2)); cap.translate(0, -len / 2, 0); const cap2 = new THREE.SphereGeometry(r1, seg, Math.max(3, seg / 2)); cap2.translate(0, len / 2, 0); return mergeGeometries([g.toNonIndexed(), cap.toNonIndexed(), cap2.toNonIndexed()]); }
const T = (g, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = null) => { g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), s || new THREE.Vector3(1, 1, 1))); return g; };
function clean(g) { let n = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k); if (!n.attributes.uv) n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2)); if (!n.attributes.normal) n.computeVertexNormals(); return n; }
// v3: untextured opaque parts are baked into ONE vertex-coloured toon mesh (1 draw instead of 1 per colour);
// textured / transparent parts keep their own material
function bakeColor(g, color) { const c = new THREE.Color(color), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; }
function mergeByMaterial(parts, shadow = true) {
  const groups = new Map(), baked = [];
  for (const p of parts) {
    if (!p.mat.map && !p.mat.transparent) { baked.push(bakeColor(clean(p.geo), p.mat.color)); continue; }
    if (!groups.has(p.mat)) groups.set(p.mat, []); groups.get(p.mat).push(clean(p.geo));
  }
  const out = [];
  if (baked.length) { const mesh = new THREE.Mesh(mergeGeometries(baked, false), toonMat({ vertexColors: true, rim: 0.55 })); mesh.castShadow = shadow; mesh.userData.ink = true; out.push(mesh); }
  for (const [m, gs] of groups) { const mesh = new THREE.Mesh(mergeGeometries(gs, false), m); mesh.castShadow = shadow; mesh.userData.ink = true; out.push(mesh); }
  return out;
}
function tube(points, r, seg, radial) { const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))); return new THREE.TubeGeometry(curve, seg, r, radial, false); }

// ---------- bodywork definition ----------
const FAIRING = [
  [-1.03, 0.80, 0.02, 0.02, 0.02], [-0.97, 0.80, 0.11, 0.065, 0.075], [-0.85, 0.80, 0.18, 0.11, 0.13], [-0.66, 0.77, 0.215, 0.14, 0.15],
  [-0.42, 0.66, 0.225, 0.24, 0.38], [-0.2, 0.61, 0.215, 0.21, 0.37], [0.0, 0.57, 0.175, 0.16, 0.31], [0.12, 0.55, 0.11, 0.1, 0.22],
];
const TANK = [[-0.46, 0.83, 0.12, 0.05, 0.08], [-0.36, 0.85, 0.17, 0.08, 0.1], [-0.12, 0.86, 0.17, 0.075, 0.1], [0.06, 0.84, 0.14, 0.05, 0.09]];
const SEAT = [[0.04, 0.855, 0.125, 0.03, 0.06], [0.2, 0.87, 0.12, 0.03, 0.06], [0.36, 0.89, 0.11, 0.03, 0.06]];
const TAIL = [[0.3, 0.88, 0.13, 0.04, 0.09], [0.5, 0.93, 0.125, 0.065, 0.1], [0.72, 0.97, 0.1, 0.06, 0.085], [0.88, 0.99, 0.055, 0.04, 0.05], [0.93, 0.99, 0.015, 0.012, 0.012]];
const SCREEN = [[-0.95, 0.865, 0.1, 0.045, 0.01], [-0.8, 0.905, 0.15, 0.07, 0.01], [-0.62, 0.925, 0.17, 0.07, 0.01], [-0.5, 0.92, 0.16, 0.04, 0.01]];

export function createBike({ livery, helmet, number, sponsor, detail = 1, tyre = 'MEDIUM' }) {
  const D = detail;
  const seg = D >= 2 ? 20 : D === 1 ? 14 : 8; // v3: toon ramps hide facets, fewer segments
  const root = new THREE.Group();
  const lean = new THREE.Group(); root.add(lean);
  const wheelie = new THREE.Group(); wheelie.position.z = REAR_Z; lean.add(wheelie);
  const body = new THREE.Group(); body.position.z = -REAR_Z; wheelie.add(body);
  const hi = new THREE.Group(); body.add(hi);

  const paintTex = liveryTexture(livery, number, sponsor);
  const cLivery = D === 0 ? new THREE.MeshLambertMaterial({ map: paintTex }) : D >= 2 ? new THREE.MeshPhysicalMaterial({ map: paintTex, roughness: 0.3, metalness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 }) : new THREE.MeshStandardMaterial({ map: paintTex, roughness: 0.28, metalness: 0.15 });
  const cDark = mat('plastic', '#141416', D), cRubber = mat('rubber', '#121212', D), cMetal = mat('metal', '#a8adb5', D), cChrome = mat('chrome', '#d8dce2', D);
  const cGold = mat('gold', '#c99a2e', D), cTi = mat('ti', '#8e8a9c', D), cSeat = mat('leather', '#1b1b1d', D);
  const cCarbon = D === 0 ? mat('plastic', '#1d1e21', D) : mat('carbon', '#ffffff', D, { map: carbonTexture() });
  const cScreen = D === 0 ? new THREE.MeshLambertMaterial({ color: '#30404f', transparent: true, opacity: 0.55 }) : new THREE.MeshStandardMaterial({ color: '#1c2833', roughness: 0.03, metalness: 0.4, transparent: true, opacity: 0.42, depthWrite: false });
  const cDisc = D === 0 ? cMetal : mat('metal', '#6d7178', D);
  const tyreStripe = { SOFT: '#ff3b3b', MEDIUM: '#ffd23b', HARD: '#f0f0f0', RAIN: '#3b9dff' }[tyre] || '#ffd23b';

  // bodywork
  const around = D >= 2 ? 36 : D === 1 ? 24 : 14;
  const parts = [
    { geo: loft(FAIRING, around), mat: cLivery }, { geo: loft(TANK, around), mat: cLivery }, { geo: loft(TAIL, around), mat: cLivery },
    { geo: loft(SEAT, Math.max(10, around / 2)), mat: cSeat },
  ];
  // winglets (carbon), belly vents, radiator, engine, frame spars
  for (const sx of [-1, 1]) {
    parts.push({ geo: T(new THREE.BoxGeometry(0.14, 0.012, 0.16), sx * 0.27, 0.74, -0.7, 0, 0, sx * -0.18), mat: cCarbon });
    parts.push({ geo: T(new THREE.BoxGeometry(0.012, 0.05, 0.16), sx * 0.34, 0.75, -0.7), mat: cCarbon });
    parts.push({ geo: T(new THREE.BoxGeometry(0.03, 0.06, 0.62), sx * 0.13, 0.62, -0.2, 0.18), mat: cMetal }); // frame spar
    parts.push({ geo: T(new THREE.BoxGeometry(0.03, 0.03, 0.11), sx * 0.17, 0.44, 0.2), mat: cMetal }); // footpeg
    parts.push({ geo: T(new THREE.BoxGeometry(0.2, 0.02, 0.02), sx * 0.16, 0.855, -0.5, 0, sx * 0.25, 0), mat: cDark }); // clip-on bar
  }
  parts.push({ geo: T(new THREE.BoxGeometry(0.24, 0.24, 0.34), 0, 0.36, -0.12), mat: cDark }); // engine block
  parts.push({ geo: T(new THREE.BoxGeometry(0.36, 0.28, 0.03), 0, 0.55, -0.47, -0.35), mat: cDark }); // radiator
  // front fender
  { const f = new THREE.TorusGeometry(R + 0.03, 0.05, 6, 16, Math.PI * 0.55); f.scale(1, 1, 0.9); f.rotateY(Math.PI / 2); f.rotateX(Math.PI * 0.25); f.translate(0, R, FRONT_Z); parts.push({ geo: f, mat: cCarbon }); }
  // fork: gold lowers, chrome uppers, triple clamps
  const rake = 0.42; // radians from vertical (fork top leans back)
  const forkTop = new THREE.Vector3(0, 0.92, FRONT_Z + Math.tan(rake) * 0.62);
  for (const sx of [-0.085, 0.085]) {
    const a = new THREE.Vector3(sx, R, FRONT_Z), b = new THREE.Vector3(sx, forkTop.y, forkTop.z), mid = a.clone().lerp(b, 0.48);
    parts.push({ geo: placeLimb(new THREE.CylinderGeometry(0.03, 0.033, 1, seg / 2), a, mid), mat: cGold });
    parts.push({ geo: placeLimb(new THREE.CylinderGeometry(0.024, 0.024, 1, seg / 2), mid, b), mat: cChrome });
  }
  parts.push({ geo: T(new THREE.BoxGeometry(0.26, 0.035, 0.08), 0, forkTop.y - 0.02, forkTop.z, rake), mat: cMetal });
  parts.push({ geo: T(new THREE.BoxGeometry(0.24, 0.03, 0.07), 0, forkTop.y - 0.2, forkTop.z - 0.08, rake), mat: cMetal });
  // swingarm (tapered spars both sides) + chain
  for (const sx of [-1, 1]) {
    const g = new THREE.BoxGeometry(0.035, 0.11, 0.7); const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) if (p.getZ(i) > 0) p.setY(i, p.getY(i) * 0.55);
    g.computeVertexNormals(); parts.push({ geo: T(g, sx * 0.1, 0.34, 0.38, -0.06), mat: D === 0 ? cMetal : mat('metal', '#9da3ab', D) });
  }
  parts.push({ geo: T(new THREE.BoxGeometry(0.012, 0.03, 0.72), -0.13, 0.32, 0.38, -0.05), mat: cDark });
  // exhaust: titanium pipe sweeping under the bike, out under the tail (right side)
  const exPts = [[0.06, 0.3, -0.32], [0.1, 0.18, -0.08], [0.14, 0.24, 0.24], [0.15, 0.5, 0.6], [0.14, 0.68, 0.8]];
  parts.push({ geo: tube(exPts, 0.042, D >= 2 ? 32 : 14, D >= 2 ? 10 : 6), mat: cTi });
  parts.push({ geo: T(new THREE.CylinderGeometry(0.052, 0.046, 0.16, D >= 2 ? 14 : 8), 0.14, 0.7, 0.82, -1.0), mat: cTi });
  const exhaust = new THREE.Vector3(0.14, 0.75, 0.88);
  for (const m of mergeByMaterial(parts)) hi.add(m);
  // windscreen
  const scr = new THREE.Mesh(loft(SCREEN, D >= 1 ? 20 : 10, { from: 0.28, to: 0.72 }), cScreen); scr.renderOrder = 3; hi.add(scr);
  // number plates
  const numMat = D === 0 ? new THREE.MeshLambertMaterial({ map: numberTexture(number), transparent: true }) : new THREE.MeshStandardMaterial({ map: numberTexture(number), transparent: true, roughness: 0.4 });
  { const pg = [T(new THREE.PlaneGeometry(0.18, 0.15), 0, 0.85, -0.985, -0.5, Math.PI, 0)];
    for (const sx of [-1, 1]) { const g = new THREE.PlaneGeometry(0.16, 0.13); g.rotateZ(sx * 0.12); g.rotateY(sx * Math.PI / 2); g.translate(sx * 0.118, 0.955, 0.66); pg.push(g); }
    hi.add(new THREE.Mesh(mergeGeometries(pg.map(clean)), numMat)); }

  // wheels
  const mkWheel = (front) => {
    const g = new THREE.Group(); const wp = [];
    wp.push({ geo: tyreGeometry(front ? 0.06 : 0.09, D >= 2 ? 40 : D === 1 ? 26 : 14, D), mat: cRubber });
    if (D >= 1) for (const sx of [-1, 1]) { const st = new THREE.TorusGeometry(R - 0.07, 0.004, 4, D >= 2 ? 40 : 24); st.rotateY(Math.PI / 2); st.translate(sx * (front ? 0.052 : 0.08), 0, 0); wp.push({ geo: st, mat: mat('plastic', tyreStripe, D) }); }
    const rim = new THREE.TorusGeometry(R - 0.09, 0.012, 5, D >= 2 ? 32 : 18); rim.rotateY(Math.PI / 2); wp.push({ geo: rim, mat: cDark });
    for (let k = 0; k < 5; k++) { const sp = new THREE.BoxGeometry(0.02, 0.012, R - 0.11); sp.translate(0, 0, (R - 0.11) / 2); sp.rotateX(k / 5 * Math.PI * 2); wp.push({ geo: sp, mat: cDark }); }
    wp.push({ geo: T(new THREE.CylinderGeometry(0.035, 0.035, front ? 0.15 : 0.2, 10), 0, 0, 0, 0, 0, Math.PI / 2), mat: cMetal });
    if (D >= 1) {
      const discs = front ? [-0.065, 0.065] : [-0.07];
      for (const dx of discs) { const d = new THREE.CylinderGeometry(front ? 0.16 : 0.11, front ? 0.16 : 0.11, 0.008, D >= 2 ? 28 : 16); d.rotateZ(Math.PI / 2); d.translate(dx, 0, 0); wp.push({ geo: d, mat: cDisc }); }
    }
    for (const m of mergeByMaterial(wp, D >= 1)) g.add(m);
    return g;
  };
  const front = mkWheel(true); front.position.set(0, R, FRONT_Z); hi.add(front);
  const rear = mkWheel(false); rear.position.set(0, R, REAR_Z); hi.add(rear);
  // calipers (static)
  const calipers = [];
  for (const dx of [-0.065, 0.065]) calipers.push({ geo: T(new THREE.BoxGeometry(0.03, 0.09, 0.05), dx * 1.25, R + 0.12, FRONT_Z + 0.06, -0.5), mat: cGold });
  calipers.push({ geo: T(new THREE.BoxGeometry(0.03, 0.06, 0.04), -0.09, R + 0.08, REAR_Z - 0.05), mat: cGold });
  for (const m of mergeByMaterial(calipers, false)) { m.userData.ink = false; hi.add(m); }

  // ---------------- rider ----------------
  const suitMat = D === 0 ? new THREE.MeshLambertMaterial({ map: suitTexture(livery, number) }) : new THREE.MeshStandardMaterial({ map: suitTexture(livery, number), roughness: 0.62, metalness: 0.05 });
  const limbMat = mat('leather', livery[0], D);
  const accent = mat('leather', livery[1], D);
  const bootMat = mat('leather', '#18181a', D);
  const lseg = D >= 2 ? 10 : D === 1 ? 7 : 5;
  const torso = new THREE.Group(); hi.add(torso);
  { // torso shell + aero hump, built along -Z from the pelvis
    const tg = new THREE.CapsuleGeometry(0.15, 0.36, 4, lseg + 2); tg.scale(1.22, 1, 0.82); tg.rotateX(-Math.PI / 2); tg.translate(0, 0, -0.2);
    const t = new THREE.Mesh(tg, suitMat); t.castShadow = true; torso.add(t);
    const hump = new THREE.Mesh(new THREE.SphereGeometry(0.11, lseg + 2, 8), accent); hump.scale.set(1, 0.75, 1.6); hump.position.set(0, 0.12, -0.36); hump.castShadow = true; torso.add(hump);
  }
  const head = new THREE.Group(); hi.add(head);
  { const hm = new THREE.Mesh(new THREE.SphereGeometry(0.145, D >= 2 ? 26 : 16, D >= 2 ? 18 : 10), D === 0 ? new THREE.MeshLambertMaterial({ map: helmetTexture(helmet, number) }) : new THREE.MeshPhysicalMaterial({ map: helmetTexture(helmet, number), roughness: 0.25, clearcoat: D >= 2 ? 1 : 0, clearcoatRoughness: 0.08 }));
    { const sg = hm.geometry; sg.rotateY(Math.PI / 2); sg.scale(1, 0.98, 1.12); const cg = new THREE.SphereGeometry(0.11, 10, 6); cg.scale(1.05, 0.7, 1.0); cg.translate(0, -0.07, -0.07); hm.geometry = mergeGeometries([clean(sg), clean(cg)]); }
    hm.castShadow = true; head.add(hm);
    const vg = new THREE.SphereGeometry(0.149, 16, 6, Math.PI * 1.18, Math.PI * 0.64, Math.PI * 0.34, Math.PI * 0.26); vg.scale(1, 0.98, 1.12);
    const spg = new THREE.BoxGeometry(0.13, 0.025, 0.08); spg.rotateX(0.35); spg.translate(0, 0.11, 0.14);
    const vis = new THREE.Mesh(mergeGeometries([bakeColor(clean(vg), '#141a2e'), bakeColor(clean(spg), helmet[1])]), toonMat({ vertexColors: true, rim: 0.8 })); vis.userData.ink = false; head.add(vis);
  }
  // limbs: [upperArmL, foreArmL, upperArmR, foreArmR, thighL, shinL, thighR, shinR]
  const L = { ua: 0.29, fa: 0.3, th: 0.43, sh: 0.44 };
  const limbs = [];
  const mkLimb = (len, r0, r1, m) => { const mesh = new THREE.Mesh(limbGeo(r0, r1, len, lseg), m); mesh.castShadow = D >= 1; hi.add(mesh); limbs.push(mesh); return mesh; };
  for (let s = 0; s < 2; s++) { mkLimb(L.ua, 0.052, 0.045, limbMat); mkLimb(L.fa, 0.044, 0.036, limbMat); }
  for (let s = 0; s < 2; s++) { mkLimb(L.th, 0.078, 0.06, limbMat); mkLimb(L.sh, 0.056, 0.045, limbMat); }
  // gloves, boots, knee sliders (follow the limb ends)
  const extras = [];
  // (gloves, boots, knee sliders: separate animated parts, only at the top detail level to save draws)
  if (D >= 2) {
    for (let s = 0; s < 2; s++) { const g = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.1), bootMat); hi.add(g); extras.push(g); }
    for (let s = 0; s < 2; s++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, 0.22), bootMat); b.castShadow = true; hi.add(b); extras.push(b); }
    for (let s = 0; s < 2; s++) { const k = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.07, 0.1), mat('plastic', '#e9e9e9', D)); hi.add(k); extras.push(k); }
  }

  // ---------------- far LOD (single draw) ----------------
  const lo = new THREE.Group(); body.add(lo); lo.visible = false;
  {
    const lp = [];
    const col = (g, c) => { const n = clean(g); const cc = new THREE.Color(c); const arr = new Float32Array(n.attributes.position.count * 3); for (let i = 0; i < arr.length; i += 3) { arr[i] = cc.r; arr[i + 1] = cc.g; arr[i + 2] = cc.b; } n.setAttribute('color', new THREE.BufferAttribute(arr, 3)); return n; };
    lp.push(col(loft(FAIRING, 8), livery[0]), col(loft(TANK, 8), livery[1]), col(loft(TAIL, 8), livery[0]));
    for (const z of [FRONT_Z, REAR_Z]) lp.push(col(T(new THREE.CylinderGeometry(R, R, 0.14, 10), 0, R, z, 0, 0, Math.PI / 2), '#111'));
    lp.push(col(T(new THREE.BoxGeometry(0.32, 0.2, 0.5), 0, 1.0, 0.0), livery[0]));
    lp.push(col(T(new THREE.SphereGeometry(0.15, 8, 6), 0, 1.1, -0.36), helmet[0]));
    lp.push(col(T(new THREE.BoxGeometry(0.1, 0.32, 0.12), 0.17, 0.75, 0.18), livery[0]), col(T(new THREE.BoxGeometry(0.1, 0.32, 0.12), -0.17, 0.75, 0.18), livery[0]));
    const m = new THREE.Mesh(mergeGeometries(lp.map(g => { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k); return g; })), loMaterial());
    lo.add(m);
  }

  // ---------------- anime look: toon ramps, rim light on bike+rider, ink outlines ----------------
  toonify(hi, { rim: 0.55 }); toonify(lo, { rim: 0.4 });
  // ink only on the big silhouettes: baked bodywork, livery, wheels, torso, helmet, limbs
  limbs.forEach(l => { l.userData.ink = true; }); torso.traverse(o => { if (o.isMesh) o.userData.ink = true; }); head.children[0].userData.ink = true;
  addOutlines(hi, { width: D >= 2 ? 2.2 : 1.9, minSize: 0.05, filter: o => o.userData.ink });
  addOutlines(lo, { width: 1.6 });
  hi.traverse(o => { if (o.isMesh) o.receiveShadow = false; });
  const bike = {
    root, lean, wheelie, body, hi, lo, front, rear, head, torso, limbs, extras, exhaust, detail: D,
    anim: { lean: 0, leanV: 0, pitch: 0, pitchV: 0, hang: 0, hangV: 0, tuck: 0.8, tuckV: 0, spin: 0, look: 0, lookV: 0, lod: 0 },
    knee: [new THREE.Vector3(), new THREE.Vector3()], // world-space knee slider positions (for sparks)
    setLOD(level) { if (this.anim.lod === level) return; this.anim.lod = level; hi.visible = level === 0; lo.visible = level === 1; },
    hulls: [], loHulls: [], ink: true, loInk: true,
    setInk(on, loOn = on) { if (on !== this.ink) { this.ink = on; for (const h of this.hulls) h.visible = on; } if (loOn !== this.loInk) { this.loInk = loOn; for (const h of this.loHulls) h.visible = loOn; } },
  };
  hi.traverse(o => { if (o.userData.outline) bike.hulls.push(o); }); lo.traverse(o => { if (o.userData.outline) bike.loHulls.push(o); });
  poseRider(bike, 0, 0.8, 0, 0); // initial pose
  return bike;
}
let _loMat = null;
function loMaterial() { if (!_loMat) _loMat = new THREE.MeshLambertMaterial({ vertexColors: true }); return _loMat; }
function placeLimb(g, a, b) { const len = a.distanceTo(b); g.scale(1, len, 1); const q = new THREE.Quaternion().setFromUnitVectors(_up, b.clone().sub(a).normalize()); g.applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1))); return g; }

// critically damped spring step (x towards target)
function spring(a, key, target, omega, dt) {
  const vk = key + 'V'; const x = a[key], v = a[vk] || 0;
  const f = 1 + 2 * dt * omega, oo = omega * omega, hoo = dt * oo, hhoo = dt * hoo, det = 1 / (f + hhoo);
  a[key] = (f * x + dt * v + hhoo * target) * det; a[vk] = (v + hoo * (target - x)) * det;
}

// 2-bone IK: shoulder/hip S, target T, lengths l1/l2, pole direction -> writes elbow/knee into out
function ik(S, Tt, l1, l2, pole, out) {
  _v1.subVectors(Tt, S); let d = _v1.length(); const maxD = (l1 + l2) * 0.999; if (d > maxD) { _v1.multiplyScalar(maxD / d); d = maxD; }
  _v1.normalize();
  const a = (l1 * l1 + d * d - l2 * l2) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  _v2.copy(pole).addScaledVector(_v1, -pole.dot(_v1)).normalize();
  out.copy(S).addScaledVector(_v1, a).addScaledVector(_v2, h);
  return out;
}
function setLimb(mesh, A, B) {
  mesh.position.addVectors(A, B).multiplyScalar(0.5);
  _v3.subVectors(B, A).normalize(); mesh.quaternion.setFromUnitVectors(_up, _v3);
}
const P = {
  pelvis: new THREE.Vector3(), shoulder: new THREE.Vector3(), sh: [new THREE.Vector3(), new THREE.Vector3()], hip: [new THREE.Vector3(), new THREE.Vector3()],
  hand: [new THREE.Vector3(), new THREE.Vector3()], foot: [new THREE.Vector3(), new THREE.Vector3()], elbow: new THREE.Vector3(), knee: new THREE.Vector3(),
  pole: new THREE.Vector3(), fwd: new THREE.Vector3(),
};
// hang: -1..1 (+ = inside to the right), tuck: 0 (sitting up) .. 1 (full tuck), look: head yaw, pitch: body pitch (for braking)
function poseRider(m, hang, tuck, look, brake, celebrate = 0) {
  const ah = Math.abs(hang), side = Math.sign(hang) || 1;
  // pelvis slides towards the inside and drops a little
  P.pelvis.set(hang * 0.2, 0.93 - ah * 0.05 + (1 - tuck) * 0.02, 0.27 - (1 - tuck) * 0.02);
  // torso pitch: tucked = nearly flat; sitting up under braking
  // elevation of the spine above horizontal (rotation about X lifts the -Z axis): ~13° in full tuck, ~50° sitting up
  const pitch = 0.22 + (1 - tuck) * 0.62 + brake * 0.14 + celebrate * 0.5;
  m.torso.position.copy(P.pelvis);
  m.torso.rotation.set(pitch + 0.0, 0, -hang * 0.32, 'YXZ');
  m.torso.rotation.y = hang * 0.1;
  m.torso.updateMatrix();
  // shoulders: along the torso direction
  P.fwd.set(0, 0, -1).applyEuler(m.torso.rotation);
  P.shoulder.copy(P.pelvis).addScaledVector(P.fwd, 0.5);
  _v3.set(1, 0, 0).applyEuler(m.torso.rotation);
  for (let s = 0; s < 2; s++) { const sx = s ? 1 : -1; P.sh[s].copy(P.shoulder).addScaledVector(_v3, sx * 0.19); P.sh[s].y -= 0.02; }
  // head ahead of the shoulders, turning into the corner and dipping behind the screen when tucked
  m.head.position.copy(P.shoulder).addScaledVector(P.fwd, 0.12); m.head.position.y += 0.09 + (1 - tuck) * 0.04; m.head.position.x += hang * 0.06;
  m.head.rotation.set(-0.08 + tuck * 0.12 - (1 - tuck) * 0.25 + celebrate * 0.3, look, -hang * 0.35 * 0.6, 'YXZ');
  // hands on the clip-ons, feet on the pegs
  for (let s = 0; s < 2; s++) {
    const sx = s ? 1 : -1;
    P.hand[s].set(sx * 0.22, 0.86, -0.5);
    if (celebrate > 0) P.hand[s].lerp(_v2.set(sx * 0.42, P.shoulder.y + 0.5, P.shoulder.z + 0.05), celebrate);
    P.foot[s].set(sx * 0.18, 0.47, 0.2);
  }
  // arms: elbows out & down; inside elbow drops more when hanging off
  for (let s = 0; s < 2; s++) {
    const sx = s ? 1 : -1; const inside = (sx === side && ah > 0.05) ? ah : 0;
    P.pole.set(sx * (0.8 + inside * 0.8), -0.6 - inside * 0.4 + celebrate * 0.5, 0.2);
    ik(P.sh[s], P.hand[s], 0.29, 0.3, P.pole, P.elbow);
    setLimb(m.limbs[s * 2], P.sh[s], P.elbow); setLimb(m.limbs[s * 2 + 1], P.elbow, P.hand[s]);
    if (m.extras.length) m.extras[s].position.copy(P.hand[s]); if (m.extras.length) m.extras[s].quaternion.copy(m.limbs[s * 2 + 1].quaternion);
  }
  // legs: inside knee pushed out towards the tarmac
  for (let s = 0; s < 2; s++) {
    const sx = s ? 1 : -1; const inside = (sx === side) ? ah : 0;
    P.hip[s].copy(P.pelvis); P.hip[s].x += sx * 0.13; P.hip[s].y -= 0.02;
    P.pole.set(sx * (0.25 + inside * 1.6), 0.15 - inside * 0.5, -1);
    ik(P.hip[s], P.foot[s], 0.43, 0.44, P.pole, P.knee);
    setLimb(m.limbs[4 + s * 2], P.hip[s], P.knee); setLimb(m.limbs[5 + s * 2], P.knee, P.foot[s]);
    if (m.extras.length) m.extras[2 + s].position.copy(P.foot[s]).add(_v1.set(0, -0.01, 0.06));
    if (m.extras.length) { m.extras[4 + s].position.copy(P.knee); m.extras[4 + s].position.x += sx * 0.07; m.extras[4 + s].quaternion.copy(m.limbs[4 + s * 2].quaternion);
    m.extras[4 + s].visible = inside > 0.25; }
    m.knee[s].copy(P.knee); m.knee[s].x += sx * 0.1;
  }
}

// Smoothly animate the model from physical state. dt in seconds.
export function animateBike(m, { lean = 0, accel = 0, v = 0, dt = 0.016, crashed = false, brake = 0, near = true }) {
  const a = m.anim; dt = Math.min(dt, 0.05);
  spring(a, 'lean', lean, 14, dt);
  let pTarget = 0;
  if (accel < -2) pTarget = Math.max(-0.045, accel * 0.0035);
  else if (accel > 4 && v < 55 && Math.abs(a.lean) < 0.3) pTarget = Math.min(0.12, (accel - 4) * 0.028);
  spring(a, 'pitch', pTarget, 7, dt);
  spring(a, 'hang', Math.max(-1, Math.min(1, lean / 0.9)), 6, dt);
  const tuckT = brake > 0.2 || accel < -5 ? 0.1 : Math.abs(lean) > 0.35 ? 0.45 : Math.min(1, 0.35 + v / 70);
  spring(a, 'tuck', tuckT, 5, dt);
  spring(a, 'look', Math.max(-0.5, Math.min(0.5, lean * 0.55)), 6, dt);
  m.lean.rotation.z = -a.lean;
  m.wheelie.rotation.x = Math.max(-0.045, a.pitch);
  a.spin = (a.spin + v * dt / R) % (Math.PI * 2);
  m.front.rotation.x = -a.spin; m.rear.rotation.x = -a.spin;
  if (crashed) { m.lean.rotation.z = 1.35; m.wheelie.rotation.x = 0; }
  if (near && a.lod === 0) poseRider(m, a.hang, a.tuck, a.look, Math.max(0, Math.min(1, -accel / 10)));
}

// menu/podium helper: a standing rider is out of scope; reuse the tucked pose
export { poseRider };
