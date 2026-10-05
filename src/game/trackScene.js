import * as THREE from 'three';
import { mulberry } from './trackgeom.js';

function canvasTex(w, h, draw, repeat = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 8;
  return t;
}
const SPONSORS = ['NOVARA ENERGY', 'TIDECORE OIL', 'BLUEPEAK', 'ARROWLINE', 'GRANITBRAU', 'LIMEFROST', 'SIAM VELOCITY', 'APEX TELECOM', 'HORIZON AIR', 'TITAN TOOLS', 'VORTEX TYRES', 'KITE WATCHES'];

export function asphaltTexture(wet) {
  return canvasTex(256, 512, (x, w, h) => {
    x.fillStyle = wet ? '#2a2c30' : '#3d3f43'; x.fillRect(0, 0, w, h);
    const r = mulberry(7);
    for (let i = 0; i < 9000; i++) { const g = 40 + r() * 50 | 0; x.fillStyle = `rgba(${g},${g},${g + 4},${0.25 + r() * 0.3})`; x.fillRect(r() * w, r() * h, 1.5, 1.5); }
    // rubbered racing line darker band
    const grd = x.createLinearGradient(0, 0, w, 0);
    grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(0.5, 'rgba(0,0,0,0.12)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = grd; x.fillRect(0, 0, w, h);
    x.fillStyle = '#e8e8e8'; x.fillRect(4, 0, 7, h); x.fillRect(w - 11, 0, 7, h);
  });
}
function kerbTexture() {
  return canvasTex(64, 128, (x, w, h) => {
    x.fillStyle = '#d81e1e'; x.fillRect(0, 0, w, h / 2); x.fillStyle = '#f2f2f2'; x.fillRect(0, h / 2, w, h / 2);
    x.fillStyle = 'rgba(0,0,0,0.15)'; x.fillRect(0, 0, 6, h);
  });
}
function boardTexture() {
  return canvasTex(2048, 64, (x, w, h) => {
    const cols = ['#c8102e', '#1546c7', '#111', '#ff7f11', '#14a6b8', '#6a1fb5', '#0e7a3c', '#d4af37'];
    const seg = w / 8;
    for (let i = 0; i < 8; i++) {
      x.fillStyle = cols[i % cols.length]; x.fillRect(i * seg, 0, seg, h);
      x.fillStyle = '#fff'; x.font = 'italic 900 34px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(SPONSORS[i % SPONSORS.length], i * seg + seg / 2, h / 2 + 2);
    }
  });
}
function grassTexture() {
  return canvasTex(256, 256, (x, w, h) => {
    x.fillStyle = '#3f6b2a'; x.fillRect(0, 0, w, h);
    const r = mulberry(3);
    for (let i = 0; i < 6000; i++) { const g = r(); x.fillStyle = `rgba(${30 + g * 50 | 0},${80 + g * 60 | 0},${20 + g * 30 | 0},0.5)`; x.fillRect(r() * w, r() * h, 2, 2); }
    // mowing stripes
    x.fillStyle = 'rgba(255,255,255,0.04)'; x.fillRect(0, 0, w / 2, h);
  });
}
function crowdTexture() {
  return canvasTex(256, 128, (x, w, h) => {
    x.fillStyle = '#2a2d33'; x.fillRect(0, 0, w, h);
    const r = mulberry(11);
    const cols = ['#e33', '#ff0', '#fff', '#36f', '#f80', '#0c6', '#d4af37', '#c0c', '#111'];
    for (let i = 0; i < 2200; i++) { x.fillStyle = cols[r() * cols.length | 0]; x.fillRect(r() * w, r() * h, 2.5, 3); }
    for (let row = 0; row < 8; row++) { x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(0, row * 16 + 13, w, 3); }
  });
}

function ribbon(geo, d0f, d1f, yOff, sFrom, sTo, step, vScale, colorFn) {
  // build a strip between lateral offsets d0(i) and d1(i) for sample range
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
function fixWinding(g) { // ensure normals point up
  const n = g.attributes.normal; let sum = 0; for (let i = 0; i < n.count; i++) sum += n.getY(i);
  if (sum < 0) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } g.computeVertexNormals(); }
  return g;
}

export function buildTrackScene(geo, opts) {
  const { quality, weather, night } = opts;
  const group = new THREE.Group();
  const hw = geo.halfW, N = geo.N;
  const wet = weather === 'LIGHT_RAIN' || weather === 'HEAVY_RAIN';
  const KERB = 1.3, RUNOFF = 16, WALL = hw + 21;

  // corner zones for kerbs / gravel
  const absK = new Float32Array(N);
  for (let i = 0; i < N; i++) { let m = 0; for (let k = -12; k <= 12; k++) m = Math.max(m, Math.abs(geo.kappa[(i + k + N) % N])); absK[i] = m; }
  const isCorner = (i) => absK[i] > 1 / 260;

  // road
  const roadMat = new THREE.MeshLambertMaterial({ map: asphaltTexture(wet) });
  if (wet) { roadMat.color.setRGB(0.75, 0.78, 0.85); }
  const road = new THREE.Mesh(fixWinding(ribbon(geo, () => -hw, () => hw, 0.02, 0, N, 1, 12)), roadMat);
  road.receiveShadow = true; group.add(road);
  if (wet) { // glossy sheen layer
    const sheen = new THREE.Mesh(road.geometry, new THREE.MeshStandardMaterial({ color: '#8899aa', roughness: 0.08, metalness: 0.6, transparent: true, opacity: 0.25 }));
    sheen.position.y = 0.005; group.add(sheen);
  }
  // kerbs (both sides in corner zones)
  const kerbMat = new THREE.MeshLambertMaterial({ map: kerbTexture() });
  const kerbGeos = [];
  let start = -1;
  for (let i = 0; i <= N; i++) {
    const c = i < N && isCorner(i);
    if (c && start < 0) start = i;
    if (!c && start >= 0) {
      kerbGeos.push(fixWinding(ribbon(geo, () => hw, () => hw + KERB, 0.04, start, i, 1, 6)));
      kerbGeos.push(fixWinding(ribbon(geo, () => -hw - KERB, () => -hw, 0.04, start, i, 1, 6)));
      start = -1;
    }
  }
  for (const g of kerbGeos) { const m = new THREE.Mesh(g, kerbMat); m.receiveShadow = true; group.add(m); }
  // run-off: paved band + gravel traps on the outside of corners
  const runMat = new THREE.MeshLambertMaterial({ vertexColors: true, map: canvasTex(64, 64, (x) => { const r = mulberry(5); x.fillStyle = '#fff'; x.fillRect(0, 0, 64, 64); for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(0,0,0,${r() * 0.25})`; x.fillRect(r() * 64, r() * 64, 2, 2); } }) });
  const PAVED = 5;
  for (const side of [1, -1]) {
    const g = ribbon(geo, (i) => side * (hw + (isCorner(i) ? KERB : 0.0)), (i) => side * (hw + PAVED), 0.012, 0, N, 2, 8, () => [0.13, 0.16, 0.14]);
    const m = new THREE.Mesh(fixWinding(g), runMat); m.receiveShadow = true; group.add(m);
    const gravelAt = (i) => Math.sign(geo.kappa[i]) === -side && absK[i] > 1 / 200;
    let st = -1;
    for (let i = 0; i <= N; i += 2) {
      const gz = i < N && gravelAt(i);
      if (gz && st < 0) st = i;
      if (!gz && st >= 0) { const gg = ribbon(geo, () => side * (hw + PAVED), () => side * (hw + RUNOFF), 0.008, st, i, 2, 8, () => [0.5, 0.44, 0.32]); group.add(new THREE.Mesh(fixWinding(gg), runMat)); st = -1; }
    }
  }
  // barriers with sponsor boards (vertical walls)
  const boardMat = new THREE.MeshLambertMaterial({ map: boardTexture(), side: THREE.DoubleSide });
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
    group.add(new THREE.Mesh(g, boardMat));
  }
  // start/finish line & grid slots
  const lineMat = new THREE.MeshLambertMaterial({ map: canvasTex(128, 16, (x) => { for (let i = 0; i < 16; i++) for (let j = 0; j < 2; j++) { x.fillStyle = (i + j) % 2 ? '#111' : '#fff'; x.fillRect(i * 8, j * 8, 8, 8); } }, false) });
  const sfl = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, 1.6), lineMat);
  sfl.rotation.x = -Math.PI / 2; sfl.rotation.z = -Math.atan2(geo.tz[0], geo.tx[0]) + Math.PI / 2;
  sfl.position.set(geo.x[0], geo.y[0] + 0.035, geo.z[0]); group.add(sfl);
  const slotMat = new THREE.MeshBasicMaterial({ color: '#f0f0f0' });
  const slots = gridSlots(geo, 24);
  for (const sl of slots) {
    const i = ((Math.round(sl.s / geo.ds) % N) + N) % N;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.18), slotMat);
    m.rotation.x = -Math.PI / 2; m.rotation.z = -geo.heading[i] + Math.PI / 2;
    m.position.set(geo.x[i] + geo.rx[i] * sl.d, geo.y[i] + 0.04, geo.z[i] + geo.rz[i] * sl.d);
    m.translateY(-1.1);
    group.add(m);
  }

  // start gantry with lights
  const gantry = new THREE.Group();
  const gm = new THREE.MeshLambertMaterial({ color: '#202226' });
  for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.5, 8, 0.5), gm); p.position.set(s * (hw + 1.5), 4, 0); gantry.add(p); }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 3.5, 1.4, 0.7), gm); beam.position.y = 7.6; gantry.add(beam);
  const lights = [];
  for (let i = 0; i < 5; i++) {
    const lm = new THREE.MeshBasicMaterial({ color: '#330000' });
    for (const zz of [-0.37, 0.37]) {
      const l = new THREE.Mesh(new THREE.CircleGeometry(0.32, 16), lm);
      l.position.set((i - 2) * 1.6, 7.6, zz); if (zz > 0) l.rotation.y = 0; else l.rotation.y = Math.PI; gantry.add(l);
    }
    lights.push(lm);
  }
  gantry.position.set(geo.x[0], geo.y[0], geo.z[0]);
  gantry.rotation.y = Math.atan2(-geo.tx[0], -geo.tz[0]);
  group.add(gantry);

  // ---------------- terrain ----------------
  let mnx = 1e9, mxx = -1e9, mnz = 1e9, mxz = -1e9, ysum = 0;
  for (let i = 0; i < N; i++) { mnx = Math.min(mnx, geo.x[i]); mxx = Math.max(mxx, geo.x[i]); mnz = Math.min(mnz, geo.z[i]); mxz = Math.max(mxz, geo.z[i]); ysum += geo.y[i]; }
  const yavg = ysum / N;
  const M = 700; mnx -= M; mxx += M; mnz -= M; mxz += M;
  const cell = quality >= 2 ? 12 : 18;
  const nx = Math.ceil((mxx - mnx) / cell) + 1, nz = Math.ceil((mxz - mnz) / cell) + 1;
  // spatial hash of track samples
  const H = 60, hash = new Map();
  for (let i = 0; i < N; i += 2) { const key = Math.floor(geo.x[i] / H) + ',' + Math.floor(geo.z[i] / H); if (!hash.has(key)) hash.set(key, []); hash.get(key).push(i); }
  const nearest = (x, z, rad = 2) => {
    const cx = Math.floor(x / H), cz = Math.floor(z / H); let bd = 1e18, bi = -1;
    for (let a = -rad; a <= rad; a++) for (let b = -rad; b <= rad; b++) { const l = hash.get((cx + a) + ',' + (cz + b)); if (!l) continue; for (const i of l) { const dd = (geo.x[i] - x) ** 2 + (geo.z[i] - z) ** 2; if (dd < bd) { bd = dd; bi = i; } } }
    return [bi, Math.sqrt(bd)];
  };
  const rnd = mulberry(geo.N * 7 + 13);
  const ph = [rnd() * 6, rnd() * 6, rnd() * 6];
  const hills = (x, z) => (Math.sin(x * 0.004 + ph[0]) * Math.cos(z * 0.0035 + ph[1]) * 0.6 + Math.sin(x * 0.011 + z * 0.009 + ph[2]) * 0.25);
  const tPos = new Float32Array(nx * nz * 3), tCol = new Float32Array(nx * nz * 3), distArr = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = mnx + i * cell, z = mnz + j * cell; const id = j * nx + i;
    const [bi, dist] = nearest(x, z);
    const near = bi >= 0 ? geo.y[bi] : yavg;
    const dd = bi >= 0 ? dist : 999;
    distArr[id] = dd;
    const far = Math.max(0, Math.min(1, (dd - 60) / 400));
    let h = near * (1 - far) + yavg * far + hills(x, z) * (12 + far * 60) * far;
    // keep terrain just under the track surface near the circuit
    if (dd < hw + RUNOFF + 10) h = near - 0.25;
    else if (dd < hw + 60) h = Math.min(h, near - 0.25 + (dd - hw - RUNOFF - 10) * 0.05);
    tPos[id * 3] = x; tPos[id * 3 + 1] = h; tPos[id * 3 + 2] = z;
    const g = 0.85 + hills(x * 3, z * 3) * 0.15;
    tCol[id * 3] = 0.55 * g + far * 0.1; tCol[id * 3 + 1] = 0.75 * g; tCol[id * 3 + 2] = 0.45 * g;
  }
  const tIdx = [];
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) { const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1; tIdx.push(a, c, b, b, c, d); }
  const tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.BufferAttribute(tPos, 3)); tg.setAttribute('color', new THREE.BufferAttribute(tCol, 3));
  const tuv = new Float32Array(nx * nz * 2); for (let k = 0; k < nx * nz; k++) { tuv[k * 2] = tPos[k * 3] / 40; tuv[k * 2 + 1] = tPos[k * 3 + 2] / 40; }
  tg.setAttribute('uv', new THREE.BufferAttribute(tuv, 2));
  tg.setIndex(tIdx); tg.computeVertexNormals();
  const terrain = new THREE.Mesh(tg, new THREE.MeshLambertMaterial({ map: grassTexture(), vertexColors: true }));
  terrain.receiveShadow = quality >= 2; group.add(terrain);
  const terrainH = (x, z) => { const i = Math.round((x - mnx) / cell), j = Math.round((z - mnz) / cell); if (i < 0 || j < 0 || i >= nx || j >= nz) return yavg; return tPos[(j * nx + i) * 3 + 1]; };
  const terrainD = (x, z) => { const i = Math.round((x - mnx) / cell), j = Math.round((z - mnz) / cell); if (i < 0 || j < 0 || i >= nx || j >= nz) return 999; return distArr[j * nx + i]; };

  // ---------------- trees (instanced) ----------------
  const treeCount = [250, 700, 1400, 2400][quality];
  const trunkG = new THREE.CylinderGeometry(0.35, 0.5, 3, 5); trunkG.translate(0, 1.5, 0);
  const crownG = new THREE.ConeGeometry(3.2, 9, 7); crownG.translate(0, 7, 0);
  const crown2G = new THREE.IcosahedronGeometry(3.6, 0); crown2G.translate(0, 6, 0);
  const trunks = new THREE.InstancedMesh(trunkG, new THREE.MeshLambertMaterial({ color: '#5a3e26' }), treeCount);
  const crowns = new THREE.InstancedMesh(crownG, new THREE.MeshLambertMaterial({ color: '#2f5a24' }), Math.ceil(treeCount / 2));
  const crowns2 = new THREE.InstancedMesh(crown2G, new THREE.MeshLambertMaterial({ color: '#3d6e2a' }), Math.ceil(treeCount / 2));
  const dummy = new THREE.Object3D(); let placed = 0, c1 = 0, c2 = 0, tries = 0;
  const tc = new THREE.Color();
  while (placed < treeCount && tries < treeCount * 20) {
    tries++;
    // cluster trees: pick around random track sample at random distance
    const si = (rnd() * N) | 0; const side = rnd() < 0.5 ? -1 : 1; const dist = WALL + 12 + Math.pow(rnd(), 1.6) * 420;
    const x = geo.x[si] + geo.rx[si] * dist * side + (rnd() - 0.5) * 40, z = geo.z[si] + geo.rz[si] * dist * side + (rnd() - 0.5) * 40;
    if (terrainD(x, z) < WALL + 10) continue;
    const y = terrainH(x, z); const s = 0.7 + rnd() * 0.8;
    dummy.position.set(x, y, z); dummy.scale.set(s, s * (0.8 + rnd() * 0.5), s); dummy.rotation.y = rnd() * 6; dummy.updateMatrix();
    trunks.setMatrixAt(placed, dummy.matrix);
    if (placed % 2 === 0 && c1 < crowns.count) { crowns.setMatrixAt(c1, dummy.matrix); tc.setHSL(0.27 + rnd() * 0.06, 0.45, 0.22 + rnd() * 0.1); crowns.setColorAt(c1, tc); c1++; }
    else if (c2 < crowns2.count) { crowns2.setMatrixAt(c2, dummy.matrix); tc.setHSL(0.22 + rnd() * 0.08, 0.45, 0.25 + rnd() * 0.12); crowns2.setColorAt(c2, tc); c2++; }
    placed++;
  }
  trunks.count = placed; crowns.count = c1; crowns2.count = c2;
  group.add(trunks, crowns, crowns2);

  // ---------------- grandstands, pit building ----------------
  let ksum = 0; for (let i = 0; i < N; i++) ksum += geo.kappa[i];
  const infield = ksum > 0 ? 1 : -1; // right turns dominate -> infield on the right
  const standMat = new THREE.MeshLambertMaterial({ map: crowdTexture() });
  const roofMat = new THREE.MeshLambertMaterial({ color: '#d8dade' });
  const concrete = new THREE.MeshLambertMaterial({ color: '#8a8d93' });
  const addStand = (si, side, len, tiers = 6) => {
    const i = ((si % N) + N) % N;
    const st = new THREE.Group();
    for (let t = 0; t < tiers; t++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(len, 1.6, 2.2), standMat);
      b.position.set(0, 0.8 + t * 1.6, t * 2.2); st.add(b);
    }
    const back = new THREE.Mesh(new THREE.BoxGeometry(len, tiers * 1.6 + 4, 1), concrete); back.position.set(0, (tiers * 1.6 + 4) / 2, tiers * 2.2 + 0.5); st.add(back);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(len + 2, 0.4, tiers * 2.2 + 4), roofMat); roof.position.set(0, tiers * 1.6 + 4, tiers * 1.1); st.add(roof);
    const d = side * (WALL + 3);
    st.position.set(geo.x[i] + geo.rx[i] * d, geo.y[i] - 0.3, geo.z[i] + geo.rz[i] * d);
    // face the track: local +z points away from track
    const ang = Math.atan2(geo.rx[i] * side, geo.rz[i] * side);
    st.rotation.y = ang;
    group.add(st);
  };
  const standCount = [3, 6, 10, 14][quality];
  for (let k = 0; k < 3; k++) addStand(-60 - k * 45, -infield, 42);
  // grandstands at heaviest braking zones
  const zones = [];
  for (let i = 0; i < N; i += 5) { if (absK[i] > 1 / 60) zones.push(i); }
  for (let k = 0; k < standCount - 3 && zones.length; k++) { const i = zones[Math.floor((k + 0.5) / (standCount - 3) * zones.length)]; addStand(i - 25, Math.sign(geo.kappa[i]) > 0 ? -1 : 1, 50, 5); }
  // pit building on infield side of main straight
  {
    const pitLen = 260, i0 = ((Math.round(-140 / geo.ds) % N) + N) % N;
    const pb = new THREE.Mesh(new THREE.BoxGeometry(pitLen, 9, 14), new THREE.MeshLambertMaterial({ map: canvasTex(512, 64, (x, w, h) => { x.fillStyle = '#e9ebee'; x.fillRect(0, 0, w, h); for (let i = 0; i < 24; i++) { x.fillStyle = '#26303a'; x.fillRect(i * 21 + 3, 18, 16, 30); } x.fillStyle = '#c8102e'; x.fillRect(0, 0, w, 8); }, false) }));
    const d = infield * (WALL + 14);
    pb.position.set(geo.x[i0] + geo.rx[i0] * d, geo.y[i0] + 4.2, geo.z[i0] + geo.rz[i0] * d);
    pb.rotation.y = Math.atan2(-geo.tx[i0], -geo.tz[i0]) + Math.PI / 2;
    group.add(pb);
  }
  // floodlight poles for night races
  if (night) {
    const poleG = new THREE.CylinderGeometry(0.3, 0.4, 22, 5); poleG.translate(0, 11, 0);
    const headG = new THREE.BoxGeometry(3, 1.4, 1); headG.translate(0, 22, 0);
    const cnt = Math.floor(N / 40);
    const poles = new THREE.InstancedMesh(poleG, new THREE.MeshLambertMaterial({ color: '#444' }), cnt);
    const heads = new THREE.InstancedMesh(headG, new THREE.MeshBasicMaterial({ color: '#fffbe6' }), cnt);
    for (let k = 0; k < cnt; k++) { const i = k * 40, side = k % 2 ? 1 : -1, d = side * (WALL + 2); dummy.position.set(geo.x[i] + geo.rx[i] * d, geo.y[i], geo.z[i] + geo.rz[i] * d); dummy.scale.set(1, 1, 1); dummy.rotation.y = geo.heading[i]; dummy.updateMatrix(); poles.setMatrixAt(k, dummy.matrix); heads.setMatrixAt(k, dummy.matrix); }
    group.add(poles, heads);
  }
  return { group, lights, slots, bounds: { mnx, mxx, mnz, mxz }, wall: WALL, kerb: KERB, runoff: RUNOFF, isCorner };
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
