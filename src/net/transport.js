import { Peer } from 'peerjs';
// WebRTC P2P link over PeerJS DataChannels.
//  - signaling: PeerJS free public cloud broker (0.peerjs.com) by default; ?peerhost=&peerport=&peerpath= override (CI/self-host)
//  - ICE: public STUN (Google, Cloudflare) + the free public PeerJS TURN relay as best-effort fallback for strict NATs
//  - two channels: 'ctl' reliable+ordered (lobby, season, results) and 'st' unreliable+unordered (30 Hz bike state)
//  - optional network simulator: ?netlag=ms&netjit=ms&netloss=0..1 (or window.__netsim) delays/drops outgoing packets
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const PREFIX = 'gprl4-room-';
export function makeCode(n = 5) { let s = ''; const r = crypto.getRandomValues(new Uint8Array(n)); for (let i = 0; i < n; i++) s += ALPHA[r[i] % ALPHA.length]; return s; }
export function normCode(c) { return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8); }
export const now = () => performance.timeOrigin + performance.now();

const ICE = [
  { urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'], username: 'peerjs', credential: 'peerjsp' },
];
function peerOptions() {
  const q = new URLSearchParams(location.search);
  const o = { debug: 0, config: { iceServers: ICE } };
  if (q.get('peerhost')) { o.host = q.get('peerhost'); o.port = +(q.get('peerport') || 9000); o.path = q.get('peerpath') || '/'; o.secure = q.get('peersecure') === '1'; }
  return o;
}
function simFromUrl() {
  const q = new URLSearchParams(location.search);
  return { lag: +(q.get('netlag') || 0), jit: +(q.get('netjit') || 0), loss: +(q.get('netloss') || 0) };
}
const FRIENDLY = {
  'peer-unavailable': 'Room not found. Check the code — the host must keep the game open.',
  'unavailable-id': 'That room code is already in use.',
  network: 'Cannot reach the free signaling server. Check your internet connection and try again.',
  'server-error': 'The free signaling server is unavailable right now. Please try again in a minute.',
  'socket-error': 'Cannot reach the free signaling server. Check your internet connection and try again.',
  'socket-closed': 'Lost the connection to the signaling server.',
  'browser-incompatible': 'This browser does not support WebRTC peer-to-peer connections.',
  'webrtc': 'WebRTC error while connecting.',
  ice: 'Could not open a direct peer-to-peer connection (strict NAT / firewall). Try another Wi-Fi or a mobile hotspot.',
  timeout: 'Connection timed out. The direct peer-to-peer link could not be established (strict NAT / firewall?).',
};

export class Link {
  constructor(role, code) {
    this.role = role; this.code = normCode(code); this.handlers = {}; this.ctl = null; this.st = null; this.peer = null;
    this.rtt = 0; this.offset = 0; this.samples = []; this.lastRx = 0; this.open = false; this.closed = false;
    this.sim = window.__netsim || simFromUrl(); window.__netsim = this.sim; this._due = 0;
    this.stats = { tx: 0, rx: 0, dropped: 0 };
  }
  on(ev, fn) { (this.handlers[ev] = this.handlers[ev] || []).push(fn); return this; }
  emit(ev, a) { if (ev === 'ready') this.isReady = true; for (const f of this.handlers[ev] || []) try { f(a); } catch (e) { console.warn(e); } }
  fail(type, raw) { this.emit('error', { type, message: FRIENDLY[type] || (raw && raw.message) || 'Connection error' }); }

  start() {
    const id = this.role === 'host' ? PREFIX + this.code : undefined;
    let tries = 0;
    const make = () => {
      const peer = this.peer = new Peer(id, peerOptions());
      peer.on('open', () => { this.emit('ready'); if (this.role === 'guest') this.connect(); });
      peer.on('connection', (c) => this.role === 'host' && this.accept(c));
      peer.on('disconnected', () => { if (!this.closed && !peer.destroyed) setTimeout(() => { try { peer.reconnect(); } catch { /* */ } }, 1500); });
      peer.on('error', (err) => {
        // host re-opening the same room right after a reload: the broker may still hold the old id for a few seconds
        if (err.type === 'unavailable-id' && this.role === 'host' && tries++ < 15) { peer.destroy(); setTimeout(make, 2000); return; }
        if (err.type === 'peer-unavailable') { this.emit('unavailable'); if (!this.everOpen) this.fail('peer-unavailable', err); return; }
        this.fail(err.type, err);
      });
    };
    make();
    this.pingTimer = setInterval(() => this.tick(), 1000);
    return this;
  }
  // guest: open both channels to the host
  connect() {
    if (!this.peer || this.peer.destroyed || this.closed) return;
    const hostId = PREFIX + this.code;
    const ctl = this.peer.connect(hostId, { label: 'ctl', reliable: true, serialization: 'json' });
    const st = this.peer.connect(hostId, { label: 'st', reliable: false, serialization: 'json' });
    this.bind(ctl); this.bind(st);
    clearTimeout(this.openTimer);
    if (!this.everOpen) this.openTimer = setTimeout(() => { if (!this.open) this.fail('timeout'); }, 20000);
  }
  accept(c) { this.bind(c); }
  bind(c) {
    c.on('open', () => {
      if (c.label === 'st') { if (this.st && this.st !== c) try { this.st.close(); } catch { /* */ } this.st = c; return; }
      if (this.ctl && this.ctl !== c) { const old = this.ctl; this.ctl = null; try { old.close(); } catch { /* */ } }
      this.ctl = c; this.open = true; this.everOpen = true; this.lastRx = now(); clearTimeout(this.openTimer);
      this.emit('open');
    });
    c.on('data', (m) => this.rx(m));
    c.on('close', () => { if (c === this.ctl) this.lost(); if (c === this.st) this.st = null; });
    c.on('error', (e) => { if (c.label === 'ctl' && !this.everOpen) this.fail('webrtc', e); });
    c.on('iceStateChanged', (s) => { if (s === 'failed') { if (!this.everOpen) this.fail('ice'); else if (c === this.ctl) this.lost(); } });
  }
  lost() { if (!this.open) return; this.open = false; this.ctl = null; this.emit('close'); }
  tick() {
    if (!this.open) { if (this.role === 'guest' && this.peer && this.peer.open && !this.closed && this.everOpen && (this._rc = (this._rc || 0) + 1) % 3 === 0) this.connect(); return; }
    this.send({ t: 'ping', a: now() });
    if (now() - this.lastRx > 6000) { try { this.ctl && this.ctl.close(); } catch { /* */ } this.lost(); }
  }
  rx(m) {
    this.lastRx = now(); this.stats.rx++;
    if (m.t === 'ping') return this.send({ t: 'pong', a: m.a, b: now() });
    if (m.t === 'pong') {
      const t = now(), rtt = t - m.a; this.samples.push({ rtt, off: m.b - (m.a + rtt / 2) });
      if (this.samples.length > 12) this.samples.shift();
      const best = this.samples.reduce((a, b) => (b.rtt < a.rtt ? b : a));
      this.rtt = this.samples.slice(-4).reduce((a, b) => a + b.rtt, 0) / Math.min(4, this.samples.length); this.offset = best.off;
      this.emit('ping', this.rtt); return;
    }
    this.emit('msg', m);
  }
  // remote clock (ms) <-> local clock
  toLocal(remoteMs) { return remoteMs - this.offset; }
  out(c, m, fast) {
    if (!c || !c.open) return;
    const { lag, jit, loss } = this.sim;
    if (fast && loss > 0 && Math.random() < loss) { this.stats.dropped++; return; }
    this.stats.tx++;
    if (!lag && !jit) { try { c.send(m); } catch { /* */ } return; }
    let due = now() + lag + Math.random() * jit;
    if (!fast) { due = Math.max(due, this._due); this._due = due; } // reliable channel stays ordered
    setTimeout(() => { try { c.open && c.send(m); } catch { /* */ } }, Math.max(0, due - now()));
  }
  send(m) { this.out(this.ctl, m, false); }
  sendFast(m) { if (this.st && this.st.open) this.out(this.st, m, true); else this.out(this.ctl, m, true); }
  close() { this.closed = true; clearInterval(this.pingTimer); clearTimeout(this.openTimer); try { this.peer && this.peer.destroy(); } catch { /* */ } this.open = false; }
}

// Loopback relay transport for CI / offline tests (?relay=ws://host:port): same API, same network simulator, but the
// packets go through a tiny local WebSocket relay (tests/relay-server.mjs) instead of WebRTC.
export class RelayLink extends Link {
  start() {
    this.url = new URLSearchParams(location.search).get('relay');
    this.dial(); this.pingTimer = setInterval(() => this.tick(), 1000); return this;
  }
  dial() {
    if (this.closed) return;
    const ws = this.ws = new WebSocket(this.url);
    ws.onopen = () => { ws.send(JSON.stringify({ join: this.code, role: this.role })); this.emit('ready'); };
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.sys === 'peer-open') { const c = { open: true, send: (x) => ws.readyState === 1 && ws.send(JSON.stringify(x)) }; this.ctl = this.st = c; this.open = true; this.everOpen = true; this.lastRx = now(); this.emit('open'); return; }
      if (m.sys === 'peer-close') { this.st = null; this.lost(); return; }
      if (m.sys === 'no-room') { this.emit('unavailable'); if (!this.everOpen) this.fail('peer-unavailable'); return; }
      if (m.sys === 'taken') { this.fail('unavailable-id'); return; }
      this.rx(m);
    };
    ws.onclose = () => { this.st = null; this.lost(); if (!this.closed) setTimeout(() => this.dial(), 2000); };
    ws.onerror = () => { if (!this.everOpen) this.fail('network'); };
  }
  tick() { if (!this.open) return; this.send({ t: 'ping', a: now() }); if (now() - this.lastRx > 6000) this.lost(); }
  close() { this.closed = true; clearInterval(this.pingTimer); try { this.ws && this.ws.close(); } catch { /* */ } this.open = false; }
}
export function createLink(role, code) { return new URLSearchParams(location.search).get('relay') ? new RelayLink(role, code) : new Link(role, code); }
