import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { TRACK_BY_ID } from '../data/tracks.js';
import { riderLivery, riderTeamName, displayName, shortName } from '../data/riders.js';
import { TEAM_BY_ID } from '../data/teams.js';
import { MANUFACTURER_BY_ID } from '../data/manufacturers.js';
import { buildTrackGeometry, toWorld, trackOutline } from './trackgeom.js';
import { trackSceneStages, buildRacingLine, gridSlots } from './trackScene.js';
import { createBike, animateBike, poseRider } from './bikeModel.js';
import { Race } from './race.js';
import { speedProfile, WEATHER, POINTS } from './perf.js';
import { Input } from './input.js';
import { audio } from './audio.js';
import { Hud, fmtTime } from '../ui/hud.js';
import { buildEnvironment } from './env.js';
import { Post, DynRes } from './post.js';
import { FX, Confetti } from './fx.js';
import { themeOf } from './themes.js';

// lodNear: distance (m) within which bikes use the full model; fx: max particle-emitter distance
export const PRESETS = {
  LOW: { q: 0, pr: 0.75, shadow: 0, draw: 800, rain: 400, lines: 40, lodNear: 40, fx: 45 },
  MEDIUM: { q: 1, pr: 1, shadow: 1024, draw: 1300, rain: 1000, lines: 60, lodNear: 70, fx: 80 },
  HIGH: { q: 2, pr: 1.25, shadow: 2048, draw: 1900, rain: 1800, lines: 90, lodNear: 100, fx: 120 },
  ULTRA: { q: 3, pr: 1.75, shadow: 4096, draw: 2600, rain: 2800, lines: 120, lodNear: 150, fx: 160 },
};
const PRESET_ORDER = ['LOW', 'MEDIUM', 'HIGH', 'ULTRA'];
const CAMS = ['chase', 'far', 'helmet', 'tv'];
const geoCache = new Map();
export function getGeo(id) { if (!geoCache.has(id)) geoCache.set(id, buildTrackGeometry(TRACK_BY_ID[id])); return geoCache.get(id); }
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
// critically damped spring (implicit integration: stable for any dt)
function crit(o, key, target, omega, dt) {
  const vk = key + 'V', x = o[key], v = o[vk] || 0;
  const f = 1 + 2 * dt * omega, hoo = dt * omega * omega, det = 1 / (f + dt * hoo);
  o[key] = (f * x + dt * v + dt * hoo * target) * det; o[vk] = (v + hoo * (target - x)) * det;
}
const TIPS = [
  'Watch the SLIPSTREAM gauge: tuck in behind a rival on the straights, then pull out before the braking zone.',
  'Purple sector = fastest of anyone. Green = your personal best. Yellow = slower.',
  'In MANUAL mode, braking hard while leaned over can tuck the front. Brake upright, then release as you turn in.',
  'Late brakers dive up the inside — leave the door open and you can switch back on the exit.',
  'Rain: the racing line is greasy. Smooth inputs and earlier braking keep you upright.',
  'Press C (or CAM) to cycle cameras. Helmet cam gives the biggest sense of speed.',
  'Dynamic resolution keeps the frame rate steady — toggle it in Settings › Graphics.',
];
function outlineSvg(def) {
  const pts = trackOutline(def, 6); let mnx = 1e9, mxx = -1e9, mny = 1e9, mxy = -1e9;
  for (const [x, y] of pts) { mnx = Math.min(mnx, x); mxx = Math.max(mxx, x); mny = Math.min(mny, y); mxy = Math.max(mxy, y); }
  const S = 200, sc = (S - 20) / Math.max(mxx - mnx, mxy - mny), ox = (S - (mxx - mnx) * sc) / 2, oy = (S - (mxy - mny) * sc) / 2;
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${((x - mnx) * sc + ox).toFixed(1)} ${((y - mny) * sc + oy).toFixed(1)}`).join('') + 'Z';
  return `<svg viewBox="0 0 ${S} ${S}"><path d="${d}" fill="none" stroke="rgba(225,6,0,.35)" stroke-width="12" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/></svg>`;
}

export class Game {
  constructor(canvas, hudRoot, settings) {
    this.canvas = canvas; this.settings = settings;
    // AA comes from the post chain (MSAA render target / FXAA); LOW renders straight to the canvas without AA
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, stencil: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.info.autoReset = false; // post passes would otherwise reset the per-frame counters
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 3000);
    this.input = new Input();
    this.hud = new Hud(hudRoot);
    this.hudRoot = hudRoot;
    this.clock = new THREE.Clock();
    this.state = 'menu';
    this.timeScale = 1;
    this.fps = 60; this.fpsAcc = 0; this.fpsFrames = 0; this.lowFpsWindows = 0;
    this.post = new Post(this.renderer); this.dyn = new DynRes(58); this.dynScale = 1;
    this.loadToken = 0; this.time = 0;
    this._tw = {}; this._v1 = new THREE.Vector3(); this._v2 = new THREE.Vector3(); this._v3 = new THREE.Vector3(); this._look = new THREE.Vector3();
    this.cs = { yaw: 0, back: 5, up: 1.8, roll: 0, fov: 60 };
    this.__anim = (m, lean, v = 30) => animateBike(m, { lean, v, dt: 0.05, near: true }); // debug/screenshot hook
    this.buildShowroom();
    this.applyGraphics(settings.graphics);
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }
  get preset() { return PRESETS[this.settings.graphics] || PRESETS.HIGH; }
  applyPixelRatio() {
    const p = this.preset;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, p.pr) * (this.dynScale || 1));
    this.resize();
  }
  applyGraphics(name) {
    this.settings.graphics = name;
    const p = this.preset;
    this.dynScale = 1; this.dyn.scale = 1;
    this.renderer.shadowMap.enabled = p.shadow > 0;
    if (this.sun) { this.sun.castShadow = p.shadow > 0; if (p.shadow) { this.sun.shadow.mapSize.set(p.shadow, p.shadow); if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; } } }
    if (this.scene && this.scene.fog) { this.scene.fog.far = p.draw * (this.fogF || 1); this.camera.far = Math.max(5000, p.draw + 800); this.camera.updateProjectionMatrix(); }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, p.pr));
    this.resize();
    this.post.configure(p, this.scene || this.show.scene, this.camera);
    if (this.fx && this.scene) { /* particle budgets are rebuilt with the next race */ }
  }
  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.post.resize();
    this.mobile = (navigator.maxTouchPoints > 0 && Math.min(w, h) < 820);
  }
  render(dt) {
    const scene = this.state === 'menu' ? this.show.scene : this.scene;
    if (!scene) return;
    this.renderer.info.reset();
    if (this.post.enabled) { if (this.post.scene !== scene) this.post.setScene(scene, this.camera); this.post.render(dt); }
    else this.renderer.render(scene, this.camera);
  }

  // ---------------- menu showroom (studio with reflective floor + light strips) ----------------
  buildShowroom() {
    const s = new THREE.Scene();
    s.background = new THREE.Color('#090a0d');
    s.fog = new THREE.Fog('#090a0d', 9, 26);
    const pm = new THREE.PMREMGenerator(this.renderer);
    this.studioEnv = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose();
    s.environment = this.studioEnv; s.environmentIntensity = 0.45;
    s.add(new THREE.HemisphereLight('#ffffff', '#202024', 0.6));
    const key = new THREE.DirectionalLight('#ffffff', 2.4); key.position.set(4, 7, 3); key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
    const sc = key.shadow.camera; sc.left = -3; sc.right = 3; sc.top = 3; sc.bottom = -3; sc.near = 1; sc.far = 20; key.shadow.bias = -0.0005; key.shadow.normalBias = 0.02;
    s.add(key);
    const rim = new THREE.DirectionalLight('#ff3020', 3.0); rim.position.set(-5, 2.5, -4); s.add(rim);
    const rim2 = new THREE.DirectionalLight('#6aa8ff', 1.4); rim2.position.set(5, 1.5, -5); s.add(rim2);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(14, 64), new THREE.MeshStandardMaterial({ color: '#101115', roughness: 0.22, metalness: 0.65 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; s.add(floor);
    const table = new THREE.Mesh(new THREE.CylinderGeometry(2.25, 2.3, 0.06, 64), new THREE.MeshStandardMaterial({ color: '#17181d', roughness: 0.3, metalness: 0.8 }));
    table.position.y = 0.03; table.receiveShadow = true; s.add(table);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.27, 0.018, 8, 96), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.12, 0.05) }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.065; s.add(ring);
    // overhead light strips (bloom + paint reflections)
    for (let k = -1; k <= 1; k++) { const st = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.04, 0.12), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3, 3.2) })); st.position.set(0, 4.2, k * 1.1); s.add(st); }
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(11, 11, 8, 64, 1, true), new THREE.MeshStandardMaterial({ color: '#0d0e12', roughness: 0.9, side: THREE.BackSide }));
    wall.position.y = 4; s.add(wall);
    for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; const b = new THREE.Mesh(new THREE.BoxGeometry(0.06, 5, 0.06), new THREE.MeshBasicMaterial({ color: new THREE.Color(k % 3 ? 1.2 : 3.5, k % 3 ? 1.2 : 0.15, k % 3 ? 1.3 : 0.08) })); b.position.set(Math.cos(a) * 10.8, 2.6, Math.sin(a) * 10.8); s.add(b); }
    this.show = { scene: s, bike: null, rot: 0, t: 0, key };
  }
  showroom(rider) {
    this.state = 'menu';
    const sh = this.show;
    if (this.post.scene !== sh.scene) this.post.setScene(sh.scene, this.camera);
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    if (sh.riderId === rider?.id) return;
    if (sh.bike) sh.scene.remove(sh.bike.root);
    if (!rider) return;
    const team = TEAM_BY_ID[rider.team];
    sh.bike = createBike({ livery: riderLivery(rider), helmet: rider.helmet, number: rider.number, sponsor: team?.sponsor, detail: this.preset.q >= 1 ? 2 : 1 });
    sh.bike.root.position.y = 0.06;
    sh.bike.root.traverse(o => { if (o.isMesh) o.castShadow = true; });
    sh.scene.add(sh.bike.root); sh.riderId = rider.id;
  }
  renderShowroom(dt) {
    const sh = this.show; sh.rot += dt * 0.32; sh.t += dt;
    if (sh.bike) {
      sh.bike.root.rotation.y = sh.rot;
      const lean = Math.sin(sh.t * 0.9) * 0.42;
      animateBike(sh.bike, { lean, accel: 0, v: 4, dt, near: true });
    }
    const narrow = window.innerWidth < window.innerHeight * 1.2;
    const drift = Math.sin(sh.t * 0.17) * 0.35;
    const dist = narrow ? 5.3 : 4.7;
    this.camera.position.set(Math.sin(drift) * dist, 1.25 + Math.sin(sh.t * 0.23) * 0.12, Math.cos(drift) * dist);
    this.camera.fov = 40; this.camera.updateProjectionMatrix();
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(narrow ? 0 : -1.15, 0.62, 0);
    if (this.post.enabled) this.post.setLook({ bloom: 0.28, vignette: 0.4, saturation: 1.05, contrast: 1.05 });
    this.render(dt);
  }

  // ---------------- loading screen ----------------
  showLoading(track, cfg) {
    document.querySelectorAll('#loading').forEach(n => n.remove());
    const w = WEATHER[cfg.weather] || { icon: '', label: '' };
    const div = document.createElement('div'); div.id = 'loading';
    div.innerHTML = `<div class="ld-track">${outlineSvg(track)}</div><div class="ld-round">${cfg.title || 'QUICK RACE'}</div><h1>${track.name}</h1>
      <div class="ld-meta">${track.country} · ${(track.length / 1000).toFixed(2)} km · ${cfg.laps} LAP${cfg.laps > 1 ? 'S' : ''} · ${w.icon} ${w.label}${track.night ? ' · NIGHT RACE' : ''}</div>
      <div class="ld-bar"><i></i></div><div class="ld-label">Loading</div><div class="ld-tip">TIP · ${TIPS[(Math.random() * TIPS.length) | 0]}</div>`;
    document.body.appendChild(div);
    const bar = div.querySelector('.ld-bar i'), lab = div.querySelector('.ld-label');
    return {
      set: (p, label) => { bar.style.width = Math.round(p * 100) + '%'; if (label) lab.textContent = label; },
      done: () => { bar.style.width = '100%'; div.classList.add('out'); setTimeout(() => div.remove(), 500); },
    };
  }

  // ---------------- race setup (async, staged, with progress) ----------------
  async startRace(cfg, cb) {
    const token = ++this.loadToken;
    this.closeT = 0;
    this.disposeRace();
    audio.ensure(); audio.stopMusic();
    this.cb = cb; this.cfg = cfg; this.state = 'loading';
    const track = TRACK_BY_ID[cfg.trackId];
    const ld = this.showLoading(track, cfg);
    const alive = () => token === this.loadToken;
    ld.set(0.04, 'Preparing circuit'); await nextFrame(); if (!alive()) return;
    const geo = getGeo(cfg.trackId);
    const weather = cfg.weather;
    const wetAmt = WEATHER[weather].wet;
    const night = !!track.night;
    const p = this.preset;
    const theme = themeOf(track);
    const scene = new THREE.Scene();
    let ysum = 0; for (let i = 0; i < geo.N; i += 8) ysum += geo.y[i]; const yavg = ysum / Math.ceil(geo.N / 8);
    this.camera.far = Math.max(5000, p.draw + 800); this.camera.updateProjectionMatrix();
    const env = buildEnvironment(this.renderer, scene, { theme, weather, night, preset: p, seed: track.id.length * 31 + geo.N, yBase: yavg });
    ld.set(0.12, 'Lighting the sky'); await nextFrame(); if (!alive()) { env.dispose(); return; }
    const it = trackSceneStages(geo, { quality: p.q, weather, night, theme });
    let r;
    while (!(r = it.next()).done) { ld.set(0.12 + r.value.p * 0.55, r.value.label); await nextFrame(); if (!alive()) { env.dispose(); return; } }
    const ts = r.value; scene.add(ts.group);
    // race logic
    const race = new Race({ geo, track, laps: cfg.laps, weather, difficulty: cfg.difficulty, control: this.settings.control, gearMode: this.settings.gear, playerTire: cfg.playerTire, entrants: cfg.entrants, spectator: !!cfg.spectator, seed: cfg.seed });
    race.wallD = ts.wall;
    const order = race.qualify();
    race.placeOnGrid(order, gridSlots(geo, race.entrants.length));
    // bikes, a few per frame
    const detail = p.q >= 2 ? 2 : p.q === 1 ? 1 : 0;
    const bikes = [];
    for (let k = 0; k < race.entrants.length; k++) {
      const e = race.entrants[k], team = TEAM_BY_ID[e.rider.team];
      const m = createBike({ livery: riderLivery(e.rider), helmet: e.rider.helmet, number: e.rider.number, sponsor: team?.sponsor, detail, tyre: e.tire });
      if (p.shadow === 0) m.root.traverse(o => { if (o.isMesh) o.castShadow = false; });
      scene.add(m.root); bikes.push(m);
      if (k % 4 === 3) { ld.set(0.68 + 0.2 * k / race.entrants.length, 'Rolling out the bikes'); await nextFrame(); if (!alive()) { env.dispose(); return; } }
    }
    // commit
    this.scene = scene; this.env = env; this.ts = ts; this.geo = geo; this.track = track; this.race = race; this.bikes = bikes;
    this.wet = wetAmt > 0; this.wetAmt = wetAmt; this.night = night; this.theme = theme; this.weather = weather;
    this.sun = env.sun; this.fogF = scene.fog.far / p.draw;
    this.renderer.shadowMap.enabled = p.shadow > 0;
    this.renderer.toneMappingExposure = env.exposure;
    if (race.player && this.settings.line !== 'OFF') {
      const prof = speedProfile(geo, geo.lineK, race.player.eff);
      this.lineMesh = buildRacingLine(geo, prof, this.settings.line);
      if (this.lineMesh) scene.add(this.lineMesh);
    }
    this.buildRain(weather);
    this.buildSpeedLines();
    this.fx = new FX(scene, p.q);
    this.focus = race.player || race.order[0];
    this.camMode = cfg.spectator ? 'tv' : this.settings.camera;
    this.camInit = false;
    this.tvCams = this.buildTvCams();
    this.post.setScene(scene, this.camera);
    ld.set(0.9, 'Warming up tyres'); await nextFrame(); if (!alive()) return;
    // pre-compile shaders so the first race frames don't hitch
    try {
      if (this.renderer.extensions.has('KHR_parallel_shader_compile')) await Promise.race([this.renderer.compileAsync(scene, this.camera), sleep(2500)]);
      else this.renderer.compile(scene, this.camera);
    } catch { /* optional */ }
    if (!alive()) return;
    this.hud.build({ race, geo, mobile: this.mobile, spectator: !!cfg.spectator, manual: this.settings.control === 'MANUAL', settings: this.settings, onPause: () => this.pause(), onCamera: () => this.cycleCamera(), input: this.input });
    this.input.tiltOn = !!this.settings.tilt;
    audio.setVolume({ master: this.settings.master, engine: this.settings.engine, sfx: this.settings.sfx });
    audio.stopAll();
    if (audio.ctx) {
      audio.startAmbience(wetAmt);
      if (race.player) this.playerVoice = audio.makeEngine(MANUFACTURER_BY_ID[race.player.bike.manufacturer]?.engine || 'V4', 1);
      this.aiVoices = [audio.makeEngine('V4', 0.55), audio.makeEngine('I4', 0.55)];
    }
    this.state = 'intro'; this.introT = 0; this.finishT = 0; this.paused = false; this.acc = 0; this.alpha = 1;
    this.battleCd = 10; this.lastLeader = null; this.flash = 0; this.lastContactT = -9; this.nearMissCd = 0; this.finishers = []; this.shake = 0;
    this.dyn.scale = 1; this.dynScale = 1; this.applyPixelRatio();
    ld.done();
    this.showIntroCard();
    window.__gp = { game: this, race };
  }

  showIntroCard() {
    const r = this.race, t = this.track, w = WEATHER[r.weather];
    const pole = r.order[0], me = r.player;
    const card = (e, label) => `<div class="icard"><div class="ic-l">${label}</div><div class="ic-n"><span class="num" style="background:${e.rider.helmet[0]};color:${e.rider.helmet[1]}">${e.rider.number}</span>${displayName(e.rider)}</div><div class="ic-t">${riderTeamName(e.rider)} · OVR ${e.rider.ovr}</div></div>`;
    const div = document.createElement('div'); div.className = 'intro'; div.id = 'intro';
    div.innerHTML = `<div class="intro-top"><div class="it-round">${this.cfg.title || 'QUICK RACE'}</div><h1>${t.name}</h1><div class="it-meta">${t.country} · ${(r.geo.L / 1000).toFixed(2)} km · ${r.laps} LAP${r.laps > 1 ? 'S' : ''} · ${w.icon} ${w.label} · ${t.character.join(' / ').toUpperCase()}</div></div>
      <div class="intro-cards">${card(pole, 'POLE POSITION · ' + fmtTime(r.qualiTimes[0].time))}${me && me !== pole ? card(me, 'YOU START P' + me.gridPos) : ''}</div>
      <button class="btn primary skip" id="intro-skip">START ▶</button>`;
    this.hudRoot.appendChild(div);
    this.hudRoot.querySelector('.hud').classList.add('hidden');
    div.querySelector('#intro-skip').onclick = () => this.endIntro();
  }
  endIntro() {
    if (this.state !== 'intro') return;
    const el = document.getElementById('intro'); if (el) el.remove();
    const h = this.hudRoot.querySelector('.hud'); if (h) h.classList.remove('hidden');
    this.state = 'start'; this.camInit = false;
  }

  buildRain(weather) {
    const w = WEATHER[weather].wet; if (!w) { this.rain = null; return; }
    const n = Math.round(this.preset.rain * (0.5 + w * 0.5));
    const pos = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) { const x = (Math.random() - 0.5) * 60, y = Math.random() * 30, z = (Math.random() - 0.5) * 60; pos.set([x, y, z, x + 0.05, y - 0.9, z], i * 6); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#c8d4e0', transparent: true, opacity: 0.4, depthWrite: false }));
    this.rain.frustumCulled = false; this.scene.add(this.rain);
  }
  buildSpeedLines() {
    const n = this.preset.lines; const pos = new Float32Array(n * 6); this.slData = [];
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, r = 1.6 + Math.random() * 3.5; this.slData.push({ x: Math.cos(a) * r, y: Math.sin(a) * r * 0.7, z: -Math.random() * 30, len: 1.5 + Math.random() * 3 }); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.speedLines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
    this.speedLines.frustumCulled = false; this.speedLines.renderOrder = 10;
    this.camera.add(this.speedLines); this.scene.add(this.camera);
  }
  buildTvCams() {
    const g = this.geo, out = [];
    for (let s = 0; s < g.L; s += 260) {
      const i = Math.floor(s / g.ds); const side = (Math.floor(s / 260) % 2) ? 1 : -1; const d = side * (g.halfW + 26);
      out.push({ s, pos: new THREE.Vector3(g.x[i] + g.rx[i] * d, g.y[i] + 7 + (i % 3) * 3, g.z[i] + g.rz[i] * d) });
    }
    return out;
  }
  cycleCamera() {
    const i = CAMS.indexOf(this.camMode); this.camMode = CAMS[(i + 1) % CAMS.length]; this.camInit = false;
    if (!this.cfg.spectator) { this.settings.camera = this.camMode; this.onSettingsChanged && this.onSettingsChanged(); }
    this.hud.note(this.camMode.toUpperCase() + ' CAM', 'small', 1);
  }
  pause() {
    if (!this.race || this.state === 'results' || this.state === 'podium' || this.paused) return;
    this.paused = true;
    const div = document.createElement('div'); div.className = 'pause-menu'; div.id = 'pause';
    div.innerHTML = `<div class="panel"><h2>PAUSED</h2>
      <button class="btn primary" data-a="resume">RESUME</button>
      <button class="btn" data-a="restart">RESTART RACE</button>
      <button class="btn" data-a="cam">CAMERA: ${this.camMode.toUpperCase()}</button>
      ${this.race.player ? `<button class="btn" data-a="line">RACING LINE: ${this.settings.line}</button>` : ''}
      <button class="btn danger" data-a="quit">QUIT TO MENU</button></div>`;
    this.hudRoot.appendChild(div);
    div.onclick = (ev) => {
      const a = ev.target.dataset.a; if (!a) return; audio.click();
      if (a === 'resume') this.resume();
      if (a === 'restart') { this.resume(); this.cb.onRestart && this.cb.onRestart(); }
      if (a === 'cam') { this.cycleCamera(); ev.target.textContent = 'CAMERA: ' + this.camMode.toUpperCase(); }
      if (a === 'line') {
        const order = ['OFF', 'BRAKING', 'FULL']; this.settings.line = order[(order.indexOf(this.settings.line) + 1) % 3]; ev.target.textContent = 'RACING LINE: ' + this.settings.line;
        if (this.lineMesh) { this.scene.remove(this.lineMesh); this.lineMesh.geometry.dispose(); this.lineMesh = null; }
        if (this.settings.line !== 'OFF') { this.lineMesh = buildRacingLine(this.geo, speedProfile(this.geo, this.geo.lineK, this.race.player.eff), this.settings.line); this.scene.add(this.lineMesh); }
        this.onSettingsChanged && this.onSettingsChanged();
      }
      if (a === 'quit') { this.resume(); this.quit(); }
    };
    if (audio.ctx) audio.ctx.suspend();
  }
  resume() { this.paused = false; const el = document.getElementById('pause'); if (el) el.remove(); if (audio.ctx) audio.ctx.resume(); this.clock.getDelta(); }
  quit() { this.disposeRace(); this.state = 'menu'; this.cb && this.cb.onQuit && this.cb.onQuit(); }

  disposeRace() {
    audio.stopAll();
    document.querySelectorAll('#loading').forEach(n => n.remove());
    if (this.scene) {
      const seen = new Set();
      this.scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          const ms = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of ms) {
            if (seen.has(m)) continue; seen.add(m);
            for (const k of ['map', 'normalMap', 'roughnessMap', 'emissiveMap']) { const t = m[k]; if (t && !t.userData.cached) t.dispose(); }
            m.dispose();
          }
        }
      });
      if (this.speedLines) this.camera.remove(this.speedLines);
    }
    if (this.camera.parent) this.camera.parent.remove(this.camera);
    if (this.env) this.env.dispose();
    if (this.fx) this.fx.dispose();
    if (this.confetti) this.confetti.dispose();
    this.scene = null; this.race = null; this.bikes = []; this.lineMesh = null; this.playerVoice = null; this.aiVoices = []; this.env = null; this.fx = null; this.confetti = null; this.podium = null;
    this.hudRoot.innerHTML = '';
  }

  // ---------------- per-frame ----------------
  loop() {
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.1, this.clock.getDelta());
    this.time += dt;
    this.trackFps(dt);
    if (this.state === 'loading') return;
    if (this.state === 'menu' || !this.scene) { if (this.state === 'menu') this.renderShowroom(dt); return; }
    if (this.paused) { this.render(0); return; }
    if (this.input.consume('pause')) { this.pause(); return; }
    if (this.input.consume('camera') && this.state !== 'podium') this.cycleCamera();
    const race = this.race;
    if (this.state === 'podium') { this.updatePodium(dt); return; }
    if (this.cfg.spectator) {
      if (this.input.consume('focusNext') || this.input.consume('focusPrev')) {
        const i = race.order.indexOf(this.focus), nx = (i + 1) % race.order.length;
        this.focus = race.order[nx]; this.hud.lower(this.focus, ` · P${this.focus.pos}`); this.lowerT = 4; this.camInit = false;
      }
    }
    const ui = this.input.read();
    if (this.cfg.spectator) { if (ui.steer !== 0 && !this.specSteerLatch) { const i = race.order.indexOf(this.focus); this.focus = race.order[(i + (ui.steer > 0 ? 1 : race.order.length - 1)) % race.order.length]; this.hud.lower(this.focus, ` · P${this.focus.pos}`); this.lowerT = 4; this.camInit = false; } this.specSteerLatch = ui.steer !== 0; }
    if (this.state === 'intro') {
      this.introT += dt;
      if (ui.steer !== 0 || ui.throttle > 0 || this.introT > 7.5) this.endIntro();
    }
    if (this.state === 'start' || this.state === 'race' || this.state === 'finished') {
      // fixed-timestep simulation; rendering interpolates between the last two steps
      const step = 1 / 120;
      this.acc += dt * this.timeScale;
      race.lodS = this.focus.s;
      let n = 0;
      const E = race.entrants;
      while (this.acc >= step && n < 240) {
        for (let k = 0; k < E.length; k++) { const e = E[k]; e.ps = e.s; e.pd = e.d; e.ppsi = e.psi; e.plean = e.lean; }
        race.step(step, this.state === 'finished' ? {} : ui); this.acc -= step; n++; ui.shiftUp = ui.shiftDown = ui.reset = false;
      }
      this.alpha = n ? Math.min(1, this.acc / step) : this.alpha;
      if (race.phase === 'race' && this.state === 'start') this.state = 'race';
      this.handleEvents();
      if (this.state === 'race') this.checkFinish(dt);
      if (this.state === 'finished') { this.finishT += dt; if (this.finishT > (this.cfg.spectator ? 3 : 3.2)) this.startPodium(); }
    }
    if (!this.race || !this.scene || this.state === 'podium' || this.state === 'results') return;
    this.updateVisuals(dt);
    this.updateCamera(dt);
    this.frameCommon(dt);
    this.updateAudio(dt);
    if (this.state !== 'intro') this.hud.update(dt, this.focus, this.camMode);
    if (this.lowerT > 0) { this.lowerT -= dt; if (this.lowerT <= 0) this.hud.lower(null); }
    this.render(dt);
  }
  // per-frame bits shared by race + podium
  frameCommon(dt) {
    const fb = this.bikes[this.race.entrants.indexOf(this.focus)];
    this.env.update(this.camera, fb ? fb.root.position : null);
    this.ts.update(this.time);
    const scale = this.renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2));
    this.fx.update(dt, scale);
    if (this.settings.dynRes !== false && this.state !== 'intro') { const s = this.dyn.update(dt); if (s) { this.dynScale = s; this.applyPixelRatio(); } }
    this.flash = Math.max(0, (this.flash || 0) - dt * 2.5);
  }

  trackFps(dt) {
    this.fpsAcc += dt; this.fpsFrames++;
    if (this.fpsAcc >= 4) {
      this.fps = this.fpsFrames / this.fpsAcc; this.fpsAcc = 0; this.fpsFrames = 0;
      const dynHeadroom = this.settings.dynRes !== false && this.dynScale > this.dyn.min + 0.01;
      if (this.settings.autoGfx && (this.state === 'race') && !this.paused && document.visibilityState === 'visible' && !dynHeadroom) {
        const threshold = this.mobile ? 27 : 42;
        if (this.fps < threshold) this.lowFpsWindows++; else this.lowFpsWindows = 0;
        const idx = PRESET_ORDER.indexOf(this.settings.graphics);
        if (this.lowFpsWindows >= 2 && idx > 0) {
          this.applyGraphics(PRESET_ORDER[idx - 1]); this.lowFpsWindows = 0;
          this.hud.note('GRAPHICS AUTO-ADJUSTED: ' + this.settings.graphics, 'small', 2.5);
          this.onSettingsChanged && this.onSettingsChanged();
        }
      }
      if (this.fpsEl) this.fpsEl.textContent = Math.round(this.fps) + ' FPS' + (this.dynScale < 0.999 ? ` · ${Math.round(this.dynScale * 100)}%` : '');
    }
  }

  handleEvents() {
    const race = this.race, hud = this.hud, focus = this.focus;
    for (const ev of race.events) {
      switch (ev.type) {
        case 'light': hud.lights(ev.n, false); audio.blip(440, 0.18, 'sine', 0.2); break;
        case 'go': hud.lights(0, true); audio.blip(880, 0.4, 'sine', 0.25); setTimeout(() => this.hud && hud.lights(0, false), 1200); for (const l of this.ts.lights) l.color.set('#2a0000'); audio.cheer(1.2); break;
        case 'shift': if (ev.e.isPlayer) audio.shift(this.playerVoice, ev.up); break;
        case 'fastest':
          if (race.t - race.goTime > 10) { hud.note(`FASTEST LAP · ${ev.e.rider.name.toUpperCase()} ${fmtTime(ev.time)}`, 'purple', 3); if (ev.e === focus) hud.pop('BEST LAP', 'purple', fmtTime(ev.time), 2.2); }
          break;
        case 'lap':
          if (ev.e.isPlayer && ev.e.lap < race.laps) hud.note(`LAP ${ev.e.lap} · ${fmtTime(ev.time)}`, 'small', 2);
          if (ev.e === focus && ev.e.lapTimes.length > 1 && ev.time <= ev.e.bestLap && (!race.fastestLap || race.fastestLap.time < ev.time)) hud.pop('PERSONAL BEST', 'green', fmtTime(ev.time), 2);
          break;
        case 'sector': if (ev.e === focus) { hud.sector(ev.k, ev.cls); if (ev.cls === 'purple' && race.t - race.goTime > 20) hud.pop(`S${ev.k + 1} · PURPLE`, 'purple', '', 1.2); } break;
        case 'finalLap': hud.note('FINAL LAP', 'white', 2.5); break;
        case 'position': {
          const o = ev.other, nm = o ? shortName(o.rider) : '';
          if (ev.to < ev.from) {
            const clean = race.t - this.lastContactT > 2.5, close = o && Math.abs(race.player.d - o.d) < 1.35;
            hud.pop(`OVERTAKE · P${ev.to}`, 'green', o ? `${close && clean ? 'CLOSE PASS' : clean ? 'CLEAN PASS' : 'PASSED'} ON ${nm}` : '', 1.8);
            if (this.crowdNear > 0.3) audio.cheer(0.8);
          } else hud.note(`P${ev.to}  ▼${ev.to - ev.from}${nm ? ' · ' + nm : ''}`, 'red', 1.6);
          break;
        }
        case 'mistake': {
          const L = this.geo.L; let dl = (ev.e.s - focus.s) % L; if (dl > L / 2) dl -= L; if (dl < -L / 2) dl += L;
          if (Math.abs(dl) < 250 && ev.e !== focus) hud.pop(`${shortName(ev.e.rider)} ${ev.kind === 'LOCK-UP' ? 'LOCKS UP!' : 'RUNS WIDE!'}`, 'red', '', 1.4);
          break;
        }
        case 'finish': {
          const prev = this.finishers[this.finishers.length - 1];
          this.finishers.push(ev.e);
          if (prev && ev.e.finishTime - prev.finishTime < 0.05 && (this.finishers.length <= 3 || ev.e.isPlayer || prev.isPlayer)) {
            hud.note(`PHOTO FINISH! ${shortName(prev.rider)} BY ${((ev.e.finishTime - prev.finishTime) * 1000).toFixed(0)} ms`, 'photo', 3.5); this.flash = 1; audio.cheer(1.5);
          }
          if (this.finishers.length === 1) audio.cheer(1.4);
          break;
        }
        case 'crash':
          if (ev.e.isPlayer) { hud.note(ev.kind === 'HIGHSIDE' ? 'HIGHSIDE!' : 'CRASH! (R to reset)', 'red', 2.5); audio.thud(0.6); this.shake = 1; }
          else if (Math.abs(ev.e.s - focus.s) < 400 || ev.e.pos <= 5) hud.note(`${ev.e.rider.name.toUpperCase()} IS DOWN!`, 'red', 2.5);
          { const m = this.bikes[ev.e.idx]; if (m && this.fx && m.root.visible) this.fx.burst(m.root.position, this.theme.sand ? [0.75, 0.62, 0.45] : [0.55, 0.5, 0.42], 26); }
          break;
        case 'bump': case 'contact': audio.thud(0.25); this.shake = 0.5; this.lastContactT = race.t; break;
      }
    }
    if (race.phase === 'lights') this.ts.lights.forEach((l, i) => { if (i < race.lightsOn) l.color.setRGB(7, 0.25, 0.12); else l.color.set('#2a0000'); });
    race.events.length = 0;
    this.battleCd -= 1 / 60;
    if (race.phase === 'race' && race.t - race.goTime > 15 && this.battleCd <= 0 && race.order.length > 1) {
      const a = race.order[0], b = race.order[1];
      if (!a.finished && race.gap(a, b) < 0.35) { hud.note('BATTLE FOR P1', 'white', 2.5); this.battleCd = 30; }
    }
  }

  checkFinish(dt) {
    const race = this.race;
    if (race.player) {
      if (!race.player.finished && race.entrants.every(e => e.finished || e.isPlayer)) {
        this.closeT = (this.closeT || 0) + dt * this.timeScale;
        if (this.closeT > 30) { this.closeT = 0; race.projectFinish(); this.hud.note('RACE CLOSED', 'white', 3); }
      }
      if (race.player.finished) { race.autopilot = true; this.state = 'finished'; this.finishT = 0; this.hud.note(race.player.pos === 1 ? 'WINNER!' : `FINISHED P${race.player.pos}`, race.player.pos <= 3 ? 'gold' : 'white', 3.5); this.toWinnerCam(); }
    } else if (race.order[0].finished) { this.state = 'finished'; this.finishT = 0; this.hud.note(`${race.order[0].rider.name.toUpperCase()} WINS!`, 'gold', 3); this.toWinnerCam(); }
  }
  toWinnerCam() { this.focus = this.race.order[0]; this.camMode = 'tv'; this.camInit = false; }

  // ---------------- podium celebration ----------------
  startPodium() {
    if (this.state === 'podium' || this.state === 'results') return;
    const race = this.race, geo = this.geo; race.projectFinish();
    this.state = 'podium'; this.podT = 0;
    const N = geo.N; let ksum = 0; for (let i = 0; i < N; i++) ksum += geo.kappa[i];
    const side = ksum > 0 ? 1 : -1;
    const i0 = ((Math.round(-70 / geo.ds) % N) + N) % N, d = side * (geo.halfW + 9);
    const c = new THREE.Vector3(geo.x[i0] + geo.rx[i0] * d, geo.y[i0], geo.z[i0] + geo.rz[i0] * d);
    const face = Math.atan2(-geo.rx[i0] * side, -geo.rz[i0] * side); // podium front faces the track
    const g = new THREE.Group(); g.position.copy(c); g.rotation.y = face;
    const stepMat = new THREE.MeshStandardMaterial({ color: '#f2f3f5', roughness: 0.4, metalness: 0.1 });
    const numTex = (n) => { const cv = document.createElement('canvas'); cv.width = cv.height = 128; const x = cv.getContext('2d'); x.fillStyle = '#e10600'; x.fillRect(0, 0, 128, 128); x.fillStyle = '#fff'; x.font = 'italic 900 96px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(n, 64, 70); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; };
    const H = [1.2, 0.85, 0.6], X = [0, -2.6, 2.6];
    for (let k = 0; k < 3; k++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(2.4, H[k], 2.2), stepMat); b.position.set(X[k], H[k] / 2, 0); b.castShadow = b.receiveShadow = true; g.add(b);
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), new THREE.MeshBasicMaterial({ map: numTex(String(k + 1)) })); pl.position.set(X[k], H[k] / 2, 1.111); g.add(pl);
    }
    const back = new THREE.Mesh(new THREE.BoxGeometry(9.5, 4.2, 0.2), new THREE.MeshStandardMaterial({ map: (() => { const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 448; const x = cv.getContext('2d'); x.fillStyle = '#0b0d12'; x.fillRect(0, 0, 1024, 448); for (let i = 0; i < 4; i++) for (let j = 0; j < 8; j++) { x.fillStyle = (i + j) % 2 ? '#e10600' : '#ffd400'; x.font = 'italic 900 30px Arial'; x.fillText(['NOVARA ENERGY', 'GP LEGENDS', 'TIDECORE OIL', 'KITE WATCHES'][(i + j) % 4], j * 128 - (i % 2) * 64, 70 + i * 110); } const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; })(), roughness: 0.6 }));
    back.position.set(0, 2.1, -1.6); g.add(back);
    this.scene.add(g); g.updateMatrixWorld(true);
    const top = race.order.slice(0, 3);
    this.bikes.forEach(m => { m.root.visible = false; });
    this.podium = { group: g, center: c.clone().add(new THREE.Vector3(0, 1.3, 0)), face, top, models: [] };
    top.forEach((e, k) => {
      const m = this.bikes[e.idx]; m.root.visible = true; m.setLOD(0);
      const p = new THREE.Vector3(X[k], H[k] + 0.02, 0.1).applyMatrix4(g.matrixWorld);
      m.root.position.copy(p); m.root.rotation.y = face + Math.PI + (k === 0 ? 0.0 : k === 1 ? 0.35 : -0.35) + Math.PI / 2;
      m.lean.rotation.z = 0; m.wheelie.rotation.x = 0; m.anim.lean = 0;
      this.podium.models.push(m);
    });
    this.confetti = new Confetti(this.scene, [300, 700, 1100, 1500][this.preset.q]);
    // overlay
    const hudEl = this.hudRoot.querySelector('.hud'); if (hudEl) hudEl.classList.add('hidden');
    const div = document.createElement('div'); div.id = 'podium';
    const nm = (e, k) => `<div class="pd-n p${k + 1}"><i>${k + 1}</i><b>${displayName(e.rider)}</b><span>${riderTeamName(e.rider)}${k ? ' · +' + (e.finishTime - top[0].finishTime).toFixed(3) : ''}</span></div>`;
    div.innerHTML = `<div class="pd-top"><small>${this.track.name}</small><h2>${race.player && top[0] === race.player ? 'VICTORY!' : displayName(top[0].rider).toUpperCase() + ' WINS'}</h2></div>
      <div class="pd-names">${top[1] ? nm(top[1], 1) : ''}${nm(top[0], 0)}${top[2] ? nm(top[2], 2) : ''}</div>
      <button class="btn primary" id="podium-skip">RESULTS ▶</button>`;
    this.hudRoot.appendChild(div);
    div.querySelector('#podium-skip').onclick = () => { audio.click(); this.showResults(); };
    audio.stopEngines(); audio.cheer(2);
    this.renderer.toneMappingExposure = this.env.exposure;
  }
  updatePodium(dt) {
    const P = this.podium; if (!P) return;
    this.podT += dt; const t = this.podT;
    P.models.forEach((m, k) => {
      const cel = k === 0 ? 0.75 + 0.25 * Math.sin(t * 4) : 0.4 + 0.3 * Math.sin(t * 3 + k);
      poseRider(m, 0, 0, Math.sin(t * 0.8 + k) * 0.35, 0, Math.min(1, t * 1.5) * cel);
    });
    const a = P.face + Math.PI / 2 + Math.sin(t * 0.25) * 0.7 - 0.2;
    const r = 9 - Math.min(2.5, t * 0.4);
    // orbit in front of the podium (podium front faces local +z rotated by face)
    const fx = Math.sin(P.face), fz = Math.cos(P.face);
    const ox = Math.sin(a - P.face - Math.PI / 2) * 0.9;
    this.camera.position.set(P.center.x + (fx + ox * fz) * r, P.center.y + 1.6 + Math.sin(t * 0.5) * 0.4, P.center.z + (fz - ox * fx) * r);
    this.camera.up.set(0, 1, 0); this.camera.lookAt(P.center.x, P.center.y + 0.5, P.center.z);
    this.camera.fov = 45; this.camera.updateProjectionMatrix();
    const scale = this.renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2));
    this.confetti.update(dt, scale, P.center);
    this.env.update(this.camera, P.center); this.ts.update(this.time); this.fx.update(dt, scale);
    if (this.post.enabled) this.post.setLook({ bloom: 0.45, vignette: 0.38, saturation: 1.12, contrast: 1.08, flash: this.flash });
    this.flash = Math.max(0, this.flash - dt * 2);
    if (audio.amb) audio.setWind(0, 1);
    this.render(dt);
    if (t > 7.5) this.showResults();
  }

  showResults() {
    if (this.state === 'results') return;
    this.state = 'results';
    const pd = document.getElementById('podium'); if (pd) pd.remove();
    const race = this.race; race.projectFinish();
    const leader = race.order[0];
    const fl = race.fastestLap;
    const results = race.order.map((e, k) => ({
      pos: k + 1, riderId: e.rider.id, rider: e.rider, isPlayer: e.isPlayer, team: riderTeamName(e.rider), bike: e.bike.name,
      time: e.finishTime, gap: e.finishTime - leader.finishTime, bestLap: e.bestLap, points: POINTS[k] || 0, grid: e.gridPos, projected: !!e.projected,
      fastest: fl && fl.e === e,
    }));
    const summary = { trackId: this.cfg.trackId, laps: race.laps, weather: race.weather, results, fastestLap: fl ? { riderId: fl.rider.id, name: fl.rider.name, time: fl.time } : null, distanceKm: race.player ? Math.min(race.player.s, race.laps * race.geo.L) / 1000 : 0, overtakes: race.overtakes };
    audio.stopAll();
    this.cb.onResults && this.cb.onResults(summary);
  }

  // ---------------- visuals: interpolation, LOD, effects ----------------
  updateVisuals(dt) {
    const race = this.race, geo = this.geo, tmp = this._tw, a = this.alpha ?? 1;
    const camP = this.camera.position, p = this.preset;
    const drawSq = (p.draw * 0.55) ** 2, lodSq = p.lodNear * p.lodNear, fxSq = p.fx * p.fx;
    const E = race.entrants;
    for (let k = 0; k < E.length; k++) {
      const e = E[k], m = this.bikes[k];
      let s = e.s, d = e.d, psi = e.psi, lean = e.lean;
      if (e.ps !== undefined && Math.abs(e.s - e.ps) < 30) { s = e.ps + (e.s - e.ps) * a; d = e.pd + (e.d - e.pd) * a; psi = e.ppsi + (e.psi - e.ppsi) * a; lean = e.plean + (e.lean - e.plean) * a; }
      toWorld(geo, s, d, tmp);
      m.root.position.set(tmp.x, tmp.y + 0.02, tmp.z);
      const hb = tmp.heading + psi;
      m.root.rotation.y = Math.atan2(-Math.cos(hb), -Math.sin(hb));
      const dsq = (tmp.x - camP.x) ** 2 + (tmp.z - camP.z) ** 2;
      const visible = dsq < drawSq;
      m.root.visible = visible;
      if (!visible) { m.lastGear = e.gear; continue; }
      const near = dsq < lodSq || e === this.focus;
      m.setLOD(near ? 0 : 1);
      const brk = e.brake || (e.accel < -4 ? Math.min(1, -e.accel / 12) : 0);
      animateBike(m, { lean: e.crashT > 0 ? 0 : lean, accel: e.accel, v: e.v, dt, crashed: e.crashT > 0, brake: brk, near });
      if (dsq < fxSq) this.bikeFx(e, m, dt, k, lean, dsq);
      m.lastGear = e.gear;
    }
    if (this.rain) { this.rain.position.set(camP.x, camP.y - 8, camP.z); this.rainOff = ((this.rainOff || 0) + dt * 24) % 30; this.rain.position.y -= this.rainOff - 15; }
    // near-miss detection for the player
    const pl = race.player; this.nearMissCd -= dt;
    if (pl && this.nearMissCd <= 0 && pl.crashT <= 0 && pl.v > 25) {
      for (const o of E) {
        if (o === pl || o.crashT > 0) continue;
        const ds = o.s - pl.s, dd = Math.abs(o.d - pl.d);
        if (Math.abs(ds) < 1.0 && dd > 0.84 && dd < 1.15 && Math.abs(o.v - pl.v) > 2.5 && race.t - this.lastContactT > 1.5) { this.hud.pop('NEAR MISS', 'gold', '', 1.2); this.nearMissCd = 6; break; }
      }
    }
  }
  bikeFx(e, m, dt, k, lean, dsq) {
    const fx = this.fx, v = e.v, race = this.race, geo = this.geo;
    const th = m.root.rotation.y, sn = Math.sin(th), cs = Math.cos(th), P = m.root.position;
    const fwX = -sn, fwZ = -cs, vx = fwX * v, vz = fwZ * v;
    const rear = this._v1.set(P.x + 0.72 * sn, P.y + 0.02, P.z + 0.72 * cs);
    // rain spray off the rear tyre
    if (this.wetAmt > 0 && v > 12) { const n = fx.n('sp' + k, v * 0.8 * this.wetAmt, dt); for (let i = 0; i < n; i++) fx.spray(rear, vx, vz, this.wetAmt); }
    // gravel / grass dust
    if (Math.abs(e.d) > geo.halfW + 4.5 && v > 4) { const n = fx.n('du' + k, 25 + v * 1.2, dt); for (let i = 0; i < n; i++) fx.dust(rear, vx, vz); }
    // tyre smoke: AI lock-ups (front), player locking the front in manual, launch wheelspin (rear)
    if (!this.wet) {
      let sm = 0, at = rear;
      if (e.lockup > 0.2) { sm = e.lockup; at = this._v2.set(P.x - 0.74 * sn, P.y + 0.02, P.z - 0.74 * cs); }
      else if (e.isPlayer && !race.autopilot && race.ctl.crash && e.brake > 0.92 && v > 25) { sm = 0.5; at = this._v2.set(P.x - 0.74 * sn, P.y + 0.02, P.z - 0.74 * cs); }
      else if (race.goTime !== null && race.t - race.goTime < 1.6 && e.started && v > 0.5 && v < 20 && (k % 3 === 0 || e.isPlayer)) sm = 0.45;
      if (sm > 0) { const n = fx.n('sm' + k, 38 * sm, dt); for (let i = 0; i < n; i++) fx.tyreSmoke(at, vx, vz, sm); }
    }
    // sparks: knee slider / footpeg touching down at extreme lean (per-rider phase so not everyone sparks)
    const al = Math.abs(lean);
    if (al > 0.93 && v > 22 && e.crashT <= 0 && ((k * 7 + Math.floor(race.t * 2)) % 5 < 2)) {
      const sd = Math.sign(lean), rx = cs, rz = -sn; // bike right vector
      const pt = this._v3.set(P.x + rx * sd * 0.62, P.y + 0.04, P.z + rz * sd * 0.62);
      const n = fx.n('sk' + k, (al - 0.93) * 260, dt); for (let i = 0; i < n; i++) fx.sparks(pt, vx * 0.85, vz * 0.85);
      if (n && e.isPlayer && Math.random() < 0.3) audio.scrape(0.08);
    }
    // backfire on downshift (exhaust exit at local (0.14, 0.75, 0.88))
    if (m.lastGear !== undefined && e.gear < m.lastGear && v > 12 && e.accel < 0) {
      const ex = this._v2.set(P.x + 0.14 * cs + 0.88 * sn, P.y + 0.75, P.z - 0.14 * sn + 0.88 * cs);
      fx.flame(ex, vx - fwX * 3, vz - fwZ * 3);
      if (!e.isPlayer && dsq < 35 * 35 && Math.random() < 0.6) audio.crackle(null, (1 - Math.sqrt(dsq) / 35) * 0.6, 3);
    }
  }

  updateCamera(dt) {
    const race = this.race, cam = this.camera, cs = this.cs;
    const e = this.focus; const m = this.bikes[race.entrants.indexOf(e)];
    if (!m) return;
    const bp = m.root.position, v = e.v;
    const sp = clamp((v - 20) / 70, 0, 1);
    cam.up.set(0, 1, 0);
    let fovT = 60, blur = 0;
    if (this.state === 'intro') {
      const g = this.geo, t = this.introT, ease = t / 7.5;
      const s = 420 - t * 62; const i = ((Math.floor(s / g.ds) % g.N) + g.N) % g.N;
      const side = Math.sin(t * 0.4) * 30;
      cam.position.set(g.x[i] + g.rx[i] * side, g.y[i] + 34 - ease * 24, g.z[i] + g.rz[i] * side);
      cam.lookAt(g.x[0], g.y[0] + 2, g.z[0]);
      cam.fov = 55; cam.updateProjectionMatrix(); this.speedLines.material.opacity = 0; cs.fov = 55;
      if (this.post.enabled) this.post.setLook(this.lookParams(0));
      return;
    }
    const mode = this.camMode;
    const look = this._look;
    if (mode === 'chase' || mode === 'far') {
      const far = mode === 'far';
      let yawT = m.root.rotation.y;
      if (e.crashT > 0) yawT = cs.yaw; // don't spin with a tumbling bike
      if (!this.camInit) { cs.yaw = yawT; cs.yawV = 0; cs.back = far ? 9.5 : 5.2; cs.backV = 0; cs.up = far ? 3.3 : 1.75; cs.upV = 0; cs.roll = 0; cs.rollV = 0; this.camInit = true; }
      while (yawT - cs.yaw > Math.PI) yawT -= Math.PI * 2; while (yawT - cs.yaw < -Math.PI) yawT += Math.PI * 2;
      crit(cs, 'yaw', yawT, far ? 4.5 : 5.5, dt);
      const backT = (far ? 9.5 : 5.2) + sp * (far ? 1.2 : 0.8) + clamp(e.accel, -14, 9) * 0.05;
      crit(cs, 'back', backT, 3.2, dt);
      crit(cs, 'up', (far ? 3.3 : 1.75) - sp * 0.18, 4, dt);
      crit(cs, 'roll', m.anim.lean * (far ? 0.12 : 0.26), 6, dt);
      const sy = Math.sin(cs.yaw), cy = Math.cos(cs.yaw);
      cam.position.set(bp.x + sy * cs.back, bp.y + cs.up, bp.z + cy * cs.back);
      cam.position.y = Math.max(cam.position.y, bp.y + 0.9);
      look.set(bp.x - sy * 7, bp.y + 0.9, bp.z - cy * 7);
      cam.lookAt(look); cam.rotateZ(-cs.roll);
      fovT = (far ? 56 : 58) + sp * 20 + (e.draft || 0) * 3;
      blur = sp * sp * 0.05;
    } else if (mode === 'helmet') {
      m.root.updateMatrixWorld(true);
      m.head.getWorldPosition(this._v1);
      const th = m.root.rotation.y, fx = -Math.sin(th), fz = -Math.cos(th);
      if (!this.camInit) { cs.roll = 0; cs.rollV = 0; this.camInit = true; }
      crit(cs, 'roll', m.anim.lean * 0.8, 9, dt);
      cam.position.set(this._v1.x + fx * 0.22, this._v1.y + 0.1, this._v1.z + fz * 0.22);
      look.set(cam.position.x + fx * 20, cam.position.y - 1.15, cam.position.z + fz * 20);
      cam.lookAt(look); cam.rotateZ(-cs.roll);
      fovT = 70 + sp * 16;
      blur = sp * sp * 0.065;
    } else if (mode === 'tv') {
      const L = this.geo.L; const sMod = ((e.s % L) + L) % L;
      let best = this.tvCams[0], bd = 1e9;
      for (const c of this.tvCams) { let dd = c.s - sMod; if (dd < -L / 2) dd += L; if (dd > L / 2) dd -= L; const sc = dd > -90 && dd < 170 ? Math.abs(dd - 40) : 1e6; if (sc < bd) { bd = sc; best = c; } }
      if (bd >= 1e6) {
        const sy = Math.sin(m.root.rotation.y), cy = Math.cos(m.root.rotation.y);
        this._v1.set(bp.x + sy * 14, bp.y + 6, bp.z + cy * 14);
        if (!this.camInit) { cam.position.copy(this._v1); this.camInit = true; }
        cam.position.lerp(this._v1, 1 - Math.exp(-dt * 4));
      } else { cam.position.copy(best.pos); this.camInit = true; }
      look.set(bp.x, bp.y + 0.8, bp.z);
      cam.lookAt(look);
      const dist = cam.position.distanceTo(bp);
      fovT = Math.max(6, Math.min(55, 2 * Math.atan(4.5 / dist) * 57.3));
    }
    // smooth camera shake: speed buzz + kerbs + impacts (rotation noise, never positional jitter)
    if (mode !== 'tv') {
      const t = this.time, hw = this.geo.halfW, ad = Math.abs(e.d);
      const kerb = ad > hw && ad < hw + 1.3 && v > 10 ? 1 : 0;
      const amp = clamp((v - 50) / 40, 0, 1) * 0.0022 + kerb * 0.006 * (mode === 'helmet' ? 1.6 : 1) + (this.shake || 0) * 0.02;
      if (amp > 0) { cam.rotateX((Math.sin(t * 31.0) + Math.sin(t * 47.3) * 0.6) * amp); cam.rotateY((Math.sin(t * 27.7) + Math.sin(t * 39.1) * 0.5) * amp * 0.7); }
    }
    this.shake = Math.max(0, (this.shake || 0) - dt * 1.5);
    if (Math.abs(cs.fov - cam.fov) > 5 && mode === 'tv') cs.fov = fovT;
    crit(cs, 'fov', fovT, mode === 'tv' ? 6 : 3, dt);
    cam.fov = cs.fov; cam.updateProjectionMatrix();
    // speed lines
    const op = mode === 'tv' ? 0 : Math.max(0, Math.min(0.32, (v - 55) / 80));
    this.speedLines.material.opacity = op;
    if (op > 0) {
      const pa = this.speedLines.geometry.attributes.position, sd = this.slData;
      for (let i = 0; i < sd.length; i++) { const s = sd[i]; s.z += v * dt * 0.9; if (s.z > -1) s.z = -30; pa.setXYZ(i * 2, s.x, s.y, s.z); pa.setXYZ(i * 2 + 1, s.x, s.y, s.z - s.len * (v / 60)); }
      pa.needsUpdate = true;
    }
    if (this.post.enabled) this.post.setLook(this.lookParams(blur, sp));
  }
  lookParams(blur, sp = 0) {
    const o = this._lp || (this._lp = { tint: new THREE.Vector3() });
    const sunny = this.weather === 'SUNNY' && !this.night;
    o.speed = blur; o.time = this.time; o.haze = sunny && (this.theme.sand || this.theme.sky.turbidity > 6) ? 1 : sunny ? 0.5 : 0;
    o.vignette = 0.28 + sp * 0.16; o.saturation = this.wet ? 0.9 : this.night ? 1.04 : 1.1; o.contrast = this.wet ? 1.02 : 1.07;
    if (this.night) o.tint.set(0.96, 0.98, 1.05); else if (this.wet) o.tint.set(0.96, 0.99, 1.03); else if (sunny) o.tint.set(1.03, 1.0, 0.95); else o.tint.set(1, 1, 1);
    o.bloom = this.night ? 0.55 : sunny ? 0.18 : 0.26; o.flash = this.flash || 0;
    return o;
  }

  updateAudio(dt) {
    if (!audio.ctx || this.paused) return;
    const race = this.race; const p = race.player, L = this.geo.L;
    if (p && this.playerVoice) audio.setEngine(this.playerVoice, p.rpm, p.crashT > 0 ? 0 : Math.max(p.throttle, 0.15), 1, 0, 1, p.v);
    const ref = this.focus;
    if (this.aiVoices && this.aiVoices.length) {
      const near = this._near || (this._near = race.entrants.map(e => ({ e, d: 0 })));
      for (const n of near) { let dl = (n.e.s - ref.s) % L; if (dl > L / 2) dl -= L; if (dl < -L / 2) dl += L; n.d = n.e === p ? 1e9 : Math.abs(dl) + Math.abs(n.e.d - ref.d) * 0.5; n.dl = dl; }
      near.sort((a, b) => a.d - b.d);
      for (let i = 0; i < this.aiVoices.length; i++) {
        const n = near[i]; if (!n) break;
        const g = Math.max(0, 1 - n.d / 130) * (p ? 0.8 : 1.4);
        // doppler: closing speed along the track (positive when approaching the listener)
        const closing = (n.e.v - ref.v) * (n.dl < 0 ? 1 : -1);
        const dop = 343 / Math.max(200, 343 - clamp(closing, -60, 60));
        audio.setEngine(this.aiVoices[i], n.e.rpm, Math.max(0.3, n.e.accel > 0 ? 0.9 : 0.3), g, Math.max(-1, Math.min(1, (n.e.d - ref.d) / 6)), dop, n.e.v);
      }
    }
    // crowd swells near grandstands and the start/finish straight
    const sMod = ((ref.s % L) + L) % L; let best = 1e9;
    for (const st of this.ts.stands) { let dd = Math.abs(st.s - sMod); if (dd > L / 2) dd = L - dd; if (dd < best) best = dd; }
    const nearStart = Math.max(0, 1 - Math.min(sMod, L - sMod) / 300);
    this.crowdNear = Math.max(nearStart, Math.max(0, 1 - best / 220));
    audio.setWind(this.camMode === 'tv' ? 0 : ref.v, this.crowdNear);
    // tyre squeal: lock-ups and the edge of grip
    const sq = ref.crashT > 0 ? 0 : Math.max((ref.lockup || 0) * 0.8, ref.v > 20 ? Math.max(0, Math.abs(ref.lean) - 0.92) * 6 : 0, ref.isPlayer && ref.brake > 0.95 && ref.v > 30 && race.ctl.crash ? 0.4 : 0);
    audio.setSqueal(this.camMode === 'tv' ? sq * 0.4 : sq);
  }
}
