// PRO ASSIST QA (pure Node, real Race sim): proves there is NO steering assistance of any kind, while auto
// throttle / brake / gears still work. Compares with SEMI AUTO to show the checks would catch an assist.
import { TRACKS } from '../src/data/tracks.js';
import { CURRENT_GRID, riderBike } from '../src/data/riders.js';
import { buildTrackGeometry } from '../src/game/trackgeom.js';
import { Race } from '../src/game/race.js';
const results = []; const ok = (n, c, i = '') => { results.push(!!c); console.log(`${c ? 'PASS' : 'FAIL'}  ${n} ${i}`); };
const DT = 1 / 120;
function setup(track, control) {
  const geo = buildTrackGeometry(track);
  const field = CURRENT_GRID.slice(0, 22);
  const race = new Race({ geo, track, laps: 3, weather: 'SUNNY', difficulty: 'NORMAL', control, gearMode: 'AUTO', playerTire: 'AUTO', seed: 3,
    entrants: field.map((r, k) => ({ rider: r, bike: riderBike(r, 'modern'), isPlayer: k === 0 })) });
  race.wallD = geo.halfW + 21;
  race.placeOnGrid(race.entrants.slice(), race.entrants.map((e, k) => ({ s: -20 - k * 8, d: 0 })));
  let n = 0; while (race.phase !== 'race' && n++ < 20000) race.step(DT, {});
  for (const e of race.entrants) if (!e.isPlayer) { e.s = -5000; e.v = 0; } // AI out of the way
  return { geo, race, me: race.player };
}
function findStraight(geo) { const W = Math.round(350 / geo.ds); for (let i = 0; i < geo.N; i++) { let m = 0; for (let j = 0; j < W; j++) m = Math.max(m, Math.abs(geo.kappa[(i + j) % geo.N])); if (m < 1 / 2500) return i * geo.ds; } return null; }
function findCorner(geo) { for (let i = Math.round(200 / geo.ds); i < geo.N; i++) if (Math.abs(geo.kappa[i]) > 1 / 120) return i * geo.ds; return null; }
function place(me, s, d, v) { me.s = s; me.d = d; me.v = v; me.psi = 0; me.steer = 0; me.started = true; me.lap = 1; me.ps = s; }

for (const track of TRACKS.slice(0, 6)) {
  for (const control of ['PRO', 'SEMI']) {
    const { geo, race, me } = setup(track, control);
    // 1) straight, off the racing line, no input: lateral position and heading must not move (no line pull)
    const sS = findStraight(geo);
    if (sS !== null) {
      place(me, sS + 3 * geo.L, 3.0, 45); let y1 = 0; for (let k = 0; k < 120; k++) { race.step(DT, { steer: 0 }); y1 = Math.max(y1, Math.abs(me.yaw)); }
      const drift = Math.abs(me.d - 3.0);
      // edge: on the grass beyond the kerb, parallel to the road, no input -> no push-back towards the track
      place(me, sS + 3 * geo.L, geo.halfW + 4, 30); let y2 = 0; for (let k = 0; k < 120; k++) { race.step(DT, { steer: 0 }); y2 = Math.max(y2, Math.abs(me.yaw)); }
      const edge = Math.abs(me.d - (geo.halfW + 4));
      if (control === 'PRO') { ok(`${track.id} PRO: off-line, no input -> zero yaw (no line pull)`, y1 === 0, `max yaw ${y1}, Δd ${drift.toFixed(3)} m (road geometry only)`); ok(`${track.id} PRO: beyond kerb, no input -> zero yaw (no edge push-back)`, y2 === 0 && edge < 0.5, `max yaw ${y2}, Δd ${edge.toFixed(3)} m`); }
      else console.log(`      (SEMI reference: straight yaw ${y1.toFixed(3)}, edge push-back Δd ${edge.toFixed(3)} m)`);
    }
    // 2) corner, no input: world yaw stays 0 -> the bike runs wide
    const sC = findCorner(geo);
    place(me, sC - 60 + 3 * geo.L, 0, 40); let maxYaw = 0, d0 = me.d;
    for (let k = 0; k < 240; k++) { race.step(DT, { steer: 0 }); maxYaw = Math.max(maxYaw, Math.abs(me.yaw)); }
    const wide = Math.abs(me.d - d0);
    if (control === 'PRO') ok(`${track.id} PRO: corner, no input -> zero yaw, runs wide`, maxYaw === 0 && wide > 4, `max yaw ${maxYaw.toFixed(4)} rad/s, ran ${wide.toFixed(1)} m wide`);
    else console.log(`      (SEMI reference: corner max yaw ${maxYaw.toFixed(3)} rad/s, ${wide.toFixed(1)} m wide)`);
    // 3) steering is exactly the input: same input -> yaw proportional, none without input
    if (control === 'PRO') {
      place(me, sS + 3 * geo.L, 0, 40); race.step(DT, { steer: 0.5 }); const y5 = me.yaw; race.step(DT, { steer: 1 }); const y10 = me.yaw;
      ok(`${track.id} PRO: yaw follows input instantly & proportionally`, y5 > 0 && Math.abs(y10 / y5 - 2) < 0.02 && me.steer === 1, `yaw(0.5)=${y5.toFixed(3)} yaw(1)=${y10.toFixed(3)}`);
      // 4) auto throttle / brake / gears over 40 s of riding with a simple steering controller
      place(me, 3 * geo.L + 20, 0, 20); let gUp = 0, gDown = 0, brk = 0, thr = 0, vmax = 0, g = me.gear;
      for (let k = 0; k < 40 * 120; k++) {
        const kc = geo.kappa[Math.floor((me.s % geo.L) / geo.ds) % geo.N];
        const steer = Math.max(-1, Math.min(1, (kc * me.v) / Math.max(0.1, Math.min(1.2, 1.1 * 9.81 / me.v)) * 1.0 - me.psi * 2 - me.d * 0.05));
        race.step(DT, { steer });
        if (me.gear > g) gUp++; if (me.gear < g) gDown++; g = me.gear; if (me.brake > 0.3) brk++; if (me.throttle > 0.5) thr++; vmax = Math.max(vmax, me.v);
      }
      ok(`${track.id} PRO: auto throttle / brake / gears work`, gUp >= 3 && gDown >= 3 && brk > 50 && thr > 500 && vmax > 60, `upshifts ${gUp}, downshifts ${gDown}, braking ${(brk / 120).toFixed(1)} s, top ${(vmax * 3.6).toFixed(0)} km/h`);
    }
  }
}
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`); process.exit(results.every(Boolean) ? 0 : 1);
