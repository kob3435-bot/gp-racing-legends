import * as THREE from 'three';
import { mulberry } from './trackgeom.js';

// Sky, sun, ambient, fog, distant backdrop and an image-based-lighting environment map (PMREM) per race.
// Everything far away (sky, clouds, mountains) is drawn as a camera-centred backdrop so it never clips.

// painted anime sky: banded gradient, crisp sun disc with a soft halo
const GRAD_VS = `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }`;
const GRAD_FS = `uniform vec3 top; uniform vec3 hor; uniform vec3 bot; uniform vec3 sunDir; uniform vec3 sunCol; uniform float sunSize; varying vec3 vDir;
void main(){ vec3 d = normalize(vDir); float y = d.y;
  float t = pow(clamp(y, 0.0, 1.0), 0.5);
  vec3 c = y > 0.0 ? mix(hor, top, smoothstep(0.0, 1.0, t)) : mix(hor, bot, clamp(-y * 6.0, 0.0, 1.0));
  // soft painted band just above the horizon
  c = mix(c, hor * 1.06 + 0.04, smoothstep(0.12, 0.0, abs(y - 0.03)) * 0.5);
  float s = max(0.0, dot(d, sunDir));
  c += sunCol * (smoothstep(sunSize - 0.0006, sunSize, s) * 1.4 + smoothstep(0.96, 1.0, s) * 0.35 + pow(s, 8.0) * 0.12);
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;

// stylised cumulus: stacked hard-edged circles, white tops, lilac-blue shaded bellies, flat base
function cumulusTexture(seed, tint) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; const x = c.getContext('2d');
  const r = mulberry(seed); const blobs = [];
  const n = 7 + Math.floor(r() * 5);
  for (let i = 0; i < n; i++) { const px = 40 + r() * 176, rad = 16 + r() * 26 * (1 - Math.abs(px - 128) / 160); blobs.push([px, 100 - rad * (0.5 + r() * 0.6), rad]); }
  const x0 = Math.min(...blobs.map(b => b[0])), x1 = Math.max(...blobs.map(b => b[0]));
  const draw = (fill, dx, dy, grow) => { x.fillStyle = fill; for (const [px, py, rad] of blobs) { x.beginPath(); x.arc(px + dx, py + dy, rad + grow, 0, 7); x.fill(); }
    x.beginPath(); x.ellipse((x0 + x1) / 2 + dx, 92 + dy, (x1 - x0) / 2 + 12 + grow, 10 + grow, 0, 0, 7); x.fill(); };
  x.save(); x.beginPath(); x.rect(0, 0, 256, 104); x.clip();
  draw(tint[2], 0, 0, 2.5);      // soft outline
  draw(tint[1], 0, 0, 0);        // shaded body
  draw(tint[0], -5, -7, -3);     // lit tops
  x.restore();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function glareTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
  x.translate(128, 128);
  const g = x.createRadialGradient(0, 0, 0, 0, 0, 128); g.addColorStop(0, 'rgba(255,250,230,0.9)'); g.addColorStop(0.18, 'rgba(255,240,200,0.35)'); g.addColorStop(1, 'rgba(255,230,190,0)');
  x.fillStyle = g; x.fillRect(-128, -128, 256, 256);
  x.fillStyle = 'rgba(255,250,235,0.55)';
  for (let i = 0; i < 6; i++) { x.rotate(Math.PI / 3); x.beginPath(); x.moveTo(-4, 0); x.lineTo(0, -126); x.lineTo(4, 0); x.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function mountainRing(theme, haze, seed, radius) {
  const m = theme.mountains; if (!m) return null;
  const r = mulberry(seed);
  const seg = 160, pos = [], col = [], idx = [];
  const base = new THREE.Color(m.color), hz = new THREE.Color(haze), snow = new THREE.Color('#f4f7fb'), cc = new THREE.Color();
  const ph = [r() * 6, r() * 6, r() * 6, r() * 6];
  const scale = radius / 2600;
  for (let layer = 0; layer < 2; layer++) {
    const R = radius * (layer ? 0.97 : 0.9), H = m.h * scale * (layer ? 1.0 : 0.55), off = pos.length / 3;
    for (let i = 0; i <= seg; i++) {
      const a = i / seg * Math.PI * 2;
      let h = 0.5 + 0.28 * Math.sin(a * 3 + ph[0] + layer) + 0.18 * Math.sin(a * 7 + ph[1]) + 0.1 * Math.sin(a * 17 + ph[2]) + 0.06 * Math.sin(a * 37 + ph[3]);
      h = Math.max(0.05, h) * H;
      pos.push(Math.cos(a) * R, -20 * scale, Math.sin(a) * R, Math.cos(a) * R, h, Math.sin(a) * R);
      const fade = layer ? 0.62 : 0.4; // farther ridge is hazier
      cc.copy(base).lerp(hz, fade + 0.25); col.push(cc.r, cc.g, cc.b);
      const top = m.snow && h > H * 0.62 ? snow.clone().lerp(hz, fade * 0.6) : base.clone().lerp(hz, fade);
      col.push(top.r, top.g, top.b);
      if (i > 0) { const a0 = off + (i - 1) * 2; idx.push(a0, a0 + 2, a0 + 1, a0 + 1, a0 + 2, a0 + 3); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx);
  const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, depthWrite: false, side: THREE.DoubleSide }));
  mesh.renderOrder = -8; mesh.frustumCulled = false;
  return mesh;
}

export function buildEnvironment(renderer, scene, { theme, weather, night, preset, seed = 1, yBase = 0 }) {
  const wet = weather === 'LIGHT_RAIN' || weather === 'HEAVY_RAIN';
  const heavy = weather === 'HEAVY_RAIN';
  const cloudy = weather === 'CLOUDY';
  const backdrop = new THREE.Group(); backdrop.name = 'backdrop';
  const R = 4000;
  const elev = THREE.MathUtils.degToRad(night ? 55 : theme.sky.elev), azim = THREE.MathUtils.degToRad(theme.sky.azim);
  const sunDir = new THREE.Vector3().setFromSphericalCoords(1, Math.PI / 2 - elev, azim);
  // anime palette: saturated blue zenith -> pale cyan horizon (themes tint the horizon)
  const haze = new THREE.Color(theme.haze);
  let top, hor, bot, sunCol = '#fff6dc', sunSize = 0.9994;
  if (night) { top = '#070b22'; hor = '#2a2f5c'; bot = '#141428'; sunCol = '#000000'; }
  else if (heavy) { top = '#4c5876'; hor = '#9aa3b8'; bot = '#545a66'; sunCol = '#000000'; }
  else if (wet) { top = '#5f7499'; hor = '#b6bfd2'; bot = '#5d6470'; sunCol = '#202020'; }
  else if (cloudy) { top = '#4f86d6'; hor = '#c9daf0'; bot = '#7b8a80'; sunCol = '#a09080'; }
  else { top = '#2f7fe8'; hor = new THREE.Color('#bfe6ff').lerp(haze, 0.35).getStyle(); bot = '#7ea07a'; }
  const horizon = new THREE.Color(hor);
  const skyMat = new THREE.ShaderMaterial({
    uniforms: { top: { value: new THREE.Color(top) }, hor: { value: horizon.clone() }, bot: { value: new THREE.Color(bot) }, sunDir: { value: sunDir }, sunCol: { value: new THREE.Color(sunCol) }, sunSize: { value: sunSize } },
    vertexShader: GRAD_VS, fragmentShader: GRAD_FS, side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const skyMesh = new THREE.Mesh(new THREE.SphereGeometry(R, 24, 12), skyMat);
  skyMesh.renderOrder = -10; skyMesh.frustumCulled = false; backdrop.add(skyMesh);
  const disposables = [skyMesh.geometry, skyMat];

  // cumulus billboards, merged into ONE mesh (quads face the dome centre = the camera)
  if (!night) {
    const r = mulberry(seed * 13 + 5);
    const count = heavy ? 26 : wet ? 22 : cloudy ? 22 : preset.q >= 1 ? 13 : 9;
    const tint = heavy ? ['#b6bccb', '#8c93a6', 'rgba(70,72,96,0.6)'] : wet ? ['#e2e6f0', '#aab2c6', 'rgba(90,96,130,0.5)'] : ['#ffffff', '#c8d4f2', 'rgba(120,130,190,0.45)'];
    const variants = 4, texs = [];
    // atlas of 4 cloud shapes stacked vertically
    const atlas = document.createElement('canvas'); atlas.width = 256; atlas.height = 128 * variants; const ax = atlas.getContext('2d');
    for (let v = 0; v < variants; v++) { const t = cumulusTexture(seed * 31 + v * 7, tint); ax.drawImage(t.image, 0, v * 128); t.dispose(); texs.push(v); }
    const tex = new THREE.CanvasTexture(atlas); tex.colorSpace = THREE.SRGBColorSpace;
    const pos = [], uv = [], idx = [];
    const up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3(), right = new THREE.Vector3(), upv = new THREE.Vector3(), cpos = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      const az = (i / count) * Math.PI * 2 + r() * 0.4, el = 0.035 + Math.pow(r(), 1.6) * 0.22;
      dir.setFromSphericalCoords(1, Math.PI / 2 - el, az);
      const dist = R * (0.62 + r() * 0.12); cpos.copy(dir).multiplyScalar(dist);
      right.crossVectors(up, dir).normalize(); upv.crossVectors(dir, right).normalize();
      const w = dist * (0.16 + r() * 0.16) * (cloudy || wet ? 1.4 : 1), h = w * 0.5;
      const v = Math.floor(r() * variants), b = pos.length / 3;
      for (const [sx, sy] of [[-1, 0], [1, 0], [1, 1], [-1, 1]]) {
        pos.push(cpos.x + right.x * sx * w / 2 + upv.x * sy * h, cpos.y + right.y * sx * w / 2 + upv.y * sy * h - h * 0.12, cpos.z + right.z * sx * w / 2 + upv.z * sy * h);
        uv.push(sx < 0 ? 0 : 1, 1 - (v + 1 - sy) / variants);
      }
      idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    const cm = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide });
    const clouds = new THREE.Mesh(g, cm); clouds.renderOrder = -9; clouds.frustumCulled = false; backdrop.add(clouds);
    backdrop.userData.clouds = clouds; disposables.push(g, cm, tex);
    // stylised sun glare
    if (!wet && !cloudy) {
      const gm = new THREE.SpriteMaterial({ map: glareTexture(), transparent: true, depthWrite: false, depthTest: false, fog: false, blending: THREE.AdditiveBlending, opacity: 0.8 });
      const glare = new THREE.Sprite(gm); glare.position.copy(sunDir).multiplyScalar(R * 0.8); glare.scale.setScalar(R * 0.34); glare.renderOrder = -8;
      backdrop.add(glare); disposables.push(gm.map, gm);
    }
  }
  // stars
  if (night) {
    const r = mulberry(seed + 99); const n = 900, p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const v = new THREE.Vector3().setFromSphericalCoords(R * 0.85, Math.acos(r() * 0.95), r() * Math.PI * 2); p.set([v.x, v.y, v.z], i * 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const sm = new THREE.PointsMaterial({ color: '#f1f4ff', size: 2, sizeAttenuation: false, fog: false, depthWrite: false });
    const stars = new THREE.Points(g, sm);
    stars.renderOrder = -9; stars.frustumCulled = false; backdrop.add(stars); disposables.push(g, sm);
  }
  const mtn = mountainRing(theme, horizon.getStyle(), seed, 2600);
  if (mtn) { backdrop.add(mtn); disposables.push(mtn.geometry, mtn.material); }
  scene.add(backdrop);

  // fog = painted atmospheric perspective towards the horizon colour
  const fogFar = preset.draw * (heavy ? 0.45 : wet ? 0.65 : 1);
  scene.fog = new THREE.Fog(horizon.clone(), heavy ? 30 : 120, fogFar);

  // lights: one key light + hemisphere fill (toon ramps do the rest). No env maps.
  const sunColor = night ? new THREE.Color('#e4e8ff') : new THREE.Color('#fff3df');
  const sunI = night ? 1.5 : heavy ? 1.1 : wet ? 1.4 : cloudy ? 1.9 : 2.6;
  const sun = new THREE.DirectionalLight(sunColor, sunI);
  sun.position.copy(sunDir).multiplyScalar(200);
  const hemi = new THREE.HemisphereLight(night ? '#8a96d8' : wet ? '#c4cee0' : '#d8ecff', night ? '#2a2440' : new THREE.Color(theme.grass[0]).lerp(new THREE.Color('#8070a0'), 0.4), night ? 1.3 : wet ? 1.6 : cloudy ? 1.5 : 1.25);
  scene.add(sun, sun.target, hemi);
  scene.environment = null;

  const shadowSize = preset.shadow;
  if (shadowSize) {
    sun.castShadow = true; sun.shadow.mapSize.set(shadowSize, shadowSize);
    const sc = sun.shadow.camera; const ext = 30;
    sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = 20; sc.far = 420;
    sun.shadow.bias = -0.0012; sun.shadow.normalBias = 0.08;
  }
  const tmpTarget = new THREE.Vector3();
  return {
    backdrop, sun, hemi, horizon, sunDir, exposure: 1, envRT: null, wet, night,
    update(camera, focus) {
      backdrop.position.set(camera.position.x, yBase, camera.position.z);
      backdrop.scale.setScalar(Math.min(1, camera.far * 0.92 / 4000));
      if (backdrop.userData.clouds) backdrop.userData.clouds.rotation.y += 0.00003;
      if (focus) {
        const texel = (sun.shadow.camera.right - sun.shadow.camera.left) / Math.max(1, shadowSize || 1024);
        tmpTarget.set(Math.round(focus.x / texel) * texel, focus.y, Math.round(focus.z / texel) * texel);
        sun.target.position.copy(tmpTarget);
        sun.position.copy(tmpTarget).addScaledVector(sunDir, 200);
      }
    },
    dispose() { for (const d of disposables) d.dispose(); },
  };
}
