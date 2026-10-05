// Headless balance tool. Runs thousands of simplified races using the SAME performance model as the game AI
// (perf.js: effective(), speedProfile(), lapTimeOf(), sigma/mistakeRate/wearRate/reaction/launch, qualiTime(), passChance())
// on the real track geometry, then reports win / podium / average finish per rider.
import { writeFileSync } from 'fs';
import { TRACKS } from '../src/data/tracks.js';
import { RIDERS, CURRENT_GRID, LEGENDS, riderBike, displayName } from '../src/data/riders.js';
import { equalBike } from '../src/data/bikes.js';
import { buildTrackGeometry, mulberry } from '../src/game/trackgeom.js';
import { effective, speedProfile, lapTimeOf, pickWeather, autoTire, qualiTime, rollMistake, passChance, WEATHER } from '../src/game/perf.js';

const args = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')));
const RACES = +(args.races || 1400), LAPS = +(args.laps || 12), DIFF = args.difficulty || 'PRO';
const rand = mulberry(+(args.seed || 2026));
const gauss = () => { let u = 0; while (!u) u = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand()); };
const geos = Object.fromEntries(TRACKS.map(t => [t.id, buildTrackGeometry(t)]));
const cache = new Map();
function perfFor(r, bike, track, weather) {
  const key = r.id + '|' + bike.id + '|' + track.id + '|' + weather;
  if (cache.has(key)) return cache.get(key);
  const tire = autoTire(weather, track), geo = geos[track.id];
  const e0 = effective(r, bike, track, { weather, tire, wear: 0, difficulty: DIFF });
  const e1 = effective(r, bike, track, { weather, tire, wear: 1, difficulty: DIFF });
  const t0 = lapTimeOf(geo, speedProfile(geo, geo.lineK, e0)), t1 = lapTimeOf(geo, speedProfile(geo, geo.lineK, e1));
  const v = { eff: e0, lap: t0, wearSlope: t1 - t0 };
  cache.set(key, v); return v;
}

function simRace(field, track, weather) {
  const wearScale = Math.max(1, Math.min(4, 22 / LAPS));
  const apexes = 12;
  const ents = field.map(({ rider, bike }) => { const p = perfFor(rider, bike, track, weather); return { rider, p, eff: p.eff, wear: 0, time: 0, dnf: false }; });
  // qualifying -> grid
  ents.forEach(e => { e.formF = 1 + gauss() * e.eff.formSigma; e.q = qualiTime(e.p.lap / e.formF, e.eff, gauss()); });
  ents.sort((a, b) => a.q - b.q);
  ents.forEach((e, i) => { e.grid = i + 1; e.time = Math.floor(i / 3) * 0.32 + (i % 3) * 0.05 + e.eff.reaction * (0.8 + rand() * 0.5) - (e.eff.launch - 1) * 1.5 + 2.8; });
  for (let lap = 1; lap <= LAPS; lap++) {
    for (const e of ents) {
      const paceF = e.formF * (1 + gauss() * e.eff.sigma);
      let lt = (e.p.lap + e.p.wearSlope * e.wear) / paceF;
      // one roll per corner, same per-corner probability as the game AI
      for (let c = 0; c < apexes; c++) if (rand() < e.eff.mistakeRate / apexes) { const sev = rollMistake(rand()); lt += sev === 1 ? 0.5 + rand() * 0.5 : sev === 2 ? 1.4 + rand() * 1.2 : 12 + rand() * 8; }
      e.cand = e.time + lt;
      e.wear = Math.min(1, e.wear + e.eff.wearRate * wearScale);
    }
    // traffic: a faster rider must actually complete the pass, otherwise he is held up
    ents.sort((a, b) => a.time - b.time);
    for (let i = 1; i < ents.length; i++) {
      const A = ents[i - 1], B = ents[i];
      if (B.cand < A.cand + 0.15 && B.time - A.time < 1.2) {
        const adv = (A.cand - A.time) - (B.cand - B.time);
        if (rand() < passChance(B.eff, A.eff, adv)) continue;
        B.cand = A.cand + 0.12 + rand() * 0.15;
      }
    }
    for (const e of ents) e.time = e.cand;
  }
  ents.sort((a, b) => a.time - b.time);
  return ents.map((e, i) => ({ id: e.rider.id, pos: i + 1, grid: e.grid }));
}

function runField(label, field, races, weatherOverride) {
  const st = new Map(field.map(f => [f.rider.id, { r: f.rider, bike: f.bike, wins: 0, pod: 0, sum: 0, poles: 0, top5: 0 }]));
  const weatherCount = {};
  for (let k = 0; k < races; k++) {
    const track = TRACKS[k % TRACKS.length];
    const weather = weatherOverride || pickWeather(track, rand);
    weatherCount[weather] = (weatherCount[weather] || 0) + 1;
    for (const res of simRace(field, track, weather)) {
      const s = st.get(res.id); s.sum += res.pos; if (res.pos === 1) s.wins++; if (res.pos <= 3) s.pod++; if (res.pos <= 5) s.top5++; if (res.grid === 1) s.poles++;
    }
  }
  const rows = [...st.values()].sort((a, b) => a.sum - b.sum);
  // Spearman rank correlation between OVR and average finish
  const byOvr = [...rows].sort((a, b) => b.r.ovr - a.r.ovr); const rankO = new Map(byOvr.map((x, i) => [x.r.id, i])); const rankF = new Map(rows.map((x, i) => [x.r.id, i]));
  const n = rows.length; let d2 = 0; for (const x of rows) d2 += (rankO.get(x.r.id) - rankF.get(x.r.id)) ** 2;
  const rho = 1 - 6 * d2 / (n * (n * n - 1));
  let out = `\n=== ${label} — ${races} races × ${LAPS} laps, AI difficulty ${DIFF} ===\n`;
  out += `weather mix: ${Object.entries(weatherCount).map(([w, c]) => `${w} ${(c / races * 100).toFixed(0)}%`).join(', ')}\n`;
  out += `${'RIDER'.padEnd(36)} OVR  BIKE                     WIN%   POD%  TOP5%  POLE%  AVG POS\n`;
  for (const x of rows) out += `${displayName(x.r).padEnd(36)} ${String(x.r.ovr).padStart(3)}  ${x.bike.name.padEnd(24)} ${(x.wins / races * 100).toFixed(1).padStart(5)}  ${(x.pod / races * 100).toFixed(1).padStart(5)}  ${(x.top5 / races * 100).toFixed(1).padStart(5)}  ${(x.poles / races * 100).toFixed(1).padStart(5)}  ${(x.sum / races).toFixed(2).padStart(6)}\n`;
  const maxWin = Math.max(...rows.map(x => x.wins / races));
  const winners = rows.filter(x => x.wins > 0).length;
  out += `Spearman(OVR rank vs avg finish rank) = ${rho.toFixed(3)} · top win rate ${(maxWin * 100).toFixed(1)}% · ${winners}/${n} riders won at least once\n`;
  return { out, rho, maxWin, rows };
}

const t0 = Date.now();
let report = `GP RACING LEGENDS — BALANCE REPORT\nGenerated ${new Date().toISOString()} by tools/simulate.mjs (same performance model as in-game AI)\n`;
const total = { n: 0 };
const A = runField('A) CURRENT GRID · REAL MACHINERY · ALL 14 TRACKS · MIXED WEATHER', CURRENT_GRID.map(r => ({ rider: r, bike: riderBike(r, 'modern') })), RACES); report += A.out;
const uniq = (arr) => { const seen = new Set(); return arr.filter(r => { if (seen.has(r.name)) return false; seen.add(r.name); return true; }); };
const dream = [...uniq(LEGENDS.slice().sort((a, b) => b.ovr - a.ovr)).slice(0, 12), ...CURRENT_GRID.slice().sort((a, b) => b.ovr - a.ovr).slice(0, 10)];
const B = runField('B) DREAM GRID · EQUAL MACHINERY · LEGEND PRIMES + CURRENT STARS', dream.map(r => ({ rider: r, bike: equalBike() })), Math.round(RACES / 2)); report += B.out;
const C = runField('C) CURRENT GRID · HEAVY RAIN ONLY (wet specialists should rise)', CURRENT_GRID.map(r => ({ rider: r, bike: riderBike(r, 'modern') })), Math.round(RACES / 4), 'HEAVY_RAIN'); report += C.out;
const racesTotal = RACES + Math.round(RACES / 2) + Math.round(RACES / 4);
// wet specialist check
const posIn = (res, id) => res.rows.findIndex(x => x.r.id === id) + 1;
report += `\n=== SUMMARY ===\nTotal simulated races: ${racesTotal} (${((Date.now() - t0) / 1000).toFixed(1)} s)\n`;
report += `A) rank correlation ${A.rho.toFixed(3)}, top win rate ${(A.maxWin * 100).toFixed(1)}%\nB) rank correlation ${B.rho.toFixed(3)}, top win rate ${(B.maxWin * 100).toFixed(1)}%\n`;
for (const id of ['srisuk', 'reyna', 'hartigan', 'bellandi']) report += `Wet check: ${id} dry/mixed avg-rank P${posIn(A, id)} → heavy rain P${posIn(C, id)}\n`;
report += `Targets: higher OVR should win more over the long run (correlation > 0.8) without dominating (top win rate < 45%).\n`;
writeFileSync(new URL('../balance-report.txt', import.meta.url), report);
console.log(report);
