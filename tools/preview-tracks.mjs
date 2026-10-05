import { writeFileSync } from 'fs';
import { TRACKS } from '../src/data/tracks.js';
import { buildTrackGeometry, trackStats } from '../src/game/trackgeom.js';
let html = '<html><body style="background:#222;color:#eee;font:12px sans-serif;display:flex;flex-wrap:wrap">';
for (const t of TRACKS) {
  const g = buildTrackGeometry(t);
  const st = trackStats(g);
  // self-overlap check
  let minGap = 1e9, where = -1;
  for (let i = 0; i < g.N; i += 3) for (let j = 0; j < g.N; j += 3) {
    const sep = Math.min(Math.abs(i - j), g.N - Math.abs(i - j)) * g.ds; if (sep < 150) continue;
    const dd = Math.hypot(g.x[i] - g.x[j], g.z[i] - g.z[j]); if (dd < minGap) { minGap = dd; where = i; }
  }
  let mnx = 1e9, mxx = -1e9, mnz = 1e9, mxz = -1e9;
  for (let i = 0; i < g.N; i++) { mnx = Math.min(mnx, g.x[i]); mxx = Math.max(mxx, g.x[i]); mnz = Math.min(mnz, g.z[i]); mxz = Math.max(mxz, g.z[i]); }
  const W = 360, sc = W / Math.max(mxx - mnx, mxz - mnz) * 0.9;
  const X = (v) => (v - mnx) * sc + 18, Z = (v) => (v - mnz) * sc + 18;
  let path = '', line = '';
  for (let i = 0; i < g.N; i += 2) { path += (i ? 'L' : 'M') + X(g.x[i]).toFixed(1) + ' ' + Z(g.z[i]).toFixed(1); line += (i ? 'L' : 'M') + X(g.lineX[i]).toFixed(1) + ' ' + Z(g.lineZ[i]).toFixed(1); }
  const tight = []; for (let i = 0; i < g.N; i++) if (Math.abs(g.kappa[i]) > 1 / 18) tight.push(i);
  html += `<div style="margin:6px"><svg width="400" height="400" style="background:#353"><path d="${path}Z" stroke="#999" stroke-width="${Math.max(2, t.width * sc)}" fill="none"/><path d="${line}Z" stroke="#f33" stroke-width="1" fill="none"/>
  <circle cx="${X(g.x[0])}" cy="${Z(g.z[0])}" r="6" fill="#fff"/><circle cx="${X(g.x[10])}" cy="${Z(g.z[10])}" r="4" fill="#0f0"/>
  ${where >= 0 ? `<circle cx="${X(g.x[where])}" cy="${Z(g.z[where])}" r="8" fill="none" stroke="#ff0"/>` : ''}
  ${tight.filter((_, k) => k % 5 == 0).map(i => `<circle cx="${X(g.x[i])}" cy="${Z(g.z[i])}" r="3" fill="#f0f"/>`).join('')}
  </svg><br>${t.name} L=${g.L} turns=${st.turns} minR=${st.minRadius.toFixed(1)} gap=${minGap.toFixed(0)} straight=${st.longestStraight}</div>`;
  console.log(t.id.padEnd(10), 'turns', st.turns, 'minR', st.minRadius.toFixed(1), 'minGap', minGap.toFixed(0), 'straight', st.longestStraight);
}
writeFileSync('/tmp/tracks.html', html + '</body></html>');
