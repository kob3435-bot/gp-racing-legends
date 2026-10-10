import { now } from './transport.js';
// Per-race network sync.
//  - own bike: simulated locally every physics step with zero input delay (prediction); state sent at 30 Hz
//  - host: authoritative AI + start lights + finish order; host bike 30 Hz, AI snapshot 20 Hz (compact arrays)
//  - remote bikes: samples stamped with the sender's race clock (synced at the green light) go into a jitter buffer;
//    rendered at (local race time - adaptive delay) with interpolation, short extrapolation and a velocity-aware
//    correction filter so they never jitter or snap
const r2 = (x) => Math.round(x * 100) / 100, r3 = (x) => Math.round(x * 1000) / 1000;
function pack(e) {
  return [e.idx, r2(e.s), r2(e.d), r3(e.psi), r2(e.v), r3(e.lean), e.gear, Math.round(e.rpm / 10),
    (e.crashT > 0 ? 1 : 0) | (e.finished ? 2 : 0) | (e.offTrack ? 4 : 0) | (e.projected ? 8 : 0),
    e.finished ? r3(e.finishTime) : 0, e.lap, isFinite(e.bestLap) ? r3(e.bestLap) : 0, r2(e.throttle || 0), r2(e.brake || 0)];
}
const HOST_HZ = 30, AI_HZ = 20, GUEST_HZ = 30;

export class NetRace {
  constructor(session, game, race, cfg) {
    this.session = session; this.game = game; this.race = race; this.role = session.role;
    this.buf = new Map(); this.lags = []; this.delay = 0.12; this.target = 0.12; this.delayInit = false;
    this.lastStamp = new Map(); this.gaps = [];
    this.offline = !session.connected(); this.finalRx = null; this.finalSent = false; this.lights = null;
    this.txH = 0; this.txS = 0; this.rivalT = 0;
    this.metrics = { rx: 0, extrapSteps: 0, steps: 0, snaps: 0, maxExtrap: 0 };
    const humans = cfg.humans || [];
    for (const e of race.entrants) {
      e.human = humans.includes(e.rider.id);
      e.remote = this.role === 'host' ? (e.human && !e.isPlayer) : !e.isPlayer;
    }
    if (this.offline) for (const e of race.entrants) e.remote = false; // nobody to listen to: AI rides the vacant bike
    this.rival = race.entrants.find(e => e.human && !e.isPlayer) || null;
    race.remoteApply = (e, dt) => this.apply(e, dt);
    window.__net = this;
  }
  setLights(localAt, hold) { this.lights = { at: localAt, hold }; }
  // ---------- receive ----------
  onMsg(m) {
    if (m.t === 'H' || m.t === 'S' || m.t === 'G') this.ingest(m.r, m.e);
    else if (m.t === 'final') this.finalRx = m;
  }
  ingest(t, entries) {
    const race = this.race; this.metrics.rx++;
    // one-way "lag" in race-clock terms (network delay + clock skew between devices); drives the buffer delay
    this.lags.push(race.t - t); if (this.lags.length > 90) this.lags.shift();
    for (const a of entries) {
      const e = race.entrants[a[0]]; if (!e || !e.remote) continue;
      let b = this.buf.get(e.idx); if (!b) this.buf.set(e.idx, (b = []));
      const smp = { t, s: a[1], d: a[2], psi: a[3], v: a[4], lean: a[5], gear: a[6], rpm: a[7] * 10, fl: a[8], ft: a[9], lap: a[10], best: a[11], th: a[12], br: a[13] };
      const last = b[b.length - 1];
      if (!last || t > last.t) b.push(smp);
      else if (t < last.t) { let i = b.length - 1; while (i > 0 && b[i - 1].t > t) i--; if (b[i] && b[i].t !== t) b.splice(i, 0, smp); } // unordered channel
      if (b.length > 48) b.shift();
      const ls = this.lastStamp.get(e.idx); if (ls !== undefined && t > ls) { this.gaps.push(t - ls); if (this.gaps.length > 60) this.gaps.shift(); }
      if (ls === undefined || t > ls) this.lastStamp.set(e.idx, t);
      if ((smp.fl & 2) && smp.ft > 0) e.netFt = smp.ft;
      if (smp.best > 0) e.netBest = smp.best;
    }
    const sorted = this.lags.slice().sort((x, y) => x - y);
    const p90 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))];
    const gap = this.gaps.length ? this.gaps.reduce((x, y) => x + y, 0) / this.gaps.length : 1 / 30;
    this.target = Math.max(0.06, Math.min(0.6, p90 + gap * 1.3 + 0.01));
    if (!this.delayInit && this.lags.length >= 6) { this.delay = this.target; this.delayInit = true; }
  }
  // ---------- remote bike for one physics step ----------
  apply(e, dt) {
    const b = this.buf.get(e.idx); if (!b || !b.length) return;
    const T = this.race.t - this.delay; this.metrics.steps++;
    let s, d, psi, v, lean, src;
    if (T <= b[0].t) { src = b[0]; ({ s, d, psi, v, lean } = src); }
    else {
      let i = b.length - 1; while (i > 0 && b[i - 1].t > T) i--;
      if (T < b[b.length - 1].t) {
        const A = b[Math.max(0, i - 1)], B = b[i], k = (T - A.t) / Math.max(1e-6, B.t - A.t);
        s = A.s + (B.s - A.s) * k; d = A.d + (B.d - A.d) * k; psi = A.psi + (B.psi - A.psi) * k; v = A.v + (B.v - A.v) * k; lean = A.lean + (B.lean - A.lean) * k; src = B;
      } else { // ran out of samples: dead-reckon briefly
        src = b[b.length - 1]; const x = Math.min(0.3, T - src.t);
        s = src.s + src.v * x; d = src.d + Math.sin(src.psi) * src.v * x * 0.5; psi = src.psi; v = src.v; lean = src.lean;
        this.metrics.extrapSteps++; this.metrics.maxExtrap = Math.max(this.metrics.maxExtrap, T - src.t);
      }
    }
    const far = e._netInit && Math.abs(s - e.s) > 25;
    if (!e._netInit || far) { if (far) this.metrics.snaps++; e.s = s; e.d = d; e.psi = psi; e.lean = lean; e._netInit = true; }
    else {
      // velocity-aware correction: predicted continuation blended towards the buffered target (no added lag when on track)
      const pred = e.s + v * dt, k = 1 - Math.exp(-dt * 14), kd = 1 - Math.exp(-dt * 20);
      e.s = pred + (s - pred) * k; e.d += (d - e.d) * kd; e.psi += (psi - e.psi) * kd; e.lean += (lean - e.lean) * kd;
    }
    e.accel = (v - (e.v || 0)) / Math.max(dt, 1e-3) * 0.1 + (e.accel || 0) * 0.9; e.v = v;
    e.gear = src.gear; e.rpm = src.rpm; e.crashT = src.fl & 1 ? 1 : 0; e.offTrack = !!(src.fl & 4); e.throttle = src.th; e.brake = src.br; e.started = true;
    if (e.netBest && e.netBest < e.bestLap) e.bestLap = e.netBest;
    if (e.netFt && !e.finished && this.race.goTime !== null) {
      e.finished = true; e.finishTime = e.netFt; e.lap = this.race.laps; this.race.events.push({ type: 'finish', e });
    }
  }
  // ---------- per frame: send own state, adapt delay, rival HUD ----------
  frame(dt) {
    const race = this.race, L = this.session.link, t = now();
    const rate = 0.06 * dt; this.delay += Math.max(-rate, Math.min(rate, this.target - this.delay)); // <=6% time warp, never a jump
    if (L && L.open && !this.offline) {
      if (this.role === 'host') {
        if (t - this.txH >= 1000 / HOST_HZ && race.player) { this.txH = t; L.sendFast({ t: 'H', r: r3(race.t), e: [pack(race.player)] }); }
        if (t - this.txS >= 1000 / AI_HZ) { this.txS = t; L.sendFast({ t: 'S', r: r3(race.t), e: race.entrants.filter(e => !e.isPlayer && !e.remote).map(pack) }); }
      } else if (race.player && t - this.txH >= 1000 / GUEST_HZ) { this.txH = t; L.sendFast({ t: 'G', r: r3(race.t), e: [pack(race.player)] }); }
    }
    this.rivalT -= dt;
    if (this.rivalT <= 0 && this.rival && race.player) { this.rivalT = 0.25; this.game.hud.rival && this.game.hud.rival(this.rival, race.player, race); }
  }
  // peer dropped mid-race: AI takes the vacant bikes over from their last state
  drop() {
    if (this.offline) return;
    this.offline = true;
    for (const e of this.race.entrants) if (e.remote) { e.remote = false; e.started = true; e._netInit = false; }
    this.game.hud.note(this.role === 'host' ? 'RIVAL DISCONNECTED · AI TAKES OVER' : 'HOST DISCONNECTED · RACE CONTINUES OFFLINE', 'red', 4);
  }
  canPodium() {
    if (this.offline) return true;
    if (this.role === 'host') return !this.rival || this.rival.finished;
    return !!this.finalRx;
  }
  // host: authoritative classification sent before the podium so both devices show identical results/points
  makeFinal() {
    const race = this.race, fl = race.fastestLap;
    return { t: 'final', e: race.entrants.map(e => [e.idx, r3(e.finishTime), e.projected ? 1 : 0, isFinite(e.bestLap) ? r3(e.bestLap) : 0]), fl: fl ? [fl.e.idx, r3(fl.time)] : null };
  }
  applyFinal(m) {
    const race = this.race;
    for (const [idx, ft, pj, best] of m.e) { const e = race.entrants[idx]; e.finished = true; e.finishTime = ft; e.projected = !!pj; e.bestLap = best || Infinity; }
    if (m.fl) { const e = race.entrants[m.fl[0]]; race.fastestLap = { time: m.fl[1], rider: e.rider, e, lap: 0 }; } else race.fastestLap = null;
    race.updatePositions();
  }
}
