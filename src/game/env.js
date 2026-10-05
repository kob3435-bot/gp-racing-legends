import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { mulberry } from './trackgeom.js';

// Sky, sun, ambient, fog, distant backdrop and an image-based-lighting environment map (PMREM) per race.
// Everything far away (sky, clouds, mountains) is drawn as a camera-centred backdrop so it never clips.

const GRAD_VS = `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }`;
const GRAD_FS = `uniform vec3 top; uniform vec3 hor; uniform vec3 bot; uniform vec3 sunDir; uniform vec3 sunCol; varying vec3 vDir;
void main(){ float y = vDir.y; vec3 c = y > 0.0 ? mix(hor, top, pow(clamp(y,0.0,1.0), 0.55)) : mix(hor, bot, clamp(-y*4.0,0.0,1.0));
  float s = max(0.0, dot(normalize(vDir), sunDir)); c += sunCol * (pow(s, 600.0) * 4.0 + pow(s, 12.0) * 0.18);
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function cloudTexture(seed, coverage) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 256; const x = c.getContext('2d');
  const r = mulberry(seed);
  x.clearRect(0, 0, 1024, 256);
  const blobs = Math.round(160 + coverage * 900);
  for (let i = 0; i < blobs; i++) {
    const px = r() * 1024, py = 40 + Math.pow(r(), 0.7) * 200, rad = 12 + r() * 46 * (0.6 + coverage);
    const g = x.createRadialGradient(px, py, 0, px, py, rad);
    const a = 0.10 + r() * 0.16;
    g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.beginPath(); x.ellipse(px, py, rad * 2.2, rad, 0, 0, Math.PI * 2); x.fill();
    // wrap horizontally so the dome is seamless
    if (px < 120) { x.save(); x.translate(1024, 0); x.beginPath(); x.ellipse(px, py, rad * 2.2, rad, 0, 0, Math.PI * 2); x.fill(); x.restore(); }
    if (px > 904) { x.save(); x.translate(-1024, 0); x.beginPath(); x.ellipse(px, py, rad * 2.2, rad, 0, 0, Math.PI * 2); x.fill(); x.restore(); }
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
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
  // sun direction
  const elev = THREE.MathUtils.degToRad(night ? 55 : theme.sky.elev), azim = THREE.MathUtils.degToRad(theme.sky.azim);
  const sunDir = new THREE.Vector3().setFromSphericalCoords(1, Math.PI / 2 - elev, azim);
  let horizon, skyMesh, skyForEnv;
  const mkGrad = (top, hor, bot, sunCol) => new THREE.ShaderMaterial({
    uniforms: { top: { value: new THREE.Color(top) }, hor: { value: new THREE.Color(hor) }, bot: { value: new THREE.Color(bot) }, sunDir: { value: sunDir }, sunCol: { value: new THREE.Color(sunCol) } },
    vertexShader: GRAD_VS, fragmentShader: GRAD_FS, side: THREE.BackSide, depthWrite: false, fog: false,
  });
  if (night) {
    horizon = new THREE.Color('#1a2236');
    const m = mkGrad('#02040a', '#1a2236', '#0a0c12', '#000000');
    skyMesh = new THREE.Mesh(new THREE.SphereGeometry(R, 32, 16), m);
    skyForEnv = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), m);
  } else if (wet || cloudy && heavy) {
    horizon = new THREE.Color(heavy ? '#6f767f' : '#8c939b');
    const m = mkGrad(heavy ? '#3c434c' : '#58616c', horizon.getStyle(), '#3a3f38', heavy ? '#000000' : '#202020');
    skyMesh = new THREE.Mesh(new THREE.SphereGeometry(R, 32, 16), m);
    skyForEnv = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), m);
  } else {
    const mk = () => {
      const sky = new Sky();
      const u = sky.material.uniforms;
      u.turbidity.value = cloudy ? theme.sky.turbidity * 1.6 + 4 : theme.sky.turbidity;
      u.rayleigh.value = cloudy ? 3.2 : theme.sky.rayleigh;
      u.mieCoefficient.value = cloudy ? 0.012 : 0.005; u.mieDirectionalG.value = 0.8;
      u.sunPosition.value.copy(sunDir);
      sky.material.depthWrite = false;
      return sky;
    };
    skyMesh = mk(); skyMesh.scale.setScalar(R * 0.9);
    skyForEnv = mk(); skyForEnv.scale.setScalar(450);
    horizon = new THREE.Color(cloudy ? '#b9c2cc' : theme.haze);
  }
  skyMesh.renderOrder = -10; skyMesh.frustumCulled = false; backdrop.add(skyMesh);
  // clouds
  if (!night && preset.q >= 1) {
    const cov = heavy ? 1 : wet ? 0.9 : cloudy ? 0.75 : 0.25;
    const tex = cloudTexture(seed * 7 + 3, cov);
    const cm = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, side: THREE.BackSide, opacity: wet ? 0.95 : 0.85 });
    cm.color.set(heavy ? '#7a8088' : wet ? '#a4aab2' : cloudy ? '#e4e8ee' : '#ffffff');
    const dome = new THREE.Mesh(new THREE.SphereGeometry(R * 0.8, 48, 12, 0, Math.PI * 2, 0, Math.PI * 0.48), cm);
    dome.renderOrder = -9; dome.frustumCulled = false; backdrop.add(dome);
    backdrop.userData.clouds = dome;
  }
  // stars
  if (night) {
    const r = mulberry(seed + 99); const n = 1800, p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const v = new THREE.Vector3().setFromSphericalCoords(R * 0.85, Math.acos(r() * 0.95), r() * Math.PI * 2); p.set([v.x, v.y, v.z], i * 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const stars = new THREE.Points(g, new THREE.PointsMaterial({ color: '#dfe8ff', size: 1.6, sizeAttenuation: false, fog: false, depthWrite: false }));
    stars.renderOrder = -9; stars.frustumCulled = false; backdrop.add(stars);
  }
  // distant mountains (tinted towards the haze colour = atmospheric perspective)
  const mtn = mountainRing(theme, horizon.getStyle(), seed, 2600);
  if (mtn) { backdrop.add(mtn); }
  scene.add(backdrop);

  // fog
  const fogFar = preset.draw * (heavy ? 0.42 : wet ? 0.6 : 1);
  scene.fog = new THREE.Fog(horizon.clone(), heavy ? 25 : 90, fogFar);

  // lights
  const sunColor = night ? new THREE.Color('#dfe6ff') : new THREE.Color().setHSL(0.1, 0.5, 0.92);
  const sunI = night ? 1.1 : heavy ? 0.45 : wet ? 0.75 : cloudy ? 1.2 : 2.2;
  const sun = new THREE.DirectionalLight(sunColor, sunI);
  sun.position.copy(sunDir).multiplyScalar(200);
  const hemi = new THREE.HemisphereLight(night ? '#7f8fc0' : wet ? '#aab4c0' : '#cfe3ff', night ? '#20201a' : new THREE.Color(theme.grass[0]).multiplyScalar(0.6), night ? 0.9 : wet ? 1.1 : cloudy ? 1.0 : 0.65);
  scene.add(sun, sun.target, hemi);

  // image based lighting from the sky (+ a ground disc so lower reflections aren't sky-blue)
  let envRT = null;
  if (preset.q >= 1) {
    const envScene = new THREE.Scene();
    envScene.add(skyForEnv);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(400, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(theme.grass[0]).multiplyScalar(night ? 0.08 : wet ? 0.25 : 0.4) }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -12; envScene.add(ground);
    if (night) { // floodlight banks show up as bright reflections on paint
      for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; const q = new THREE.Mesh(new THREE.PlaneGeometry(40, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 5.6, 4.8), side: THREE.DoubleSide })); q.position.set(Math.cos(a) * 200, 70, Math.sin(a) * 200); q.lookAt(0, 0, 0); envScene.add(q); }
    }
    const pm = new THREE.PMREMGenerator(renderer);
    envRT = pm.fromScene(envScene, 0.02, 1, 1200);
    pm.dispose();
    scene.environment = envRT.texture;
    scene.environmentIntensity = night ? 0.6 : wet ? 0.8 : 1.0;
    envScene.traverse(o => { if (o.geometry && o !== skyForEnv) o.geometry.dispose(); });
  }

  const shadowSize = preset.shadow;
  if (shadowSize) {
    sun.castShadow = true; sun.shadow.mapSize.set(shadowSize, shadowSize);
    const sc = sun.shadow.camera; const ext = preset.q >= 3 ? 34 : preset.q >= 2 ? 40 : 46;
    sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = 20; sc.far = 420;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  }
  const exposure = night ? 1.0 : heavy ? 1.0 : wet ? 0.95 : cloudy ? 0.9 : 0.78;
  const tmpTarget = new THREE.Vector3();
  return {
    backdrop, sun, hemi, horizon, sunDir, exposure, envRT, wet, night,
    // keep backdrop centred on camera and the shadow frustum snapped around the focus bike (stable, no shimmer)
    update(camera, focus) {
      backdrop.position.set(camera.position.x, yBase, camera.position.z);
      backdrop.scale.setScalar(Math.min(1, camera.far * 0.92 / 4000));
      if (backdrop.userData.clouds) backdrop.userData.clouds.rotation.y += 0.00002;
      if (focus) {
        const texel = (sun.shadow.camera.right - sun.shadow.camera.left) / Math.max(1, shadowSize || 1024);
        tmpTarget.set(Math.round(focus.x / texel) * texel, focus.y, Math.round(focus.z / texel) * texel);
        sun.target.position.copy(tmpTarget);
        sun.position.copy(tmpTarget).addScaledVector(sunDir, 200);
      }
    },
    dispose() {
      if (envRT) envRT.dispose();
      skyForEnv.geometry.dispose(); if (skyForEnv.material !== skyMesh.material) skyForEnv.material.dispose();
    },
  };
}
