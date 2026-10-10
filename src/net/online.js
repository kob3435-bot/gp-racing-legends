import { createLink, makeCode, normCode, now } from './transport.js';
import { NetRace } from './netrace.js';
import { RIDERS, RIDER_BY_ID, CURRENT_GRID, riderBike, riderTeamId, riderTeamName, displayName } from '../data/riders.js';
import { TRACK_BY_ID, CALENDAR, MONTH_OF, seasonLaps, lapsLabel, realLaps } from '../data/tracks.js';
import { DIFFICULTY, pickWeather, WEATHER } from '../game/perf.js';
import { Race } from '../game/race.js';
import { getGeo } from '../game/game.js';
import { commitRound } from '../champ.js';
import { controlPicker, CONTROL_DESC, esc, seg, bindSegs, standTable, standings, teamLabel, flag } from '../ui/screens.js';
import { audio } from '../game/audio.js';

// ONLINE CHAMPIONSHIP (2 players): lobby, season sync, race orchestration. Host-authoritative.
const KEY = 'gprl.online.v1';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } };
const store = (o) => { if (o) localStorage.setItem(KEY, JSON.stringify(o)); else localStorage.removeItem(KEY); };

export function buildField2(a, b) {
  const field = CURRENT_GRID.filter(r => r.id !== a.id && r.id !== b.id).sort((x, y) => y.ovr - x.ovr).slice(0, 20);
  return [a, b, ...field];
}

export class Online {
  constructor(app) {
    this.app = app; this.ui = app.ui; this.link = null; this.role = null; this.code = null;
    this.me = { riderId: null, ready: false }; this.peer = { riderId: null, ready: false, connected: false };
    this.settings = { rounds: 'FULL', laps: 3, custom: 15, weather: 'RANDOM', difficulty: 'NORMAL' };
    this.season = null; this.view = null; this.err = ''; this.net = null; this.racing = false; this.ping = 0;
    window.__online = this;
  }
  connected() { return !!(this.link && this.link.open); }
  get myRider() { return this.me.riderId; }

  // ---------------- connection ----------------
  start(role, code) {
    if (this.link) this.link.close();
    this.role = role; this.code = normCode(code); this.err = ''; this.peer.connected = false;
    const L = this.link = createLink(role, this.code).start();
    L.on('ready', () => this.refresh());
    L.on('open', () => { this.peer.connected = true; this.err = ''; if (role === 'guest') this.send({ t: 'hello', riderId: this.me.riderId, ready: this.me.ready }); this.refresh(); });
    L.on('close', () => { this.peer.connected = false; this.peer.ready = false; if (this.net) this.net.drop(); this.refresh(); });
    L.on('error', (e) => { this.err = e.message; this.refresh(); });
    L.on('ping', (ms) => { this.ping = ms; const el = document.getElementById('net-ping'); if (el) el.textContent = Math.round(ms) + ' ms'; });
    L.on('msg', (m) => this.onMsg(m));
  }
  send(m) { if (this.link) this.link.send(m); }
  persist() { store({ role: this.role, code: this.code, myRider: this.me.riderId, season: this.season }); }
  leave() { if (this.link) { try { this.send({ t: 'bye' }); } catch { /* */ } this.link.close(); } this.link = null; this.role = null; this.net = null; }

  onMsg(m) {
    if (this.net && (m.t === 'H' || m.t === 'S' || m.t === 'G' || m.t === 'final')) return this.net.onMsg(m);
    const H = this.role === 'host';
    switch (m.t) {
      case 'hello': if (!H) return;
        this.peer = { riderId: m.riderId, ready: !!m.ready, connected: true };
        if (this.season) { this.send({ t: 'season', season: this.season }); if (!this.racing) this.send({ t: 'hub' }); }
        else this.broadcastLobby();
        this.refresh(); break;
      case 'pick': if (!H) return; this.peer.riderId = m.riderId; this.peer.ready = false; this.me.ready = false; this.broadcastLobby(); this.refresh(); break;
      case 'ready': if (!H) return; this.peer.ready = !!m.v && this.peer.riderId !== this.me.riderId; this.broadcastLobby(); this.refresh(); break;
      case 'lobby': if (H) return;
        this.settings = m.settings; this.peer = { ...m.host, connected: true }; this.me.ready = !!m.guest.ready; if (m.guest.riderId) this.me.riderId = m.guest.riderId;
        this.refresh(); break;
      case 'season': if (H) return; this.season = m.season; this.persist(); if (this.view === 'hub' || this.view === 'lobby' || this.view === 'menu') this.hub(); break;
      case 'hub': if (H) return; if (!this.racing) this.hub(); break;
      case 'race': if (H || this.racing) return; this.launch(m.cfg); break;
      case 'loaded': if (!H) return; this.peerLoaded = true; this.maybeLights(); break;
      case 'lights': if (H) return; this.pendingLights = { at: this.link.toLocal(m.at), hold: m.hold }; if (this.net) this.net.setLights(this.pendingLights.at, m.hold); break;
      case 'bye': this.peer.connected = false; this.refresh(); break;
    }
  }
  broadcastLobby() { this.send({ t: 'lobby', host: { riderId: this.me.riderId, ready: this.me.ready }, guest: { riderId: this.peer.riderId, ready: this.peer.ready }, settings: this.settings }); }
  refresh() { if (this.view === 'lobby') this.renderLobbyStatus(); else if (this.view === 'hub') this.renderHubStatus(); else if (this.view === 'menu') this.menu(); }

  // ---------------- screens ----------------
  menu(prefill = '') {
    this.view = 'menu';
    const saved = load();
    const q = new URLSearchParams(location.search).get('room');
    const code = normCode(prefill || q || '');
    const el = this.ui.show(`${this.ui.header('ONLINE CHAMPIONSHIP', '2 players on 2 devices · 22-rider grid · direct peer-to-peer, no account needed')}
      <div class="online">
        ${this.err ? `<div class="net-err" id="net-err">${esc(this.err)}</div>` : ''}
        ${saved && saved.season ? `<section class="col"><h4>RESUME</h4><p>Season room <b>${esc(saved.code)}</b> · you are the ${saved.role === 'host' ? 'host' : 'guest'} · round ${Math.min(saved.season.round + 1, saved.season.calendar.length)}/${saved.season.calendar.length}</p>
          <div class="row"><button class="btn primary" id="resume">RESUME SEASON ▶</button><button class="btn danger small" id="forget">FORGET SEASON</button></div></section>` : ''}
        <section class="col"><h4>HOST A ROOM</h4><p class="fine">Creates a short room code and a link to send to your friend.</p><button class="btn primary big" id="host">CREATE ROOM</button></section>
        <section class="col"><h4>JOIN A ROOM</h4><div class="join-row"><input id="code" maxlength="6" placeholder="CODE" value="${esc(code)}" autocomplete="off" spellcheck="false"><button class="btn primary big" id="join">JOIN ▶</button></div></section>
        <p class="fine">Works over the internet between two browsers (desktop or mobile). Uses a free public signaling service to find each other, then a direct WebRTC link. Some strict corporate / carrier networks block direct links — if connecting fails, try another Wi-Fi or a phone hotspot.</p>
      </div>`, 'setupscreen');
    el.querySelector('[data-back]').onclick = () => { this.leave(); this.view = null; this.ui.main(); };
    el.querySelector('#host').onclick = () => { audio.click(); this.season = null; this.me = { riderId: this.app.lastRider() || CURRENT_GRID[0].id, ready: false }; this.start('host', makeCode()); this.lobby(); };
    el.querySelector('#join').onclick = () => { audio.click(); const c = normCode(el.querySelector('#code').value); if (c.length < 4) { this.err = 'Enter the room code from the host.'; return this.menu(c); } this.season = null; this.me = { riderId: this.me.riderId || this.app.lastRider() || CURRENT_GRID[1].id, ready: false }; this.start('guest', c); this.lobby(); };
    if (saved && saved.season) {
      el.querySelector('#resume').onclick = () => { audio.click(); this.season = saved.season; this.me = { riderId: saved.myRider, ready: true }; this.start(saved.role, saved.code); this.hub(); };
      el.querySelector('#forget').onclick = () => { if (confirm('Forget the saved online season on this device?')) { store(null); this.menu(); } };
    }
    if (q && !prefill && !this.autoJoined && !(saved && saved.code === code && saved.season)) { this.autoJoined = true; setTimeout(() => el.querySelector('#join').click(), 50); }
  }

  shareLink() { const u = new URL(location.href); u.search = ''; u.hash = ''; for (const k of ['peerhost', 'peerport', 'peerpath', 'peersecure', 'relay']) { const v = new URLSearchParams(location.search).get(k); if (v) u.searchParams.set(k, v); } u.searchParams.set('room', this.code); return u.toString(); }

  lobby() {
    this.view = 'lobby';
    const H = this.role === 'host', st = this.settings;
    const el = this.ui.show(`${this.ui.header('ONLINE LOBBY', H ? 'Share the code, pick your rider, set the season, ready up.' : 'Pick your rider and ready up. The host sets the season.')}
      <div class="online">
        <div id="net-err"></div>
        <div class="room-code"><span class="fine">ROOM</span><b id="room-code">${esc(this.code)}</b>${H ? `<input id="share" readonly value="${esc(this.shareLink())}"><button class="btn small" id="copy">COPY LINK</button>` : ''}</div>
        <div class="players" id="players"></div>
        <div class="setup"><section class="col"><h4>YOUR CONTROLS (each player picks their own)</h4><div class="opts" id="myctl">${controlPicker(this.app.settings.control)}</div><h4>YOUR RIDER</h4><div id="rp"></div></section>
        <section class="col"><h4>SEASON ${H ? '' : '(HOST)'}</h4><div id="settings"></div>
          <div class="row"><button class="btn big" id="ready">READY</button>${H ? '<button class="btn primary big" id="startS" disabled>START SEASON ▶</button>' : ''}</div>
          <p class="fine" id="lobby-hint"></p></section></div>
      </div>`, 'setupscreen');
    el.querySelector('[data-back]').onclick = () => { this.leave(); this.view = null; this.ui.main(); };
    const myc = el.querySelector('#myctl');
    bindSegs(myc, this.app.settings, (k, v) => { myc.querySelector('#ctlDesc').textContent = CONTROL_DESC[v]; this.app.game.onSettingsChanged && this.app.game.onSettingsChanged(); });
    if (H) {
      el.querySelector('#copy').onclick = () => { const i = el.querySelector('#share'); i.select(); navigator.clipboard?.writeText(i.value).catch(() => document.execCommand('copy')); el.querySelector('#copy').textContent = 'COPIED ✓'; };
      const sEl = el.querySelector('#settings');
      sEl.innerHTML = `<div class="opts"><label>ROUNDS</label>${seg('rounds', ['FULL', 2, 4, 6, 10], st.rounds, { FULL: `FULL · ${CALENDAR.length}` })}
        <label>LAPS PER RACE</label>${seg('laps', [1, 3, 5, 10, 'REAL', 'CUSTOM'], st.laps, { REAL: 'REALISTIC' })}
        <div class="custom-laps" id="customRow" ${st.laps === 'CUSTOM' ? '' : 'hidden'}><input type="number" id="customLaps" min="1" max="99" value="${st.custom}"> <span>laps</span></div>
        <label>WEATHER</label>${seg('weather', ['RANDOM', 'SUNNY', 'CLOUDY', 'LIGHT_RAIN'], st.weather, { LIGHT_RAIN: 'RAIN' })}
        <label>AI DIFFICULTY</label>${seg('difficulty', Object.keys(DIFFICULTY), st.difficulty)}</div>`;
      bindSegs(sEl, st, () => { el.querySelector('#customRow').hidden = st.laps !== 'CUSTOM'; this.me.ready = false; this.peer.ready = false; this.broadcastLobby(); this.renderLobbyStatus(); });
      sEl.querySelector('#customLaps').oninput = (ev) => { st.custom = Math.max(1, Math.min(99, +ev.target.value || 1)); this.broadcastLobby(); };
      el.querySelector('#startS').onclick = () => this.startSeason();
    }
    this.ui.riderPicker(el.querySelector('#rp'), this.me, 'riderId', { onPick: (id) => { this.me.ready = false; if (H) { this.peer.ready = false; this.broadcastLobby(); } else this.send({ t: 'pick', riderId: id }); this.renderLobbyStatus(); } });
    el.querySelector('#ready').onclick = () => {
      audio.click(); if (this.me.riderId === this.peer.riderId) return;
      this.me.ready = !this.me.ready;
      if (H) this.broadcastLobby(); else this.send({ t: 'ready', v: this.me.ready });
      this.renderLobbyStatus();
    };
    this.renderLobbyStatus();
  }
  renderLobbyStatus() {
    const el = document.getElementById('players'); if (!el) return;
    const H = this.role === 'host';
    const card = (title, p, isMe) => { const r = RIDER_BY_ID[p.riderId]; const on = isMe || this.peer.connected; return `<div class="pl ${on ? 'on' : ''} ${p.ready ? 'ready' : ''}" data-pl="${isMe ? 'me' : 'peer'}"><h5>${title}${isMe ? ' · YOU' : ''}</h5><b>${on ? (r ? esc(r.name) : 'choosing…') : 'waiting for player…'}</b><small>${on && r ? esc(riderTeamName(r)) + ' · OVR ' + r.ovr : ''}</small><small>${on ? (p.ready ? '✔ READY' : 'not ready') : ''}${!isMe && on ? ` · ping <span id="net-ping">${Math.round(this.ping)} ms</span>` : ''}</small></div>`; };
    el.innerHTML = H ? card('HOST', this.me, true) + card('GUEST', this.peer, false) : card('HOST', this.peer, false) + card('GUEST', this.me, true);
    const errEl = document.getElementById('net-err'); if (errEl) errEl.innerHTML = this.err ? `<div class="net-err">${esc(this.err)}</div>` : (!this.peer.connected ? `<p class="fine">${H ? (this.link?.isReady ? 'Room open — waiting for your friend to join…' : 'Opening room on the signaling server…') : 'Connecting to the host…'}</p>` : '');
    document.querySelectorAll('#rp .rcard').forEach(c => c.classList.toggle('taken', !!this.peer.riderId && c.dataset.rid === this.peer.riderId));
    const dup = this.me.riderId && this.me.riderId === this.peer.riderId;
    const rb = document.getElementById('ready'); if (rb) { rb.textContent = this.me.ready ? '✔ READY' : 'READY'; rb.classList.toggle('primary', this.me.ready); }
    const sb = document.getElementById('startS'); if (sb) sb.disabled = !(this.peer.connected && this.me.ready && this.peer.ready && !dup);
    const hint = document.getElementById('lobby-hint'); if (hint) hint.textContent = dup ? 'Both players picked the same rider — choose another.' : !H ? `Host settings: ${this.settingsText()}` : '';
  }
  settingsText() { const s = this.settings; return `${s.rounds === 'FULL' ? 'full season' : s.rounds + ' rounds'} · ${s.laps === 'REAL' ? 'realistic laps' : s.laps === 'CUSTOM' ? s.custom + ' laps' : s.laps + ' lap' + (s.laps > 1 ? 's' : '')} · ${s.weather.toLowerCase().replace('_', ' ')} · ${DIFFICULTY[s.difficulty]?.label || s.difficulty}`; }

  startSeason() {
    const s = this.settings, order = CALENDAR.map(c => c.id);
    const cal = s.rounds === 'FULL' ? order : Array.from({ length: s.rounds }, (_, k) => order[Math.round(k * (order.length - 1) / Math.max(1, s.rounds - 1))]);
    const a = RIDER_BY_ID[this.me.riderId], b = RIDER_BY_ID[this.peer.riderId];
    const field = buildField2(a, b).map(r => r.id);
    const c = { version: 1, online: true, code: this.code, hostRider: a.id, guestRider: b.id, difficulty: s.difficulty, weather: s.weather,
      lapsMode: s.laps === 'REAL' ? 'REAL' : 'FIXED', laps: s.laps === 'CUSTOM' ? s.custom : s.laps === 'REAL' ? null : s.laps,
      calendar: cal, round: 0, field, points: Object.fromEntries(field.map(id => [id, 0])), teamPoints: {}, results: [], created: Date.now() };
    for (const id of field) c.teamPoints[riderTeamId(RIDER_BY_ID[id])] = 0;
    this.season = c; this.persist();
    this.send({ t: 'season', season: c }); this.send({ t: 'hub' });
    this.hub();
  }

  hub() {
    this.view = 'hub'; this.racing = false;
    const c = this.season; if (!c) return this.lobby();
    if (c.round >= c.calendar.length) return this.champion();
    const H = this.role === 'host', next = TRACK_BY_ID[c.calendar[c.round]];
    const myId = H ? c.hostRider : c.guestRider, rivalId = H ? c.guestRider : c.hostRider;
    this.me.riderId = myId; this.app.game.showroom(RIDER_BY_ID[myId]);
    const rs = standings(c.points), ts = standings(c.teamPoints);
    const pos = (id) => rs.findIndex(x => x[0] === id) + 1;
    const el = this.ui.show(`${this.ui.header('ONLINE CHAMPIONSHIP', `Room ${esc(c.code)} · ${DIFFICULTY[c.difficulty].label} · ${lapsLabel(c)}`)}
      <div class="online">
        <div class="players"><div class="pl on"><h5>YOU · P${pos(myId)}</h5><b>${esc(RIDER_BY_ID[myId].name)}</b><small>${c.points[myId]} pts</small></div>
          <div class="pl ${this.peer.connected ? 'on' : ''}" id="rival-card"><h5>RIVAL · P${pos(rivalId)}</h5><b>${esc(RIDER_BY_ID[rivalId].name)}</b><small>${c.points[rivalId]} pts</small><small id="conn-status"></small></div></div>
        <div class="setup champ"><section class="col"><h4>NEXT · ROUND ${c.round + 1} / ${c.calendar.length}</h4>
          <div class="nextround"><div><b>${next.name}</b><small>${flag(next.flag)} ${next.country} · ${MONTH_OF[next.id]} · ${seasonLaps(c, next.id)} laps</small></div></div>
          <div class="cal">${c.calendar.map((id, i) => { const t = TRACK_BY_ID[id], r = c.results[i]; return `<div class="calr ${i === c.round ? 'cur' : ''} ${i < c.round ? 'done' : ''}"><span>R${i + 1}</span><span class="mon">${MONTH_OF[id]}</span><span>${flag(t.flag)} ${t.name}</span><span class="lp">${seasonLaps(c, id)}L</span><span>${r ? esc(RIDER_BY_ID[r.winner]?.name || '') : ''}</span></div>`; }).join('')}</div>
          <div class="row" id="hub-actions"></div></section>
        <section class="col"><h4>RIDERS' STANDINGS</h4>${standTable(rs, { me: myId, rival: rivalId }, (id) => esc(RIDER_BY_ID[id]?.name || id), (id) => riderTeamName(RIDER_BY_ID[id]))}
          <h4>TEAMS' STANDINGS</h4>${standTable(ts, { me: riderTeamId(RIDER_BY_ID[myId]), rival: riderTeamId(RIDER_BY_ID[rivalId]) }, (id) => esc(teamLabel(id)))}</section></div>
      </div>`, 'setupscreen');
    el.querySelector('[data-back]').onclick = () => { this.leave(); this.view = null; this.ui.main(); };
    this.renderHubStatus();
  }
  renderHubStatus() {
    const a = document.getElementById('hub-actions'); if (!a) return;
    const H = this.role === 'host', c = this.season;
    const st = document.getElementById('conn-status');
    if (st) st.innerHTML = this.peer.connected ? `connected · ping <span id="net-ping">${Math.round(this.ping)} ms</span>` : this.err ? esc(this.err) : (H ? 'offline — waiting to reconnect…' : 'reconnecting to host…');
    document.getElementById('rival-card')?.classList.toggle('on', this.peer.connected);
    if (H) {
      a.innerHTML = this.peer.connected ? `<button class="btn primary big" id="go">RACE ROUND ${c.round + 1} ▶</button>` : `<button class="btn big" id="go">RACE ROUND ${c.round + 1} WITHOUT RIVAL (AI RIDES) ▶</button>`;
      a.querySelector('#go').onclick = () => this.startRound();
    } else a.innerHTML = `<p class="fine" id="hub-wait">${this.peer.connected ? `Waiting for the host to start round ${c.round + 1}…` : 'Reconnecting… the host keeps the room open.'}</p>`;
  }
  champion() {
    this.view = 'champion';
    const c = this.season, rs = standings(c.points), champ = RIDER_BY_ID[rs[0][0]];
    const H = this.role === 'host', myId = H ? c.hostRider : c.guestRider, rivalId = H ? c.guestRider : c.hostRider;
    const p = (id) => rs.findIndex(x => x[0] === id) + 1;
    const winner = p(myId) < p(rivalId) ? 'YOU beat your rival' : 'Your rival beat you';
    const el = this.ui.show(`${this.ui.header('ONLINE SEASON COMPLETE')}
      <div class="center-col"><div class="trophy">🏆</div><h2>${esc(champ.name)} is World Champion</h2>
      <p>${winner}: you P${p(myId)} (${c.points[myId]} pts) · rival P${p(rivalId)} (${c.points[rivalId]} pts)</p>
      <div class="champ-tables"><div>${standTable(rs, { me: myId, rival: rivalId }, (id) => esc(RIDER_BY_ID[id]?.name || id), (id) => riderTeamName(RIDER_BY_ID[id]))}</div>
      <div><h4>TEAMS</h4>${standTable(standings(c.teamPoints), { me: riderTeamId(RIDER_BY_ID[myId]), rival: riderTeamId(RIDER_BY_ID[rivalId]) }, (id) => esc(teamLabel(id)))}</div></div>
      <div class="row"><button class="btn" data-back>MENU</button><button class="btn danger" id="forget">CLOSE SEASON</button></div></div>`, 'setupscreen');
    el.querySelector('[data-back]').onclick = () => { this.leave(); this.view = null; this.ui.main(); };
    el.querySelector('#forget').onclick = () => { store(null); this.leave(); this.view = null; this.ui.main(); };
  }

  // ---------------- races ----------------
  gridFor(cfg) {
    // deterministic qualifying on the host without player assists, so both devices use exactly the same grid
    const geo = getGeo(cfg.trackId);
    const r = new Race({ geo, track: TRACK_BY_ID[cfg.trackId], laps: cfg.laps, weather: cfg.weather, difficulty: cfg.difficulty, control: 'SEMI', gearMode: 'AUTO', playerTire: 'AUTO', seed: cfg.seed,
      entrants: cfg.field.map(id => ({ rider: RIDER_BY_ID[id], bike: riderBike(RIDER_BY_ID[id], 'modern'), isPlayer: false })) });
    return r.qualify().map(e => e.rider.id);
  }
  startRound() {
    const c = this.season, track = TRACK_BY_ID[c.calendar[c.round]];
    const cfg = { round: c.round, trackId: track.id, laps: seasonLaps(c, track.id), weather: c.weather === 'RANDOM' ? pickWeather(track) : c.weather, difficulty: c.difficulty,
      seed: (Math.random() * 1e9) | 0, field: c.field, humans: [c.hostRider, c.guestRider], total: c.calendar.length };
    cfg.gridIds = this.gridFor(cfg);
    if (this.connected()) this.send({ t: 'race', cfg });
    this.launch(cfg);
  }
  launch(cfg) {
    this.racing = true; this.view = 'race'; this.peerLoaded = false; this.hostLoaded = false; this.pendingLights = null; this.lightsSent = false;
    const mine = this.role === 'host' ? this.season.hostRider : this.season.guestRider;
    const session = this;
    const gcfg = { mode: 'online', title: `ONLINE · ROUND ${cfg.round + 1}/${cfg.total}`, trackId: cfg.trackId, laps: cfg.laps, weather: cfg.weather, difficulty: cfg.difficulty, seed: cfg.seed, gridIds: cfg.gridIds, humans: cfg.humans, round: cfg.round, playerTire: 'AUTO',
      entrants: cfg.field.map(id => { const r = RIDER_BY_ID[id]; return { rider: r, bike: riderBike(r, 'modern'), isPlayer: id === mine }; }),
      net: {
        attach: (game, race, c) => { session.net = new NetRace(session, game, race, c); if (session.pendingLights) session.net.setLights(session.pendingLights.at, session.pendingLights.hold); return session.net; },
        loaded: () => session.loaded(),
      } };
    this.app.race(gcfg, () => { this.racing = false; this.hub(); });
  }
  loaded() {
    if (this.role === 'guest') { this.send({ t: 'loaded' }); return; }
    this.hostLoaded = true; this.maybeLights();
    clearTimeout(this.loadTimer);
    this.loadTimer = setTimeout(() => { if (!this.lightsSent) { if (this.net) this.net.drop(); this.maybeLights(true); } }, 25000);
  }
  maybeLights(force) {
    if (this.role !== 'host' || this.lightsSent || !this.hostLoaded) return;
    if (!force && this.connected() && !this.peerLoaded) return;
    this.lightsSent = true; clearTimeout(this.loadTimer);
    const at = now() + (this.connected() ? 2500 : 1200), hold = 4.5 + 0.4 + Math.random() * 1.6;
    if (this.connected()) this.send({ t: 'lights', at, hold });
    if (this.net) this.net.setLights(at, hold);
  }
  onResults(sum, cfg) {
    const H = this.role === 'host', wasOffline = !this.net || this.net.offline;
    this.net = null; this.racing = false;
    let note = '';
    if (H) { if (this.season && commitRound(this.season, sum)) { this.persist(); if (this.connected()) this.send({ t: 'season', season: this.season }); } }
    else if (wasOffline) note = 'Connection to the host was lost during this race — this result is unofficial; standings resync from the host when you reconnect.';
    this.ui.results(sum, cfg, { onRetry: null, onNext: () => this.hub(), nextLabel: 'ONLINE HUB ▶' });
    const rt = document.getElementById('retry'); if (rt) rt.remove();
    const m = document.getElementById('menu'); if (m) m.onclick = () => this.hub();
    if (note) { const p = document.createElement('p'); p.className = 'net-err'; p.textContent = note; document.querySelector('.restable')?.before(p); }
    this.view = 'results';
  }
}
