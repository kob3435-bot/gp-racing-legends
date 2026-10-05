import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Procedural low-poly GP bike + rider. Local frame: forward = -Z, up = +Y, right = +X. Ground contact at y=0.
const matCache = new Map();
function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) {
    const m = opts.standard ? new THREE.MeshStandardMaterial({ color, roughness: opts.rough ?? 0.45, metalness: opts.metal ?? 0.1, transparent: !!opts.opacity, opacity: opts.opacity ?? 1 })
      : new THREE.MeshLambertMaterial({ color, transparent: !!opts.opacity, opacity: opts.opacity ?? 1 });
    matCache.set(key, m);
  }
  return matCache.get(key);
}

function profileGeo(points, width, bevel = 0.04) {
  // points: [u (forward +), v (up)] — extruded across X, centred
  const sh = new THREE.Shape();
  sh.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) sh.lineTo(points[i][0], points[i][1]);
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: width, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 4 });
  g.rotateY(Math.PI / 2); // u -> -z, extrude(z) -> x
  g.translate(-width / 2, 0, 0);
  // the cap facing -X would show textures mirrored: flip its U
  const nrm = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < nrm.count; i++) if (nrm.getX(i) < -0.9) uv.setX(i, 1.0 - uv.getX(i));
  return g;
}

function numberTexture(num, bg, fg) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = bg; x.beginPath(); x.ellipse(64, 64, 60, 54, 0, 0, Math.PI * 2); x.fill();
  x.fillStyle = fg; x.font = 'italic 900 78px "Arial Black", Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(String(num), 64, 68);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function helmetTexture(h, num) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = h[0]; x.fillRect(0, 0, 256, 128);
  x.fillStyle = h[1]; x.fillRect(0, 48, 256, 22);
  x.fillStyle = h[2];
  for (let i = 0; i < 6; i++) { x.beginPath(); x.moveTo(i * 48, 0); x.lineTo(i * 48 + 20, 0); x.lineTo(i * 48 - 10, 48); x.lineTo(i * 48 - 30, 48); x.fill(); }
  x.fillRect(0, 70, 256, 6);
  x.fillStyle = h[1]; x.font = 'italic 900 30px Arial'; x.textAlign = 'center'; x.fillText(String(num), 64, 110); x.fillText(String(num), 192, 110);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function liveryTexture(colors, num, sponsor) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = colors[0]; x.fillRect(0, 0, 512, 256);
  x.fillStyle = colors[1];
  x.beginPath(); x.moveTo(0, 150); x.lineTo(512, 80); x.lineTo(512, 120); x.lineTo(0, 200); x.fill();
  x.fillStyle = colors[2]; x.fillRect(0, 230, 512, 26);
  x.beginPath(); x.moveTo(0, 200); x.lineTo(512, 120); x.lineTo(512, 130); x.lineTo(0, 210); x.fill();
  if (sponsor) { x.fillStyle = colors[1]; x.font = 'italic 900 40px Arial'; x.textAlign = 'center'; x.fillText(sponsor, 256, 60); }
  x.fillStyle = '#fff'; x.beginPath(); x.arc(400, 175, 38, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#111'; x.font = 'italic 900 50px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(num), 400, 178);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function mergeByMaterial(parts) {
  // parts: [{geo, mat}] -> meshes merged per material
  const groups = new Map();
  for (const p of parts) {
    let g = p.geo.index ? p.geo.toNonIndexed() : p.geo;
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!groups.has(p.mat)) groups.set(p.mat, []);
    groups.get(p.mat).push(g);
  }
  const meshes = [];
  for (const [m, gs] of groups) { const mg = mergeGeometries(gs, false); const mesh = new THREE.Mesh(mg, m); meshes.push(mesh); }
  return meshes;
}
function limb(a, b, r, seg = 6, scaleX = 1) {
  const A = new THREE.Vector3(...a), Bv = new THREE.Vector3(...b);
  const len = A.distanceTo(Bv);
  const g = new THREE.CylinderGeometry(r, r * 0.9, len, seg);
  if (scaleX !== 1) g.scale(scaleX, 1, 0.75);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), Bv.clone().sub(A).normalize());
  g.applyMatrix4(new THREE.Matrix4().compose(A.clone().add(Bv).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
  return g;
}
const T = (geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1)); geo.applyMatrix4(m); return geo; };

export function createBike({ livery, helmet, number, sponsor, detail = 1 }) {
  const root = new THREE.Group();
  const lean = new THREE.Group(); root.add(lean);
  const wheelie = new THREE.Group(); wheelie.position.z = 0.72; lean.add(wheelie);
  const body = new THREE.Group(); body.position.z = -0.72; wheelie.add(body);

  const cPrim = mat(livery[0], { standard: detail > 1, rough: 0.35, metal: 0.2 });
  const cSec = mat(livery[1], { standard: detail > 1, rough: 0.35, metal: 0.2 });
  const cDark = mat('#1a1a1c');
  const cTyre = mat('#111111');
  const cMetal = mat('#9aa0a8', { standard: true, metal: 0.8, rough: 0.3 });
  const cGold = mat('#c9a227', { standard: true, metal: 0.7, rough: 0.35 });
  const cScreen = mat('#223040', { opacity: 0.7 });
  const liveryTex = liveryTexture(livery, number, sponsor);
  const cLivery = new THREE.MeshLambertMaterial({ map: liveryTex });

  const R = 0.3; // wheel radius
  const parts = [];
  // main fairing side profile (u forward, v up) — nose at u≈+1.0
  const fairing = profileGeo([[1.0, 0.6], [0.84, 0.78], [0.62, 0.88], [0.32, 0.9], [0.1, 0.84], [-0.04, 0.62], [0.0, 0.34], [0.42, 0.2], [0.78, 0.3], [0.95, 0.46]], 0.34, 0.05);
  parts.push({ geo: fairing, mat: cLivery });
  // tank + seat + tail unit
  const tail = profileGeo([[0.6, 0.9], [0.36, 0.97], [0.1, 0.9], [-0.14, 0.83], [-0.44, 0.85], [-0.6, 0.95], [-0.82, 0.93], [-0.76, 0.8], [-0.4, 0.73], [0.0, 0.72], [0.5, 0.8]], 0.24, 0.035);
  parts.push({ geo: tail, mat: cPrim });
  // winglets + belly accent
  parts.push({ geo: T(new THREE.BoxGeometry(0.6, 0.02, 0.13), 0, 0.64, -0.86), mat: cSec });
  parts.push({ geo: T(new THREE.BoxGeometry(0.3, 0.05, 0.62), 0, 0.22, -0.3), mat: cSec });
  // swingarm, forks, bars, exhaust, engine
  parts.push({ geo: T(new THREE.BoxGeometry(0.2, 0.08, 0.62), 0, 0.33, 0.42, 0.12), mat: cDark });
  for (const sx of [-0.09, 0.09]) parts.push({ geo: limb([sx, 0.3, -0.74], [sx, 0.82, -0.56], 0.028, 6), mat: cGold });
  parts.push({ geo: T(new THREE.BoxGeometry(0.5, 0.03, 0.04), 0, 0.82, -0.58), mat: cDark });
  parts.push({ geo: limb([0.13, 0.42, 0.2], [0.14, 0.62, 0.72], 0.055, 8), mat: cMetal });
  parts.push({ geo: T(new THREE.BoxGeometry(0.27, 0.28, 0.4), 0, 0.42, -0.12), mat: cDark });
  for (const m of mergeByMaterial(parts)) { m.castShadow = true; body.add(m); }
  // windscreen bubble
  const scr = new THREE.Mesh(profileGeo([[0.6, 0.88], [0.84, 0.79], [0.66, 0.99], [0.44, 0.97]], 0.24, 0.02), cScreen); body.add(scr);

  // wheels (rotating)
  const wheelGeo = (() => {
    const ps = [];
    const tyre = new THREE.TorusGeometry(R - 0.05, 0.06, 6, detail > 1 ? 20 : 12); tyre.rotateY(Math.PI / 2); ps.push({ geo: tyre, mat: cTyre });
    const rim = new THREE.CylinderGeometry(R - 0.09, R - 0.09, 0.05, detail > 1 ? 16 : 10); rim.rotateZ(Math.PI / 2); ps.push({ geo: rim, mat: cDark });
    const disc = new THREE.CylinderGeometry(0.16, 0.16, 0.09, 12); disc.rotateZ(Math.PI / 2); ps.push({ geo: disc, mat: cMetal });
    ps.push({ geo: new THREE.BoxGeometry(0.06, 0.035, R * 1.6), mat: cGold });
    return ps;
  })();
  const mkWheel = () => { const g = new THREE.Group(); for (const m of mergeByMaterial(wheelGeo.map(p => ({ geo: p.geo.clone(), mat: p.mat })))) { m.castShadow = true; g.add(m); } return g; };
  const front = mkWheel(); front.position.set(0, R, -0.74); body.add(front);
  const rear = mkWheel(); rear.position.set(0, R, 0.72); body.add(rear);

  // front number plate
  const numTex = numberTexture(number, '#ffffff', '#111111');
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.16), new THREE.MeshLambertMaterial({ map: numTex, transparent: true }));
  plate.position.set(0, 0.7, -1.03); plate.rotation.y = Math.PI; plate.rotation.x = -0.55; body.add(plate);
  // tail number
  const tplate = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.15), plate.material);
  tplate.position.set(0, 0.9, -0.52 + 1.38); tplate.rotation.x = -0.3; body.add(tplate);

  // ---------------- rider (tucked) ----------------
  const rider = new THREE.Group(); body.add(rider);
  const suit = mat(livery[0]);
  const suit2 = mat(livery[2] || '#111');
  const rparts = [];
  rparts.push({ geo: limb([0, 0.92, 0.2], [0, 1.0, -0.24], 0.17, 8, 1.2), mat: suit }); // torso
  rparts.push({ geo: T(new THREE.BoxGeometry(0.18, 0.1, 0.26), 0, 1.06, 0.1, -0.18), mat: suit2 }); // aero hump
  rparts.push({ geo: T(new THREE.BoxGeometry(0.32, 0.16, 0.24), 0, 0.9, 0.24), mat: suit2 }); // hips
  for (const sx of [-1, 1]) {
    rparts.push({ geo: limb([sx * 0.17, 0.99, -0.2], [sx * 0.22, 0.86, -0.42], 0.05, 6), mat: suit });
    rparts.push({ geo: limb([sx * 0.22, 0.86, -0.42], [sx * 0.24, 0.82, -0.58], 0.045, 6), mat: suit });
    rparts.push({ geo: T(new THREE.BoxGeometry(0.08, 0.06, 0.09), sx * 0.24, 0.82, -0.6), mat: suit2 });
  }
  for (const m of mergeByMaterial(rparts)) { m.castShadow = true; rider.add(m); }
  const legs = [];
  for (const sx of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(sx * 0.14, 0.88, 0.22); rider.add(hip);
    const lp = mergeByMaterial([
      { geo: limb([0, 0, 0], [sx * 0.08, -0.22, -0.3], 0.075, 6), mat: suit },
      { geo: limb([sx * 0.08, -0.22, -0.3], [sx * 0.04, -0.46, 0.02], 0.058, 6), mat: suit },
      { geo: T(new THREE.BoxGeometry(0.08, 0.07, 0.08), sx * 0.11, -0.23, -0.32), mat: mat('#e8e8e8') },
      { geo: T(new THREE.BoxGeometry(0.09, 0.08, 0.2), sx * 0.04, -0.48, 0.07), mat: suit2 },
    ]);
    for (const m of lp) { m.castShadow = true; hip.add(m); }
    legs.push(hip);
  }
  const head = new THREE.Group(); head.position.set(0, 1.1, -0.36); rider.add(head);
  const hm = new THREE.Mesh(new THREE.SphereGeometry(0.145, detail > 1 ? 18 : 12, detail > 1 ? 12 : 8), new THREE.MeshLambertMaterial({ map: helmetTexture(helmet, number) }));
  hm.scale.set(1, 0.95, 1.12); hm.rotation.y = Math.PI / 2; hm.castShadow = true; head.add(hm);
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.147, 12, 6, Math.PI * 1.2, Math.PI * 0.6, Math.PI * 0.35, Math.PI * 0.28), mat('#0a0a12', { standard: true, metal: 0.9, rough: 0.1 }));
  visor.scale.set(1, 0.95, 1.12); head.add(visor);

  return {
    root, lean, wheelie, body, rider, legs, head, front, rear,
    // animation state
    anim: { lean: 0, pitch: 0, hang: 0, spin: 0 },
  };
}

// Smoothly animate the model given physical state. dt in seconds.
export function animateBike(m, { lean = 0, accel = 0, v = 0, dt = 0.016, crashed = false }) {
  const a = m.anim;
  const k = Math.min(1, dt * 8);
  a.lean += (lean - a.lean) * k;
  // pitch: braking dive (negative) / acceleration squat + wheelie (positive)
  let pTarget = 0;
  if (accel < -2) pTarget = Math.max(-0.05, accel * 0.004);
  else if (accel > 4 && v < 55 && Math.abs(a.lean) < 0.35) pTarget = Math.min(0.14, (accel - 4) * 0.03);
  a.pitch += (pTarget - a.pitch) * Math.min(1, dt * 5);
  a.hang += (a.lean - a.hang) * Math.min(1, dt * 5);
  m.lean.rotation.z = -a.lean;
  m.wheelie.rotation.x = Math.max(-0.05, a.pitch);
  // rider hangs off towards the inside, head tucks in
  const hang = Math.max(-1, Math.min(1, a.hang / 0.95));
  m.rider.position.x = hang * 0.22;
  m.rider.rotation.z = -hang * 0.18;
  m.rider.position.y = -Math.abs(hang) * 0.05;
  m.head.position.x = hang * 0.08;
  // inside knee out, outside leg tucked
  m.legs[0].rotation.z = hang < 0 ? Math.abs(hang) * 0.7 : 0;
  m.legs[1].rotation.z = hang > 0 ? -Math.abs(hang) * 0.7 : 0;
  // sit up under heavy braking
  m.rider.rotation.x = accel < -6 ? 0.12 : 0;
  a.spin += v * dt / 0.3;
  m.front.rotation.x = -a.spin; m.rear.rotation.x = -a.spin;
  if (crashed) { m.lean.rotation.z = 1.35; m.wheelie.rotation.x = 0; }
}
