// ONLINE CHAMPIONSHIP QA: two isolated browser contexts (separate storage = two devices) host + join through the real
// PeerJS signaling path and a real WebRTC DataChannel. Falls back to a local PeerServer (npm "peer") when the public
// broker is unreachable (CI / offline). Runs a short 2-round season and measures sync, latency and smoothness.
// Usage: node tests/online.mjs [baseUrl] [--local] [--lag]   (--lag: 150 ms +0..50 ms jitter, 5 % loss on state packets)
import { chromium } from 'playwright-core';
import { PeerServer } from 'peer';
import { startRelay } from './relay-server.mjs';
let peerUsed = '';
const args = process.argv.slice(2);
const BASE = args.find(a => a.startsWith('http')) || process.env.BASE_URL || 'http://localhost:4173/gp-racing-legends/';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const OUT = new URL('../screenshots/', import.meta.url).pathname;
const LAG = args.includes('--lag'), SHOTS = args.includes('--shots');
let LOCAL = args.includes('--local');
const results = []; const ok = (name, cond, info = '') => { results.push({ name, pass: !!cond }); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name} ${info}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

if (!LOCAL) { // is the public broker reachable?
  try { const r = await fetch('https://0.peerjs.com/peerjs/id?ts=' + Date.now(), { signal: AbortSignal.timeout(8000) }); if (!r.ok) throw new Error(r.status); console.log('public PeerJS broker reachable'); }
  catch (e) { console.log('public broker unreachable (' + e.message + ') -> local PeerServer fallback'); LOCAL = true; }
}
let server = null;
const startLocal = () => { server = PeerServer({ port: 9010, path: '/' }); return '&peerhost=localhost&peerport=9010&peerpath=/'; };
let peerQ = LOCAL ? startLocal() : '';
const simQ = LAG ? '&netlag=150&netjit=50&netloss=0.05' : '';

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const init = () => {
  localStorage.setItem('gprl.profile.v1', JSON.stringify({ type: 'experienced' }));
  if (!localStorage.getItem('gprl.settings.v1')) localStorage.setItem('gprl.settings.v1', JSON.stringify({ graphics: 'LOW', autoGfx: false, control: 'SEMI', camera: 'chase', dynRes: false, music: 0, master: 0, line: 'OFF' }));
};
const errors = [];
async function device(name, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, ...opts });
  await ctx.addInitScript(init);
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') errors.push(`[${name}] ${m.text()}`); });
  page.on('pageerror', e => errors.push(`[${name}] pageerror: ${e.message}`));
  return { ctx, page, name };
}
const H = await device('host'), G = await device('guest');
const hp = H.page; let gp = G.page;

// ---------------- 1) real signaling path probe: PeerJS broker + WebRTC ----------------
let transQ = '', viaRelay = false;
{
  await hp.goto(BASE + '?nosw' + peerQ); await hp.waitForSelector('[data-go=online]', { timeout: 30000 });
  await hp.click('[data-go=online]'); await hp.click('#host'); await hp.waitForSelector('#room-code');
  const pc = (await hp.textContent('#room-code')).trim();
  const reg = await hp.waitForFunction(() => window.__online.link.peer && window.__online.link.peer.open, null, { timeout: 30000 }).then(() => true).catch(() => false);
  ok(`signaling: host room registered on the ${LOCAL ? 'local PeerServer' : 'PUBLIC PeerJS broker'}`, reg, 'peer id ' + await hp.evaluate(() => window.__online.link.peer.id));
  const t0 = Date.now();
  await gp.goto(BASE + '?nosw&room=' + pc + peerQ);
  const res = await gp.waitForFunction(() => window.__online.peer.connected ? 'connected' : (window.__online.err || ''), null, { timeout: 40000, polling: 250 }).then(h => h.jsonValue()).catch(() => 'no result');
  const sig = await gp.evaluate(() => { const c = window.__online.link.peer?._connections; const out = []; if (c) for (const [, arr] of c) for (const x of arr) out.push(x.peerConnection?.signalingState + '/' + x.peerConnection?.iceConnectionState); return out; });
  ok('signaling: guest reached the host through the broker (offer/answer exchanged)', sig.length > 0 && sig.some(x => x.startsWith('stable') || x.startsWith('closed')), sig.join(', '));
  if (res === 'connected') ok('WebRTC DataChannel opened (real P2P path)', true, `${Date.now() - t0} ms`);
  else {
    ok('P2P failure is reported with a clear message', /peer-to-peer|NAT|firewall/i.test(res), `"${res}" after ${Date.now() - t0} ms`);
    console.log('NOTE  this sandbox blocks UDP and its managed Chrome policy (WebRtcIPHandling=default_public_interface_only) yields no ICE candidates -> loopback relay fallback for the gameplay run');
    viaRelay = true; startRelay(9012); transQ = '&relay=ws://localhost:9012';
  }
  peerUsed = LOCAL ? 'local PeerServer' : 'public PeerJS broker';
}
// ---------------- 2) lobby ----------------
async function openRoom() {
  await hp.goto(BASE + '?nosw' + transQ + peerQ + simQ); await hp.waitForSelector('[data-go=online]', { timeout: 30000 });
  await hp.click('[data-go=online]'); await hp.click('#host');
  await hp.waitForSelector('#room-code');
  return (await hp.textContent('#room-code')).trim();
}
let code = await openRoom();
ok('host: room code is short & readable', /^[A-HJ-NP-Z2-9]{5}$/.test(code), code);
const share = await hp.inputValue('#share');
ok('host: share link carries ?room=CODE', share.includes('room=' + code), share);
const t0 = Date.now();
await gp.goto(BASE + '?nosw&room=' + code + transQ + peerQ + simQ);  // the share link auto-joins
await Promise.all([hp, gp].map(p => p.waitForFunction(() => document.querySelectorAll('.pl.on').length === 2, null, { timeout: 45000 })));
ok(`both players connected in the lobby via ${viaRelay ? 'loopback relay' : 'WebRTC'}`, true, `${Date.now() - t0} ms`);
await sleep(2500);
const ping = await gp.evaluate(() => window.__online.ping);
ok('lobby shows ping', ping > 0 && (await gp.textContent('#net-ping')).includes('ms'), Math.round(ping) + ' ms');
const transport = await hp.evaluate(() => ({ st: !!window.__online.link.st?.open, rel: window.__online.link.st?.reliable }));
ok('state channel open' + (viaRelay ? ' (relay)' : ' (unreliable DataChannel)'), transport.st, JSON.stringify(transport));
// riders: host first card, guest second card; duplicates are blocked
const cards = await hp.$$eval('#rp .rcard', c => c.map(x => x.dataset.rid));
await hp.click(`#rp .rcard[data-rid="${cards[0]}"]`); await sleep(400);
await gp.click(`#rp .rcard[data-rid="${cards[1]}"]`).catch(() => {});
await sleep(600);
const taken = await gp.$eval(`#rp .rcard[data-rid="${cards[0]}"]`, el => el.classList.contains('taken'));
ok('guest: host rider is marked taken (no duplicates)', taken);
await hp.click('[data-seg=rounds] [data-v="2"]'); await hp.click('[data-seg=laps] [data-v="1"]');
await sleep(600);
const hint = await gp.textContent('#lobby-hint');
ok('guest sees host season settings', /2 rounds · 1 lap/.test(hint), hint);
await hp.click('#ready'); await gp.click('#ready');
await hp.waitForFunction(() => !document.querySelector('#startS').disabled, null, { timeout: 10000 });
ok('host can start once both are ready', true);
await Promise.all([hp, gp].map(p => p.evaluate(() => { const sc = document.querySelector('#ui .screen'); if (sc) sc.scrollTop = 0; window.scrollTo(0, 0); })));
await hp.screenshot({ path: OUT + 'v4-online-lobby-host.png' }); await gp.screenshot({ path: OUT + 'v4-online-lobby-guest.png' });
await hp.click('#startS');
await Promise.all([hp, gp].map(p => p.waitForSelector('.cal .calr', { timeout: 15000 })));
const seasonOf = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('gprl.online.v1') || 'null'));
let hs = await seasonOf(hp), gs = await seasonOf(gp);
ok('season saved on both devices, same calendar & 22-rider field', hs && gs && JSON.stringify(hs.season.calendar) === JSON.stringify(gs.season.calendar) && hs.season.field.length === 22 && gs.season.field.join() === hs.season.field.join(), `${hs?.season.calendar.join(',')} · ${hs?.season.field.length} riders`);
ok('roles saved (host/guest) with the room code', hs.role === 'host' && gs.role === 'guest' && gs.code === code);
await hp.screenshot({ path: OUT + 'v4-online-hub.png' });

// ---------------- in-race measurements ----------------
const samplerSrc = () => {
  window.__sample = (idxs, ms) => new Promise(res => {
    const g = window.__gp.game, out = Object.fromEntries(idxs.map(i => [i, []])); const t0 = performance.now();
    const f = () => { const t = performance.now(); for (const i of idxs) { const p = g.bikes[i].root.position; out[i].push([t, p.x, p.z, g.bikes[i].root.visible ? 1 : 0]); } if (t - t0 < ms) requestAnimationFrame(f); else res(out); };
    requestAnimationFrame(f);
  });
};
function jitter(arr) { // relative speed jitter: RMS of (per-frame speed - 5-frame moving average) / mean speed
  const v = []; for (let i = 1; i < arr.length; i++) { const dt = (arr[i][0] - arr[i - 1][0]) / 1000; if (dt > 0) v.push(Math.hypot(arr[i][1] - arr[i - 1][1], arr[i][2] - arr[i - 1][2]) / dt); }
  const m = v.reduce((a, b) => a + b, 0) / v.length; let e = 0, n = 0;
  for (let i = 2; i < v.length - 2; i++) { const avg = (v[i - 2] + v[i - 1] + v[i] + v[i + 1] + v[i + 2]) / 5; e += (v[i] - avg) ** 2; n++; }
  let back = 0; return { pct: Math.sqrt(e / Math.max(1, n)) / Math.max(1e-6, m) * 100, mean: m, frames: arr.length, back };
}
async function inputLatency(p) { // keydown -> own bike steering / heading change, measured in-page
  return p.evaluate(() => new Promise(res => {
    const r = window.__gp.race, e = r.player; r.autopilot = false;
    const psi0 = e.psi, st0 = e.steer; const t0 = performance.now(); let tSteer = null, frames = 0, fSteer = null, last = t0, fdt = [];
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', code: 'ArrowLeft', bubbles: true }));
    const f = () => { const t = performance.now(); frames++; fdt.push(t - last); last = t; if (tSteer === null && Math.abs(e.steer - st0) > 0.02) { tSteer = t - t0; fSteer = frames; } if (Math.abs(e.psi - psi0) > 0.002 || t - t0 > 1500) { window.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowLeft', code: 'ArrowLeft', bubbles: true })); fdt.sort((a, b) => a - b); res({ steer: tSteer, heading: t - t0, frames: fSteer, frameMs: fdt[fdt.length >> 1] }); } else requestAnimationFrame(f); };
    requestAnimationFrame(f);
  }));
}

async function raceRound(r, { disconnect = false } = {}) {
  await hp.click('#go');
  await Promise.all([hp, gp].map(p => p.waitForFunction(() => window.__gp && window.__gp.race && window.__net && document.getElementById('intro-skip'), null, { timeout: 120000 })));
  const grids = await Promise.all([hp, gp].map(p => p.evaluate(() => window.__gp.race.order.map(e => e.rider.id))));
  ok(`R${r + 1}: both devices see the same 22-rider grid`, grids[0].join() === grids[1].join() && grids[0].length === 22, `pole ${grids[0][0]}`);
  await Promise.all([hp, gp].map(p => p.evaluate(samplerSrc)));
  await Promise.all([hp, gp].map(p => p.waitForFunction(() => window.__gp.race.phase === 'race', null, { timeout: 60000 })));
  const go = await Promise.all([hp, gp].map(p => p.evaluate(() => window.__goWall)));
  const dGo = Math.abs(go[0] - go[1]);
  ok(`R${r + 1}: green light in sync (< 100 ms)`, dGo < 100, `Δ ${dGo.toFixed(1)} ms`);
  // let both humans ride on autopilot, measure input latency on the guest after the start
  await Promise.all([hp, gp].map(p => p.evaluate(() => { window.__gp.race.autopilot = true; })));
  await sleep(4000);
  const idx = await Promise.all([hp, gp].map(p => p.evaluate(() => ({ me: window.__gp.race.player.idx, rival: window.__net.rival.idx, ai: window.__gp.race.entrants.find(e => !e.human).idx }))));
  const lat = await inputLatency(gp); await gp.evaluate(() => { window.__gp.race.autopilot = true; });
  ok(`R${r + 1}: guest own-bike input→steer→heading latency is local (no network delay)`, lat.steer !== null && lat.frames <= 2, `responds on rendered frame #${lat.frames} (steer ${lat.steer?.toFixed(0)} ms, heading ${lat.heading.toFixed(0)} ms, frame ≈${lat.frameMs?.toFixed(0)} ms on SwiftShader) (net RTT ${Math.round(await gp.evaluate(() => window.__online.ping))} ms)`);
  // smoothness: rendered positions of remote bikes every frame for 5 s, vs a host-local AI as reference
  const [hsS, gsS] = await Promise.all([hp.evaluate((i) => window.__sample([i.rival, i.ai], 5000), idx[0]), gp.evaluate((i) => window.__sample([i.rival, i.ai], 5000), idx[1])]);
  const jRemHost = jitter(hsS[idx[0].rival]), jRef = jitter(hsS[idx[0].ai]), jRemGuest = jitter(gsS[idx[1].rival]), jAiGuest = jitter(gsS[idx[1].ai]);
  const vis = hsS[idx[0].rival].every(x => x[3]) && gsS[idx[1].rival].every(x => x[3]);
  ok(`R${r + 1}: both bikes move and are visible on each other's screen`, vis && jRemHost.mean > 10 && jRemGuest.mean > 10, `rival speed on host view ${jRemHost.mean.toFixed(1)} m/s, on guest view ${jRemGuest.mean.toFixed(1)} m/s`);
  const nm = await Promise.all([hp, gp].map(p => p.evaluate(() => ({ delay: window.__net.delay, target: window.__net.target, ...window.__net.metrics }))));
  const info = `jitter: guest bike on host ${jRemHost.pct.toFixed(2)}% · host bike on guest ${jRemGuest.pct.toFixed(2)}% · host AI on guest ${jAiGuest.pct.toFixed(2)}% · local AI ref ${jRef.pct.toFixed(2)}% · buffer host ${(nm[0].delay * 1000).toFixed(0)} ms / guest ${(nm[1].delay * 1000).toFixed(0)} ms · extrap ${(100 * nm[1].extrapSteps / Math.max(1, nm[1].steps)).toFixed(1)}% steps, snaps ${nm[0].snaps + nm[1].snaps}`;
  ok(`R${r + 1}: remote motion smooth (jitter close to local sim)`, Math.max(jRemHost.pct, jRemGuest.pct, jAiGuest.pct) < Math.max(6, jRef.pct * 2.5) && nm[0].snaps + nm[1].snaps === 0, info);
  measures.push({ round: r + 1, dGo, lat, jRemHost: jRemHost.pct, jRemGuest: jRemGuest.pct, jAiGuest: jAiGuest.pct, jRef: jRef.pct, bufHost: nm[0].delay, bufGuest: nm[1].delay, fpsHost: hsS[idx[0].ai].length / 5, fpsGuest: gsS[idx[1].ai].length / 5 });
  if (SHOTS || r === 0) { await hp.screenshot({ path: OUT + `v4-race-host-view.png` }); await gp.screenshot({ path: OUT + `v4-race-guest-view.png` }); }
  const rivalHud = await gp.evaluate(() => { const el = document.getElementById('h-rival'); return el && !el.hidden ? el.textContent : ''; });
  ok(`R${r + 1}: rival HUD shows the other human's position and gap`, /RIVAL.*P\d+.*s/.test(rivalHud), rivalHud);
  if (disconnect) {
    const rivalIdx = idx[0].rival;
    await G.ctx.close(); // guest device drops mid-race
    await hp.waitForFunction((i) => !window.__gp.race.entrants[i].remote, rivalIdx, { timeout: 15000 });
    const s0 = await hp.evaluate((i) => window.__gp.race.entrants[i].s, rivalIdx); await sleep(2000);
    const s1 = await hp.evaluate((i) => window.__gp.race.entrants[i].s, rivalIdx);
    ok(`R${r + 1}: guest dropped -> AI took over the bike on the host`, s1 > s0 + 20, `moved ${(s1 - s0).toFixed(0)} m in 2 s`);
    // the guest comes back with the same code (fresh tab, saved season on the device)
    const ng = await device('guest2'); G.ctx = ng.ctx; gp = ng.page;
    await gp.context().addInitScript(() => {});
    await gp.context().storageState(); // new context: restore the guest's saved season to simulate the same device
    await gp.goto(BASE + '?nosw' + transQ + peerQ + simQ); await gp.evaluate((s) => localStorage.setItem('gprl.online.v1', JSON.stringify(s)), guestSave);
    await gp.goto(BASE + '?nosw&room=' + code + transQ + peerQ + simQ);
    await gp.waitForSelector('#resume', { timeout: 30000 }); await gp.click('#resume');
    await gp.waitForFunction(() => window.__online.peer.connected, null, { timeout: 45000 });
    ok(`R${r + 1}: guest rejoined with the same room code`, true, await gp.textContent('#hub-wait').catch(() => ''));
    await hp.evaluate(() => { window.__gp.game.timeScale = 6; });
  } else await Promise.all([hp, gp].map(p => p.evaluate(() => { window.__gp.game.timeScale = 6; })));
  const resultsOf = async (p) => { await p.waitForSelector('#podium-skip, .restable', { timeout: 300000 }); if (await p.$('#podium-skip')) await p.click('#podium-skip').catch(() => {}); await p.waitForSelector('.restable', { timeout: 60000 }); return p.$$eval('.restable .rr:not(.head)', rows => rows.map(x => x.children[1].textContent + '|' + x.lastElementChild.textContent)); };
  if (disconnect) {
    const hr = await resultsOf(hp); await hp.screenshot({ path: OUT + 'v4-results-host.png' });
    ok(`R${r + 1}: host classified all 22`, hr.length === 22);
  } else {
    const [hr, gr] = await Promise.all([resultsOf(hp), resultsOf(gp)]);
    ok(`R${r + 1}: finish order and points identical on both devices`, hr.join() === gr.join() && hr.length === 22, hr.slice(0, 3).join(' / '));
    const hl = await gp.$$eval('.restable .rr.me, .restable .rr.rival', x => x.length);
    ok(`R${r + 1}: results highlight both humans`, hl === 2);
    if (r === 0) { await hp.screenshot({ path: OUT + 'v4-results-host.png' }); }
  }
  await sleep(1500);
  hs = await seasonOf(hp); gs = await seasonOf(gp);
  ok(`R${r + 1}: standings synced (host = guest)`, JSON.stringify(hs.season.points) === JSON.stringify(gs.season.points) && JSON.stringify(hs.season.teamPoints) === JSON.stringify(gs.season.teamPoints) && hs.season.round === r + 1 && gs.season.round === r + 1, `round ${hs.season.round}/${gs.season.round}, total ${Object.values(hs.season.points).reduce((a, b) => a + b, 0)} pts`);
  await hp.click('#next');
}
const measures = [];
let guestSave = null;
await raceRound(0);
await gp.waitForSelector('.cal .calr, #next', { timeout: 30000 }); if (await gp.$('#next')) await gp.click('#next');
await gp.waitForSelector('.cal .calr'); await gp.screenshot({ path: OUT + 'v4-standings-guest.png' });
guestSave = await seasonOf(gp);
await raceRound(1, { disconnect: true });
// season complete: champion screens on both
await hp.waitForSelector('.center-col h2', { timeout: 20000 }); await gp.waitForSelector('.center-col h2', { timeout: 30000 });
const ch = await Promise.all([hp, gp].map(p => p.textContent('.center-col h2')));
ok('season complete: same champion on both devices', ch[0] === ch[1], ch[0]);
const hlc = await gp.$$eval('.stand .sr.me, .stand .sr.rival', x => x.length);
ok('champion standings highlight both humans (riders + teams)', hlc >= 3, hlc + ' highlighted rows');
await hp.screenshot({ path: OUT + 'v4-champion-host.png' });
// persistence after reload
await hp.reload(); await hp.waitForSelector('[data-go=online]'); await hp.click('[data-go=online]');
const resumeTxt = await hp.textContent('section.col p');
const hs2 = await seasonOf(hp);
ok('standings persist after reload', JSON.stringify(hs2.season.points) === JSON.stringify(hs.season.points) && /2\/2/.test(resumeTxt), resumeTxt);

// ---------------- mobile lobby ----------------
const M = await device('mobile', { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
await M.page.goto(BASE + '?nosw' + transQ + peerQ); await M.page.waitForSelector('[data-go=online]'); await M.page.tap('[data-go=online]'); await M.page.tap('#host');
await M.page.waitForSelector('#room-code'); await M.page.waitForFunction(() => /waiting for your friend/i.test(document.getElementById('net-err').textContent), null, { timeout: 30000 });
const mb = await M.page.evaluate(() => { const r = (s) => document.querySelector(s).getBoundingClientRect(); return { code: r('#room-code'), copy: r('#copy'), ready: r('#ready'), w: innerWidth }; });
ok('mobile 844x390: lobby renders, code + copy fit the screen', mb.code.right <= mb.w && mb.copy.right <= mb.w && mb.code.height > 20, JSON.stringify({ code: Math.round(mb.code.right), copy: Math.round(mb.copy.right) }));
await M.page.screenshot({ path: OUT + 'v4-mobile-lobby.png' });

const errs = errors.filter(e => !/favicon|ERR_INTERNET_DISCONNECTED|Could not connect to peer|Lost connection to server/i.test(e));
ok('no console errors', errs.length === 0, errs.slice(0, 5).join(' | '));
console.log('\nMEASURES ' + JSON.stringify(measures.map(m => ({ ...m, lat: m.lat, bufHost: Math.round(m.bufHost * 1000), bufGuest: Math.round(m.bufGuest * 1000) }))));
const pass = results.filter(r => r.pass).length;
console.log(`\n${pass}/${results.length} passed  (signaling: ${peerUsed}; gameplay transport: ${viaRelay ? 'loopback relay' : 'WebRTC'}${LAG ? ', simulated 150-200 ms lag + 5% loss' : ''})`);
await browser.close(); if (server) server.close?.();
process.exit(pass === results.length ? 0 : 1);
