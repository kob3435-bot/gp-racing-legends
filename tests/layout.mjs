// v10 QA: free orientation. Portrait phones get a native portrait layout; both landscapes native; live switching, desktop unaffected, and every mid-race message
// (lap / sector / best lap / overtake ...) stays in the top band or a side corner, never in the central play area.
import { chromium } from 'playwright-core';
const BASE = process.argv[2] || 'http://localhost:4173/gp-racing-legends/';
const OUT = new URL('../screenshots/', import.meta.url).pathname;
const results = []; const ok = (n, c, i = '') => { results.push(!!c); console.log(`${c ? 'PASS' : 'FAIL'}  ${n} ${i}`); };
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const init = () => { localStorage.setItem('gprl.profile.v1', '{"type":"experienced"}'); localStorage.setItem('gprl.settings.v1', JSON.stringify({ graphics: 'LOW', autoGfx: false, master: 0, music: 0, control: 'SEMI' })); localStorage.setItem('gprl.lastrace.v1', JSON.stringify({ riderId: 'arrieta', trackId: 'siam', laps: 3 })); };
const errs = [];
// 1) PORTRAIT phone 390x844 (native, no rotation): dedicated portrait layout everywhere
const helpers = (p, cdp) => {
  const touch = async (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
  const centre = (sel) => p.evaluate((sel) => { const b = document.querySelector(sel).getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, sel);
  const tapSel = async (sel) => { await p.evaluate((sel) => document.querySelector(sel).scrollIntoView({ block: 'center' }), sel); await p.waitForTimeout(120); const c = await centre(sel); await touch('touchStart', c.x, c.y); await touch('touchEnd'); await p.waitForTimeout(200); };
  const hold = async (sel, ms = 600) => { const c = await centre(sel); const hit = await p.evaluate(([x, y, sel]) => document.querySelector(sel).contains(document.elementFromPoint(x, y)), [c.x, c.y, sel]); await touch('touchStart', c.x, c.y); await p.waitForTimeout(ms); const st = await p.evaluate(() => window.__gp.race.player.steer); await touch('touchEnd'); await p.waitForTimeout(400); return { hit, st }; };
  const fit = () => p.evaluate(() => { const ui = document.getElementById('ui'); return { sw: ui.scrollWidth, cw: ui.clientWidth, doc: document.documentElement.scrollWidth, W: innerWidth }; });
  const fits = (f) => f.sw <= f.cw + 1 && f.doc <= f.W + 1;
  const startRace = async () => { await tapSel('[data-go=quick]'); await p.waitForSelector('#go'); await tapSel('#go'); await p.waitForSelector('#intro-skip', { timeout: 90000 }); await tapSel('#intro-skip');
    await p.evaluate(() => { window.__gp.game.timeScale = 6; }); await p.waitForFunction(() => window.__gp.race.phase === 'race', null, { timeout: 120000 }); await p.evaluate(() => { window.__gp.game.timeScale = 1; }); await p.waitForTimeout(1200); };
  return { touch, centre, tapSel, hold, fit, fits, startRace };
};
const mockOri = () => { let A = 0; Object.defineProperty(screen, 'orientation', { configurable: true, get: () => ({ type: A === 0 ? 'portrait-primary' : A === 90 ? 'landscape-primary' : 'landscape-secondary', angle: A, addEventListener() {}, removeEventListener() {}, lock: async () => { throw new Error('locking must not be used'); } }) }); window.__setAngle = (a) => { A = a; }; };
const tiltAt = (p, angle, beta, gamma) => p.evaluate(([angle, beta, gamma]) => { window.__setAngle(angle); const inp = window.__gp.game.input; inp.tiltOn = true; const e = new Event('deviceorientation'); Object.assign(e, { alpha: 0, beta, gamma }); dispatchEvent(e); const v = inp.tilt; inp.tiltOn = false; inp.tilt = 0; return v; }, [angle, beta, gamma]);
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); await ctx.addInitScript(init); await ctx.addInitScript(mockOri);
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); await p.goto(BASE + '?nosw'); await p.waitForSelector('[data-go=quick]'); await p.waitForTimeout(900);
  const cdp = await ctx.newCDPSession(p); const H = helpers(p, cdp);
  const g0 = await p.evaluate(() => ({ cls: document.documentElement.className, tf: getComputedStyle(document.getElementById('root')).transform, gl: window.__gpGame.renderer.getSize(new window.__gpGame.camera.position.constructor()), aspect: +window.__gpGame.camera.aspect.toFixed(2) }));
  ok('portrait phone: native portrait (no CSS rotation), portrait layout on, renderer 390x844', /\bportrait\b/.test(g0.cls) && !/\b(rot|flip)\b/.test(g0.cls) && g0.tf === 'none' && g0.gl.x === 390 && g0.gl.y === 844 && g0.aspect < 0.5, JSON.stringify(g0));
  const man = await (await p.request.get(BASE + 'manifest.webmanifest')).json(); ok('manifest does not force an orientation', !man.orientation || man.orientation === 'any', String(man.orientation));
  ok('portrait: menu fits (no horizontal overflow)', H.fits(await H.fit()));
  await p.screenshot({ path: OUT + 'v9-portrait-menu.png' });
  for (const g of ['quick', 'champ', 'dream', 'db', 'stats', 'settingsScreen', 'online']) {
    await H.tapSel(`[data-go=${g}]`); await p.waitForTimeout(800); const f = await H.fit();
    ok(`portrait: ${g} screen fits without horizontal overflow (native vertical scroll)`, H.fits(f), JSON.stringify(f));
    if (g === 'settingsScreen') { await H.tapSel('[data-seg=control] [data-v=FULL]'); ok('portrait: settings tap hits', await p.evaluate(() => document.querySelector('[data-seg=control] button.on')?.dataset.v === 'FULL')); await H.tapSel('[data-seg=control] [data-v=SEMI]'); }
    if (g === 'db') { const r = await p.evaluate(() => { const ui = document.getElementById('ui'); return { sh: ui.scrollHeight, ch: ui.clientHeight, oy: getComputedStyle(ui).overflowY, ta: getComputedStyle(ui).touchAction }; }); ok('portrait: rider database scrolls natively (vertical, no touch-action override)', r.sh > r.ch * 2 && r.oy === 'auto' && r.ta !== 'none', JSON.stringify(r)); }
    if (g === 'online') {
      await H.tapSel('#code'); await p.keyboard.type('ab12c'); ok('portrait: online room-code input', await p.evaluate(() => document.getElementById('code').value.toUpperCase() === 'AB12C'));
      await H.tapSel('#host'); await p.waitForSelector('#room-code', { timeout: 20000 }); await p.waitForTimeout(600);
      const l = await p.evaluate(() => { const r = document.getElementById('room-code').getBoundingClientRect(); return { l: r.left, r: r.right, W: innerWidth }; }); const f2 = await H.fit();
      ok('portrait: online lobby fits, room code fully visible', H.fits(f2) && l.l >= 0 && l.r <= l.W, JSON.stringify({ l, f2 }));
    }
    await p.goto(BASE + '?nosw'); await p.waitForSelector('[data-go=quick]'); await p.waitForTimeout(500);
  }
  // quick race in portrait
  await H.startRace();
  const hud = await p.evaluate(() => { const W = innerWidth, Hh = innerHeight; const out = []; for (const sel of ['.hud-tl', '.hud-tr', '.hud-br', '.hud-bl', '#h-tower', '#t-left', '#t-right']) { const e = document.querySelector(sel); if (!e) { out.push({ sel, missing: true }); continue; } const r = e.getBoundingClientRect(); out.push({ sel, vis: getComputedStyle(e).display !== 'none' && r.width > 0, inb: r.left >= -1 && r.top >= -1 && r.right <= W + 1 && r.bottom <= Hh + 1, r: [r.left, r.top, r.right, r.bottom].map(Math.round) }); }
    const L = document.getElementById('t-left').getBoundingClientRect(), R = document.getElementById('t-right').getBoundingClientRect(), sp = document.querySelector('.hud-br').getBoundingClientRect();
    return { out, rows: document.querySelectorAll('#h-tower .tr').length, zones: { lw: L.width / W, lt: L.top / Hh, rl: R.left / W }, spdCentre: Math.abs((sp.left + sp.right) / 2 - W / 2) < 8, cs: { up: +window.__gp.game.cs.up.toFixed(2), back: +window.__gp.game.cs.back.toFixed(2), fov: Math.round(window.__gp.game.camera.fov) } }; });
  ok('portrait race HUD: position/lap, timing, speed, minimap, leaderboard, touch zones all visible and in bounds', hud.out.every(o => o.vis && o.inb) && hud.rows >= 3, JSON.stringify(hud.out.filter(o => !(o.vis && o.inb))) + ` rows ${hud.rows}`);
  ok('portrait: LEFT/RIGHT zones are the bottom half split in two; speed/gear bottom centre', hud.zones.lw > 0.45 && hud.zones.lt > 0.5 && hud.zones.lt < 0.6 && hud.zones.rl > 0.45 && hud.spdCentre, JSON.stringify(hud.zones));
  ok('portrait chase camera is taller/further with wider vertical FOV', hud.cs.up > 3 && hud.cs.back > 7.5 && hud.cs.fov >= 75, JSON.stringify(hud.cs));
  const tL = await H.hold('#t-left'), tR = await H.hold('#t-right');
  ok('portrait: touch LEFT steers left, RIGHT steers right', tL.hit && tR.hit && tL.st < 0 && tR.st > 0, JSON.stringify({ tL, tR }));
  const t0 = await tiltAt(p, 0, 0, 15), t90 = await tiltAt(p, 90, 15, 0), t270 = await tiltAt(p, 270, -15, 0);
  ok('tilt steering follows screen.orientation.angle (portrait gamma, landscape ±beta)', t0 > 0.3 && t90 > 0.3 && t270 > 0.3, JSON.stringify({ t0, t90, t270 }));
  await p.screenshot({ path: OUT + 'v9-portrait-race.png' });
  // jitter (iOS address bar) must not toggle the layout
  await p.evaluate(() => { window.__log = []; new MutationObserver(() => window.__log.push(document.documentElement.className)).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] }); });
  for (const h of [800, 844, 760, 844]) { await p.setViewportSize({ width: 390, height: h }); await p.waitForTimeout(80); } await p.waitForTimeout(500);
  ok('portrait: address-bar height jitter never toggles the layout', await p.evaluate(() => window.__log.length === 0 && document.documentElement.classList.contains('portrait')));
  // live orientation switch mid-race: portrait -> landscape (both sides) -> portrait, no pause, no reload
  await p.evaluate(() => { window.__mark = 1; });
  const sw = async (w, h, angle) => { await p.evaluate((a) => window.__setAngle(a), angle); await p.setViewportSize({ width: w, height: h }); await p.waitForTimeout(700);
    return p.evaluate(() => ({ cls: document.documentElement.className, hudP: document.querySelector('.hud').classList.contains('portrait'), tf: getComputedStyle(document.getElementById('root')).transform, gl: window.__gp.game.renderer.getSize(new window.__gp.game.camera.position.constructor()), paused: !!window.__gp.game.paused, mark: window.__mark, phase: window.__gp.race.phase, t: window.__gp.race.t })); };
  const tA = await p.evaluate(() => window.__gp.race.t);
  const LA = await sw(844, 390, 90); const lL = await H.hold('#t-left'), lR = await H.hold('#t-right');
  ok('mid-race to landscape (camera left): adapts live, native (no transform), not paused, no reload, steering correct', !/portrait/.test(LA.cls) && !LA.hudP && LA.tf === 'none' && LA.gl.x === 844 && !LA.paused && LA.mark === 1 && LA.t > tA && lL.st < 0 && rR(lR), JSON.stringify(LA));
  await p.screenshot({ path: OUT + 'v9-landscape-race.png' });
  const LB = await sw(844, 390, 270); const bL = await H.hold('#t-left'), bR = await H.hold('#t-right');
  ok('landscape other side (camera right): also native upright (no 180 flip), steering correct', LB.tf === 'none' && !/flip/.test(LB.cls) && bL.st < 0 && bR.st > 0 && !LB.paused, JSON.stringify(LB));
  const PB = await sw(390, 844, 0);
  ok('mid-race back to portrait: portrait HUD + camera return live, not paused', /portrait/.test(PB.cls) && PB.hudP && PB.gl.x === 390 && !PB.paused && PB.mark === 1, JSON.stringify(PB));
  // results screen in portrait
  await p.evaluate(() => { const r = window.__gp.race; r.projectFinish(); r.player.finished = true; });
  await p.waitForSelector('#podium-skip', { timeout: 60000 }); await H.tapSel('#podium-skip'); await p.waitForSelector('.restable', { timeout: 30000 }); await p.waitForTimeout(800);
  ok('portrait: results screen fits without horizontal overflow', H.fits(await H.fit()));
  await p.screenshot({ path: OUT + 'v9-portrait-results.png' });
  await ctx.close();
}
function rR(x) { return x.hit && x.st > 0; }
// 2) desktop: never shows overlay (even in a tall window)
{
  const ctx = await browser.newContext({ viewport: { width: 700, height: 1000 } }); await ctx.addInitScript(init);
  const p = await ctx.newPage(); await p.goto(BASE + '?nosw'); await p.waitForTimeout(800);
  ok('desktop (mouse) unaffected: no portrait layout / rotation even in a tall window', await p.evaluate(() => !/\b(rot|flip|portrait)\b/.test(document.documentElement.className) && window.__gpGame.renderer.getSize(new window.__gpGame.camera.position.constructor()).x === 700));
  await ctx.close();
}
// 3) message bands in a real race, mobile 844x390 and desktop 1366x768
for (const [name, vp, mobile] of [['mobile', { width: 844, height: 390 }, true], ['desktop', { width: 1366, height: 768 }, false]]) {
  const ctx = await browser.newContext({ viewport: vp, ...(mobile ? { isMobile: true, hasTouch: true } : {}) }); await ctx.addInitScript(init);
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); await p.goto(BASE + '?nosw');
  await p.click('[data-go=quick]'); await p.waitForSelector('#go'); await p.evaluate(() => document.getElementById('go').click());
  await p.waitForSelector('#intro-skip', { timeout: 90000 }); await p.click('#intro-skip');
  await p.evaluate(() => { window.__gp.game.timeScale = 6; }); await p.waitForFunction(() => window.__gp.race.phase === 'race', null, { timeout: 120000 });
  await p.evaluate(() => { window.__gp.race.autopilot = true; window.__gp.game.timeScale = 1; });
  await p.waitForTimeout(2500);
  // real lap-line crossing: put the player just before the line
  await p.evaluate(() => { const r = window.__gp.race, me = r.player; me.s = r.geo.L * me.lap - 6; me.ps = me.s; });
  await p.waitForFunction(() => [...document.querySelectorAll('#h-banner .note')].some(e => /^LAP \d/.test(e.textContent)), null, { timeout: 20000 }).catch(() => {});
  const lapSeen = await p.evaluate(() => [...document.querySelectorAll('#h-banner .note')].some(e => /^LAP \d/.test(e.textContent)));
  ok(`${name}: real lap-line crossing message shown in the banner`, lapSeen);
  await p.evaluate(() => { const g = window.__gp.game, h = g.hud; h.pop('PERSONAL BEST', 'green', '1:41.220', 1.8); h.pop('S2 · PURPLE', 'purple'); h.note('FINAL LAP', 'white', 2.5); g.lastCutin = -9; g.cutin(window.__gp.race.player, 'OVERTAKE!', 'P2 · ON BAGNAYA'); });
  await p.waitForTimeout(300);
  const m = await p.evaluate(() => {
    const W = innerWidth, H = innerHeight, centre = { l: W * 0.22, r: W * 0.78, t: H * 0.3, b: H * 0.82 };
    const els = [...document.querySelectorAll('#h-banner .note, .cutin, #h-pops > *')].filter(e => getComputedStyle(e).display !== 'none');
    return { W, H, items: els.map(e => { const b = e.getBoundingClientRect(); const hit = !(b.right < centre.l || b.left > centre.r || b.bottom < centre.t || b.top > centre.b); return { t: e.textContent.trim().slice(0, 28), top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right), hit }; }), lap: [...document.querySelectorAll('#h-banner .note')].some(e => /^LAP \d/.test(e.textContent)) };
  });
    ok(`${name}: all mid-race messages outside the central play area`, m.items.length >= 2 && m.items.every(i => !i.hit), JSON.stringify(m.items.filter(i => i.hit)));
  ok(`${name}: banner chips in top band (bottom ≤ 24% of height)`, m.items.filter(i => !/OVERTAKE/.test(i.t)).every(i => i.bottom <= m.H * 0.24), m.items.map(i => i.bottom).join(','));
  await p.screenshot({ path: OUT + `v7-lap-banner-${name}.png` });
  await ctx.close();
}
ok('no console errors', errs.length === 0, errs.join('; '));
await browser.close();
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`); process.exit(results.every(Boolean) ? 0 : 1);
