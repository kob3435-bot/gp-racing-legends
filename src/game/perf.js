// Shared performance model — used by in-game AI, the player's assists and the headless balance tool.
export const G = 9.81;
export const MU_BASE = 1.38;      // lateral grip coefficient for an 85-rated rider/bike (≈54° lean)
export const DECEL_BASE = 12.2;   // m/s² peak braking
export const A0_BASE = 9.6;       // m/s² low-speed acceleration
export const VTOP_BASE = 94.5;    // m/s (~340 km/h)

export const WEATHER = {
  SUNNY: { label: 'Sunny', grip: 1.0, wet: 0, icon: '☀' },
  CLOUDY: { label: 'Cloudy', grip: 0.985, wet: 0, icon: '☁' },
  LIGHT_RAIN: { label: 'Light Rain', grip: 0.8, wet: 0.6, icon: '🌦' },
  HEAVY_RAIN: { label: 'Heavy Rain', grip: 0.68, wet: 1.0, icon: '🌧' },
};
export const TIRES = {
  SOFT: { label: 'SOFT', color: '#ff3b3b', dry: 1.03, wetGrip: 0.66, wear: 1.55 },
  MEDIUM: { label: 'MEDIUM', color: '#ffd23b', dry: 1.0, wetGrip: 0.64, wear: 1.0 },
  HARD: { label: 'HARD', color: '#f0f0f0', dry: 0.975, wetGrip: 0.6, wear: 0.65 },
  RAIN: { label: 'RAIN', color: '#3b9dff', dry: 0.88, wetGrip: 1.0, wear: 2.6 },
};
export const DIFFICULTY = {
  CASUAL: { mu: 0.93, decel: 0.9, brakeAcc: 0.84, racecraft: -18, mistakes: 2.6, label: 'Casual' },
  NORMAL: { mu: 0.962, decel: 0.95, brakeAcc: 0.9, racecraft: -9, mistakes: 1.6, label: 'Normal' },
  HARD: { mu: 0.984, decel: 0.975, brakeAcc: 0.94, racecraft: -3, mistakes: 1.15, label: 'Hard' },
  PRO: { mu: 1.0, decel: 1.0, brakeAcc: 0.97, racecraft: 0, mistakes: 1.0, label: 'Pro' },
  LEGEND: { mu: 1.012, decel: 1.015, brakeAcc: 1.0, racecraft: 4, mistakes: 0.6, label: 'Legend' },
};

const SENS = 0.78; // global skill sensitivity (balance knob)
const n = (v) => SENS * ((v ?? 80) - 85) / 100;

export function trackWeights(track) {
  const c = track.character || [];
  return {
    braking: c.includes('heavy-braking') ? 1 : c.includes('stop-and-go') ? 0.6 : 0.2,
    flow: c.includes('flowing') ? 1 : c.includes('technical') ? 0.5 : 0.3,
    exit: c.includes('stop-and-go') ? 1 : 0.5,
    tyre: c.includes('tire-killer') ? 1.35 : 1.0,
    power: c.includes('high-speed') ? 1 : 0.5,
  };
}

// Rider style → preferred bike character, compared with the bike's character profile.
export function compatibility(rider, bike) {
  const a = rider.attributes, st = rider.styles || [];
  const has = (t) => st.includes(t) ? 1 : 0;
  const pref = {
    frontEnd: 55 + (a.cornerEntry - a.cornerExit) * 1.5 + has('Front-End Feel') * 30 + has('Late Brake Master') * 10,
    rearSteer: 40 + (a.aggression - 80) * 1.2 + (a.bikeControl - 85) * 1.5 + has('Aggressive Attacker') * 20 - has('Smooth Operator') * 15,
    cornerSpeed: 55 + (a.midCorner - a.braking) * 3 + has('Corner Speed Specialist') * 30 + has('Smooth Operator') * 12,
    hardBraking: 55 + (a.braking - a.midCorner) * 3 + has('Late Brake Master') * 30 + has('Aggressive Attacker') * 8,
  };
  const c = bike.character;
  let dist = 0;
  for (const k of ['frontEnd', 'rearSteer', 'cornerSpeed', 'hardBraking']) {
    const p = Math.max(0, Math.min(100, pref[k]));
    // being "over-equipped" for rear-steer demand hurts only if the rider can't handle it
    let d = c[k] - p; if (k === 'rearSteer') d = Math.max(0, d);
    dist += Math.abs(d) * (k === 'rearSteer' ? 0.7 : 1);
  }
  return Math.round(Math.max(0, Math.min(100, 100 - dist / 2.6)));
}

export function trackAffinity(rider, track) {
  const w = trackWeights(track), st = rider.styles || [];
  let b = 0;
  if (st.includes('Late Brake Master')) b += 0.006 * w.braking;
  if (st.includes('Corner Speed Specialist')) b += 0.006 * w.flow;
  if (st.includes('Smooth Operator')) b += 0.003 * w.flow;
  if (st.includes('Aggressive Attacker')) b += 0.003 * w.exit;
  if (st.includes('Launch Specialist')) b += 0.002 * w.exit;
  if (st.includes('Tire Whisperer')) b += 0.004 * (w.tyre - 1) * 3;
  return b; // fractional performance bonus (≈0 .. 1%)
}

// Effective dynamic parameters for one rider on one bike at one track & condition.
// opts: { weather, tire, difficulty (AI only), wear (0..1) }
export function effective(rider, bike, track, opts = {}) {
  const a = rider.attributes, h = rider.hidden || {};
  const w = trackWeights(track);
  const weather = WEATHER[opts.weather || 'SUNNY'];
  const tire = TIRES[opts.tire || 'MEDIUM'];
  const diff = opts.difficulty ? DIFFICULTY[opts.difficulty] : null;
  const compat = compatibility(rider, bike);
  const compatF = (compat - 70) / 100 * 0.02;
  const aff = trackAffinity(rider, track);
  const cornerMix = (a.cornerEntry * (0.3 + 0.1 * w.braking) + a.midCorner * (0.3 + 0.2 * w.flow) + a.cornerExit * (0.3 + 0.1 * w.exit)) /
    (0.9 + 0.1 * w.braking + 0.2 * w.flow + 0.1 * w.exit);
  const pace = n(a.racePace);

  let mu = MU_BASE * (1 + 0.105 * n(cornerMix) + 0.055 * n(a.bikeControl) + 0.045 * pace + 0.06 * n(bike.cornerSpeed) + 0.035 * n(bike.turning) + 0.02 * n(bike.electronics) + compatF + aff);
  let decel = DECEL_BASE * (1 + 0.12 * n(a.braking) + 0.035 * n(a.cornerEntry) + 0.03 * n(h.lateBrakingConfidence) + 0.075 * n(bike.braking) + 0.035 * n(bike.stability) + 0.03 * pace + compatF + aff);
  let a0 = A0_BASE * (1 + 0.07 * n(a.acceleration) + 0.065 * n(a.throttleControl) + 0.045 * n(a.cornerExit) + 0.1 * n(bike.acceleration) + 0.07 * n(bike.traction) + 0.035 * n(bike.electronics) + 0.03 * n(bike.power) + compatF);
  let vTop = VTOP_BASE * (1 + 0.06 * n(bike.topSpeed) + 0.03 * n(bike.power) + 0.02 * n(bike.aero) + 0.01 * n(a.speed));

  // weather & tyres
  const wet = weather.wet;
  let grip = weather.grip * (track.grip || 1);
  if (wet > 0) {
    grip *= 1 + (a.wet - 80) / 100 * 0.45 * wet;          // wet specialists clearly benefit
    grip *= tire.wetGrip + (1 - tire.wetGrip) * (1 - wet) * 0.4;
  } else grip *= tire.dry;
  const wear = opts.wear || 0;
  grip *= 1 - wear * 0.07 * (1 - 0.4 * n(a.tireManagement) * 4 * 0.25);
  mu *= grip; decel *= Math.min(1, 0.35 + grip * 0.65) * (wet ? (1 + (a.wet - 80) / 100 * 0.3 * wet) : 1);
  a0 *= Math.min(1, 0.4 + grip * 0.6);
  if (wet) vTop *= 1 - 0.02 * wet;

  // AI difficulty scales braking accuracy / corner speed / racecraft / consistency — never top speed
  let racecraft = a.racecraft, mistakeMul = 1, brakeAcc = 1;
  if (diff) { mu *= diff.mu; decel *= diff.decel; racecraft += diff.racecraft; mistakeMul = diff.mistakes; brakeAcc = diff.brakeAcc; }

  const consistency = a.consistency;
  // race-weekend form / set-up variance (per race), smaller for consistent & mentally strong riders
  const formSigma = 0.0026 + (100 - consistency) * 0.00005 + (100 - a.mental) * 0.00003 + wet * 0.0028;
  const sigma = 0.0022 + (100 - consistency) * 0.00011 + wet * 0.0015;
  const mistakeRate = (0.012 + (100 - consistency) * 0.0026 + Math.max(0, (h.riskTaking ?? 70) - 75) * 0.0012) * (1 + wet * (0.7 + Math.max(0, 85 - a.wet) / 25)) * mistakeMul;
  const wearRate = 0.028 * tire.wear * w.tyre * (1 + (82 - a.tireManagement) / 70) * (1 + (85 - bike.tireWear) / 90) * (1 + Math.max(0, a.aggression - 85) / 200);
  const reaction = 0.16 + (100 - (h.startReaction ?? a.reaction)) * 0.0045;
  const launch = 1 + 0.12 * n(a.clutch) + 0.05 * n(bike.electronics);
  return {
    mu, decel, a0, vTop, compat, sigma, formSigma, mistakeRate, wearRate, reaction, launch, brakeAcc,
    racecraft, overtaking: a.overtaking, defending: a.defending, aggression: a.aggression,
    slipstream: h.slipstreamUsage ?? a.racecraft, lateBrake: h.lateBrakingConfidence ?? a.braking,
    pressure: h.pressureResistance ?? a.mental, qualifying: a.qualifying, mental: a.mental,
  };
}

export function accelAt(p, v) {
  const r = Math.min(1, v / p.vTop);
  return Math.max(0, p.a0 * (1 - Math.pow(r, 2.3)));
}

// Speed profile along a curvature array (friction-circle limited braking/acceleration).
export function speedProfile(geo, kArr, p, out) {
  const N = geo.N, ds = geo.ds;
  const v = out || new Float32Array(N);
  const latMax = p.mu * G;
  for (let i = 0; i < N; i++) { const k = Math.abs(kArr[i]); v[i] = Math.min(p.vTop, k > 1e-5 ? Math.sqrt(latMax / k) : p.vTop); }
  const avail = (vv, k) => { const lat = vv * vv * Math.abs(k) / latMax; return Math.sqrt(Math.max(0.06, 1 - lat * lat)); };
  for (let pass = 0; pass < 2; pass++) {
    for (let c = 2 * N; c > 0; c--) { // backward (braking)
      const i = c % N, nx = (i + 1) % N;
      const lim = Math.sqrt(v[nx] * v[nx] + 2 * p.decel * avail(v[nx], kArr[nx]) * ds);
      if (v[i] > lim) v[i] = lim;
    }
    for (let c = 0; c < 2 * N; c++) { // forward (traction)
      const i = (c + 1) % N, pv = c % N;
      const lim = Math.sqrt(v[pv] * v[pv] + 2 * accelAt(p, v[pv]) * avail(v[pv], kArr[pv]) * ds);
      if (v[i] > lim) v[i] = lim;
    }
  }
  return v;
}
export function lapTimeOf(geo, v) { let t = 0; for (let i = 0; i < geo.N; i++) t += geo.ds * geo.lineLenF[i] / v[i]; return t; }

// Penalty curvature when off the ideal line: returns effective curvature multiplier.
export function linePenalty(geo, offsetErr) {
  const e = Math.min(1, Math.abs(offsetErr) / (geo.halfW * 1.1));
  return 1 + e * e * 0.55 + e * 0.15;
}

export function pickWeather(track, rand = Math.random) {
  const keys = ['SUNNY', 'CLOUDY', 'LIGHT_RAIN', 'HEAVY_RAIN'];
  let r = rand(), acc = 0;
  for (let i = 0; i < 4; i++) { acc += track.weather[i]; if (r <= acc) return keys[i]; }
  return 'SUNNY';
}
export function autoTire(weather, track) {
  if (WEATHER[weather].wet > 0) return 'RAIN';
  return trackWeights(track).tyre > 1.2 ? 'HARD' : track.temp === 'cool' ? 'SOFT' : 'MEDIUM';
}
export const POINTS = [25, 20, 16, 13, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];

// Shared helpers used by both the in-game AI (race.js) and the balance tool (tools/simulate.mjs)
export const MISTAKE = { minorBelow: 0.72, majorBelow: 0.97 }; // else: crash
export function qualiTime(lapEst, eff, z) { return lapEst * (1 - (eff.qualifying - 85) * 0.00035) * (1 + z * eff.sigma * 0.9); }
export function rollMistake(r) { return r < MISTAKE.minorBelow ? 1 : r < MISTAKE.majorBelow ? 2 : 3; }
export function passChance(att, def, paceAdv) {
  // att/def: effective params; paceAdv: seconds per lap faster
  return Math.max(0.04, Math.min(0.92, 0.3 + (att.overtaking - def.defending) / 55 + (att.racecraft - 85) / 120 + paceAdv * 0.9 + (att.aggression - 80) / 200));
}
