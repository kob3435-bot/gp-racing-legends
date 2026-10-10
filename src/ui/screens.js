import { RIDERS, RIDER_BY_ID, CURRENT_GRID, LEGENDS, ROOKIES, displayName, riderTeamName, riderBike, riderTeamId, riderLivery } from '../data/riders.js';
import { TRACKS, TRACK_BY_ID, CALENDAR, MONTH_OF, realLaps, seasonLaps, lapsLabel } from '../data/tracks.js';
import { ATTRS, ATTR_LABEL, ovrTier } from '../data/attributes.js';
import { equalBike, balancedBike, BIKE_STATS } from '../data/bikes.js';
import { MANUFACTURER_BY_ID } from '../data/manufacturers.js';
import { TEAM_BY_ID, CURRENT_TEAMS } from '../data/teams.js';
import { trackOutline, trackStats } from '../game/trackgeom.js';
import { WEATHER, TIRES, DIFFICULTY, POINTS, pickWeather, compatibility } from '../game/perf.js';
import { getGeo } from '../game/game.js';
import { fmtTime } from './hud.js';
import * as save from '../save.js';
import { audio } from '../game/audio.js';

export const CONTROL_MODES = ['SEMI', 'PRO', 'FULL', 'MANUAL'];
export const CONTROL_LABEL = { SEMI: 'SEMI AUTO', PRO: 'PRO ASSIST', FULL: 'FULL ASSIST', MANUAL: 'MANUAL' };
export const CONTROL_DESC = {
  SEMI: 'Semi Auto: auto throttle, brake & gears; light steering help (the bike follows part of each corner, soft edge push-back). No crashes.',
  PRO: 'Pro Assist: auto throttle, brake & gears — steering is 100% yours, zero steering help (no line pull, edge nudge or smoothing; let go and you run wide). No crashes; grass & gravel slow you down.',
  FULL: 'Full Assist: auto throttle, brake & gears plus extra steering help towards the racing line. No crashes.',
  MANUAL: 'Manual: W/S throttle & brake, Shift/Ctrl gears (or auto gears). You can crash.',
};
export function controlPicker(value) { return `${seg('control', CONTROL_MODES, value, CONTROL_LABEL)}<p class="fine" id="ctlDesc">${CONTROL_DESC[value] || ''}</p>`; }
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const FLAG = { ESP: '🇪🇸', ITA: '🇮🇹', FRA: '🇫🇷', JPN: '🇯🇵', AUS: '🇦🇺', USA: '🇺🇸', GBR: '🇬🇧', THA: '🇹🇭', BRA: '🇧🇷', ARG: '🇦🇷', POR: '🇵🇹', RSA: '🇿🇦', FIN: '🇫🇮', SWE: '🇸🇪', GER: '🇩🇪', NED: '🇳🇱', AUT: '🇦🇹', MAS: '🇲🇾', QAT: '🇶🇦' };
export const flag = (c) => FLAG[c] || '';

export function trackSvg(def, size = 120, stroke = 5) {
  const pts = trackOutline(def, 6);
  let mnx = 1e9, mxx = -1e9, mny = 1e9, mxy = -1e9;
  for (const [x, y] of pts) { mnx = Math.min(mnx, x); mxx = Math.max(mxx, x); mny = Math.min(mny, y); mxy = Math.max(mxy, y); }
  const sc = (size - 16) / Math.max(mxx - mnx, mxy - mny);
  const ox = (size - (mxx - mnx) * sc) / 2, oy = (size - (mxy - mny) * sc) / 2;
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${((x - mnx) * sc + ox).toFixed(1)} ${((y - mny) * sc + oy).toFixed(1)}`).join('') + 'Z';
  return `<svg viewBox="0 0 ${size} ${size}" class="tsvg"><path d="${d}" fill="none" stroke="rgba(0,0,0,.55)" stroke-width="${stroke + 3}" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linejoin="round"/></svg>`;
}

export function riderCard(r, sel = false, extra = '') {
  const lv = riderLivery(r);
  return `<button class="rcard ${sel ? 'sel' : ''}" data-rid="${r.id}" style="--c1:${r.helmet[0]};--c2:${lv[0]};--c3:${r.helmet[1]}">
    <div class="rc-band"><span class="rc-num">${r.number}</span><span class="rc-ovr"><b>${r.ovr}</b><small>OVR</small></span></div>
    <div class="rc-name">${esc(r.name)}</div>
    <div class="rc-sub">${r.version ? `<span class="tag legend">${esc(r.version)}</span>` : r.kind === 'rookie' ? '<span class="tag rookie">ROOKIE</span>' : ''} ${flag(r.nationality)} ${r.nationality}</div>
    <div class="rc-team">${esc(riderTeamName(r))}</div>${extra}
  </button>`;
}

export function seg(name, options, value, labels = {}) {
  return `<div class="seg" data-seg="${name}">${options.map(o => `<button class="${o === value ? 'on' : ''}" data-v="${o}">${labels[o] || o}</button>`).join('')}</div>`;
}
export function bindSegs(root, state, onChange) {
  root.querySelectorAll('.seg').forEach(sg => sg.addEventListener('click', (ev) => {
    const b = ev.target.closest('button'); if (!b) return; audio.click();
    sg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    let v = b.dataset.v; if (/^\d+$/.test(v)) v = +v;
    state[sg.dataset.seg] = v; onChange && onChange(sg.dataset.seg, v);
  }));
}

export class UI {
  constructor(root, app) { this.root = root; this.app = app; this.qr = null; }
  get settings() { return this.app.settings; }
  show(html, cls = '') {
    this.root.innerHTML = `<div class="screen ${cls} enter">${html}</div>`;
    this.root.style.display = 'block';
    requestAnimationFrame(() => { const sc = this.root.firstElementChild; if (sc) requestAnimationFrame(() => sc.classList.remove('enter')); });
    if (audio.ctx) audio.startMusic();
    this.root.scrollTop = 0;
    const back = this.root.querySelector('[data-back]');
    if (back) back.onclick = () => { audio.click(); this.main(); };
    return this.root.firstElementChild;
  }
  hide() { this.root.style.display = 'none'; this.root.innerHTML = ''; }
  header(title, sub = '') { return `<header class="sh"><button class="back" data-back>‹ MENU</button><div><h2>${title}</h2>${sub ? `<p>${sub}</p>` : ''}</div></header>`; }

  // ---------------- first launch ----------------
  welcome() {
    const el = this.show(`<div class="welcome"><div class="logo">${this.logo()}</div>
      <h3>HOW DO YOU WANT TO RIDE?</h3>
      <div class="choice">
        <button class="bigchoice" data-x="casual"><b>CASUAL</b><span>Semi-auto riding: you steer and pick the line, the bike handles throttle, braking and gears. Full racing line shown.</span></button>
        <button class="bigchoice" data-x="exp"><b>EXPERIENCED</b><span>Manual throttle, brakes and gears. Braking-only line. You can run wide and crash.</span></button>
      </div><p class="fine">You can change this any time in Settings.</p></div>`, 'center');
    el.querySelectorAll('[data-x]').forEach(b => b.onclick = () => {
      audio.ensure(); audio.click();
      const casual = b.dataset.x === 'casual';
      Object.assign(this.settings, casual ? { control: 'SEMI', line: 'FULL', gear: 'AUTO' } : { control: 'MANUAL', line: 'BRAKING', gear: 'MANUAL' });
      save.saveSettings(this.settings); save.saveProfile({ created: Date.now(), style: b.dataset.x });
      this.main();
    });
  }
  logo() { return `<div class="logo-mark"><span class="l1">GP RACING</span><span class="l2">LEGENDS</span><span class="l3">WORLD CHAMPIONSHIP</span></div>`; }

  // ---------------- main menu ----------------
  main() {
    this.app.game.showroom(RIDER_BY_ID[this.app.lastRider()] || CURRENT_GRID[0]);
    const champ = save.loadChampionship();
    const items = [
      ['quick', 'QUICK RACE', 'Pick a rider & track and go'],
      ['champ', 'CHAMPIONSHIP', champ ? `Round ${Math.min(champ.round + 1, champ.calendar.length)} of ${champ.calendar.length} · continue` : 'Full season with standings'],
      ['online', 'ONLINE CHAMPIONSHIP', '2 players · share a room code'],
      ['dream', 'DREAM GRID', 'Legends of every era on one grid'],
      ['spectator', 'SPECTATOR', 'Watch the AI battle it out'],
      ['db', 'RIDER DATABASE', `${RIDERS.length} riders · ${LEGENDS.length} legend versions`],
      ['stats', 'STATISTICS', 'Your racing record'],
      ['settingsScreen', 'SETTINGS', 'Controls, assists, graphics, sound'],
    ];
    const el = this.show(`<div class="mainmenu"><div class="mm-left">${this.logo()}
      <nav class="mm-nav">${items.map(([id, t, s], i) => `<button class="mm-item ${i === 0 ? 'primary' : ''}" data-go="${id}"><b>${t}</b><small>${s}</small></button>`).join('')}</nav>
      <p class="fine">All riders, teams, manufacturers, sponsors and circuits are fictional.</p></div></div>`, 'menu');
    el.querySelectorAll('[data-go]').forEach(b => b.onclick = () => { audio.ensure(); audio.click(); audio.whoosh(); this[b.dataset.go](); });
    // menu music starts on the first user gesture (autoplay policy)
    const kick = () => { if (audio.ensure()) audio.startMusic(); window.removeEventListener('pointerdown', kick); window.removeEventListener('keydown', kick); };
    if (!audio.music) { window.addEventListener('pointerdown', kick); window.addEventListener('keydown', kick); }
  }

  // ---------------- shared pickers ----------------
  riderPicker(container, state, key, { pool = null, onPick } = {}) {
    let tab = state._tab || (RIDER_BY_ID[state[key]]?.kind || 'current');
    const render = () => {
      const list = (pool || RIDERS).filter(r => tab === 'all' || r.kind === tab).sort((a, b) => b.ovr - a.ovr);
      container.innerHTML = `<div class="tabs">${['current', 'legend', 'rookie'].map(t => `<button class="${t === tab ? 'on' : ''}" data-tab="${t}">${{ current: 'CURRENT GRID', legend: 'LEGENDS', rookie: 'ROOKIES' }[t]}</button>`).join('')}</div>
        <div class="rgrid">${list.map(r => riderCard(r, r.id === state[key])).join('')}</div>`;
      container.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { audio.click(); tab = b.dataset.tab; state._tab = tab; render(); });
      container.querySelectorAll('[data-rid]').forEach(b => b.onclick = () => {
        audio.click(); state[key] = b.dataset.rid; container.querySelectorAll('.rcard').forEach(x => x.classList.toggle('sel', x === b));
        this.app.game.showroom(RIDER_BY_ID[state[key]]); onPick && onPick(state[key]);
      });
    };
    render();
  }
  trackPicker(container, state, key = 'trackId', onPick) {
    container.innerHTML = `<div class="tgrid">${TRACKS.map(t => `<button class="tcard ${t.id === state[key] ? 'sel' : ''}" data-tid="${t.id}">${trackSvg(t, 92, 4)}<div><b>${t.name}</b><small>${flag(t.flag)} ${t.country} · ${(t.length / 1000).toFixed(2)} km${t.night ? ' · NIGHT' : ''}</small><small class="chars">${t.character.join(' · ')}</small></div></button>`).join('')}</div>`;
    container.querySelectorAll('[data-tid]').forEach(b => b.onclick = () => { audio.click(); state[key] = b.dataset.tid; container.querySelectorAll('.tcard').forEach(x => x.classList.toggle('sel', x === b)); onPick && onPick(); });
  }
  optionsBlock(state, { tyre = true, laps = [1, 3, 5, 8, 12, 20] } = {}) {
    return `<div class="opts">
      <label>LAPS</label>${seg('laps', laps, state.laps)}
      <label>WEATHER</label>${seg('weather', ['RANDOM', 'SUNNY', 'CLOUDY', 'LIGHT_RAIN', 'HEAVY_RAIN'], state.weather, { RANDOM: 'RANDOM', SUNNY: '☀ SUNNY', CLOUDY: '☁ CLOUDY', LIGHT_RAIN: '🌦 LIGHT RAIN', HEAVY_RAIN: '🌧 HEAVY RAIN' })}
      <label>AI DIFFICULTY</label>${seg('difficulty', Object.keys(DIFFICULTY), state.difficulty)}
      ${tyre ? `<label>TYRES</label>${seg('tire', ['AUTO', 'SOFT', 'MEDIUM', 'HARD', 'RAIN'], state.tire)}` : ''}
    </div>`;
  }
  resolveWeather(w, trackId) { return w === 'RANDOM' ? pickWeather(TRACK_BY_ID[trackId]) : w; }

  // ---------------- QUICK RACE ----------------
  quick() {
    const last = save.loadLastRace() || {};
    const st = this.qr = this.qr || { riderId: last.riderId || this.app.lastRider() || 'srisuk', trackId: last.trackId || 'siam', laps: last.laps || 3, weather: 'SUNNY', difficulty: this.settings.difficulty || 'NORMAL', tire: 'AUTO' };
    const el = this.show(`${this.header('QUICK RACE', 'Rider, track, go. Defaults are ready — just press START.')}
      <div class="setup">
        <section class="col"><h4>1 · RIDER</h4><div id="rp"></div></section>
        <section class="col"><h4>2 · TRACK</h4><div id="tp"></div><h4>3 · RACE OPTIONS</h4>${this.optionsBlock(st)}</section>
      </div>
      <div class="startbar"><div id="sb-sum"></div><button class="btn primary big" id="go">START RACE ▶</button></div>`, 'setupscreen');
    const sum = () => { const r = RIDER_BY_ID[st.riderId], t = TRACK_BY_ID[st.trackId]; el.querySelector('#sb-sum').innerHTML = `<b>${esc(displayName(r))}</b> <span>OVR ${r.ovr}</span> · ${t.name} · ${st.laps} lap${st.laps > 1 ? 's' : ''} · ${DIFFICULTY[st.difficulty].label}`; };
    this.riderPicker(el.querySelector('#rp'), st, 'riderId', { onPick: sum });
    this.trackPicker(el.querySelector('#tp'), st, 'trackId', sum);
    bindSegs(el, st, sum); sum();
    el.querySelector('#go').onclick = () => {
      audio.ensure(); audio.click();
      const me = RIDER_BY_ID[st.riderId];
      save.saveLastRace({ riderId: st.riderId, trackId: st.trackId, laps: st.laps });
      this.settings.difficulty = st.difficulty; save.saveSettings(this.settings);
      const field = buildField(me, CURRENT_GRID);
      const cfg = { mode: 'quick', title: 'QUICK RACE', trackId: st.trackId, laps: st.laps, weather: this.resolveWeather(st.weather, st.trackId), difficulty: st.difficulty, playerTire: st.tire, entrants: field.map(r => ({ rider: r, bike: riderBike(r, 'modern'), isPlayer: r.id === me.id })) };
      this.app.race(cfg, () => this.quick());
    };
  }

  // ---------------- DREAM GRID ----------------
  dream() {
    const st = this.dg = this.dg || { picked: LEGENDS.filter(r => r.version.includes('Prime')).sort((a, b) => b.ovr - a.ovr).slice(0, 21).map(r => r.id), me: 'arrieta-2019', machinery: 'EQUAL', trackId: 'tuscan', laps: 3, weather: 'SUNNY', difficulty: 'HARD', tire: 'AUTO', filter: 'legend', q: '' };
    if (!st.picked.includes(st.me) && st.me !== 'SPECTATE') st.picked.unshift(st.me);
    const el = this.show(`${this.header('DREAM GRID', 'Build a grid from any era — up to 22 riders. Prime versions included.')}
      <div class="setup">
        <section class="col"><h4>RIDERS <span id="dg-count"></span></h4>
          <div class="row wrap"><button class="chip" data-p="primes">LEGEND PRIMES</button><button class="chip" data-p="current">CURRENT GRID</button><button class="chip" data-p="mixed">MIXED ERAS</button><button class="chip" data-p="random">RANDOM 22</button><button class="chip" data-p="clear">CLEAR</button></div>
          <div class="tabs" id="dg-tabs">${['legend', 'current', 'rookie'].map(t => `<button class="${t === st.filter ? 'on' : ''}" data-f="${t}">${{ legend: 'LEGENDS', current: 'CURRENT', rookie: 'ROOKIES' }[t]}</button>`).join('')}</div>
          <div class="rgrid" id="dg-list"></div></section>
        <section class="col"><h4>YOUR RIDER</h4><select id="dg-me" class="sel"></select>
          <h4>MACHINERY</h4>${seg('machinery', ['REAL', 'BALANCED', 'EQUAL'], st.machinery, { REAL: 'REAL (era bikes)', BALANCED: 'BALANCED', EQUAL: 'EQUAL MACHINERY' })}
          <p class="fine" id="dg-mach"></p>
          <h4>TRACK</h4><div id="tp"></div>${this.optionsBlock(st)}</section>
      </div>
      <div class="startbar"><div id="sb-sum"></div><button class="btn primary big" id="go">START DREAM RACE ▶</button></div>`, 'setupscreen');
    const machTxt = { REAL: 'Every legend rides the machine from their era: a 2005 bike vs a 2026 bike is not a fair fight.', BALANCED: 'Era machines pulled 70% towards a common baseline — skill shows, character remains.', EQUAL: 'Everyone on an identical spec prototype — pure rider skill.' };
    const renderList = () => {
      const list = RIDERS.filter(r => r.kind === st.filter).sort((a, b) => b.ovr - a.ovr);
      el.querySelector('#dg-list').innerHTML = list.map(r => riderCard(r, st.picked.includes(r.id), `<span class="check">${st.picked.includes(r.id) ? '✓' : '+'}</span>`)).join('');
      el.querySelector('#dg-count').textContent = `${st.picked.length}/22`;
      el.querySelectorAll('#dg-list [data-rid]').forEach(b => b.onclick = () => {
        audio.click(); const id = b.dataset.rid; const i = st.picked.indexOf(id);
        if (i >= 0) { if (id === st.me) return; st.picked.splice(i, 1); } else if (st.picked.length < 22) st.picked.push(id); else { this.toast('Grid is full (22). Remove someone first.'); return; }
        renderList(); renderMe();
      });
    };
    const renderMe = () => {
      const s = el.querySelector('#dg-me');
      s.innerHTML = `<option value="SPECTATE" ${st.me === 'SPECTATE' ? 'selected' : ''}>— Spectate (no player) —</option>` + st.picked.map(id => { const r = RIDER_BY_ID[id]; return `<option value="${id}" ${id === st.me ? 'selected' : ''}>${esc(displayName(r))} (${r.ovr})</option>`; }).join('');
      el.querySelector('#dg-mach').textContent = machTxt[st.machinery];
      const r = RIDER_BY_ID[st.me]; el.querySelector('#sb-sum').innerHTML = `${st.picked.length} riders · ${st.me === 'SPECTATE' ? 'Spectating' : '<b>' + esc(displayName(r)) + '</b>'} · ${st.machinery} · ${TRACK_BY_ID[st.trackId].name}`;
      if (r) this.app.game.showroom(r);
    };
    el.querySelector('#dg-me').onchange = (e) => { st.me = e.target.value; renderMe(); };
    el.querySelectorAll('#dg-tabs [data-f]').forEach(b => b.onclick = () => { st.filter = b.dataset.f; el.querySelectorAll('#dg-tabs button').forEach(x => x.classList.toggle('on', x === b)); renderList(); });
    el.querySelectorAll('[data-p]').forEach(b => b.onclick = () => {
      audio.click(); const p = b.dataset.p;
      const uniq = (arr) => { const seen = new Set(); return arr.filter(r => { if (seen.has(r.name)) return false; seen.add(r.name); return true; }); };
      if (p === 'primes') st.picked = uniq(LEGENDS.slice().sort((a, b) => b.ovr - a.ovr)).slice(0, 22).map(r => r.id);
      if (p === 'current') st.picked = CURRENT_GRID.map(r => r.id);
      if (p === 'mixed') st.picked = [...uniq(LEGENDS.slice().sort((a, b) => b.ovr - a.ovr)).slice(0, 11), ...CURRENT_GRID.slice().sort((a, b) => b.ovr - a.ovr).slice(0, 11)].map(r => r.id);
      if (p === 'random') st.picked = RIDERS.slice().sort(() => Math.random() - 0.5).slice(0, 22).map(r => r.id);
      if (p === 'clear') st.picked = st.me !== 'SPECTATE' ? [st.me] : [];
      if (st.me !== 'SPECTATE' && !st.picked.includes(st.me)) { st.picked = st.picked.slice(0, 21); st.picked.unshift(st.me); }
      renderList(); renderMe();
    });
    this.trackPicker(el.querySelector('#tp'), st, 'trackId', renderMe);
    bindSegs(el, st, renderMe);
    renderList(); renderMe();
    el.querySelector('#go').onclick = () => {
      if (st.picked.length < 2) { this.toast('Pick at least 2 riders.'); return; }
      audio.ensure(); audio.click();
      const bikeFor = (r) => { const real = riderBike(r, 'real'); return st.machinery === 'REAL' ? real : st.machinery === 'BALANCED' ? balancedBike(real) : equalBike(); };
      const spectator = st.me === 'SPECTATE';
      const cfg = { mode: 'dream', title: 'DREAM GRID · ' + st.machinery + ' MACHINERY', trackId: st.trackId, laps: st.laps, weather: this.resolveWeather(st.weather, st.trackId), difficulty: st.difficulty, playerTire: st.tire, spectator, entrants: st.picked.map(id => { const r = RIDER_BY_ID[id]; return { rider: r, bike: bikeFor(r), isPlayer: id === st.me }; }) };
      this.app.race(cfg, () => this.dream());
    };
  }

  // ---------------- SPECTATOR ----------------
  spectator() {
    const st = this.sp = this.sp || { field: 'CURRENT', trackId: 'desert', laps: 3, weather: 'RANDOM', difficulty: 'PRO' };
    const el = this.show(`${this.header('SPECTATOR', 'Sit back and watch. Arrow keys / buttons switch rider, C changes camera.')}
      <div class="setup"><section class="col"><h4>FIELD</h4>${seg('field', ['CURRENT', 'LEGENDS', 'MIXED'], st.field, { CURRENT: 'CURRENT GRID', LEGENDS: 'LEGENDS (EQUAL BIKES)', MIXED: 'MIXED ERAS (EQUAL)' })}
      <h4>TRACK</h4><div id="tp"></div></section><section class="col"><h4>OPTIONS</h4>${this.optionsBlock(st, { tyre: false })}</section></div>
      <div class="startbar"><div></div><button class="btn primary big" id="go">WATCH RACE ▶</button></div>`, 'setupscreen');
    this.trackPicker(el.querySelector('#tp'), st, 'trackId'); bindSegs(el, st);
    el.querySelector('#go').onclick = () => {
      audio.ensure(); audio.click();
      const uniq = (arr) => { const seen = new Set(); return arr.filter(r => { if (seen.has(r.name)) return false; seen.add(r.name); return true; }); };
      let field; let bike = (r) => riderBike(r, 'modern');
      if (st.field === 'CURRENT') field = CURRENT_GRID.slice();
      else if (st.field === 'LEGENDS') { field = uniq(LEGENDS.slice().sort((a, b) => b.ovr - a.ovr)).slice(0, 22); bike = () => equalBike(); }
      else { field = [...uniq(LEGENDS.slice().sort((a, b) => b.ovr - a.ovr)).slice(0, 11), ...CURRENT_GRID.slice().sort((a, b) => b.ovr - a.ovr).slice(0, 11)]; bike = () => equalBike(); }
      const cfg = { mode: 'spectator', title: 'SPECTATOR MODE', spectator: true, trackId: st.trackId, laps: st.laps, weather: this.resolveWeather(st.weather, st.trackId), difficulty: st.difficulty, entrants: field.map(r => ({ rider: r, bike: bike(r), isPlayer: false })) };
      this.app.race(cfg, () => this.spectator());
    };
  }

  online() { this.app.online.menu(); }

  // ---------------- CHAMPIONSHIP ----------------
  champ() {
    const c = save.loadChampionship();
    if (!c) return this.champNew();
    if (c.round >= c.calendar.length) return this.champEnd(c);
    const next = TRACK_BY_ID[c.calendar[c.round]];
    const me = RIDER_BY_ID[c.riderId];
    this.app.game.showroom(me);
    const rs = standings(c.points), ts = standings(c.teamPoints);
    const myPos = rs.findIndex(x => x[0] === c.riderId) + 1;
    const el = this.show(`${this.header('CHAMPIONSHIP', `${esc(displayName(me))} · ${DIFFICULTY[c.difficulty].label} · ${lapsLabel(c)}`)}
      <div class="setup champ">
        <section class="col"><h4>NEXT · ROUND ${c.round + 1} / ${c.calendar.length}</h4>
          <div class="nextround">${trackSvg(next, 120, 5)}<div><b>${next.name}</b><small>${flag(next.flag)} ${next.country} · ${(next.length / 1000).toFixed(2)} km</small><small>${next.character.join(' · ')}</small><small>${MONTH_OF[next.id] || ''} · ${seasonLaps(c, next.id)} laps</small></div></div>
          <div class="cal">${c.calendar.map((id, i) => { const t = TRACK_BY_ID[id]; const res = c.results[i]; return `<div class="calr ${i === c.round ? 'cur' : ''} ${i < c.round ? 'done' : ''}"><span>R${i + 1}</span><span class="mon">${MONTH_OF[id] || ''}</span><span>${flag(t.flag)} ${t.name}</span><span class="lp">${seasonLaps(c, id)}L</span><span>${res ? (res.myPos ? 'P' + res.myPos : '') + ' · ' + esc(RIDER_BY_ID[res.winner]?.name || '') : ''}</span></div>`; }).join('')}</div>
          <div class="row"><button class="btn primary big" id="go">RACE ROUND ${c.round + 1} ▶</button></div>
          <button class="btn danger small" id="abandon">ABANDON SEASON</button>
        </section>
        <section class="col"><h4>RIDERS' STANDINGS ${myPos ? `· YOU: P${myPos}` : ''}</h4>${standTable(rs, c.riderId, (id) => esc(RIDER_BY_ID[id]?.name || id), (id) => riderTeamName(RIDER_BY_ID[id]))}
          <h4>TEAMS' STANDINGS</h4>${standTable(ts, riderTeamId(me), (id) => esc(teamLabel(id)))}</section>
      </div>`, 'setupscreen');
    el.querySelector('#abandon').onclick = () => { if (confirm('Abandon the current season? Progress will be lost.')) { save.saveChampionship(null); this.champ(); } };
    el.querySelector('#go').onclick = () => {
      audio.ensure(); audio.click();
      const field = c.field.map(id => RIDER_BY_ID[id]);
      const cfg = { mode: 'champ', title: `CHAMPIONSHIP · ROUND ${c.round + 1}/${c.calendar.length}`, trackId: next.id, laps: seasonLaps(c, next.id), weather: pickWeather(next), difficulty: c.difficulty, playerTire: 'AUTO', entrants: field.map(r => ({ rider: r, bike: riderBike(r, 'modern'), isPlayer: r.id === c.riderId })) };
      this.app.race(cfg, () => this.champ());
    };
  }
  champNew() {
    const ALL = CALENDAR.length;
    const st = { riderId: this.app.lastRider() || 'srisuk', rounds: 'FULL', laps: 3, difficulty: this.settings.difficulty || 'NORMAL', custom: 15 };
    const el = this.show(`${this.header('NEW CHAMPIONSHIP', `Full season: all ${ALL} circuits, March to November. Points: 25-20-16-13-11-10-9-8-7-6-5-4-3-2-1.`)}
      <div class="setup"><section class="col"><h4>RIDER</h4><div id="rp"></div></section>
      <section class="col"><h4>SEASON</h4><div class="opts"><label>ROUNDS</label>${seg('rounds', ['FULL', 4, 6, 10], st.rounds, { FULL: `FULL SEASON · ${ALL}` })}
      <label>LAPS PER RACE</label>${seg('laps', [1, 3, 5, 10, 'REAL', 'CUSTOM'], st.laps, { REAL: 'REALISTIC', CUSTOM: 'CUSTOM' })}
      <div class="custom-laps" id="customRow" hidden><input type="number" id="customLaps" min="1" max="99" value="${st.custom}"> <span>laps every round</span></div>
      <p class="fine" id="lapsInfo"></p>
      <label>AI DIFFICULTY</label>${seg('difficulty', Object.keys(DIFFICULTY), st.difficulty)}</div>
      <div class="cal mini" id="calPrev"></div>
      <p class="fine">Legends and rookies enter as a wildcard on a factory-spec machine, replacing the slowest regular rider.</p></section></div>
      <div class="startbar"><div></div><button class="btn primary big" id="go">START SEASON ▶</button></div>`, 'setupscreen');
    const pickCal = () => { const order = CALENDAR.map(c => c.id); if (st.rounds === 'FULL' || st.rounds >= order.length) return order; const n = st.rounds; return Array.from({ length: n }, (_, k) => order[Math.round(k * (order.length - 1) / (n - 1))]); };
    const season = () => ({ lapsMode: st.laps === 'REAL' ? 'REAL' : 'FIXED', laps: st.laps === 'CUSTOM' ? Math.max(1, Math.min(99, Math.round(+el.querySelector('#customLaps').value || 1))) : st.laps === 'REAL' ? null : st.laps });
    const refresh = () => {
      el.querySelector('#customRow').hidden = st.laps !== 'CUSTOM';
      const cal = pickCal(), s = season();
      el.querySelector('#lapsInfo').textContent = s.lapsMode === 'REAL' ? `Realistic ~118 km race distance: ${Math.min(...cal.map(id => realLaps(TRACK_BY_ID[id])))}-${Math.max(...cal.map(id => realLaps(TRACK_BY_ID[id])))} laps depending on circuit.` : `${s.laps} lap${s.laps === 1 ? '' : 's'} at every round.`;
      el.querySelector('#calPrev').innerHTML = cal.map((id, i) => `<div class="calr"><span>R${i + 1}</span><span class="mon">${MONTH_OF[id]}</span><span>${flag(TRACK_BY_ID[id].flag)} ${TRACK_BY_ID[id].name}</span><span class="lp">${seasonLaps(s, id)}L</span></div>`).join('');
    };
    this.riderPicker(el.querySelector('#rp'), st, 'riderId'); bindSegs(el, st, refresh);
    el.querySelector('#customLaps').oninput = refresh; refresh();
    el.querySelector('#go').onclick = () => {
      audio.click();
      const me = RIDER_BY_ID[st.riderId];
      const field = buildField(me, CURRENT_GRID).map(r => r.id);
      const c = { version: 2, riderId: me.id, difficulty: st.difficulty, ...season(), calendar: pickCal(), round: 0, field, points: Object.fromEntries(field.map(id => [id, 0])), teamPoints: {}, results: [], created: Date.now() };
      for (const id of field) c.teamPoints[riderTeamId(RIDER_BY_ID[id])] = 0;
      save.saveChampionship(c); this.champ();
    };
  }
  champEnd(c) {
    const rs = standings(c.points); const champ = RIDER_BY_ID[rs[0][0]]; const myPos = rs.findIndex(x => x[0] === c.riderId) + 1;
    const el = this.show(`${this.header('SEASON COMPLETE')}
      <div class="center-col"><div class="trophy">🏆</div><h2>${esc(champ.name)} is World Champion</h2><p>You finished the season <b>P${myPos}</b> with ${c.points[c.riderId]} points.</p>
      <p class="fine">${c.calendar.length} rounds · ${lapsLabel(c)} · Teams' champion: <b>${esc(teamLabel(standings(c.teamPoints)[0][0]))}</b></p>
      <div class="champ-tables"><div>${standTable(rs, c.riderId, (id) => esc(RIDER_BY_ID[id]?.name || id), (id) => riderTeamName(RIDER_BY_ID[id]))}</div>
      <div><h4>TEAMS</h4>${standTable(standings(c.teamPoints), riderTeamId(RIDER_BY_ID[c.riderId]), (id) => esc(teamLabel(id)))}</div></div>
      <div class="row"><button class="btn primary" id="new">NEW SEASON</button><button class="btn" data-back>MENU</button></div></div>`, 'setupscreen');
    el.querySelector('#new').onclick = () => { save.saveChampionship(null); this.champNew(); };
    el.querySelector('[data-back]').onclick = () => this.main();
  }

  // ---------------- RIDER DATABASE ----------------
  db() {
    const st = this.dbs = this.dbs || { filter: 'all', sort: 'ovr', q: '' };
    const el = this.show(`${this.header('RIDER DATABASE', `${RIDERS.length} fictional riders · ${CURRENT_GRID.length} current · ${LEGENDS.length} legend versions · ${ROOKIES.length} rookies`)}
      <div class="dbbar"><div class="tabs">${['all', 'current', 'legend', 'rookie'].map(t => `<button class="${t === st.filter ? 'on' : ''}" data-f="${t}">${t.toUpperCase()}</button>`).join('')}</div>
      <input id="dbq" class="search" placeholder="Search name, team, style…" value="${esc(st.q)}"/>
      <select id="dbs" class="sel">${['ovr', 'name', 'braking', 'midCorner', 'wet', 'racePace', 'qualifying'].map(s => `<option value="${s}" ${s === st.sort ? 'selected' : ''}>Sort: ${s === 'ovr' ? 'OVR' : s === 'name' ? 'Name' : ATTR_LABEL[s]}</option>`).join('')}</select></div>
      <div class="rgrid db" id="dbl"></div><div id="dbd"></div>`, 'setupscreen');
    const render = () => {
      const q = st.q.toLowerCase();
      let list = RIDERS.filter(r => (st.filter === 'all' || r.kind === st.filter) && (!q || (r.name + ' ' + riderTeamName(r) + ' ' + r.styles.join(' ') + ' ' + (r.version || '') + ' ' + r.nationality).toLowerCase().includes(q)));
      list.sort((a, b) => st.sort === 'name' ? a.name.localeCompare(b.name) : st.sort === 'ovr' ? b.ovr - a.ovr : b.attributes[st.sort] - a.attributes[st.sort]);
      el.querySelector('#dbl').innerHTML = list.map(r => riderCard(r, false, `<div class="rc-style">${r.styles[0]}</div><div class="rc-key"><span>BRK ${r.attributes.braking}</span><span>MID ${r.attributes.midCorner}</span><span>WET ${r.attributes.wet}</span></div>`)).join('') || '<p class="fine">No riders match.</p>';
      el.querySelectorAll('#dbl [data-rid]').forEach(b => b.onclick = () => { audio.click(); this.riderDetail(RIDER_BY_ID[b.dataset.rid]); });
    };
    el.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { st.filter = b.dataset.f; el.querySelectorAll('[data-f]').forEach(x => x.classList.toggle('on', x === b)); render(); });
    el.querySelector('#dbq').oninput = (e) => { st.q = e.target.value; render(); };
    el.querySelector('#dbs').onchange = (e) => { st.sort = e.target.value; render(); };
    render();
  }
  riderDetail(r) {
    const bikeM = riderBike(r, 'modern'), bikeR = riderBike(r, 'real');
    const bar = (k, v) => `<div class="abar"><label>${ATTR_LABEL[k]}</label><div class="track"><div style="width:${v}%;background:${v >= 95 ? '#ffcc00' : v >= 88 ? '#41d36b' : v >= 80 ? '#9bd441' : v >= 72 ? '#f0a020' : '#e04040'}"></div></div><b>${v}</b></div>`;
    const m = document.createElement('div'); m.className = 'modal';
    m.innerHTML = `<div class="panel detail"><button class="x" aria-label="Close">✕</button>
      <div class="dt-head" style="--c1:${r.helmet[0]};--c2:${r.helmet[1]}"><span class="dt-num">${r.number}</span><div><h2>${esc(r.name)}</h2>
      <p>${flag(r.nationality)} ${r.nationality}${r.age ? ' · Age ' + r.age : ''} · ${esc(riderTeamName(r))}</p>
      <p>${r.version ? `<span class="tag legend">${esc(r.version)}</span> Era ${r.eraYears} · Prime year ${r.primeYear}` : r.kind === 'rookie' ? '<span class="tag rookie">ROOKIE / TEST</span>' : '<span class="tag">CURRENT GRID</span>'}${r.potential ? ` · Potential <b>${r.potential}</b>` : ''}</p></div>
      <div class="dt-ovr"><b>${r.ovr}</b><small>${ovrTier(r.ovr)}</small></div></div>
      <div class="dt-body"><div class="dt-attrs">${ATTRS.map(k => bar(k, r.attributes[k])).join('')}</div>
      <div class="dt-side"><h4>RIDING STYLE</h4><p>${r.styles.map(s => `<span class="tag">${s}</span>`).join(' ')}</p>
      <h4>AI PERSONALITY</h4><p><span class="tag pers">${r.personality}</span></p>
      <h4>STRENGTHS</h4><p>${esc(r.strengths)}</p><h4>WEAKNESSES</h4><p>${esc(r.weaknesses)}</p>
      <h4>MACHINE</h4><p>${bikeM.name} <small>(compatibility ${compatibility(r, bikeM)})</small>${r.kind === 'legend' ? `<br>Era bike: ${bikeR.name} <small>(compatibility ${compatibility(r, bikeR)})</small>` : ''}</p></div></div></div>`;
    this.root.appendChild(m);
    const close = () => m.remove();
    m.querySelector('.x').onclick = close; m.onclick = (e) => { if (e.target === m) close(); };
    this.app.game.showroom(r);
  }

  // ---------------- STATS ----------------
  stats() {
    const s = save.loadStats();
    const best = Object.entries(s.bestLaps || {});
    this.show(`${this.header('STATISTICS', 'Your career record (all modes except Spectator).')}
      <div class="statgrid">${[['RACES', s.races], ['WINS', s.wins], ['PODIUMS', s.podiums], ['FASTEST LAPS', s.fastestLaps], ['POLE POSITIONS', s.poles], ['TOTAL DISTANCE', s.distanceKm.toFixed(1) + ' km'], ['POINTS SCORED', s.points], ['TITLES', s.championships], ['WIN RATE', s.races ? Math.round(s.wins / s.races * 100) + '%' : '—']].map(([l, v]) => `<div class="stat"><b>${v}</b><small>${l}</small></div>`).join('')}</div>
      <h4 class="pad">PERSONAL BEST LAPS</h4><div class="pbl">${best.length ? best.map(([id, v]) => `<div class="calr"><span>${TRACK_BY_ID[id]?.name || id}</span><span>${fmtTime(v.time)}</span><span>${esc(RIDER_BY_ID[v.rider]?.name || '')}</span></div>`).join('') : '<p class="fine">No laps yet — go race!</p>'}</div>`, 'setupscreen');
  }

  // ---------------- SETTINGS ----------------
  settingsScreen() {
    const s = this.settings;
    const el = this.show(`${this.header('SETTINGS')}
      <div class="settings">
        <div class="sg"><h4>RIDING</h4>
          <label>CONTROL MODE</label>${controlPicker(s.control)}
          <label>GEARS (MANUAL MODE)</label>${seg('gear', ['AUTO', 'MANUAL'], s.gear)}
          <label>RACING LINE</label>${seg('line', ['OFF', 'BRAKING', 'FULL'], s.line, { BRAKING: 'BRAKING ONLY' })}
          <label>DEFAULT CAMERA</label>${seg('camera', ['chase', 'far', 'helmet', 'tv'], s.camera, { chase: 'CHASE', far: 'FAR CHASE', helmet: 'HELMET', tv: 'TV' })}
          <label>TILT STEERING (MOBILE)</label>${seg('tilt', ['OFF', 'ON'], s.tilt ? 'ON' : 'OFF')}
        </div>
        <div class="sg"><h4>GRAPHICS</h4>
          <label>PRESET</label>${seg('graphics', ['LOW', 'MEDIUM', 'HIGH', 'ULTRA'], s.graphics)}
          <label>AUTO-DOWNGRADE ON LOW FPS</label>${seg('autoGfx', ['ON', 'OFF'], s.autoGfx ? 'ON' : 'OFF')}
          <label>SHOW FPS</label>${seg('showFps', ['OFF', 'ON'], s.showFps ? 'ON' : 'OFF')}
          <label>DYNAMIC RESOLUTION (HOLD FPS)</label>${seg('dynRes', ['ON', 'OFF'], s.dynRes !== false ? 'ON' : 'OFF')}
          <h4>SOUND</h4>
          ${['master', 'engine', 'sfx', 'music'].map(k => `<label>${{ master: 'MASTER VOLUME', engine: 'ENGINE', sfx: 'EFFECTS & AMBIENCE', music: 'MENU MUSIC' }[k]}</label><input type="range" min="0" max="1" step="0.05" value="${s[k] ?? 0.5}" data-vol="${k}"/>`).join('')}
          <h4>DATA</h4><button class="btn danger small" id="reset">RESET ALL SAVE DATA</button>
        </div>
      </div>`, 'setupscreen');
    bindSegs(el, s, (k, v) => {
      if (['tilt', 'autoGfx', 'showFps', 'dynRes'].includes(k)) s[k] = v === 'ON';
      if (k === 'control') el.querySelector('#ctlDesc').textContent = CONTROL_DESC[v];
      if (k === 'graphics') this.app.game.applyGraphics(v);
      if (k === 'tilt' && s.tilt && typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) DeviceOrientationEvent.requestPermission().catch(() => { });
      save.saveSettings(s); this.app.applySettings();
    });
    el.querySelectorAll('[data-vol]').forEach(i => i.oninput = () => { s[i.dataset.vol] = +i.value; audio.setVolume({ [i.dataset.vol]: +i.value }); if (i.dataset.vol === 'music') { if (+i.value > 0) { audio.ensure(); audio.startMusic(); } else audio.stopMusic(); } save.saveSettings(s); });
    el.querySelector('#reset').onclick = () => { if (confirm('Delete all settings, statistics and championship progress?')) { save.resetAll(); location.reload(); } };
  }

  // ---------------- RESULTS ----------------
  results(summary, cfg, { onRetry, onNext, nextLabel }) {
    const t = TRACK_BY_ID[summary.trackId];
    const me = summary.results.find(r => r.isPlayer);
    const el = this.show(`<header class="sh"><div><h2>RESULTS · ${t.name}</h2><p>${cfg.title} · ${summary.laps} laps · ${WEATHER[summary.weather].icon} ${WEATHER[summary.weather].label}${summary.fastestLap ? ` · Fastest lap: <b class="purple">${esc(summary.fastestLap.name)} ${fmtTime(summary.fastestLap.time)}</b>` : ''}</p></div></header>
      ${me ? `<div class="res-hero ${me.pos <= 3 ? 'podium' : ''}"><span class="rh-pos">P${me.pos}</span><div><b>${me.pos === 1 ? 'VICTORY!' : me.pos <= 3 ? 'PODIUM FINISH' : 'RACE COMPLETE'}</b><small>Started P${me.grid} · ${me.points} pts${me.fastest ? ' · FASTEST LAP' : ''}</small></div></div>` : ''}
      <div class="restable"><div class="rr head"><span>POS</span><span>RIDER</span><span class="hide-m">TEAM</span><span>TIME / GAP</span><span class="hide-m">BEST LAP</span><span>PTS</span></div>
      ${summary.results.map(r => `<div class="rr ${r.isPlayer ? 'me' : ''} ${r.rival ? 'rival' : ''} ${r.pos <= 3 ? 'p' + r.pos : ''}"><span>${r.pos}</span><span><i class="dot" style="background:${r.rider.helmet[0]}"></i>${esc(displayName(r.rider))}</span><span class="hide-m">${esc(r.team)}</span><span>${r.pos === 1 ? fmtTime(r.time) : '+' + r.gap.toFixed(3)}${r.projected ? '*' : ''}</span><span class="hide-m ${r.fastest ? 'purple' : ''}">${fmtTime(r.bestLap)}</span><span>${r.points || ''}</span></div>`).join('')}</div>
      <p class="fine pad">* projected from race pace after the leader finished.</p>
      <div class="startbar"><button class="btn" id="menu">MENU</button><button class="btn" id="retry">RETRY</button>${onNext ? `<button class="btn primary big" id="next">${nextLabel || 'NEXT RACE ▶'}</button>` : ''}</div>`, 'setupscreen results');
    el.querySelector('#menu').onclick = () => { audio.click(); this.main(); };
    el.querySelector('#retry').onclick = () => { audio.click(); onRetry(); };
    if (onNext) el.querySelector('#next').onclick = () => { audio.click(); onNext(); };
  }
  toast(msg) { const d = document.createElement('div'); d.className = 'toast'; d.textContent = msg; document.body.appendChild(d); setTimeout(() => d.remove(), 2600); }
}

// field of 22: player + current grid (a legend/rookie replaces the lowest-rated regular)
export function buildField(me, grid) {
  let field = grid.filter(r => r.id !== me.id);
  if (field.length >= grid.length) field = field.sort((a, b) => b.ovr - a.ovr).slice(0, grid.length - 1);
  return [me, ...field];
}
export function standings(points) { return Object.entries(points).sort((a, b) => b[1] - a[1]); }
export function teamLabel(id) { if (TEAM_BY_ID[id]) return TEAM_BY_ID[id].name; if (id.startsWith('legend-')) return (MANUFACTURER_BY_ID[id.slice(7)]?.name || '') + ' Legends'; return 'Wildcard Entry'; }
export function standTable(rows, meId, nameFn, subFn) {
  const me = meId && typeof meId === 'object' ? meId.me : meId, rv = meId && typeof meId === 'object' ? meId.rival : null;
  return `<div class="stand">${rows.map(([id, pts], i) => `<div class="sr ${id === me ? 'me' : id === rv ? 'rival' : ''}"><span>${i + 1}</span><span>${nameFn(id)}${subFn ? `<small>${esc(subFn(id))}</small>` : ''}</span><b>${pts}</b></div>`).join('')}</div>`;
}
