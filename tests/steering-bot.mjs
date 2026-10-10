// Steering QA (pure Node, uses the real Race simulation): a human-like bot taps LEFT/RIGHT (on/off keys, no analog)
// from the upcoming road with a reaction delay, in SEMI AUTO, on every track. Also measures input->heading latency.
// Usage: node tests/steering-bot.mjs [laps=2] [control=SEMI]
import { TRACKS } from '../src/data/tracks.js';
import { CURRENT_GRID, riderBike } from '../src/data/riders.js';
import { buildTrackGeometry } from '../src/game/trackgeom.js';
import { Race } from '../src/game/race.js';
// same grid layout as trackScene.gridSlots (kept local so this test needs no WebGL/three)
function gridSlots(geo, count) {
  let k1 = 0; for (let i = 0; i < 400 / geo.ds; i++) k1 += geo.kappa[i];
  const inside = k1 >= 0 ? 1 : -1, out = [];
  for (let i = 0; i < count; i++) { const row = Math.floor(i / 3), col = i % 3; out.push({ s: -14 - row * 9 - col * 1.6, d: inside * geo.halfW * 0.55 * (1 - col) }); }
  return out;
}

const LAPS = +(process.argv[2] || 2), CONTROL = process.argv[3] || 'SEMI';
const DT = 1 / 120, REACT = 0.16; // seconds of human reaction delay
const results = []; let allPass = true;

function makeRace(track, geo, control, seed = 7) {
  const field = CURRENT_GRID.slice(0, 22);
  const me = field[Math.min(10, field.length - 1)];
  const race = new Race({ geo, track, laps: LAPS, weather: 'SUNNY', difficulty: 'NORMAL', control, gearMode: 'AUTO', playerTire: 'AUTO', seed,
    entrants: field.map(r => ({ rider: r, bike: riderBike(r, 'modern'), isPlayer: r.id === me.id })) });
  race.wallD = geo.halfW + 21;
  race.placeOnGrid(race.qualify(), gridSlots(geo, race.entrants.length));
  return race;
}

function runTrack(track) {
  const geo = buildTrackGeometry(track);
  const race = makeRace(track, geo, CONTROL);
  const p = race.player, hist = []; let key = 0, decideT = 0, offT = 0, bumps = 0, stuckT = 0, maxStuck = 0, presses = 0;
  const N = geo.N;
  for (let t = 0; t < 60 * 15 && !p.finished; t += DT) {
    // what the rider "sees" REACT seconds ago
    hist.push({ s: p.s, d: p.d, psi: p.psi, v: p.v });
    const obs = hist.length > REACT / DT ? hist[hist.length - 1 - Math.round(REACT / DT)] : hist[0];
    if (hist.length > 200) hist.shift();
    decideT -= DT;
    if (decideT <= 0) {
      decideT = 0.05; // re-decide at ~20 Hz, like a human tapping keys
      // look ahead along the road: feed-forward from upcoming curvature + correction towards the racing line
      const L = Math.max(14, Math.min(55, obs.v * 0.75));
      const j = ((Math.floor((obs.s + L) / geo.ds) % N) + N) % N, j2 = ((Math.floor((obs.s + L * 0.4) / geo.ds) % N) + N) % N;
      const want = Math.max(-geo.halfW + 1, Math.min(geo.halfW - 1, geo.lineD[j]));
      const pred = obs.d + Math.sin(obs.psi) * L;
      const kAhead = geo.kappa[j2], v = Math.max(5, obs.v), psiMax = Math.min(0.45, 6.5 / v);
      const ff = (1 - race.ctl.follow) * kAhead * v / race.ctl.resp / psiMax; // share of lock needed to hold the curve
      const u = ff + (want - pred) * 0.22;
      const nk = u > 0.32 ? 1 : u < -0.32 ? -1 : (Math.abs(u) < 0.12 ? 0 : key);
      if (nk !== key && nk !== 0) presses++;
      key = nk;
    }
    const before = race.events.length;
    race.step(DT, { steer: key, throttle: 0, brake: 0 });
    if (process.env.TRACE === track.id && race.phase === 'race' && p.lap === +(process.env.LAP||1) && Math.round(t * 120) % 12 === 0 && (p.s % (geo.N * geo.ds)) > +process.env.S0 && (p.s % (geo.N * geo.ds)) < +process.env.S1) console.log('   s', Math.round(p.s % (geo.N * geo.ds)), 'v', Math.round(p.v * 3.6), 'k', (geo.kappa[((Math.floor(p.s / geo.ds) % N) + N) % N] * 1000).toFixed(1), 'd', p.d.toFixed(1), 'steer', p.steer.toFixed(2), 'psi', p.psi.toFixed(3), 'yaw', p.yaw.toFixed(3), 'brake', (p.brake||0).toFixed(2));
    for (let k = before; k < race.events.length; k++) if (race.events[k].type === 'bump' && race.events[k].e === p) bumps++;
    race.events.length = 0;
    if (race.phase === 'race') {
      if (p.offTrack) { if (process.env.DBG && !p._wasOff) console.log('  off @s', Math.round(p.s % (geo.N * geo.ds)), 'v', Math.round(p.v * 3.6), 'k', (geo.kappa[((Math.floor(p.s / geo.ds) % N) + N) % N] * 1000).toFixed(1), 'd', p.d.toFixed(1), 'line', geo.lineD[((Math.floor(p.s / geo.ds) % N) + N) % N].toFixed(1), 'steer', p.steer.toFixed(2), 'psi', p.psi.toFixed(3)); offT += DT; }
      p._wasOff = p.offTrack;
      if (p.v < 5 && race.t - race.goTime > 5) { stuckT += DT; maxStuck = Math.max(maxStuck, stuckT); } else stuckT = 0;
    }
  }
  const ref = makeRace(track, geo, CONTROL); ref.autopilot = true;
  for (let t = 0; t < 60 * 15 && !ref.player.finished; t += DT) { ref.step(DT, {}); ref.events.length = 0; }
  const refLap = ref.player.bestLap;
  const aiBest = Math.min(...race.entrants.filter(e => !e.isPlayer && isFinite(e.bestLap)).map(e => e.bestLap));
  const aiMedian = race.entrants.filter(e => !e.isPlayer && isFinite(e.bestLap)).map(e => e.bestLap).sort((a, b) => a - b)[10];
  const r = { track: track.id, finished: p.finished, best: +p.bestLap.toFixed(2), ref: +refLap.toFixed(2), refPct: +((p.bestLap / refLap - 1) * 100).toFixed(1), aiBest: +aiBest.toFixed(2), aiMedian: +(aiMedian || 0).toFixed(2), gapPct: +((p.bestLap / aiMedian - 1) * 100).toFixed(1), offTrackS: +offT.toFixed(1), bumps, maxStuck: +maxStuck.toFixed(1), presses, pos: p.pos };
  r.pass = r.finished && r.maxStuck < 3 && r.bumps <= 1 && r.refPct < (CONTROL === "PRO" ? 12 : 8) && r.gapPct < (CONTROL === "PRO" ? 9 : 6) && r.offTrackS < r.best * LAPS * 0.04;
  if (!r.pass) allPass = false;
  results.push(r);
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${track.id.padEnd(9)} lap ${r.best}s  same-bike autopilot ${r.ref}s (${r.refPct > 0 ? '+' : ''}${r.refPct}%)  AI best ${r.aiBest}s / median ${r.aiMedian}s (${r.gapPct > 0 ? '+' : ''}${r.gapPct}%)  off-track ${r.offTrackS}s  wall hits ${r.bumps}  stuck ${r.maxStuck}s  key presses ${r.presses}  finish P${r.pos}`);
}

// input -> heading latency on a straight at speed
function latency() {
  const track = TRACKS[0], geo = buildTrackGeometry(track);
  const race = makeRace(track, geo, CONTROL); const p = race.player;
  for (let t = 0; t < 40 && !(race.phase === 'race' && p.v > 55 && Math.abs(geo.kappa[((Math.floor(p.s / geo.ds) % geo.N) + geo.N) % geo.N]) < 1 / 2000); t += DT) { race.step(DT, { steer: 0 }); race.events.length = 0; }
  const psi0 = p.psi, d0 = p.d; let t1 = null, t2 = null, tLean = null, tFull = null;
  for (let t = 0; t < 1.5; t += DT) {
    race.step(DT, { steer: 1 }); race.events.length = 0;
    if (t1 === null && Math.abs(p.psi - psi0) > 0.005) t1 = t + DT;
    if (tFull === null && p.steer >= 0.999) tFull = t + DT;
    if (tLean === null && Math.abs(p.lean) > 0.15) tLean = t + DT;
    if (t2 === null && p.d - d0 > 0.5) t2 = t + DT;
  }
  // release and measure return to straight
  let tc = null; for (let t = 0; t < 1.5; t += DT) { race.step(DT, { steer: 0 }); race.events.length = 0; if (tc === null && Math.abs(p.steer) < 0.001) tc = t + DT; }
  const ms = (x) => x === null ? 'n/a' : Math.round(x * 1000) + ' ms';
  console.log(`LATENCY @ ${Math.round(p.v * 3.6)} km/h: first heading change ${ms(t1)}, full lock ${ms(tFull)}, lean >8.6° ${ms(tLean)}, 0.5 m lateral ${ms(t2)}, return to centre ${ms(tc)}`);
  return { t1, tFull, tLean, t2, tc };
}

console.log(`Steering bot · ${CONTROL} · ${LAPS} laps · reaction ${REACT * 1000} ms · on/off keys only`);
for (const tr of TRACKS) runTrack(tr);
const lat = latency();
const latOk = lat.t1 !== null && lat.t1 <= 0.05 && lat.tFull <= 0.13 && lat.tc <= 0.1;
console.log(`${latOk ? 'PASS' : 'FAIL'}  input latency within targets (first change ≤50 ms, full lock ≤130 ms, centre ≤100 ms)`);
const n = results.filter(r => r.pass).length + (latOk ? 1 : 0);
console.log(`\n${n}/${results.length + 1} checks passed`);
process.exit(allPass && latOk ? 0 : 1);
