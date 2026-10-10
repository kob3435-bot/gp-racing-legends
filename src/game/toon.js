import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Anime / cel-shading toolkit: stepped gradient ramps, shared toon materials (+ crisp rim light),
// and cheap inverted-hull ink outlines with screen-constant width that thins out with distance.

const ramps = {};
export function ramp(steps = 3) {
  if (ramps[steps]) return ramps[steps];
  const vals = steps === 2 ? [110, 255] : steps === 4 ? [70, 140, 205, 255] : [96, 186, 255];
  const data = new Uint8Array(vals.length * 4);
  vals.forEach((v, i) => data.set([v, v, v, 255], i * 4));
  const t = new THREE.DataTexture(data, vals.length, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true;
  return (ramps[steps] = t);
}

export const INK = new THREE.Color('#1a1426');
const rimU = { value: new THREE.Color('#fff4e0') };
export function setRimColor(c) { rimU.value.set(c); }

function addRim(m, strength) {
  m.userData.rim = strength;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uRimCol = rimU;
    sh.uniforms.uRim = { value: strength };
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uRimCol; uniform float uRim;')
      .replace('#include <opaque_fragment>', `{ float rf = 1.0 - saturate(dot(normal, normalize(vViewPosition)));
        outgoingLight += uRimCol * uRim * smoothstep(0.62, 0.72, rf) * diffuseColor.rgb; }
      #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'rim' + strength;
}

const matCache = new Map();
// shared toon material; identical params => same instance (fewer programs/state changes)
export function toonMat({ color = '#ffffff', map = null, vertexColors = false, transparent = false, opacity = 1, side = THREE.FrontSide, rim = 0, steps = 3, emissive = null, fog = true, depthWrite = true } = {}) {
  const c = new THREE.Color(color);
  const key = [c.getHexString(), map ? map.uuid : '', vertexColors, transparent, opacity.toFixed(2), side, rim, steps, emissive ? new THREE.Color(emissive).getHexString() : '', fog, depthWrite].join('|');
  let m = matCache.get(key);
  if (m) return m;
  m = new THREE.MeshToonMaterial({ color: c, map, vertexColors, transparent, opacity, side, gradientMap: ramp(steps), fog, depthWrite });
  if (emissive) m.emissive = new THREE.Color(emissive);
  if (rim) addRim(m, rim);
  m.userData.cached = true; m.userData.toon = true;
  matCache.set(key, m);
  return m;
}

// convert any lit material to its toon equivalent (keeps colour/map/vertex colours/transparency)
export function toToon(m, opts = {}) {
  if (!m || m.userData?.toon || m.userData?.noToon || m.isShaderMaterial || m.isPointsMaterial || m.isSpriteMaterial || m.isLineBasicMaterial || m.isMeshBasicMaterial) return m;
  const em = m.emissive && (m.emissive.r + m.emissive.g + m.emissive.b) > 0.05 ? m.emissive.clone().multiplyScalar(Math.min(1, m.emissiveIntensity ?? 1)) : null;
  return toonMat({ color: m.color || '#ffffff', map: m.map || null, vertexColors: !!m.vertexColors, transparent: !!m.transparent, opacity: m.opacity ?? 1, side: m.side, rim: opts.rim || 0, steps: opts.steps || 3, emissive: em, depthWrite: m.depthWrite !== false });
}

export function toonify(root, opts = {}) {
  const old = new Set();
  root.traverse((o) => {
    if (!o.isMesh || o.userData.outline) return;
    if (Array.isArray(o.material)) o.material = o.material.map(m => { const t = toToon(m, opts); if (t !== m) old.add(m); return t; });
    else { const t = toToon(o.material, opts); if (t !== o.material) { old.add(o.material); o.material = t; } }
  });
  for (const m of old) if (!m.userData?.cached) m.dispose();
  return root;
}

// ---------- ink outlines ----------
const OUT_VS = `
uniform float uWidth; uniform vec2 uRes;
#include <common>
#include <fog_pars_vertex>
void main() {
  vec4 p = vec4(position, 1.0); vec3 n = normal;
  #ifdef USE_INSTANCING
    p = instanceMatrix * p; n = mat3(instanceMatrix) * n;
  #endif
  vec4 mvPosition = modelViewMatrix * p;
  vec4 clip = projectionMatrix * mvPosition;
  vec3 vn = normalize(normalMatrix * n);
  vec2 dir = vn.xy; float l = length(dir); dir = l > 1e-4 ? dir / l : vec2(0.0);
  float w = uWidth * clamp(9.0 / max(clip.w, 0.1), 0.25, 1.0);
  clip.xy += dir * w * clip.w * 2.0 / uRes;
  gl_Position = clip;
  #include <fog_vertex>
}`;
const OUT_FS = `
uniform vec3 uColor;
#include <common>
#include <fog_pars_fragment>
void main() { gl_FragColor = vec4(uColor, 1.0);
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;
const outlineRes = { value: new THREE.Vector2(1280, 720) };
export function setOutlineResolution(w, h) { outlineRes.value.set(w, h); }
const outMats = new Map();
export function outlineMaterial(width = 2.2, color = INK) {
  const key = width + '|' + new THREE.Color(color).getHexString();
  let m = outMats.get(key);
  if (m) return m;
  m = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uWidth: { value: width }, uColor: { value: new THREE.Color(color) } }]),
    vertexShader: OUT_VS, fragmentShader: OUT_FS, side: THREE.BackSide, fog: true,
  });
  m.uniforms.uRes = outlineRes;
  m.userData.cached = true;
  outMats.set(key, m);
  return m;
}
// smooth (welded) normals so hard-edged parts don't get cracked outlines
const smoothCache = new WeakMap();
function smoothGeo(g) {
  let s = smoothCache.get(g);
  if (s) return s;
  const c = new THREE.BufferGeometry(); c.setAttribute('position', g.attributes.position); if (g.index) c.setIndex(g.index);
  s = mergeVertices(c, 1e-3); s.computeVertexNormals();
  s.userData.outlineOf = true;
  smoothCache.set(g, s);
  return s;
}
// adds an inverted hull child to each mesh under root (skips transparent/tiny parts)
export function addOutlines(root, { width = 2.2, color = INK, minSize = 0.04, filter = null } = {}) {
  const list = [];
  root.traverse((o) => { if (o.isMesh && !o.userData.outline && !(o.material && o.material.transparent) && (!filter || filter(o))) list.push(o); });
  const mat = outlineMaterial(width, color);
  for (const o of list) {
    const g = o.geometry; if (!g.boundingSphere) g.computeBoundingSphere();
    if (g.boundingSphere.radius < minSize) continue;
    const hull = o.isInstancedMesh ? new THREE.InstancedMesh(smoothGeo(g), mat, o.count) : new THREE.Mesh(smoothGeo(g), mat);
    if (o.isInstancedMesh) { hull.instanceMatrix = o.instanceMatrix; hull.count = o.count; }
    hull.userData.outline = true; hull.castShadow = false; hull.receiveShadow = false; hull.renderOrder = o.renderOrder;
    hull.frustumCulled = o.frustumCulled;
    o.add(hull);
  }
  return root;
}
export function disposeOutlineGeos(root) { root.traverse(o => { if (o.userData?.outline && o.geometry?.userData?.outlineOf) o.geometry.dispose(); }); }

// ---------- stylised sprite textures (shape based, hard edged) ----------
const texCache = {};
function canvasTex(key, size, draw) {
  if (texCache[key]) return texCache[key];
  const c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d'); draw(x, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.userData.cached = true;
  return (texCache[key] = t);
}
// cartoon puff: flat disc with a darker crescent and ink rim
export function puffTexture() {
  return canvasTex('puff', 64, (x, s) => {
    const r = s / 2;
    x.fillStyle = 'rgba(40,30,60,0.55)'; x.beginPath(); x.arc(r, r, r * 0.94, 0, 7); x.fill();
    x.fillStyle = '#ffffff'; x.beginPath(); x.arc(r, r, r * 0.84, 0, 7); x.fill();
    x.fillStyle = 'rgba(150,160,200,0.55)'; x.beginPath(); x.arc(r * 1.12, r * 1.16, r * 0.62, 0, 7); x.fill();
    x.fillStyle = '#ffffff'; x.beginPath(); x.arc(r * 0.86, r * 0.84, r * 0.56, 0, 7); x.fill();
  });
}
// four-point star for sparks / glints
export function starTexture() {
  return canvasTex('star', 64, (x, s) => {
    const r = s / 2; x.fillStyle = '#ffffff'; x.beginPath();
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, rr = i % 2 ? r * 0.18 : r * 0.98; x.lineTo(r + Math.cos(a) * rr, r + Math.sin(a) * rr); }
    x.closePath(); x.fill();
  });
}
// soft-edged round blob for contact shadows
export function blobTexture() {
  return canvasTex('blob', 64, (x, s) => {
    const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(20,14,40,0.75)'); g.addColorStop(0.55, 'rgba(20,14,40,0.6)'); g.addColorStop(1, 'rgba(20,14,40,0)');
    x.fillStyle = g; x.fillRect(0, 0, s, s);
  });
}
