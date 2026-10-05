import * as THREE from 'three';
import { TRACK_BY_ID } from '../data/tracks.js';
import { riderLivery, riderTeamName, displayName } from '../data/riders.js';
import { TEAM_BY_ID } from '../data/teams.js';
import { MANUFACTURER_BY_ID } from '../data/manufacturers.js';
import { buildTrackGeometry, toWorld } from './trackgeom.js';
import { buildTrackScene, buildRacingLine, gridSlots } from './trackScene.js';
import { createBike, animateBike } from './bikeModel.js';
import { Race } from './race.js';
import { speedProfile, effective, WEATHER, POINTS } from './perf.js';
import { Input } from './input.js';
import { audio } from './audio.js';
import { Hud, fmtTime } from '../ui/hud.js';

export const PRESETS = {
  LOW: { q: 0, pr: 0.75, shadow: 0, draw: 800, rain: 500, lines: 40 },
  MEDIUM: { q: 1, pr: 1, shadow: 1024, draw: 1300, rain: 1200, lines: 70 },
  HIGH: { q: 2, pr: 1.5, shadow: 2048, draw: 1900, rain: 2200, lines: 110 },
  ULTRA: { q: 3, pr: 2, shadow: 4096, draw: 2600, rain: 3500, lines: 150 },
};
const PRESET_ORDER = ['LOW', 'MEDIUM', 'HIGH', 'ULTRA'];
const CAMS = ['chase', 'far', 'helmet', 'tv'];
const geoCache = new Map();
export function getGeo(id) { if (!geoCache.has(id)) geoCache.set(id, buildTrackGeometry(TRACK_BY_ID[id])); return geoCache.get(id); }

export class Game {
  constructor(canvas, hudRoot, settings) {
    this.canvas = canvas; this.settings = settings;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: settings.graphics !== 'LOW', powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 3000);
    this.input = new Input();
    this.hud = new Hud(hudRoot);
    this.hudRoot = hudRoot;
    this.clock = new THREE.Clock();
    this.state = 'menu';
    this.timeScale = 1;
    this.fps = 60; this.fpsAcc = 0; this.fpsFrames = 0; this.lowFpsWindows = 0;
    this.applyGraphics(settings.graphics);
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.buildShowroom();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }
  get preset() { return PRESETS[this.settings.graphics] || PRESETS.HIGH; }
  applyGraphics(name) {
    this.settings.graphics = name;
    const p = this.preset;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, p.pr));
    this.renderer.shadowMap.enabled = p.shadow > 0;
    if (this.sun) { this.sun.castShadow = p.shadow > 0; if (p.shadow) { this.sun.shadow.mapSize.set(p.shadow, p.shadow); if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; } } }
    if (this.scene && this.scene.fog) { this.scene.fog.far = p.draw * (this.wet ? 0.45 : 1); this.camera.far = p.draw + 400; this.camera.updateProjectionMatrix(); }
    this.resize();
  }
  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.mobile = (navigator.maxTouchPoints > 0 && Math.min(w, h) < 820);
  }

  // ---------------- menu showroom ----------------
  buildShowroom() {
    const s = new THREE.Scene();
    s.background = new THREE.Color('#0b0c0f');
    s.fog = new THREE.Fog('#0b0c0f', 8, 30);
    s.add(new THREE.HemisphereLight('#ffffff', '#202024', 1.2));
    const key = new THREE.DirectionalLight('#ffffff', 2.2); key.position.set(4, 6, 3); s.add(key);
    const rim = new THREE.DirectionalLight('#ff2a2a', 2.5); rim.position.set(-5, 2, -4); s.add(rim);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(6, 48), new THREE.MeshStandardMaterial({ color: '#141518', roughness: 0.35, metalness: 0.6 }));
    floor.rotation.x = -Math.PI / 2; s.add(floor);
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.3, 2.38, 64), new THREE.MeshBasicMaterial({ color: '#e10600' }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.01; s.add(ring);
    this.show = { scene: s, bike: null, rot: 0 };
  }
  showroom(rider) {
    this.state = 'menu';
    const sh = this.show;
    if (sh.riderId === rider?.id) return;
    if (sh.bike) sh.scene.remove(sh.bike.root);
    if (!rider) return;
    const team = TEAM_BY_ID[rider.team];
    sh.bike = createBike({ livery: riderLivery(rider), helmet: rider.helmet, number: rider.number, sponsor: team?.sponsor, detail: 2 });
    sh.scene.add(sh.bike.root); sh.riderId = rider.id;
  }
  renderShowroom(dt) {
    const sh = this.show; sh.rot += dt * 0.35;
    if (sh.bike) { sh.bike.root.rotation.y = sh.rot; animateBike(sh.bike, { lean: Math.sin(sh.rot * 1.3) * 0.25, accel: 0, v: 0, dt }); }
    const narrow = window.innerWidth < window.innerHeight * 1.2;
    this.camera.position.set(0, 1.35, narrow ? 5.2 : 4.6); this.camera.fov = 42; this.camera.updateProjectionMatrix();
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(narrow ? 0 : -1.25, 0.62, 0);
    this.renderer.render(sh.scene, this.camera);
  }

  // ---------------- race setup ----------------
  startRace(cfg, cb) {
    this.closeT = 0;
    this.disposeRace();
    audio.ensure();
    this.cb = cb; this.cfg = cfg;
    const track = TRACK_BY_ID[cfg.trackId];
    const geo = getGeo(cfg.trackId);
    this.geo = geo; this.track = track;
    const weather = cfg.weather;
    this.wet = WEATHER[weather].wet > 0;
    const night = !!track.night;
    const p = this.preset;
    const scene = new THREE.Scene(); this.scene = scene;
    // sky
    const skyTop = night ? '#05070d' : this.wet ? '#59606b' : weather === 'CLOUDY' ? '#7d8fa6' : '#3f7fd0';
    const skyHor = night ? '#1b2233' : this.wet ? '#9aa1aa' : weather === 'CLOUDY' ? '#c3ccd6' : '#cfe3f5';
    const skyG = new THREE.SphereGeometry(5000, 24, 12); const cols = []; const pos = skyG.attributes.position; skyG.translate(0, -400, 0);
    const ct = new THREE.Color(skyTop), ch = new THREE.Color(skyHor), cc = new THREE.Color();
    for (let i = 0; i < pos.count; i++) { const y = pos.getY(i) / 5000; cc.copy(ch).lerp(ct, Math.max(0, Math.min(1, y * 2.2))); cols.push(cc.r, cc.g, cc.b); }
    skyG.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    this.sky = new THREE.Mesh(skyG, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    scene.add(this.sky);
    scene.fog = new THREE.Fog(skyHor, 60, p.draw * (this.wet ? 0.45 : 1));
    this.camera.far = p.draw + 400; this.camera.updateProjectionMatrix();
    const hemi = new THREE.HemisphereLight(night ? '#9fb3ff' : '#dfefff', night ? '#1a1d14' : '#4a5a30', night ? 1.4 : this.wet ? 1.3 : 1.05); scene.add(hemi);
    this.sun = new THREE.DirectionalLight(night ? '#fff6dd' : '#fff4e0', night ? 1.2 : this.wet ? 0.6 : 2.3);
    this.sun.position.set(120, 200, 80);
    this.sun.castShadow = p.shadow > 0;
    if (p.shadow) { this.sun.shadow.mapSize.set(p.shadow, p.shadow); const sc = this.sun.shadow.camera; sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 10; sc.far = 500; this.sun.shadow.bias = -0.0006; }
    scene.add(this.sun); scene.add(this.sun.target);
    this.renderer.shadowMap.enabled = p.shadow > 0;
    // track
    const ts = buildTrackScene(geo, { quality: p.q, weather, night });
    this.ts = ts; scene.add(ts.group);
    // race logic
    const race = new Race({ geo, track, laps: cfg.laps, weather, difficulty: cfg.difficulty, control: this.settings.control, gearMode: this.settings.gear, playerTire: cfg.playerTire, entrants: cfg.entrants, spectator: !!cfg.spectator, seed: cfg.seed });
    race.wallD = ts.wall;
    this.race = race;
    const order = race.qualify();
    race.placeOnGrid(order, gridSlots(geo, race.entrants.length));
    // bikes
    this.bikes = race.entrants.map((e) => {
      const team = TEAM_BY_ID[e.rider.team];
      const m = createBike({ livery: riderLivery(e.rider), helmet: e.rider.helmet, number: e.rider.number, sponsor: team?.sponsor, detail: p.q >= 2 ? 2 : 1 });
      scene.add(m.root); return m;
    });
    // racing line for the player
    if (race.player && this.settings.line !== 'OFF') {
      const prof = speedProfile(geo, geo.lineK, race.player.eff);
      this.lineMesh = buildRacingLine(geo, prof, this.settings.line);
      if (this.lineMesh) scene.add(this.lineMesh);
    }
    // effects
    this.buildRain(weather);
    this.buildSpeedLines();
    // camera / focus
    this.focus = race.player || race.order[0];
    this.camMode = cfg.spectator ? 'tv' : this.settings.camera;
    this.camPos = new THREE.Vector3(); this.camLook = new THREE.Vector3(); this.camInit = false;
    this.tvCams = this.buildTvCams();
    // HUD
    this.hud.build({ race, geo, mobile: this.mobile, spectator: !!cfg.spectator, manual: this.settings.control === 'MANUAL', settings: this.settings, onPause: () => this.pause(), onCamera: () => this.cycleCamera(), input: this.input });
    this.input.tiltOn = !!this.settings.tilt;
    // audio
    audio.setVolume({ master: this.settings.master, engine: this.settings.engine, sfx: this.settings.sfx });
    audio.stopAll();
    if (audio.ctx) {
      audio.startAmbience(WEATHER[weather].wet);
      if (race.player) this.playerVoice = audio.makeEngine(MANUFACTURER_BY_ID[race.player.bike.manufacturer]?.engine || 'V4', 1);
      this.aiVoices = [audio.makeEngine('V4', 0.55), audio.makeEngine('I4', 0.55)];
    }
    this.state = 'intro'; this.introT = 0; this.finishT = 0; this.paused = false; this.acc = 0;
    this.battleCd = 10; this.lastLeader = null;
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
    this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#c8d4e0', transparent: true, opacity: 0.45 }));
    this.rain.frustumCulled = false; this.scene.add(this.rain);
  }
  buildSpeedLines() {
    const n = this.preset.lines; const pos = new Float32Array(n * 6); this.slData = [];
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, r = 1.6 + Math.random() * 3.5; this.slData.push({ x: Math.cos(a) * r, y: Math.sin(a) * r * 0.7, z: -Math.random() * 30, len: 1.5 + Math.random() * 3 }); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.speedLines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthTest: false }));
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
    if (!this.race || this.state === 'results' || this.paused) return;
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
    if (this.scene) {
      this.scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const m of ms) { if (m.map) m.map.dispose(); m.dispose(); } } });
      this.camera.remove(this.speedLines || new THREE.Object3D());
    }
    this.scene = null; this.race = null; this.bikes = []; this.lineMesh = null; this.playerVoice = null; this.aiVoices = [];
    this.hudRoot.innerHTML = '';
  }

  // ---------------- per-frame ----------------
  loop() {
    requestAnimationFrame(this.loop);
    let dt = Math.min(0.1, this.clock.getDelta());
    this.trackFps(dt);
    if (this.state === 'menu' || !this.scene) { if (this.state === 'menu') this.renderShowroom(dt); return; }
    if (this.paused) { this.renderer.render(this.scene, this.camera); return; }
    if (this.input.consume('pause')) { this.pause(); return; }
    if (this.input.consume('camera')) this.cycleCamera();
    const race = this.race;
    if (this.cfg.spectator) {
      if (this.input.consume('focusNext') || this.input.consume('focusPrev')) {
        const i = race.order.indexOf(this.focus); const dir = this.input.pressed.size, nx = (i + 1) % race.order.length;
        this.focus = race.order[nx]; this.hud.lower(this.focus, ` · P${this.focus.pos}`); this.lowerT = 4;
      }
    }
    const ui = this.input.read();
    if (this.cfg.spectator) { if (ui.steer !== 0 && !this.specSteerLatch) { const i = race.order.indexOf(this.focus); this.focus = race.order[(i + (ui.steer > 0 ? 1 : race.order.length - 1)) % race.order.length]; this.hud.lower(this.focus, ` · P${this.focus.pos}`); this.lowerT = 4; } this.specSteerLatch = ui.steer !== 0; }
    if (this.state === 'intro') {
      this.introT += dt;
      if (ui.steer !== 0 || ui.throttle > 0 || this.introT > 7.5) this.endIntro();
    }
    if (this.state === 'start' || this.state === 'race' || this.state === 'finished') {
      const step = 1 / 120;
      this.acc += dt * this.timeScale;
      let n = 0;
      while (this.acc >= step && n < 240) { race.step(step, this.state === 'finished' ? {} : ui); this.acc -= step; n++; ui.shiftUp = ui.shiftDown = ui.reset = false; }
      if (race.phase === 'race' && this.state === 'start') this.state = 'race';
      this.handleEvents();
      if (this.state === 'race') this.checkFinish(dt);
      if (this.state === 'finished') { this.finishT += dt; if (this.finishT > (this.cfg.spectator ? 3 : 3.5)) this.showResults(); }
    }
    if (!this.race || !this.scene) return; // race was closed during this frame
    this.updateVisuals(dt);
    this.updateCamera(dt);
    if (this.sky) { this.sky.position.copy(this.camera.position); this.sky.scale.setScalar((this.camera.far * 0.92) / 5000); }
    this.updateAudio(dt);
    if (this.state !== 'intro') this.hud.update(dt, this.focus, this.camMode);
    if (this.lowerT > 0) { this.lowerT -= dt; if (this.lowerT <= 0) this.hud.lower(null); }
    this.renderer.render(this.scene, this.camera);
  }

  trackFps(dt) {
    this.fpsAcc += dt; this.fpsFrames++;
    if (this.fpsAcc >= 4) {
      this.fps = this.fpsFrames / this.fpsAcc; this.fpsAcc = 0; this.fpsFrames = 0;
      if (this.settings.autoGfx && (this.state === 'race') && !this.paused && document.visibilityState === 'visible') {
        const threshold = this.mobile ? 27 : 42;
        if (this.fps < threshold) this.lowFpsWindows++; else this.lowFpsWindows = 0;
        const idx = PRESET_ORDER.indexOf(this.settings.graphics);
        if (this.lowFpsWindows >= 2 && idx > 0) {
          this.applyGraphics(PRESET_ORDER[idx - 1]); this.lowFpsWindows = 0;
          this.hud.note('GRAPHICS AUTO-ADJUSTED: ' + this.settings.graphics, 'small', 2.5);
          this.onSettingsChanged && this.onSettingsChanged();
        }
      }
      if (this.fpsEl) this.fpsEl.textContent = Math.round(this.fps) + ' FPS';
    }
  }

  handleEvents() {
    const race = this.race, hud = this.hud;
    for (const ev of race.events) {
      switch (ev.type) {
        case 'light': hud.lights(ev.n, false); audio.blip(440, 0.18, 'sine', 0.2); break;
        case 'go': hud.lights(0, true); audio.blip(880, 0.4, 'sine', 0.25); setTimeout(() => hud.lights(0, false), 1200); for (const l of this.ts.lights) l.color.set('#330000'); break;
        case 'shift': if (ev.e.isPlayer) audio.shift(this.playerVoice); break;
        case 'fastest': if (race.t - race.goTime > 10) hud.note(`FASTEST LAP · ${ev.e.rider.name.toUpperCase()} ${fmtTime(ev.time)}`, 'purple', 3); break;
        case 'lap': if (ev.e.isPlayer && ev.e.lap < race.laps) hud.note(`LAP ${ev.e.lap} · ${fmtTime(ev.time)}`, 'small', 2); break;
        case 'finalLap': hud.note('FINAL LAP', 'white', 2.5); break;
        case 'position': if (ev.to < ev.from) hud.note(`P${ev.to}  ▲${ev.from - ev.to}`, 'green', 1.6); else hud.note(`P${ev.to}  ▼${ev.to - ev.from}`, 'red', 1.6); break;
        case 'crash': if (ev.e.isPlayer) { hud.note(ev.kind === 'HIGHSIDE' ? 'HIGHSIDE!' : 'CRASH! (R to reset)', 'red', 2.5); audio.thud(0.6); } else if (Math.abs(ev.e.s - this.focus.s) < 400 || ev.e.pos <= 5) hud.note(`${ev.e.rider.name.toUpperCase()} IS DOWN!`, 'red', 2.5); break;
        case 'bump': case 'contact': audio.thud(0.25); this.shake = 0.35; break;
      }
    }
    // gantry lights mirror the start sequence
    if (race.phase === 'lights') this.ts.lights.forEach((l, i) => l.color.set(i < race.lightsOn ? '#ff1a1a' : '#330000'));
    race.events.length = 0;
    // battle overlay
    this.battleCd -= 1 / 60;
    if (race.phase === 'race' && race.t - race.goTime > 15 && this.battleCd <= 0 && race.order.length > 1) {
      const a = race.order[0], b = race.order[1];
      if (!a.finished && race.gap(a, b) < 0.35) { hud.note('BATTLE FOR P1', 'white', 2.5); this.battleCd = 30; }
    }
  }

  checkFinish(dt) {
    const race = this.race;
    if (race.player) {
      // everyone else is home: close the race after 30 s so a stopped/stranded player can't stall it
      if (!race.player.finished && race.entrants.every(e => e.finished || e.isPlayer)) {
        this.closeT = (this.closeT || 0) + dt * this.timeScale;
        if (this.closeT > 30) { this.closeT = 0; race.projectFinish(); this.hud.note('RACE CLOSED', 'white', 3); }
      }
      if (race.player.finished) { race.autopilot = true; this.state = 'finished'; this.finishT = 0; this.hud.note(race.player.pos === 1 ? 'WINNER!' : `FINISHED P${race.player.pos}`, race.player.pos <= 3 ? 'gold' : 'white', 3.5); }
    } else if (race.order[0].finished) { this.state = 'finished'; this.finishT = 0; this.hud.note(`${race.order[0].rider.name.toUpperCase()} WINS!`, 'gold', 3); }
  }

  showResults() {
    if (this.state === 'results') return;
    this.state = 'results';
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

  updateVisuals(dt) {
    const race = this.race, geo = this.geo, tmp = {};
    const camP = this.camera.position;
    const drawSq = (this.preset.draw * 0.55) ** 2;
    race.entrants.forEach((e, k) => {
      const m = this.bikes[k];
      toWorld(geo, e.s, e.d, tmp);
      m.root.position.set(tmp.x, tmp.y + 0.02, tmp.z);
      const hb = tmp.heading + (e.crashT > 0 ? e.psi : e.psi);
      m.root.rotation.y = Math.atan2(-Math.cos(hb), -Math.sin(hb));
      const visible = (tmp.x - camP.x) ** 2 + (tmp.z - camP.z) ** 2 < drawSq;
      m.root.visible = visible;
      if (visible) animateBike(m, { lean: e.crashT > 0 ? 0 : e.lean, accel: e.accel, v: e.v, dt, crashed: e.crashT > 0 });
    });
    // shadow follows focus
    const f = this.bikes[race.entrants.indexOf(this.focus)];
    if (f && this.sun) { const fp = f.root.position; this.sun.position.set(fp.x + 60, fp.y + 120, fp.z + 40); this.sun.target.position.copy(fp); }
    if (this.rain) { this.rain.position.set(camP.x, camP.y - 8, camP.z); const pa = this.rain.geometry.attributes.position; this.rainOff = ((this.rainOff || 0) + dt * 24) % 30; this.rain.position.y -= this.rainOff - 15; }
  }

  updateCamera(dt) {
    const race = this.race, cam = this.camera;
    const e = this.focus; const m = this.bikes[race.entrants.indexOf(e)];
    if (!m) return;
    const bp = m.root.position;
    const hb = -m.root.rotation.y - Math.PI / 2; // forward dir angle
    const fwd = new THREE.Vector3(-Math.sin(m.root.rotation.y), 0, -Math.cos(m.root.rotation.y));
    const v = e.v;
    const k = 1 - Math.exp(-dt * 7);
    let fov = 60;
    cam.up.set(0, 1, 0);
    if (this.state === 'intro') {
      const g = this.geo, t = this.introT;
      const s = 420 - t * 62; const i = ((Math.floor(s / g.ds) % g.N) + g.N) % g.N;
      const side = Math.sin(t * 0.4) * 30;
      cam.position.set(g.x[i] + g.rx[i] * side, g.y[i] + 34 - t * 3.2, g.z[i] + g.rz[i] * side);
      cam.lookAt(g.x[0], g.y[0] + 2, g.z[0]);
      cam.fov = 55; cam.updateProjectionMatrix(); this.speedLines.material.opacity = 0; return;
    }
    let want = new THREE.Vector3(), look = new THREE.Vector3();
    const mode = this.camMode;
    if (mode === 'chase' || mode === 'far') {
      const back = mode === 'far' ? 9.5 : 5.4, up = mode === 'far' ? 3.3 : 1.85;
      want.copy(bp).addScaledVector(fwd, -back); want.y += up;
      look.copy(bp).addScaledVector(fwd, 7); look.y += 0.9;
      fov = 60 + Math.max(0, Math.min(1, (v - 25) / 65)) * 17;
      if (!this.camInit) { this.camPos.copy(want); this.camLook.copy(look); this.camInit = true; }
      this.camPos.lerp(want, mode === 'far' ? k * 0.8 : k);
      this.camLook.lerp(look, Math.min(1, k * 1.6));
      cam.position.copy(this.camPos);
      // keep camera above terrain-ish
      cam.position.y = Math.max(cam.position.y, bp.y + 0.9);
      cam.lookAt(this.camLook);
      cam.rotateZ(-m.anim.lean * 0.18);
    } else if (mode === 'helmet') {
      m.head.getWorldPosition(want); want.addScaledVector(fwd, 0.25); want.y += 0.12;
      cam.position.copy(want);
      look.copy(want).addScaledVector(fwd, 20); look.y -= 1.2;
      cam.lookAt(look); cam.rotateZ(-m.anim.lean * 0.75);
      fov = 70 + Math.max(0, Math.min(1, (v - 25) / 65)) * 14;
    } else if (mode === 'tv') {
      // nearest trackside camera ahead/behind
      const L = this.geo.L; const sMod = ((e.s % L) + L) % L;
      let best = this.tvCams[0], bd = 1e9;
      for (const c of this.tvCams) { let dd = c.s - sMod; if (dd < -L / 2) dd += L; if (dd > L / 2) dd -= L; const sc = dd > -90 && dd < 170 ? Math.abs(dd - 40) : 1e6; if (sc < bd) { bd = sc; best = c; } }
      if (bd >= 1e6) { want.copy(bp).addScaledVector(fwd, -14); want.y += 6; cam.position.lerp(want, k); }
      else cam.position.copy(best.pos);
      look.copy(bp); look.y += 0.8;
      cam.lookAt(look);
      const dist = cam.position.distanceTo(bp);
      fov = Math.max(6, Math.min(55, 2 * Math.atan(4.5 / dist) * 57.3));
    }
    // speed shake
    if (mode !== 'tv') {
      const sh = Math.max(0, (v - 65) / 30) * 0.012 + (this.shake || 0) * 0.08;
      if (sh > 0) { cam.position.x += (Math.random() - 0.5) * sh; cam.position.y += (Math.random() - 0.5) * sh; }
    }
    this.shake = Math.max(0, (this.shake || 0) - dt);
    cam.fov += (fov - cam.fov) * Math.min(1, dt * 4); cam.updateProjectionMatrix();
    // speed lines
    const op = mode === 'tv' ? 0 : Math.max(0, Math.min(0.35, (v - 55) / 80));
    this.speedLines.material.opacity = op;
    if (op > 0) {
      const pa = this.speedLines.geometry.attributes.position;
      this.slData.forEach((s, i) => { s.z += v * dt * 0.9; if (s.z > -1) s.z = -30; pa.setXYZ(i * 2, s.x, s.y, s.z); pa.setXYZ(i * 2 + 1, s.x, s.y, s.z - s.len * (v / 60)); });
      pa.needsUpdate = true;
    }
  }

  updateAudio(dt) {
    if (!audio.ctx || this.paused) return;
    const race = this.race; const p = race.player;
    if (p && this.playerVoice) audio.setEngine(this.playerVoice, p.rpm, p.crashT > 0 ? 0 : Math.max(p.throttle, 0.15), 1);
    const ref = this.focus;
    // nearest two opponents
    if (this.aiVoices && this.aiVoices.length) {
      const near = race.entrants.filter(e => e !== p).map(e => ({ e, d: Math.abs(e.s - ref.s) })).sort((a, b) => a.d - b.d).slice(0, 2);
      near.forEach((n, i) => {
        const g = Math.max(0, 1 - n.d / 120) * (p ? 0.8 : 1.4);
        const closing = (n.e.v - ref.v) * Math.sign(ref.s - n.e.s);
        audio.setEngine(this.aiVoices[i], n.e.rpm, Math.max(0.3, n.e.accel > 0 ? 0.9 : 0.3), g, Math.max(-1, Math.min(1, (n.e.d - ref.d) / 6)), 1 + closing / 340);
      });
    }
    const nearStart = Math.max(0, 1 - Math.abs((((ref.s % this.geo.L) + this.geo.L) % this.geo.L) - (this.geo.L - 100)) / 400);
    audio.setWind(this.camMode === 'tv' ? 0 : ref.v, nearStart);
  }
}
