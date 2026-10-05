// Web Audio synthesis — no samples. Engines with exhaust harmonics + intake roar + gear whine, rev limiter,
// downshift crackles, doppler, tyre squeal, wind, crowd (with swells/cheers), rain, UI blips and original menu music.
export class Audio {
  constructor() { this.ctx = null; this.vol = { master: 0.8, engine: 0.8, sfx: 0.7, music: 0.5 }; this.voices = []; this.music = null; }
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return true; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
    this.ctx = new AC();
    const c = this.ctx;
    this.master = c.createGain(); this.master.connect(c.destination);
    this.comp = c.createDynamicsCompressor(); this.comp.threshold.value = -14; this.comp.ratio.value = 4; this.comp.connect(this.master);
    this.engineBus = c.createGain(); this.engineBus.connect(this.comp);
    this.sfxBus = c.createGain(); this.sfxBus.connect(this.comp);
    this.musicBus = c.createGain(); this.musicBus.connect(this.master);
    const len = c.sampleRate * 2; const buf = c.createBuffer(1, len, c.sampleRate); const d = buf.getChannelData(0);
    let last = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = w * 0.6 + last * 3; }
    this.noise = buf;
    const wb = c.createBuffer(1, len, c.sampleRate); const wd = wb.getChannelData(0); for (let i = 0; i < len; i++) wd[i] = Math.random() * 2 - 1;
    this.white = wb;
    this.applyVolume();
    return true;
  }
  setVolume(v) { Object.assign(this.vol, v); this.applyVolume(); }
  applyVolume() { if (!this.ctx) return; this.master.gain.value = this.vol.master; this.engineBus.gain.value = this.vol.engine; this.sfxBus.gain.value = this.vol.sfx; this.musicBus.gain.value = (this.vol.music ?? 0.5) * 0.55; }
  noiseSrc(white) { const s = this.ctx.createBufferSource(); s.buffer = white ? this.white : this.noise; s.loop = true; s.loopStart = Math.random(); return s; }

  makeEngine(kind, gainScale = 1) {
    const c = this.ctx; const v4 = kind === 'V4'; const v = { kind, gainScale, rpm: 0 };
    const out = c.createGain(); out.gain.value = 0;
    const pan = c.createStereoPanner ? c.createStereoPanner() : null;
    if (pan) { out.connect(pan); pan.connect(this.engineBus); } else out.connect(this.engineBus);
    // exhaust: three harmonics -> soft clip -> resonant low-pass (opens with throttle)
    const shaper = c.createWaveShaper(); const curve = new Float32Array(512); for (let i = 0; i < 512; i++) { const x = i / 256 - 1; curve[i] = Math.tanh(x * (v4 ? 3.4 : 2.4)); } shaper.curve = curve; shaper.oversample = '2x';
    const am = c.createGain(); am.gain.value = 1;
    const filt = c.createBiquadFilter(); filt.type = 'lowpass'; filt.Q.value = v4 ? 5 : 3;
    const body = c.createBiquadFilter(); body.type = 'peaking'; body.frequency.value = v4 ? 180 : 320; body.gain.value = 6; body.Q.value = 1.2;
    const osc = [], gains = [];
    const types = v4 ? ['sawtooth', 'square', 'sawtooth', 'triangle'] : ['sawtooth', 'sawtooth', 'square', 'triangle'];
    const lv = v4 ? [0.5, 0.42, 0.18, 0.12] : [0.42, 0.3, 0.16, 0.22];
    for (let k = 0; k < 4; k++) { const o = c.createOscillator(); o.type = types[k]; const g = c.createGain(); g.gain.value = lv[k]; o.connect(g); g.connect(shaper); osc.push(o); gains.push(g); }
    shaper.connect(am); am.connect(body); body.connect(filt); filt.connect(out);
    // uneven firing (V4 "big bang") amplitude modulation
    const lfo = c.createOscillator(); lfo.type = v4 ? 'square' : 'sine';
    const lfoG = c.createGain(); lfoG.gain.value = v4 ? 0.32 : 0.07; lfo.connect(lfoG); lfoG.connect(am.gain);
    // rev limiter: square chop that we enable at the redline
    const lim = c.createOscillator(); lim.type = 'square'; lim.frequency.value = 22; const limG = c.createGain(); limG.gain.value = 0; lim.connect(limG); limG.connect(am.gain);
    // intake roar: band-passed noise tracking engine speed
    const intake = this.noiseSrc(true); const ib = c.createBiquadFilter(); ib.type = 'bandpass'; ib.Q.value = 3; const ig = c.createGain(); ig.gain.value = 0;
    intake.connect(ib); ib.connect(ig); ig.connect(out);
    // gear/primary whine
    const wh = c.createOscillator(); wh.type = 'sine'; const whG = c.createGain(); whG.gain.value = 0; wh.connect(whG); whG.connect(out);
    for (const o of [...osc, lfo, lim, wh]) o.start(); intake.start();
    Object.assign(v, { out, filt, osc, lfo, lim, limG, pan, am, ib, ig, intake, wh, whG });
    this.voices.push(v);
    return v;
  }
  setEngine(v, rpm, throttle, gain = 1, panX = 0, doppler = 1, speed = 0) {
    if (!v) return;
    const t = this.ctx.currentTime, v4 = v.kind === 'V4';
    const f = (v4 ? 0.9 : 1.15) * (rpm / 60) * 0.5 * doppler;
    const mult = v4 ? [1, 0.5, 1.5, 2] : [1, 2, 3, 4];
    for (let k = 0; k < 4; k++) v.osc[k].frequency.setTargetAtTime(f * mult[k], t, 0.025);
    v.lfo.frequency.setTargetAtTime(f * (v4 ? 0.25 : 0.5), t, 0.05);
    v.filt.frequency.setTargetAtTime(420 + rpm * (0.07 + throttle * 0.14) * (v4 ? 0.8 : 1.25), t, 0.04);
    v.ib.frequency.setTargetAtTime(f * 6 + 300, t, 0.05);
    v.ig.gain.setTargetAtTime(throttle * throttle * 0.05 * gain * v.gainScale, t, 0.05);
    v.wh.frequency.setTargetAtTime(f * 7.3, t, 0.05);
    v.whG.gain.setTargetAtTime(Math.min(1, speed / 80) * 0.012 * gain * v.gainScale, t, 0.1);
    v.limG.gain.setTargetAtTime(rpm > 17300 && throttle > 0.5 ? 0.55 : 0, t, 0.01);
    v.out.gain.setTargetAtTime((0.045 + throttle * 0.12) * gain * v.gainScale, t, 0.05);
    if (v.pan) v.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, panX)), t, 0.05);
    v.rpm = rpm;
  }
  // overrun / downshift pops and crackles
  crackle(v, gain = 1, count = 5) {
    if (!this.ctx || gain < 0.02) return; const c = this.ctx, t0 = c.currentTime;
    const dest = v && v.out ? v.out : this.sfxBus;
    for (let k = 0; k < count; k++) {
      const t = t0 + 0.02 + Math.random() * 0.45;
      const s = this.noiseSrc(true); const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 500 + Math.random() * 1500; f.Q.value = 1.5;
      const g = c.createGain(); const a = (0.25 + Math.random() * 0.5) * gain * (v ? 1.6 : 0.4);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a, t + 0.003); g.gain.exponentialRampToValueAtTime(0.001, t + 0.03 + Math.random() * 0.04);
      s.connect(f); f.connect(g); g.connect(dest); s.start(t); s.stop(t + 0.1);
    }
  }
  startAmbience(rain) {
    const c = this.ctx;
    this.stopAmbience();
    const wind = this.noiseSrc(); const wf = c.createBiquadFilter(); wf.type = 'bandpass'; wf.Q.value = 0.7; const wg = c.createGain(); wg.gain.value = 0;
    wind.connect(wf); wf.connect(wg); wg.connect(this.sfxBus); wind.start();
    // buffeting: second wind band with slow random-ish modulation
    const buf = this.noiseSrc(); const bf = c.createBiquadFilter(); bf.type = 'lowpass'; bf.frequency.value = 180; const bg = c.createGain(); bg.gain.value = 0;
    buf.connect(bf); bf.connect(bg); bg.connect(this.sfxBus); buf.start();
    const crowd = this.noiseSrc(); const cf = c.createBiquadFilter(); cf.type = 'bandpass'; cf.frequency.value = 900; cf.Q.value = 0.5; const cg = c.createGain(); cg.gain.value = 0.02;
    const cf2 = c.createBiquadFilter(); cf2.type = 'peaking'; cf2.frequency.value = 2400; cf2.gain.value = 5;
    crowd.connect(cf); cf.connect(cf2); cf2.connect(cg); cg.connect(this.sfxBus); crowd.start();
    // tyre squeal voice (gain driven per frame)
    const sq = c.createOscillator(); sq.type = 'sawtooth'; sq.frequency.value = 1150; const sqf = c.createBiquadFilter(); sqf.type = 'bandpass'; sqf.frequency.value = 1400; sqf.Q.value = 8;
    const vib = c.createOscillator(); vib.frequency.value = 23; const vibG = c.createGain(); vibG.gain.value = 60; vib.connect(vibG); vibG.connect(sq.frequency);
    const sqg = c.createGain(); sqg.gain.value = 0; sq.connect(sqf); sqf.connect(sqg); sqg.connect(this.sfxBus); sq.start(); vib.start();
    let rg = null, rs = null;
    if (rain) { rs = this.noiseSrc(true); const rf = c.createBiquadFilter(); rf.type = 'highpass'; rf.frequency.value = 2500; rg = c.createGain(); rg.gain.value = rain * 0.06; rs.connect(rf); rf.connect(rg); rg.connect(this.sfxBus); rs.start(); }
    this.amb = { wind, wf, wg, buf, bg, crowd, cg, sq, sqg, vib, rs, rg };
  }
  setWind(speed, crowdNear) {
    if (!this.amb) return; const t = this.ctx.currentTime;
    this.amb.wf.frequency.setTargetAtTime(380 + speed * 15, t, 0.1);
    this.amb.wg.gain.setTargetAtTime(Math.min(0.38, (speed / 90) ** 2 * 0.32), t, 0.1);
    this.amb.bg.gain.setTargetAtTime(Math.min(0.5, (speed / 90) ** 3 * 0.45) * (0.6 + 0.4 * Math.sin(t * 7.3) * Math.sin(t * 3.1)), t, 0.05);
    this.amb.cg.gain.setTargetAtTime(0.018 + crowdNear * 0.11, t, 0.35);
  }
  setSqueal(x) { if (!this.amb) return; this.amb.sqg.gain.setTargetAtTime(Math.min(1, x) * 0.05, this.ctx.currentTime, 0.04); }
  cheer(gain = 1) {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime;
    const s = this.noiseSrc(); const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 0.6; const g = c.createGain();
    g.gain.setValueAtTime(0.001, t); g.gain.linearRampToValueAtTime(0.16 * gain, t + 0.4); g.gain.exponentialRampToValueAtTime(0.001, t + 2.6);
    s.connect(f); f.connect(g); g.connect(this.sfxBus); s.start(t); s.stop(t + 2.7);
  }
  stopAmbience() { if (!this.amb) return; for (const s of [this.amb.wind, this.amb.buf, this.amb.crowd, this.amb.rs, this.amb.sq, this.amb.vib]) if (s) try { s.stop(); } catch { } this.amb = null; }
  stopEngines() { for (const v of this.voices) { try { v.out.disconnect(); for (const o of [...v.osc, v.lfo, v.lim, v.wh, v.intake]) o.stop(); } catch { } } this.voices = []; }
  stopAll() { if (!this.ctx) return; this.stopEngines(); this.stopAmbience(); }
  blip(freq = 880, dur = 0.12, type = 'sine', gain = 0.25) {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = type; o.frequency.value = freq; const g = c.createGain();
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.sfxBus); o.start(t); o.stop(t + dur + 0.02);
  }
  shift(v, up = true) { // gear change: brief engine dip + mechanical click (+ crackle on downshift)
    if (!this.ctx) return; const t = this.ctx.currentTime;
    if (v && up) { v.out.gain.cancelScheduledValues(t); v.out.gain.setValueAtTime(v.out.gain.value * 0.25, t); }
    const s = this.noiseSrc(); const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2200; const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.16, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05); s.connect(f); f.connect(g); g.connect(this.sfxBus); s.start(t); s.stop(t + 0.07);
    if (!up) this.crackle(v, 0.8, 4);
  }
  thud(gain = 0.4) {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime;
    const s = this.noiseSrc(); const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 300; const g = c.createGain();
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35); s.connect(f); f.connect(g); g.connect(this.sfxBus); s.start(t); s.stop(t + 0.4);
  }
  scrape(gain = 0.2) { // knee / peg scrape
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime;
    const s = this.noiseSrc(true); const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 3500; const g = c.createGain();
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18); s.connect(f); f.connect(g); g.connect(this.sfxBus); s.start(t); s.stop(t + 0.2);
  }
  click() { this.blip(1400, 0.04, 'square', 0.05); }
  whoosh() { if (!this.ctx) return; const c = this.ctx, t = c.currentTime; const s = this.noiseSrc(); const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2; f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(3000, t + 0.25); const g = c.createGain(); g.gain.setValueAtTime(0.001, t); g.gain.linearRampToValueAtTime(0.08, t + 0.08); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35); s.connect(f); f.connect(g); g.connect(this.sfxBus); s.start(t); s.stop(t + 0.4); }

  // ---------- original menu music: 112 bpm synth loop (Am - F - C - G), look-ahead scheduler ----------
  startMusic() {
    if (!this.ctx || this.music || (this.vol.music ?? 0.5) <= 0) return;
    const c = this.ctx, bpm = 112, beat = 60 / bpm, s16 = beat / 4;
    const chords = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
    const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
    const bus = c.createGain(); bus.gain.value = 0; bus.connect(this.musicBus);
    bus.gain.setTargetAtTime(1, c.currentTime, 0.8);
    const delay = c.createDelay(1); delay.delayTime.value = beat * 0.75; const fb = c.createGain(); fb.gain.value = 0.28; const dl = c.createBiquadFilter(); dl.type = 'lowpass'; dl.frequency.value = 2400;
    delay.connect(dl); dl.connect(fb); fb.connect(delay); dl.connect(bus);
    const m = { bus, step: 0, next: c.currentTime + 0.1, timer: 0 };
    const note = (freq, t, dur, type, gain, cut, toDelay) => {
      const o = c.createOscillator(); o.type = type; o.frequency.value = freq; const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cut; const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(f); f.connect(g); g.connect(bus); if (toDelay) g.connect(delay); o.start(t); o.stop(t + dur + 0.05);
    };
    const kick = (t) => { const o = c.createOscillator(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.18); const g = c.createGain(); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3); o.connect(g); g.connect(bus); o.start(t); o.stop(t + 0.32); };
    const hat = (t, a) => { const s = this.noiseSrc(true); const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000; const g = c.createGain(); g.gain.setValueAtTime(a, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05); s.connect(f); f.connect(g); g.connect(bus); s.start(t); s.stop(t + 0.06); };
    const tick = () => {
      while (m.next < c.currentTime + 0.25) {
        const t = m.next, st = m.step, bar = Math.floor(st / 16) % 4, k = st % 16, ch = chords[bar];
        if (k % 4 === 0) kick(t);
        if (k % 2 === 1) hat(t, k % 4 === 3 ? 0.05 : 0.025);
        if (k % 2 === 0) note(hz(ch[0] - 24 + (k % 8 === 6 ? 12 : 0)), t, s16 * 1.8, 'sawtooth', 0.11, 600, false);
        if (k === 0) for (const n of ch) note(hz(n), t, beat * 3.8, 'triangle', 0.045, 1800, false);
        const arp = [0, 1, 2, 1, 2, 0, 1, 2][k % 8];
        if (k % 2 === 0 || Math.floor(st / 64) % 2) note(hz(ch[arp] + 12), t, s16 * 0.9, 'square', 0.022, 2600, true);
        m.step++; m.next += s16;
      }
    };
    tick(); m.timer = setInterval(tick, 60);
    this.music = m;
  }
  stopMusic() {
    if (!this.music) return; const m = this.music; this.music = null; clearInterval(m.timer);
    try { m.bus.gain.setTargetAtTime(0, this.ctx.currentTime, 0.25); setTimeout(() => m.bus.disconnect(), 1500); } catch { }
  }
}
export const audio = new Audio();
