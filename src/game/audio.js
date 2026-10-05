// Web Audio synthesis — engines (V4 / inline-4 character), shifts, wind, crowd, rain, start beeps. No samples.
export class Audio {
  constructor() { this.ctx = null; this.vol = { master: 0.8, engine: 0.8, sfx: 0.7 }; this.voices = []; }
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return true; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
    this.ctx = new AC();
    const c = this.ctx;
    this.master = c.createGain(); this.master.connect(c.destination);
    this.comp = c.createDynamicsCompressor(); this.comp.connect(this.master);
    this.engineBus = c.createGain(); this.engineBus.connect(this.comp);
    this.sfxBus = c.createGain(); this.sfxBus.connect(this.comp);
    // noise buffer
    const len = c.sampleRate * 2; const buf = c.createBuffer(1, len, c.sampleRate); const d = buf.getChannelData(0);
    let last = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = w * 0.6 + last * 3; }
    this.noise = buf;
    this.applyVolume();
    return true;
  }
  setVolume(v) { Object.assign(this.vol, v); this.applyVolume(); }
  applyVolume() { if (!this.ctx) return; this.master.gain.value = this.vol.master; this.engineBus.gain.value = this.vol.engine; this.sfxBus.gain.value = this.vol.sfx; }
  noiseSrc() { const s = this.ctx.createBufferSource(); s.buffer = this.noise; s.loop = true; return s; }

  makeEngine(kind, gainScale = 1) {
    const c = this.ctx; const v = { kind, gainScale };
    const out = c.createGain(); out.gain.value = 0; out.connect(this.engineBus);
    const pan = c.createStereoPanner ? c.createStereoPanner() : null;
    const filt = c.createBiquadFilter(); filt.type = 'lowpass'; filt.Q.value = kind === 'V4' ? 4 : 2.5;
    const shaper = c.createWaveShaper(); const curve = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * (kind === 'V4' ? 3.2 : 2.2)); } shaper.curve = curve;
    const am = c.createGain(); am.gain.value = 1;
    const o1 = c.createOscillator(); o1.type = 'sawtooth';
    const o2 = c.createOscillator(); o2.type = kind === 'V4' ? 'square' : 'sawtooth';
    const o3 = c.createOscillator(); o3.type = 'triangle';
    const g1 = c.createGain(), g2 = c.createGain(), g3 = c.createGain();
    g1.gain.value = 0.5; g2.gain.value = kind === 'V4' ? 0.45 : 0.25; g3.gain.value = kind === 'V4' ? 0.15 : 0.35;
    o1.connect(g1); o2.connect(g2); o3.connect(g3); g1.connect(shaper); g2.connect(shaper); g3.connect(shaper);
    shaper.connect(am); am.connect(filt);
    if (pan) { filt.connect(pan); pan.connect(out); } else filt.connect(out);
    // V4 "big bang" uneven firing -> amplitude modulation rumble
    const lfo = c.createOscillator(); lfo.type = kind === 'V4' ? 'square' : 'sine';
    const lfoG = c.createGain(); lfoG.gain.value = kind === 'V4' ? 0.35 : 0.08; lfo.connect(lfoG); lfoG.connect(am.gain);
    for (const o of [o1, o2, o3, lfo]) o.start();
    Object.assign(v, { out, filt, o1, o2, o3, lfo, pan, am });
    this.voices.push(v);
    return v;
  }
  setEngine(v, rpm, throttle, gain = 1, panX = 0, doppler = 1) {
    if (!v) return;
    const t = this.ctx.currentTime;
    const f = (v.kind === 'V4' ? 0.9 : 1.15) * (rpm / 60) * 0.5 * doppler;
    v.o1.frequency.setTargetAtTime(f, t, 0.03);
    v.o2.frequency.setTargetAtTime(f * (v.kind === 'V4' ? 0.5 : 2.0), t, 0.03);
    v.o3.frequency.setTargetAtTime(f * (v.kind === 'V4' ? 1.5 : 3.0), t, 0.03);
    v.lfo.frequency.setTargetAtTime(f * (v.kind === 'V4' ? 0.25 : 0.5), t, 0.05);
    v.filt.frequency.setTargetAtTime(500 + rpm * (0.08 + throttle * 0.12) * (v.kind === 'V4' ? 0.8 : 1.25), t, 0.05);
    v.out.gain.setTargetAtTime((0.05 + throttle * 0.11) * gain * v.gainScale, t, 0.05);
    if (v.pan) v.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, panX)), t, 0.05);
  }
  startAmbience(rain) {
    const c = this.ctx;
    this.stopAmbience();
    const wind = this.noiseSrc(); const wf = c.createBiquadFilter(); wf.type = 'bandpass'; wf.Q.value = 0.7; const wg = c.createGain(); wg.gain.value = 0;
    wind.connect(wf); wf.connect(wg); wg.connect(this.sfxBus); wind.start();
    const crowd = this.noiseSrc(); const cf = c.createBiquadFilter(); cf.type = 'bandpass'; cf.frequency.value = 900; cf.Q.value = 0.4; const cg = c.createGain(); cg.gain.value = 0.025;
    crowd.connect(cf); cf.connect(cg); cg.connect(this.sfxBus); crowd.start();
    let rg = null, rs = null;
    if (rain) { rs = this.noiseSrc(); const rf = c.createBiquadFilter(); rf.type = 'highpass'; rf.frequency.value = 2500; rg = c.createGain(); rg.gain.value = rain * 0.06; rs.connect(rf); rf.connect(rg); rg.connect(this.sfxBus); rs.start(); }
    this.amb = { wind, wf, wg, crowd, cg, rs, rg };
  }
  setWind(speed, crowdNear) {
    if (!this.amb) return; const t = this.ctx.currentTime;
    this.amb.wf.frequency.setTargetAtTime(400 + speed * 14, t, 0.1);
    this.amb.wg.gain.setTargetAtTime(Math.min(0.35, (speed / 90) ** 2 * 0.3), t, 0.1);
    this.amb.cg.gain.setTargetAtTime(0.02 + crowdNear * 0.06, t, 0.3);
  }
  stopAmbience() { if (!this.amb) return; for (const s of [this.amb.wind, this.amb.crowd, this.amb.rs]) if (s) try { s.stop(); } catch { } this.amb = null; }
  stopEngines() { for (const v of this.voices) { try { v.out.disconnect(); for (const o of [v.o1, v.o2, v.o3, v.lfo]) o.stop(); } catch { } } this.voices = []; }
  stopAll() { if (!this.ctx) return; this.stopEngines(); this.stopAmbience(); }
  blip(freq = 880, dur = 0.12, type = 'sine', gain = 0.25) {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = type; o.frequency.value = freq; const g = c.createGain();
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.sfxBus); o.start(t); o.stop(t + dur + 0.02);
  }
  shift(v) { // gear change: brief engine dip + mechanical click
    if (!this.ctx) return; const t = this.ctx.currentTime;
    if (v) { v.out.gain.cancelScheduledValues(t); v.out.gain.setValueAtTime(v.out.gain.value * 0.25, t); }
    const s = this.noiseSrc(); const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2200; const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.18, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05); s.connect(f); f.connect(g); g.connect(this.sfxBus); s.start(t); s.stop(t + 0.07);
  }
  thud(gain = 0.4) {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime;
    const s = this.noiseSrc(); const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 300; const g = c.createGain();
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35); s.connect(f); f.connect(g); g.connect(this.sfxBus); s.start(t); s.stop(t + 0.4);
  }
  click() { this.blip(1400, 0.04, 'square', 0.05); }
}
export const audio = new Audio();
