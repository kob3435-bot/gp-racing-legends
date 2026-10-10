// Race simulation: player physics + AI + timing. Pure logic (no rendering).
import { effective, speedProfile, lapTimeOf, accelAt, linePenalty, G, TIRES, autoTire, qualiTime, rollMistake } from './perf.js';
import { lerpArr, mulberry } from './trackgeom.js';

const CONTROL = {
  // follow: share of the road curvature the bike tracks on its own (the rest needs rider input); resp: heading response (1/s)
  SEMI: { assistMu: 0.985, assistDecel: 0.97, follow: 0.6, resp: 9, auto: true, crash: false, pull: 0 },
  FULL: { assistMu: 0.975, assistDecel: 0.96, follow: 0.82, resp: 9, auto: true, crash: false, pull: 0.5 },
  MANUAL: { assistMu: 1, assistDecel: 1, follow: 0.45, resp: 8, auto: false, crash: true, pull: 0 },
};
const GEAR_SPLIT = [0.38, 0.53, 0.66, 0.78, 0.89, 1.0];
const IDLE = 3500, REDLINE = 17500;
function gauss(r) { let u = 0, v = 0; while (!u) u = r(); v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

export function findApexes(geo) {
  const N = geo.N, out = [], W = Math.round(30 / geo.ds);
  for (let i = 0; i < N; i++) {
    const k = Math.abs(geo.lineK[i]); if (k < 1 / 450) continue;
    let isMax = true;
    for (let j = -W; j <= W && isMax; j++) if (j && Math.abs(geo.lineK[(i + j + N) % N]) > k) isMax = false;
    if (isMax && (!out.length || i - out[out.length - 1].i > W)) out.push({ i, sign: Math.sign(geo.lineK[i]), k });
  }
  return out;
}

export class Race {
  constructor(cfg) {
    Object.assign(this, cfg); // geo, track, laps, weather, difficulty, control, gearMode, playerTire, spectator, seed
    this.rand = mulberry(cfg.seed || (Math.random() * 1e9) | 0);
    this.t = 0; this.phase = 'grid'; this.lightsOn = 0; this.goTime = null;
    this.apexes = findApexes(this.geo);
    this.ctl = CONTROL[cfg.control || 'SEMI'];
    this.wearScale = Math.max(1, Math.min(4, 22 / this.laps));
    this.events = []; this.overtakes = 0; this.fastestLap = null; this.bestSec = [Infinity, Infinity, Infinity];
    this.lodS = null; // focus position: AI far from it is integrated at 30 Hz (simplified sim)
    this._apObj = Array.from({ length: 48 }, () => ({ i: 0, sign: 0, k: 0, dist: 0 })); this._apK = 0; this._apArr = Array.from({ length: 8 }, () => []); this._apA = 0;
    this._sortFn = (a, b) => { if (a.finished && b.finished) return a.finishTime - b.finishTime; if (a.finished) return -1; if (b.finished) return 1; return b.s - a.s; };
    const tireAuto = autoTire(this.weather, this.track);
    this.entrants = cfg.entrants.map((en, k) => {
      const tire = en.isPlayer && cfg.playerTire && cfg.playerTire !== 'AUTO' ? cfg.playerTire : tireAuto;
      const e = {
        idx: k, rider: en.rider, bike: en.bike, isPlayer: !!en.isPlayer, tire, wear: 0,
        s: 0, d: 0, v: 0, psi: 0, yaw: 0, lean: 0, accel: 0, steer: 0,
        lap: 0, finished: false, finishTime: 0, lapTimes: [], bestLap: Infinity, lapStart: 0,
        cp: new Float32Array(Math.ceil((this.laps * this.geo.L + 400) / 50) + 4), started: false,
        tactical: 0, tacTimer: this.rand() * 0.3, mode: 'cruise', personalOff: (this.rand() - 0.5) * 1.2,
        mistake: null, nextApexChecked: -1, crashT: 0, offTrack: false, gear: 1, rpm: IDLE, shiftCut: 0,
        throttle: 0, brake: 0, draft: 0, pos: k + 1, offLineErr: 0, collideT: 0, lastPos: k + 1,
        secCount: -1, secT: 0, bestSec: [Infinity, Infinity, Infinity], lodAcc: 0, lockup: 0, dive: false, passedBy: null, passedT: -9,
      };
      this.recompute(e);
      return e;
    });
    this.player = this.entrants.find(e => e.isPlayer) || null;
    this.wallD = this.geo.halfW + 21;
  }

  recompute(e) {
    const opts = { weather: this.weather, tire: e.tire, wear: e.wear, difficulty: e.isPlayer ? null : this.difficulty };
    e.eff = effective(e.rider, e.bike, this.track, opts);
    // assisted modes are slightly conservative (auto-brake safety margin); manual riders can use 100% of the tyre
    if (e.isPlayer && !this.spectator) { e.eff.mu *= this.ctl.assistMu; e.eff.decel *= this.ctl.assistDecel; }
    e.prof = speedProfile(this.geo, this.geo.lineK, e.eff, e.prof);
    if (!e.lapEst) e.lapEst = lapTimeOf(this.geo, e.prof);
    if (e.formF === undefined) e.formF = 1 + gauss(this.rand) * e.eff.formSigma;
    e.paceF = e.formF * (1 + gauss(this.rand) * e.eff.sigma);
  }

  // simulated qualifying -> grid order (array of entrants)
  qualify() {
    const scored = this.entrants.map(e => {
      const q = qualiTime(e.lapEst, e.eff, gauss(this.rand));
      return { e, q };
    }).sort((a, b) => a.q - b.q);
    this.qualiTimes = scored.map(x => ({ id: x.e.rider.id, time: x.q }));
    return scored.map(x => x.e);
  }
  placeOnGrid(order, slots) {
    order.forEach((e, k) => { e.s = slots[k].s; e.d = slots[k].d; e.gridPos = k + 1; e.pos = k + 1; e.lastPos = k + 1; });
    this.order = order.slice();
  }

  // ---------------- start sequence ----------------
  updateStart(dt) {
    if (this.phase === 'grid') { this.phase = 'lights'; this.lightT = 0; }
    if (this.phase === 'lights') {
      this.lightT += dt;
      const on = Math.min(5, Math.floor(this.lightT / 0.9));
      if (on !== this.lightsOn) { this.lightsOn = on; this.events.push({ type: 'light', n: on }); }
      if (!this.holdT && on === 5) this.holdT = this.lightT + 0.4 + this.rand() * 1.6;
      if (this.holdT && this.lightT >= this.holdT) {
        this.phase = 'race'; this.lightsOn = 0; this.goTime = this.t; this.events.push({ type: 'go' });
        for (const e of this.entrants) e.startDelay = e.eff.reaction * (0.8 + this.rand() * 0.5);
      }
    }
  }

  // ---------------- main step ----------------
  step(dt, input) {
    this.t += dt;
    if (this.phase !== 'race' && this.phase !== 'finished') { this.updateStart(dt); return; }
    const raceT = this.t - this.goTime;
    for (const e of this.entrants) {
      if (e.finished && e.coast === undefined) e.coast = 0;
      if (!e.started) { if (raceT >= e.startDelay && (!e.isPlayer || this.ctl.auto || this.autopilot || (input && input.throttle > 0.2) || this.spectator)) e.started = true; else { e.rpm = e.isPlayer && input && input.throttle > 0.2 ? 11000 : 6000 + Math.sin(this.t * 9 + e.idx) * 900; continue; } }
      if (e.isPlayer && !this.autopilot) this.stepPlayer(e, dt, input || {}, raceT);
      else {
        if (this.lodS !== null && !e.isPlayer && raceT > 5) {
          const L = this.geo.L; let dl = (e.s - this.lodS) % L; if (dl > L / 2) dl -= L; if (dl < -L / 2) dl += L;
          if (Math.abs(dl) > 600) { e.lodAcc += dt; if (e.lodAcc < 1 / 30) { this.timing(e); continue; } this.stepAI(e, e.lodAcc, raceT); e.lodAcc = 0; this.timing(e); continue; }
        }
        if (e.lodAcc > 0) { this.stepAI(e, e.lodAcc, raceT); e.lodAcc = 0; }
        this.stepAI(e, dt, raceT);
      }
      this.timing(e);
    }
    this.collisions(dt);
    this.updatePositions();
  }

  ahead(e, maxGap) {
    let best = null, bg = maxGap;
    for (const o of this.entrants) { if (o === e || o.crashT > 0) continue; const g = o.s - e.s; if (g > 0 && g < bg) { bg = g; best = o; } }
    return best ? [best, bg] : null;
  }
  behind(e, maxGap) {
    let best = null, bg = maxGap;
    for (const o of this.entrants) { if (o === e || o.crashT > 0) continue; const g = e.s - o.s; if (g > 0 && g < bg) { bg = g; best = o; } }
    return best ? [best, bg] : null;
  }
  nextApexes(s, count = 2, maxDist = 420) {
    const geo = this.geo, N = geo.N; const i0 = ((Math.floor(s / geo.ds) % N) + N) % N;
    const out = this._apArr[this._apA = (this._apA + 1) % 8]; out.length = 0;
    const A = this.apexes; if (!A.length) return out;
    let lo = 0; while (lo < A.length && A[lo].i < i0) lo++;
    for (let k = 0; k < A.length && out.length < count; k++) {
      const a = A[(lo + k) % A.length]; let di = a.i - i0; if (di < 0) di += N;
      const dist = di * geo.ds; if (dist > maxDist) break; const o = this._apObj[this._apK = (this._apK + 1) % 48]; o.i = a.i; o.sign = a.sign; o.k = a.k; o.dist = dist; out.push(o);
    }
    return out;
  }
  alongside(e) {
    for (const o of this.entrants) { if (o === e || o.crashT > 0 || o.finished) continue; const g = o.s - e.s; if (g > -1.8 && g < 2.2 && Math.abs(o.d - e.d) < 2.2) return o; }
    return null;
  }
  draftFor(e) {
    const a = this.ahead(e, 34); if (!a) return 0;
    const [o, gap] = a; if (gap < 1.5 || Math.abs(o.d - e.d) > 1.4) return 0;
    return (1 - gap / 34) * (0.6 + 0.4 * (e.eff.slipstream / 99));
  }

  // ---------------- AI ----------------
  stepAI(e, dt, raceT) {
    const geo = this.geo, N = geo.N, p = e.eff;
    if (e.crashT > 0) { // fallen: wait, then rejoin from the run-off
      e.crashT -= dt; e.v = Math.max(0, e.v - 9 * dt); e.s += e.v * dt; e.lean = 1.3;
      if (e.crashT <= 0) { e.v = 0; e.lean = 0; e.d = Math.sign(e.d || 1) * (geo.halfW - 1); }
      return;
    }
    const i = ((Math.floor(e.s / geo.ds) % N) + N) % N;
    // tactics at ~4 Hz
    e.tacTimer -= dt * (e.blocked > 0.3 ? 2 : 1);
    if (e.tacTimer <= 0 && !e.finished) { e.tacTimer = 0.22 + this.rand() * 0.12; this.tactics(e); }
    if (e.finished) e.tactical *= 0.98;
    const laIdx = (i + Math.round(Math.max(10, e.v * 0.45) / geo.ds)) % N;
    const cornerness = Math.min(1, Math.abs(geo.lineK[laIdx]) * 250);
    let mistakeOff = 0;
    if (e.mistake) { mistakeOff = e.mistake.off * Math.max(0, 1 - Math.abs(e.mistake.at - e.s) / 120); if (e.s > e.mistake.at + 120) e.mistake = null; }
    const lim = geo.halfW - 0.7;
    let desired = geo.lineD[laIdx] + e.personalOff * (1 - cornerness) + e.tactical + mistakeOff;
    desired = Math.max(-lim - (mistakeOff ? 8 : 0), Math.min(lim + (mistakeOff ? 8 : 0), desired));
    const latMaxV = (e.mode === 'attack' ? 4.6 : 3.4) * Math.min(1, 0.4 + e.v / 40);
    const dd = Math.max(-latMaxV, Math.min(latMaxV, (desired - e.d) * 1.9));
    e.d += dd * dt;
    e.psi = Math.atan2(dd, Math.max(5, e.v));
    // target speed
    let vt = 1e9;
    const k = Math.abs(geo.lineK[i]);
    const errNow = Math.abs(e.d - geo.lineD[i]);
    if (k > 1 / 500) vt = e.prof[i] * e.paceF / Math.sqrt(linePenalty(geo, errNow));
    const aps = this.nextApexes(e.s, 2);
    for (const a of aps) {
      // per-corner mistake roll (consistency-driven), once per corner
      if (a === aps[0] && e.nextApexChecked !== a.i && a.dist < 160) {
        e.nextApexChecked = a.i;
        const perCorner = p.mistakeRate / Math.max(6, this.apexes.length);
        if (this.rand() < perCorner && raceT > 4) {
          const sev = rollMistake(this.rand());
          e.mistake = { at: e.s + a.dist, off: -a.sign * (sev === 1 ? 2.5 : 6.5), pen: sev === 1 ? 1.25 : 1.55, sev, lock: sev >= 2 || this.rand() < 0.4 };
          if (sev === 3 && !this.spectatorSafe) { e.crashT = 0; e.mistake.crash = true; }
          else this.events.push({ type: 'mistake', e, kind: e.mistake.lock ? 'LOCK-UP' : 'RUNS WIDE' });
        } else if (e.dive && this.rand() < 0.07 + (e.rider.personality === 'LATE BRAKER' ? 0.05 : 0)) {
          // over-committed late dive: runs wide past the apex (can open the door for a switchback)
          e.mistake = { at: e.s + a.dist, off: -a.sign * 2.2, pen: 1.18, sev: 1, lock: this.rand() < 0.6 };
          this.events.push({ type: 'mistake', e, kind: e.mistake.lock ? 'LOCK-UP' : 'RUNS WIDE' });
        }
      }
      const off = (e.mistake && Math.abs(e.mistake.at - (e.s + a.dist)) < 30) ? e.mistake : null;
      const predD = Math.max(-lim, Math.min(lim, geo.lineD[a.i] + e.tactical * 0.8));
      let pen = linePenalty(geo, Math.abs(predD - geo.lineD[a.i]));
      if (off) pen *= off.pen;
      // late-braking dive: brakes later but carries a compromised apex (net neutral pace, more passes)
      const dive = e.dive && a === aps[0] && a.dist < 200;
      const vA = e.prof[a.i] * e.paceF / Math.sqrt(pen * (dive ? 1.07 : 1));
      const vreq = Math.sqrt(vA * vA + 2 * p.decel * p.brakeAcc * (dive ? 1.05 : 1) * Math.max(0, a.dist - 4));
      vt = Math.min(vt, vreq);
      if (off && off.crash && a.dist < 12) { e.crashT = 9 + this.rand() * 6; e.mistake = null; this.events.push({ type: 'crash', e }); return; }
    }
    e.lockup = e.mistake && e.mistake.lock && e.accel < -4 && e.mistake.at - e.s < 90 && e.mistake.at > e.s ? 1 : Math.max(0, e.lockup - dt * 3);
    // traffic: can't drive through the bike ahead
    const ah = this.ahead(e, 9);
    if (ah && Math.abs(ah[0].d - e.d) < 1.0) { vt = Math.min(vt, ah[0].v + (ah[1] - 3.2) * 1.3); e.blocked = (e.blocked || 0) + dt; } else e.blocked = 0;
    e.draft = this.draftFor(e);
    const vTopEff = p.vTop * (1 + 0.032 * e.draft);
    const off = Math.abs(e.d) > geo.halfW + 1.3;
    if (off) vt = Math.min(vt, 30);
    let a = 0;
    if (e.v > vt) a = -Math.min(p.decel * 1.05, (e.v - vt) * 6);
    else {
      const launch = raceT < 3 ? p.launch : 1;
      const latUse = e.v * e.v * k / (p.mu * G);
      a = accelAt({ a0: p.a0, vTop: vTopEff }, e.v) * launch * Math.sqrt(Math.max(0.15, 1 - latUse * latUse)) * e.paceF;
      a = Math.min(a, (vt - e.v) / dt);
    }
    if (off) a -= 3;
    if (e.finished) a = Math.min(a, e.v > 45 ? -2 : 0);
    e.accel = a; e.v = Math.max(0, e.v + a * dt);
    e.s += e.v * Math.cos(e.psi) * dt;
    const kc = geo.kappa[i];
    e.lean = Math.atan(e.v * e.v * kc / G) * 0.95;
    this.gearbox(e, dt, true);
  }

  tactics(e) {
    const geo = this.geo, lim = geo.halfW - 0.8;
    const ap = this.nextApexes(e.s, 1, 320)[0];
    const ah = this.ahead(e, 40), bh = this.behind(e, 16);
    const p = e.eff;
    const pers = e.rider.personality;
    const aggr = (p.aggression + (pers === 'AGGRESSIVE' ? 8 : 0) + (pers === 'LATE BRAKER' ? 5 : 0)) / 100;
    let target = 0; e.mode = 'cruise'; e.dive = false;
    // switchback: just got passed into a corner -> cross back under the passer on the exit
    if (e.passedBy && this.t - e.passedT < 1.6 && ap && ap.dist < 120 && !e.finished) {
      const o = e.passedBy; const gap = o.s - e.s;
      if (gap > 0 && gap < 12 && this.rand() < 0.35 + aggr * 0.5) {
        const i = ((Math.floor(e.s / geo.ds) % geo.N) + geo.N) % geo.N;
        target = Math.max(-lim, Math.min(lim, o.d - Math.sign(o.d - e.d || ap.sign) * 1.9)) - geo.lineD[i];
        e.mode = 'attack'; e.tactical += (target - e.tactical) * 0.5; return;
      }
    }
    // side-by-side: hold a lane instead of tucking in when alongside
    const al = this.alongside(e);
    if (al && !e.finished) {
      const i = ((Math.floor(e.s / geo.ds) % geo.N) + geo.N) % geo.N;
      const side = Math.sign(e.d - al.d) || 1;
      target = Math.max(-lim, Math.min(lim, al.d + side * 1.6)) - geo.lineD[i];
      e.mode = 'side'; e.tactical += (target - e.tactical) * 0.4; return;
    }
    if (ah) {
      const [o, gap] = ah;
      const closing = e.v - o.v;
      const faster = e.lapEst / e.paceF < o.lapEst / o.paceF - 0.04 || closing > 1.2 || o.mistake;
      if (faster || (gap < 10 && this.rand() < aggr * 0.5)) {
        e.mode = 'attack';
        const skill = (p.overtaking + p.racecraft) / 200;
        if (ap && ap.dist < 230 && gap < 18) {
          // dive up the inside under braking (late brakers commit more)
          const inside = ap.sign;
          const want = Math.max(-lim, Math.min(lim, o.d + inside * (1.5 + skill)));
          target = want - geo.lineD[ap.i];
          if (this.rand() > 0.35 + skill * 0.5) target *= 0.5; // hesitates
          else if (gap < 12 && this.rand() < aggr * 0.9) e.dive = true; // commits to a late-braking dive
        } else if (gap < 9 && !(e.draft > 0.3 && gap > 4.5 && (!ap || ap.dist > 260))) {
          // pull out of the slipstream to the side with more room (after building the tow on a straight)
          const side = o.d > 0 ? -1 : 1;
          const i = ((Math.floor(e.s / geo.ds) % geo.N) + geo.N) % geo.N;
          target = Math.max(-lim, Math.min(lim, o.d + side * 1.9)) - geo.lineD[i];
        } else {
          const i = ((Math.floor(e.s / geo.ds) % geo.N) + geo.N) % geo.N;
          target = (o.d - geo.lineD[i]) * 0.8; // tuck into the tow
        }
      }
    }
    if (e.mode !== 'attack' && bh && bh[1] < 12 && ap && ap.dist < 260) {
      const def = (p.defending + (pers === 'DEFENSIVE' ? 10 : 0)) / 100;
      if (this.rand() < def * 0.8) { e.mode = 'defend'; target = ap.sign * Math.min(2.4, lim - Math.abs(geo.lineD[ap.i])) * def; }
    }
    e.tactical += (target - e.tactical) * 0.5;
  }

  // ---------------- player ----------------
  stepPlayer(e, dt, input, raceT) {
    const geo = this.geo, N = geo.N, p = e.eff, ctl = this.ctl;
    if (e.crashT > 0) {
      e.crashT -= dt; e.v = Math.max(0, e.v - 11 * dt); e.s += e.v * dt; e.d += e.v * Math.sin(e.psi) * dt * 0.6;
      e.d = Math.max(-this.wallD + 0.5, Math.min(this.wallD - 0.5, e.d));
      if (e.crashT <= 0 || (input.reset && e.crashT < 1.6)) this.resetPlayer(e);
      return;
    }
    const i = ((Math.floor(e.s / geo.ds) % N) + N) % N;
    const kc = lerpArr(geo, geo.kappa, e.s);
    const kp = kc / Math.max(0.3, 1 - kc * e.d);
    const absd = Math.abs(e.d);
    const onKerb = absd > geo.halfW && absd < geo.halfW + 1.3;
    const off = absd > geo.halfW + 1.3;
    e.offTrack = off;
    const surf = off ? 0.55 : onKerb ? 0.93 : 1;
    const latMax = p.mu * G * surf;
    // assisted modes keep a stability margin so the rider can still tighten the line at the limit
    const steerLat = latMax * (ctl.auto ? 1.12 : 1.0);
    // ---- steering v3: short linear ramp (~0.1 s to full lock), fast return to centre, no heavy smoothing ----
    const target = Math.max(-1, Math.min(1, input.steer || 0));
    if (input.analog) e.steer += (target - e.steer) * Math.min(1, 20 * dt);
    else {
      const dl = target - e.steer, building = target !== 0 && Math.sign(target) === Math.sign(e.steer || target) && Math.abs(target) >= Math.abs(e.steer);
      e.steer += Math.sign(dl) * Math.min(Math.abs(dl), (building ? 10 : 14) * dt);
    }
    const vv = Math.max(4, e.v);
    // full lock = relative heading worth ~6.5 m/s of lateral speed (capped at low speed)
    const psiMax = Math.min(0.45, 6.5 / vv);
    let psiT = e.steer * psiMax;
    // FULL assist: gentle nudge towards the line only while the rider is not steering (never overrides input)
    if (ctl.pull && Math.abs(e.steer) < 0.15) { const la = (i + Math.round(Math.max(12, e.v * 0.6) / geo.ds)) % N; psiT += Math.max(-0.035, Math.min(0.035, ctl.pull * 0.02 * (geo.lineD[la] - e.d))); }
    // soft push-back beyond the kerb in assisted modes (no snapping)
    const softEdge = geo.halfW + 1.3;
    if (ctl.auto && absd > softEdge) psiT -= Math.sign(e.d) * Math.min(0.12, (absd - softEdge) * 0.035);
    // heading relative to the road follows the target quickly; the un-followed share of curvature drifts the bike wide
    let dpsiDes = ctl.resp * (psiT - e.psi) - (1 - ctl.follow) * kp * e.v * Math.cos(e.psi);
    const roadYaw = kp * e.v * Math.cos(e.psi);
    let yaw = dpsiDes + roadYaw, over = 1;
    const demand = Math.abs(yaw * e.v);
    if (demand > steerLat && e.v > 1) { over = demand / steerLat; yaw = Math.sign(yaw) * steerLat / e.v; }
    // auto speed scrubs only when the rider is asking to turn INTO a corner beyond the grip (so holding the key makes it)
    const intoCorner = Math.abs(kp) > 1 / 700 && Math.sign(e.steer) === Math.sign(kp) && Math.abs(e.steer) > 0.4;
    const overAuto = intoCorner ? Math.max(1, Math.abs(kp) * e.v * e.v / (steerLat * 0.95)) : 1;
    // manual: overcooked -> lowside
    if (ctl.crash) {
      // overcooked: crash only when clearly faster (>12%) than the safe speed for this point of the corner given the
      // rider's current line (same model as the red racing line / auto-brake) and still leaning in; just asking for
      // more steering than the tyres allow simply runs the bike wide at the limit
      const kLine = Math.abs(geo.lineK[i]);
      const vSafe = kLine > 1 / 400 ? e.prof[i] / Math.sqrt(linePenalty(geo, e.d - geo.lineD[i])) : 1e9;
      const leaningIn = Math.sign(e.steer || 0) !== -Math.sign(geo.lineK[i]) || Math.abs(e.steer) < 0.2;
      e.overT = e.v > vSafe * 1.12 && over > 1.0 && leaningIn && e.v > 18 ? (e.overT || 0) + dt : Math.max(0, (e.overT || 0) - dt * 2);
      const leanDeg = Math.abs(e.lean) * 57.3;
      if (e.overT > 0.45) return this.crashPlayer(e, 'LOWSIDE', 'over');
      const latUseNow = Math.abs(yaw * e.v) / latMax; // friction circle: hard braking while using most of the lateral grip tucks the front
      if (e.brake > 0.85 && latUseNow > 0.85 && leanDeg > 38 && e.v > 20) { e.frontT = (e.frontT || 0) + dt; if (e.frontT > 0.35) return this.crashPlayer(e, 'LOWSIDE', 'front'); } else e.frontT = Math.max(0, (e.frontT || 0) - dt);
      if (e.throttle > 0.95 && leanDeg > 47 && e.gear <= 3 && e.v > 15 && e.v < 45) { e.hsT = (e.hsT || 0) + dt; if (e.hsT > 0.35) return this.crashPlayer(e, 'HIGHSIDE'); } else e.hsT = 0;
    }
    const dpsi = yaw - roadYaw;
    e.psi += dpsi * dt;
    e.psi = Math.max(-0.9, Math.min(0.9, e.psi));
    e.yaw = yaw;
    // longitudinal
    e.draft = this.draftFor(e);
    const vTopEff = p.vTop * (1 + 0.032 * e.draft);
    const latUse = Math.min(1, Math.abs(e.yaw * e.v) / latMax);
    const circle = Math.sqrt(Math.max(0.12, 1 - latUse * latUse));
    let a = 0;
    const launch = raceT < 3 ? p.launch : 1;
    if (ctl.auto) {
      const vt = this.autoTarget(e, i, overAuto, off);
      e.autoTarget = vt;
      if (e.v > vt + 0.2) { e.brake = Math.min(1, (e.v - vt) / 4); e.throttle = 0; a = -p.decel * Math.max(0.35, e.brake) * Math.min(1, 0.72 + circle); }
      else { e.brake = 0; e.throttle = Math.min(1, (vt - e.v) / 2 + 0.2); a = accelAt({ a0: p.a0, vTop: vTopEff }, e.v) * circle * launch * (e.shiftCut > 0 ? 0.3 : 1); a = Math.min(a, (vt - e.v) / dt); }
    } else {
      e.throttle = input.throttle || 0; e.brake = input.brake || 0;
      const gmax = vTopEff * GEAR_SPLIT[e.gear - 1] * 1.02;
      const gearEff = Math.max(0.3, Math.min(1, (e.rpm - IDLE) / 8000));
      const limiter = e.v >= gmax * 0.995;
      a = (limiter ? 0 : e.throttle * accelAt({ a0: p.a0, vTop: vTopEff }, e.v) * gearEff * circle * launch * (e.shiftCut > 0 ? 0.3 : 1));
      a -= e.brake * p.decel * Math.min(1, 0.45 + circle); // same trail-braking model as auto-brake
      if (e.throttle < 0.1) a -= 0.5 + (e.rpm / REDLINE) * 1.2; // engine braking
      if (e.v > gmax * 1.03) a -= 4; // over-rev on aggressive downshift
    }
    if (off) a -= Math.min(5, e.v * 0.12);
    e.accel = a;
    e.v = Math.max(0, e.v + a * dt);
    const ds = e.v * Math.cos(e.psi) / Math.max(0.3, 1 - kc * e.d);
    e.s += ds * dt;
    e.d += e.v * Math.sin(e.psi) * dt;
    // barrier
    if (Math.abs(e.d) > this.wallD - 0.6) {
      e.d = Math.sign(e.d) * (this.wallD - 0.6);
      if (ctl.crash && e.v > 22) return this.crashPlayer(e, 'BARRIER');
      if (ctl.auto) { e.psi = -Math.sign(e.d) * 0.04; e.v *= 0.85; } else { e.psi *= -0.25; e.v *= 0.62; }
      this.events.push({ type: 'bump', e });
    }
    const leanT = Math.atan(e.yaw * e.v / G);
    e.lean = Math.max(-1.08, Math.min(1.08, leanT));
    e.offLineErr = Math.abs(e.d - geo.lineD[i]);
    this.gearbox(e, dt, ctl.auto || this.gearMode !== 'MANUAL', input);
  }

  autoTarget(e, i, over, off) {
    const geo = this.geo, p = e.eff;
    let vt = p.vTop * (1 + 0.032 * e.draft);
    const k = Math.abs(geo.lineK[i]);
    // the rider's own braking-aware optimal profile is always an upper bound (fixes late braking into long corners)
    vt = Math.min(vt, e.prof[i] / Math.sqrt(k > 1 / 500 ? linePenalty(geo, e.d - geo.lineD[i]) : 1));
    for (const a of this.nextApexes(e.s, 3, 500)) {
      // the further away the corner, the more line correction we assume is still possible
      const err = Math.max(0, Math.abs(e.d - geo.lineD[a.i]) - a.dist * 0.035);
      const vA = e.prof[a.i] / Math.sqrt(linePenalty(geo, err));
      vt = Math.min(vt, Math.sqrt(vA * vA + 2 * p.decel * 0.93 * Math.max(0, a.dist - 3)));
    }
    if (over > 1.02) vt = Math.min(vt, e.v / Math.sqrt(over)); // stability assist: scrub speed instead of crashing
    if (off) vt = Math.min(vt, 31);
    return vt;
  }

  crashPlayer(e, kind, cause) {
    e.crashT = 3.2; e.crashKind = kind; e.throttle = 0; e.brake = 0;
    this.events.push({ type: 'crash', e, kind, cause });
  }
  resetPlayer(e) {
    e.crashT = 0; e.v = 0; e.psi = 0; e.d = Math.max(-this.geo.halfW + 1, Math.min(this.geo.halfW - 1, e.d)); e.lean = 0; e.steer = 0; e.gear = 1;
    this.events.push({ type: 'reset' });
  }

  gearbox(e, dt, auto, input) {
    const vTop = e.eff.vTop * 1.035;
    e.shiftCut = Math.max(0, e.shiftCut - dt);
    if (!auto && input) {
      if (input.shiftUp && e.gear < 6) { e.gear++; e.shiftCut = 0.07; this.events.push({ type: 'shift', e, up: true }); }
      if (input.shiftDown && e.gear > 1) { e.gear--; this.events.push({ type: 'shift', e, up: false }); }
    }
    const gmax = vTop * GEAR_SPLIT[e.gear - 1];
    e.rpm = Math.min(REDLINE * 1.02, IDLE + Math.max(0, e.v / gmax) * (REDLINE - IDLE));
    if (auto) {
      if (e.rpm > 16700 && e.gear < 6) { e.gear++; e.shiftCut = 0.06; if (e.isPlayer) this.events.push({ type: 'shift', e, up: true }); }
      else if (e.gear > 1 && e.v < vTop * GEAR_SPLIT[e.gear - 2] * 0.72) { e.gear--; if (e.isPlayer) this.events.push({ type: 'shift', e, up: false }); }
    }
  }

  timing(e) {
    const L = this.geo.L;
    const sc = Math.floor(e.s / (L / 3));
    if (sc > e.secCount && !e.finished && this.goTime !== null) {
      if (e.secCount >= 0) {
        const k = e.secCount % 3, tm = this.t - e.secT;
        const cls = tm < this.bestSec[k] ? 'purple' : tm < e.bestSec[k] ? 'green' : 'yellow';
        if (tm < this.bestSec[k]) this.bestSec[k] = tm; if (tm < e.bestSec[k]) e.bestSec[k] = tm;
        if (e.isPlayer || this.spectator) this.events.push({ type: 'sector', e, k, time: tm, cls });
      }
      e.secT = e.secCount < 0 ? this.goTime : this.t; e.secCount = sc;
    }
    const c = Math.floor(e.s / 50) + 8;
    if (c >= 0 && c < e.cp.length && !e.cp[c]) e.cp[c] = this.t;
    const lapNow = Math.floor(e.s / L);
    if (e.s > 0 && lapNow > e.lap - 1 && !e.finished) {
      // crossed the line
      if (e.lap === 0) { e.lap = 1; e.lapStart = this.goTime; return; }
      const crossT = this.t - (e.s - lapNow * L) / Math.max(1, e.v);
      const lt = crossT - e.lapStart;
      e.lapTimes.push(lt); e.lapStart = crossT;
      if (lt < e.bestLap) e.bestLap = lt;
      if (!this.fastestLap || lt < this.fastestLap.time) { this.fastestLap = { time: lt, rider: e.rider, e, lap: e.lap }; this.events.push({ type: 'fastest', e, time: lt }); }
      this.events.push({ type: 'lap', e, time: lt });
      if (e.lap >= this.laps) {
        e.finished = true; e.finishTime = crossT - this.goTime; this.events.push({ type: 'finish', e });
      } else {
        e.lap++;
        e.wear = Math.min(1, e.wear + e.eff.wearRate * this.wearScale);
        this.recompute(e);
        if (e.lap === this.laps && e.isPlayer) this.events.push({ type: 'finalLap' });
      }
    }
  }

  collisions(dt) {
    const E = this.entrants;
    for (let a = 0; a < E.length; a++) for (let b = a + 1; b < E.length; b++) {
      const A = E[a], B = E[b];
      if (A.crashT > 0 || B.crashT > 0) continue;
      const ds = A.s - B.s; if (Math.abs(ds) > 2.0) continue;
      const dd = A.d - B.d; if (Math.abs(dd) > 0.82) continue;
      const push = (0.82 - Math.abs(dd)) * 0.5 * (dd >= 0 ? 1 : -1);
      A.d += push; B.d -= push;
      const [front, rear] = ds >= 0 ? [A, B] : [B, A];
      const rel = rear.v - front.v;
      if (rel > 0) {
        if (rear.isPlayer && this.ctl.crash && rel > 7) { this.crashPlayer(rear, 'CONTACT'); continue; }
        rear.v = Math.max(0, front.v - 0.6); rear.v *= 0.985;
      }
      if ((A.isPlayer || B.isPlayer) && (A.collideT || 0) <= this.t) { A.collideT = this.t + 0.5; this.events.push({ type: 'contact' }); }
    }
  }

  updatePositions() {
    const arr = this._ord || (this._ord = this.entrants.slice());
    arr.sort(this._sortFn);
    for (let k = 0; k < arr.length; k++) {
      const e = arr[k], np = k + 1;
      if (np !== e.pos && this.phase === 'race' && this.t - this.goTime > 2) {
        if (np < e.pos && !e.isPlayer) this.overtakes++;
        if (np > e.pos && k > 0 && !arr[k - 1].finished) { e.passedBy = arr[k - 1]; e.passedT = this.t; }
        if (e.isPlayer) this.events.push({ type: 'position', from: e.pos, to: np, other: np < e.pos ? arr[k + 1] : arr[k - 1] });
      }
      e.pos = np;
    }
    this.order = arr;
  }

  // time gap from e to o (o ahead): based on 50m checkpoint crossing times
  gap(ahead, behind) {
    const c = Math.floor(behind.s / 50) + 8;
    if (c < 0 || c >= behind.cp.length) return 0;
    const ta = ahead.cp[c], tb = behind.cp[c];
    if (ta && tb) return tb - ta;
    return (ahead.s - behind.s) / Math.max(10, behind.v);
  }

  allFinished() { return this.entrants.every(e => e.finished); }
  // estimate finishing times for bikes still running (used once the player/leader is done)
  projectFinish() {
    const L = this.geo.L, total = this.laps * L;
    for (const e of this.entrants) if (!e.finished) {
      const remain = Math.max(0, total - e.s);
      const pace = e.lapEst / e.paceF * (e.crashT > 0 ? 1.0 : 1);
      e.finishTime = (this.t - this.goTime) + remain / L * pace + (e.crashT > 0 ? e.crashT : 0);
      e.finished = true; e.projected = true;
      if (!e.lapTimes.length) e.bestLap = pace;
    }
    this.updatePositions();
  }
}
