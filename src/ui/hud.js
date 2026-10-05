import { shortName, riderTeamName } from '../data/riders.js';
import { WEATHER, TIRES } from '../game/perf.js';

export const fmtTime = (t) => { if (!isFinite(t) || t <= 0) return '--:--.---'; const m = Math.floor(t / 60); const s = t - m * 60; return `${m}:${s.toFixed(3).padStart(6, '0')}`; };
export const fmtGap = (g) => (g >= 0 ? '+' : '-') + Math.abs(g).toFixed(3);

export class Hud {
  constructor(root) { this.root = root; this.el = null; this.notes = []; }
  build({ race, geo, mobile, spectator, manual, settings, onPause, onCamera, input }) {
    this.race = race; this.geo = geo; this.mobile = mobile; this.spectator = spectator;
    const tw = TIRES[race.player?.tire || 'MEDIUM'];
    this.root.innerHTML = `
    <div class="hud ${mobile ? 'mobile' : ''} ${spectator ? 'spectator' : ''}">
      <div class="hud-tl">
        <div class="hud-pos"><span class="big" id="h-pos">P-</span><span class="small" id="h-of">/${race.entrants.length}</span></div>
        <div class="hud-lap">LAP <b id="h-lap">1</b>/${race.laps}</div>
        <div class="tower" id="h-tower"></div>
      </div>
      <div class="hud-tc">
        <div class="lights" id="h-lights">${'<i></i>'.repeat(5)}</div>
        <div class="gaps" id="h-gaps"><span id="h-gapA"></span><span id="h-gapB"></span></div>
        <div class="banner" id="h-banner"></div>
      </div>
      <div class="hud-tr">
        <button class="hbtn" id="h-pause" aria-label="Pause">❚❚</button>
        <button class="hbtn" id="h-cam" aria-label="Camera">CAM</button>
        <div class="timing">
          <div><label>LAP</label><b id="h-cur">--:--.---</b></div>
          <div class="nm"><label>LAST</label><b id="h-last">--:--.---</b></div>
          <div><label>BEST</label><b id="h-best">--:--.---</b></div>
        </div>
        <div class="cond"><span>${WEATHER[race.weather].icon} ${WEATHER[race.weather].label}</span>${race.player ? `<span class="tyre" style="--tc:${tw.color}">${tw.label}</span><span id="h-wear"></span>` : ''}</div>
      </div>
      <div class="hud-bl"><canvas id="h-map" width="220" height="220"></canvas></div>
      ${race.player ? `<div class="hud-br">
        <div class="speedo"><div class="spd"><b id="h-spd">0</b><small>KM/H</small></div><div class="gear" id="h-gear">N</div></div>
        <div class="rpm"><div id="h-rpm"></div></div>
        <div class="assist" id="h-assist"></div>
      </div>` : `<div class="hud-br spec-info" id="h-focus"></div>`}
      ${race.player && mobile ? `<div class="touch">
        <div class="tbtn left" id="t-left"><span>◀</span></div>
        <div class="tbtn right" id="t-right"><span>▶</span></div>
        ${manual ? `<div class="tbtn brake" id="t-brake"><span>BRAKE</span></div><div class="tbtn gas" id="t-gas"><span>GAS</span></div>` : ''}
      </div>` : ''}
      ${spectator ? `<div class="spec-ctl"><button class="hbtn" id="s-prev">◀ RIDER</button><button class="hbtn" id="s-next">RIDER ▶</button></div>` : ''}
      <div class="lowerthird" id="h-lower"></div>
    </div>`;
    const $ = (id) => this.root.querySelector('#' + id);
    this.$ = $;
    $('h-pause').onclick = onPause; $('h-cam').onclick = onCamera;
    if (race.player && mobile && input) {
      input.bindTouch($('t-left'), 'left'); input.bindTouch($('t-right'), 'right');
      if (manual) { input.bindTouch($('t-brake'), 'brake'); input.bindTouch($('t-gas'), 'throttle'); }
    }
    if (spectator) { $('s-prev').onclick = () => input.press('focusPrev'); $('s-next').onclick = () => input.press('focusNext'); }
    this.mapCtx = $('h-map').getContext('2d');
    this.buildMap();
    this.lightEls = [...this.root.querySelectorAll('#h-lights i')];
    this.towerT = 0;
  }
  buildMap() {
    const g = this.geo; let mnx = 1e9, mxx = -1e9, mnz = 1e9, mxz = -1e9;
    for (let i = 0; i < g.N; i++) { mnx = Math.min(mnx, g.x[i]); mxx = Math.max(mxx, g.x[i]); mnz = Math.min(mnz, g.z[i]); mxz = Math.max(mxz, g.z[i]); }
    const sc = 190 / Math.max(mxx - mnx, mxz - mnz); const ox = 110 - (mnx + mxx) / 2 * sc, oz = 110 - (mnz + mxz) / 2 * sc;
    this.mapT = (x, z) => [x * sc + ox, z * sc + oz];
    const c = document.createElement('canvas'); c.width = c.height = 220; const x = c.getContext('2d');
    x.lineJoin = 'round'; x.strokeStyle = 'rgba(0,0,0,0.6)'; x.lineWidth = 9; x.beginPath();
    for (let i = 0; i <= g.N; i += 4) { const [px, pz] = this.mapT(g.x[i % g.N], g.z[i % g.N]); i ? x.lineTo(px, pz) : x.moveTo(px, pz); }
    x.closePath(); x.stroke(); x.strokeStyle = '#e8e8e8'; x.lineWidth = 4; x.stroke();
    const [sx, sz] = this.mapT(g.x[0], g.z[0]); x.fillStyle = '#e10600'; x.fillRect(sx - 4, sz - 4, 8, 8);
    this.mapBase = c;
  }
  lights(n, go) {
    this.lightEls.forEach((el, i) => { el.className = go ? 'go' : i < n ? 'on' : ''; });
    this.$('h-lights').style.display = (n > 0 || go) ? 'flex' : 'none';
  }
  note(text, cls = '', dur = 2.4) {
    const b = this.$('h-banner'); if (!b) return;
    const d = document.createElement('div'); d.className = 'note ' + cls; d.textContent = text; b.appendChild(d);
    setTimeout(() => d.classList.add('out'), dur * 1000); setTimeout(() => d.remove(), dur * 1000 + 500);
    while (b.children.length > 3) b.firstChild.remove();
  }
  lower(e, extra = '') {
    const el = this.$('h-lower'); if (!el) return;
    if (!e) { el.classList.remove('show'); return; }
    el.innerHTML = `<span class="num" style="background:${e.rider.helmet[0]};color:${e.rider.helmet[1]}">${e.rider.number}</span><div><b>${e.rider.name}</b><small>${riderTeamName(e.rider)}${extra}</small></div>`;
    el.classList.add('show');
  }
  update(dt, focus, cam) {
    const r = this.race, $ = this.$;
    const p = r.player || focus;
    if (!p) return;
    $('h-pos').textContent = 'P' + p.pos;
    $('h-lap').textContent = Math.max(1, Math.min(r.laps, p.lap || 1));
    const raceT = r.goTime != null ? r.t - r.goTime : 0;
    $('h-cur').textContent = r.goTime != null && !p.finished ? fmtTime(r.t - (p.lap > 0 ? p.lapStart : r.goTime)) : (p.finished ? 'FINISH' : '0:00.000');
    $('h-last').textContent = fmtTime(p.lapTimes[p.lapTimes.length - 1]);
    $('h-best').textContent = fmtTime(p.bestLap);
    if (r.player) {
      const kmh = Math.round(p.v * 3.6);
      $('h-spd').textContent = kmh;
      $('h-gear').textContent = p.v < 0.5 && !p.started ? 'N' : p.gear;
      const rf = Math.max(0, Math.min(1, (p.rpm - 3500) / 14000));
      const rpmEl = $('h-rpm'); rpmEl.style.width = (rf * 100).toFixed(1) + '%'; rpmEl.className = rf > 0.93 ? 'redline' : rf > 0.78 ? 'high' : '';
      const w = $('h-wear'); if (w) w.textContent = Math.round((1 - p.wear) * 100) + '%';
      const as = $('h-assist');
      if (as) as.innerHTML = p.brake > 0.05 ? `<i class="b" style="opacity:${0.4 + p.brake * 0.6}">BRAKE</i>` : p.throttle > 0.6 ? '<i class="g">THROTTLE</i>' : '<i class="y">LIFT</i>';
      if (p.offTrack) as.innerHTML = '<i class="b">OFF TRACK</i>';
    }
    // gaps
    const idx = r.order.indexOf(p);
    const A = r.order[idx - 1], B = r.order[idx + 1];
    if (r.goTime != null && raceT > 3 && !p.finished) {
      $('h-gapA').innerHTML = A ? `<em>${shortName(A.rider)}</em> ${fmtGap(-r.gap(A, p))}` : '<em>LEADER</em>';
      $('h-gapB').innerHTML = B && !B.finished ? `<em>${shortName(B.rider)}</em> ${fmtGap(r.gap(p, B))}` : '';
    } else { $('h-gapA').textContent = ''; $('h-gapB').textContent = ''; }
    // tower (throttled)
    this.towerT -= dt;
    if (this.towerT <= 0 && !this.mobile) {
      this.towerT = 0.5;
      const rows = [];
      const n = r.order.length; const show = new Set();
      for (let k = 0; k < Math.min(5, n); k++) show.add(k);
      for (let k = Math.max(0, idx - 2); k <= Math.min(n - 1, idx + 2); k++) show.add(k);
      let lastK = -1;
      for (const k of [...show].sort((a, b) => a - b)) {
        if (k !== lastK + 1) rows.push('<div class="tr sep">···</div>');
        const e = r.order[k];
        const g = k === 0 ? (e.finished ? 'FIN' : 'LEADER') : (raceT > 3 ? fmtGap(r.gap(r.order[0], e) > 0 ? r.gap(r.order[0], e) : 0) : '');
        rows.push(`<div class="tr ${e === p ? 'me' : ''}"><span class="p">${k + 1}</span><span class="c" style="background:${e.rider.helmet[0]}"></span><span class="n">${shortName(e.rider)}</span><span class="g">${g}</span></div>`);
        lastK = k;
      }
      $('h-tower').innerHTML = rows.join('');
    }
    // minimap
    const x = this.mapCtx; x.clearRect(0, 0, 220, 220); x.drawImage(this.mapBase, 0, 0);
    for (const e of r.entrants) {
      const i = ((Math.floor(e.s / this.geo.ds) % this.geo.N) + this.geo.N) % this.geo.N;
      const [px, pz] = this.mapT(this.geo.x[i], this.geo.z[i]);
      x.fillStyle = e === p ? '#ffdd00' : e.rider.helmet[0]; x.strokeStyle = '#000'; x.lineWidth = 1.5;
      x.beginPath(); x.arc(px, pz, e === p ? 6 : 3.6, 0, Math.PI * 2); x.fill(); x.stroke();
    }
    if (this.spectator) {
      const f = $('h-focus');
      if (f) f.innerHTML = `<div class="sp-name"><span class="num" style="background:${p.rider.helmet[0]};color:${p.rider.helmet[1]}">${p.rider.number}</span> ${p.rider.name}</div><div class="sp-row">P${p.pos} · ${Math.round(p.v * 3.6)} km/h · ${cam.toUpperCase()} CAM</div>`;
    }
  }
}
