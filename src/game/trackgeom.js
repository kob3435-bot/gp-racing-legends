// Pure track geometry (no Three.js) — shared by the game and the headless balance tool.
// Track frame: s = distance along centreline, d = lateral offset (+ = right of travel direction).

function hash(str) { let h = 2166136261; for (const c of str) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
export function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function catmull(p0, p1, p2, p3, t) {
  // centripetal Catmull-Rom
  const a = 0.5;
  const d = (p, q) => Math.pow(Math.hypot(q[0] - p[0], q[1] - p[1]) || 1e-4, a);
  const t0 = 0, t1 = t0 + d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3);
  const tt = t1 + (t2 - t1) * t;
  const L = (pa, pb, ta, tb) => [(tb - tt) / (tb - ta) * pa[0] + (tt - ta) / (tb - ta) * pb[0], (tb - tt) / (tb - ta) * pa[1] + (tt - ta) / (tb - ta) * pb[1]];
  const A1 = L(p0, p1, t0, t1), A2 = L(p1, p2, t1, t2), A3 = L(p2, p3, t2, t3);
  const B1 = L(A1, A2, t0, t2), B2 = L(A2, A3, t1, t3);
  return L(B1, B2, t1, t2);
}
const wrapAng = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

export function buildTrackGeometry(def, ds = 2) {
  const P = def.pts.map(p => [p[0], -p[1]]); // map north -> -z
  const n = P.length;
  // dense sample
  const dense = [];
  for (let i = 0; i < n; i++) {
    const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
    for (let k = 0; k < 40; k++) dense.push(catmull(p0, p1, p2, p3, k / 40));
  }
  const cum = [0];
  for (let i = 1; i <= dense.length; i++) { const a = dense[i - 1], b = dense[i % dense.length]; cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  const rawL = cum[dense.length];
  const scale = def.length / rawL;
  const N = Math.round(def.length / ds);
  const L = N * ds;
  const x = new Float32Array(N), z = new Float32Array(N), y = new Float32Array(N);
  let j = 0;
  for (let i = 0; i < N; i++) {
    const target = (i / N) * rawL;
    while (cum[j + 1] < target) j++;
    const f = (target - cum[j]) / (cum[j + 1] - cum[j] || 1);
    const a = dense[j], b = dense[(j + 1) % dense.length];
    x[i] = (a[0] + (b[0] - a[0]) * f) * scale; z[i] = (a[1] + (b[1] - a[1]) * f) * scale;
  }
  // place the start/finish line ~62% down the main straight (the straight containing control point 1)
  {
    const k0 = curvatureOf(x, z, N, ds, 3);
    const px1 = P[1][0] * scale, pz1 = P[1][1] * scale; let best = 0, bd = 1e18;
    for (let i = 0; i < N; i++) { const dd = (x[i] - px1) ** 2 + (z[i] - pz1) ** 2; if (dd < bd) { bd = dd; best = i; } }
    const straight = (i) => Math.abs(k0[((i % N) + N) % N]) < 1 / 450;
    let a = best, b = best;
    while (straight(a - 1) && best - a < N / 2) a--;
    while (straight(b + 1) && b - best < N / 2) b++;
    const st = ((Math.round(a + (b - a) * (def.startFrac ?? 0.62)) % N) + N) % N;
    const rx0 = Float32Array.from(x), rz0 = Float32Array.from(z);
    for (let i = 0; i < N; i++) { x[i] = rx0[(i + st) % N]; z[i] = rz0[(i + st) % N]; }
  }
  // shift so start line (sample 0) is at origin
  const ox = x[0], oz = z[0];
  for (let i = 0; i < N; i++) { x[i] -= ox; z[i] -= oz; }
  // elevation: smooth periodic profile, flat-ish around start/finish
  const rnd = mulberry(hash(def.id));
  const harm = [1, 2, 3, 5].map(k => ({ k, a: rnd() * (1 / k), p: rnd() * Math.PI * 2 }));
  let ymin = 1e9, ymax = -1e9; const raw = new Float32Array(N);
  for (let i = 0; i < N; i++) { let v = 0; for (const h of harm) v += h.a * Math.sin(2 * Math.PI * h.k * i / N + h.p); raw[i] = v; ymin = Math.min(ymin, v); ymax = Math.max(ymax, v); }
  for (let i = 0; i < N; i++) y[i] = ((raw[i] - ymin) / (ymax - ymin || 1)) * (def.elevation || 0);
  // tangents
  const tx = new Float32Array(N), tz = new Float32Array(N), rx = new Float32Array(N), rz = new Float32Array(N), heading = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = (i - 1 + N) % N, b = (i + 1) % N;
    let dx = x[b] - x[a], dz = z[b] - z[a]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    tx[i] = dx; tz[i] = dz; rx[i] = -dz; rz[i] = dx; heading[i] = Math.atan2(dz, dx);
  }
  const kappa = curvatureOf(x, z, N, ds, 3);
  const halfW = def.width / 2;
  const geo = { def, N, ds, L, x, y, z, tx, tz, rx, rz, heading, kappa, halfW };
  computeRacingLine(geo);
  return geo;
}

export function curvatureOf(x, z, N, ds, k = 3) {
  const out = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = (i - k + N) % N, b = i, c = (i + k) % N;
    const h1 = Math.atan2(z[b] - z[a], x[b] - x[a]), h2 = Math.atan2(z[c] - z[b], x[c] - x[b]);
    out[i] = wrapAng(h2 - h1) / (k * ds);
  }
  return smooth(out, 3);
}
export function smooth(arr, passes = 2, r = 2) {
  const N = arr.length; let a = Float32Array.from(arr), b = new Float32Array(N);
  for (let p = 0; p < passes; p++) {
    for (let i = 0; i < N; i++) { let s = 0; for (let k = -r; k <= r; k++) s += a[(i + k + N) % N]; b[i] = s / (2 * r + 1); }
    [a, b] = [b, a];
  }
  return a;
}

// Minimum-curvature racing line by iterative relaxation inside the track limits.
export function computeRacingLine(geo) {
  const { N, x, z, rx, rz, halfW, ds } = geo;
  const lim = halfW - 1.3;
  const d = new Float32Array(N);
  const px = new Float32Array(N), pz = new Float32Array(N);
  const upd = () => { for (let i = 0; i < N; i++) { px[i] = x[i] + rx[i] * d[i]; pz[i] = z[i] + rz[i] * d[i]; } };
  const scales = [24, 16, 10, 6, 3, 2, 1];
  for (const k of scales) {
    for (let it = 0; it < 90; it++) {
      upd();
      for (let i = 0; i < N; i++) {
        const a = (i - k + N) % N, b = (i + k) % N;
        const mx = (px[a] + px[b]) * 0.5, mz = (pz[a] + pz[b]) * 0.5;
        const delta = (mx - px[i]) * rx[i] + (mz - pz[i]) * rz[i];
        d[i] = Math.max(-lim, Math.min(lim, d[i] + delta * 0.6));
      }
    }
  }
  const ds2 = smooth(d, 2, 2);
  geo.lineD = ds2;
  upd();
  for (let i = 0; i < N; i++) { px[i] = x[i] + rx[i] * ds2[i]; pz[i] = z[i] + rz[i] * ds2[i]; }
  geo.lineX = px; geo.lineZ = pz;
  geo.lineK = curvatureOf(px, pz, N, ds, 4);
  // path length factor of line vs centreline per sample (for lap time on line)
  const lf = new Float32Array(N);
  for (let i = 0; i < N; i++) { const b = (i + 1) % N; lf[i] = Math.hypot(px[b] - px[i], pz[b] - pz[i]) / ds; }
  geo.lineLenF = lf;
}

export function sampleIdx(geo, s) { const N = geo.N; let f = s / geo.ds; f = ((f % N) + N) % N; const i = Math.floor(f); return [i, (i + 1) % N, f - i]; }
export function lerpArr(geo, arr, s) { const [i, j, f] = sampleIdx(geo, s); return arr[i] + (arr[j] - arr[i]) * f; }
// world position for track coords
export function toWorld(geo, s, d, out) {
  const [i, j, f] = sampleIdx(geo, s);
  const cx = geo.x[i] + (geo.x[j] - geo.x[i]) * f, cz = geo.z[i] + (geo.z[j] - geo.z[i]) * f, cy = geo.y[i] + (geo.y[j] - geo.y[i]) * f;
  const rx = geo.rx[i] + (geo.rx[j] - geo.rx[i]) * f, rz = geo.rz[i] + (geo.rz[j] - geo.rz[i]) * f;
  out.x = cx + rx * d; out.y = cy; out.z = cz + rz * d;
  out.heading = Math.atan2(geo.tz[i] + (geo.tz[j] - geo.tz[i]) * f, geo.tx[i] + (geo.tx[j] - geo.tx[i]) * f);
  return out;
}

export function trackStats(geo) {
  // count corners: contiguous zones with |k| > 1/250
  let turns = 0, inC = false, maxK = 0;
  for (let i = 0; i < geo.N; i++) { const k = Math.abs(geo.kappa[i]); maxK = Math.max(maxK, k); if (k > 1 / 220 && !inC) { turns++; inC = true; } else if (k < 1 / 400) inC = false; }
  let longest = 0, run = 0;
  for (let i = 0; i < geo.N * 2; i++) { if (Math.abs(geo.kappa[i % geo.N]) < 1 / 600) { run++; longest = Math.max(longest, run); } else run = 0; }
  return { turns, minRadius: 1 / maxK, longestStraight: Math.min(longest, geo.N) * geo.ds };
}

// Cheap outline for menus/minimaps (no scaling / racing line)
export function trackOutline(def, per = 8) {
  const P = def.pts.map(p => [p[0], -p[1]]), n = P.length, out = [];
  for (let i = 0; i < n; i++) { const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n]; for (let k = 0; k < per; k++) out.push(catmull(p0, p1, p2, p3, k / per)); }
  return out;
}
