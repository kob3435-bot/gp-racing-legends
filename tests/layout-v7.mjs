// v8 QA: portrait phones get the game CSS-rotated to landscape (taps/scroll/inputs/steering verified), desktop unaffected, and every mid-race message
// (lap / sector / best lap / overtake ...) stays in the top band or a side corner, never in the central play area.
import { chromium } from 'playwright-core';
const BASE = process.argv[2] || 'http://localhost:4173/gp-racing-legends/';
const OUT = new URL('../screenshots/', import.meta.url).pathname;
const results = []; const ok = (n, c, i = '') => { results.push(!!c); console.log(`${c ? 'PASS' : 'FAIL'}  ${n} ${i}`); };
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const init = () => { localStorage.setItem('gprl.profile.v1', '{"type":"experienced"}'); localStorage.setItem('gprl.settings.v1', JSON.stringify({ graphics: 'LOW', autoGfx: false, master: 0, music: 0, control: 'SEMI' })); localStorage.setItem('gprl.lastrace.v1', JSON.stringify({ riderId: 'arrieta', trackId: 'siam', laps: 3 })); };
const errs = [];
// 1) portrait phone (390x844, touch): the game is CSS-rotated to landscape; every interaction must still hit
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }); await ctx.addInitScript(init);
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); await p.goto(BASE + '?nosw'); await p.waitForSelector('[data-go=quick]'); await p.waitForTimeout(800);
  const cdp = await ctx.newCDPSession(p);
  const touch = async (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
  const centre = (sel) => p.evaluate((sel) => { const b = document.querySelector(sel).getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, sel);
  const tapSel = async (sel) => { await p.evaluate((sel) => document.querySelector(sel).scrollIntoView({ block: 'center' }), sel); await p.waitForTimeout(100); const c = await centre(sel); await touch('touchStart', c.x, c.y); await touch('touchEnd'); await p.waitForTimeout(150); };
  const geo = await p.evaluate(() => { const r = document.getElementById('root').getBoundingClientRect(); const g = window.__gpGame.renderer.getSize(new window.__gpGame.camera.position.constructor()); return { rot: document.documentElement.classList.contains('rot'), rw: Math.round(r.width), rh: Math.round(r.height), gl: [g.x, g.y], aspect: +window.__gpGame.camera.aspect.toFixed(2), overlay: !!document.getElementById('rotate') }; });
  ok('portrait phone: game rotated to landscape (root covers screen, renderer 844x390, no blocking overlay)', geo.rot && geo.rw === 390 && geo.rh === 844 && geo.gl[0] === 844 && geo.gl[1] === 390 && geo.aspect > 2 && !geo.overlay, JSON.stringify(geo));
  await p.screenshot({ path: OUT + 'v8-portrait-menu.png' });
  const man = await (await p.request.get(BASE + 'manifest.webmanifest')).json(); ok('manifest orientation = landscape', man.orientation === 'landscape');
  // settings tap (segmented control)
  await tapSel('[data-go=settingsScreen]'); await p.waitForSelector('[data-seg=control]');
  await tapSel('[data-seg=control] [data-v=FULL]');
  ok('portrait-rotated: settings taps hit the right button', await p.evaluate(() => document.querySelector('[data-seg=control] button.on')?.dataset.v === 'FULL'));
  await tapSel('[data-seg=control] [data-v=SEMI]'); await tapSel('[data-back]');
  // rider database: touch-drag scrolls in the visual direction (finger towards the game's top = content moves up)
  await tapSel('[data-go=db]'); await p.waitForTimeout(600);
  const scroller = () => p.evaluate(() => { const c = [...document.querySelectorAll('#root *')].filter(e => { const o = getComputedStyle(e).overflowY; return (o === 'auto' || o === 'scroll') && e.scrollHeight > e.clientHeight + 50; }); c.sort((a, b) => (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight)); const e = c[0]; if (!e) return { id: 'none', top: 0, ids: [...document.body.children].map(x => x.id).join(',') }; e.setAttribute('data-scroller', '1'); return { id: e.id || e.className, top: e.scrollTop }; });
  const s0 = await scroller(); const sc = s0.top; console.log('      scroller', JSON.stringify(s0));
  { const W = 390; // game "up" on screen is +x in the cw-rotated view
    await touch('touchStart', 120, 420); for (let k = 1; k <= 10; k++) { await touch('touchMove', 120 + k * 22, 420); await p.waitForTimeout(16); } await touch('touchEnd'); await p.waitForTimeout(700); void W; }
  const sc2 = await p.evaluate(() => document.querySelector('[data-scroller]')?.scrollTop ?? -1);
  ok('portrait-rotated: rider database scrolls with the finger (correct direction)', sc2 > sc + 40, `scrollTop ${sc} -> ${sc2}`);
  await tapSel('[data-back]');
  // online lobby: code input takes focus + typing
  await tapSel('[data-go=online]'); await p.waitForSelector('#code'); await tapSel('#code'); await p.keyboard.type('ab12c');
  ok('portrait-rotated: online room-code input focus + typing', await p.evaluate(() => document.activeElement?.id === 'code' && document.getElementById('code').value.toUpperCase() === 'AB12C'));
  await tapSel('[data-back]');
  // quick race via taps
  await tapSel('[data-go=quick]'); await p.waitForSelector('#go'); await tapSel('#go');
  await p.waitForSelector('#intro-skip', { timeout: 90000 }); await tapSel('#intro-skip');
  await p.evaluate(() => { window.__gp.game.timeScale = 6; }); await p.waitForFunction(() => window.__gp.race.phase === 'race', null, { timeout: 120000 });
  await p.evaluate(() => { window.__gp.game.timeScale = 1; }); await p.waitForTimeout(1500);
  ok('portrait-rotated: menu taps started a quick race', await p.evaluate(() => window.__gp.race.phase === 'race'));
  // touch steering: hold the visual LEFT / RIGHT buttons -> steer sign must match keyboard ArrowLeft / ArrowRight
  const hold = async (sel, ms = 700) => { const c = await centre(sel); const hit = await p.evaluate(([x, y, sel]) => document.querySelector(sel).contains(document.elementFromPoint(x, y)), [c.x, c.y, sel]); await touch('touchStart', c.x, c.y); await p.waitForTimeout(ms); const st = await p.evaluate(() => window.__gp.race.player.steer); await touch('touchEnd'); await p.waitForTimeout(400); return { hit, st }; };
  const kb = async (key) => { await p.keyboard.down(key); await p.waitForTimeout(500); const v = await p.evaluate(() => window.__gp.race.player.steer); await p.keyboard.up(key); await p.waitForTimeout(400); return v; };
  const kL = await kb('ArrowLeft'), kR = await kb('ArrowRight');
  const tL = await hold('#t-left'), tR = await hold('#t-right');
  // the visual left button must be on the left of the rotated picture: in cw rotation game-left = screen top
  const pos = await p.evaluate(() => { const l = document.getElementById('t-left').getBoundingClientRect(), r = document.getElementById('t-right').getBoundingClientRect(); return { l: l.top, r: r.top }; });
  ok('portrait-rotated: touch LEFT/RIGHT hit their buttons and steer the same way as the arrow keys', tL.hit && tR.hit && Math.sign(tL.st) === Math.sign(kL) && Math.sign(tR.st) === Math.sign(kR) && kL !== 0 && kR !== 0 && Math.sign(kL) !== Math.sign(kR), JSON.stringify({ kL, kR, tL, tR }));
  ok('portrait-rotated: LEFT button is on the picture\'s left (screen top in cw rotation)', pos.l < pos.r, JSON.stringify(pos));
  const tilt = await p.evaluate(() => { const inp = window.__gp.game.input; const was = inp.tiltOn; inp.tiltOn = true; const fire = (beta, gamma) => { const e = new Event('deviceorientation'); Object.assign(e, { beta, gamma, alpha: 0 }); window.dispatchEvent(e); return inp.tilt; };
    const a = fire(15, 5), b = fire(-15, 5), c = fire(0, 30); inp.tiltOn = was; inp.tilt = 0; return { a, b, c }; });
  ok('portrait-rotated: tilt steering uses the landscape "wheel" axis (beta), not gamma', tilt.a > 0.3 && tilt.b < -0.3 && Math.abs(tilt.c) < 0.05, JSON.stringify(tilt));
  await p.screenshot({ path: OUT + 'v8-portrait-race.png' });
  // rotate to real landscape mid-race and back: no reload, no pause, renderer follows
  const before = await p.evaluate(() => { window.__mark = 1; return window.__gp.race.t; });
  await p.setViewportSize({ width: 844, height: 390 }); await p.waitForTimeout(700);
  const L = await p.evaluate(() => ({ rot: document.documentElement.classList.contains('rot'), gl: window.__gpGame.renderer.getSize(new window.__gpGame.camera.position.constructor()), paused: !!window.__gp.game.paused, mark: window.__mark, phase: window.__gp.race.phase, t: window.__gp.race.t }));
  ok('rotate to landscape mid-race: un-rotated live, no reload, no pause, race continues', !L.rot && L.gl.x === 844 && L.gl.y === 390 && !L.paused && L.mark === 1 && L.phase === 'race' && L.t > before, JSON.stringify(L));
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(700);
  const P = await p.evaluate(() => ({ rot: document.documentElement.classList.contains('rot'), gl: window.__gpGame.renderer.getSize(new window.__gpGame.camera.position.constructor()), paused: !!window.__gp.game.paused, mark: window.__mark }));
  ok('…and back to portrait: re-rotated live, renderer 844x390, still not paused', P.rot && P.gl.x === 844 && P.gl.y === 390 && !P.paused && P.mark === 1, JSON.stringify(P));
  const tL2 = await hold('#t-left'); ok('after rotating back, touch LEFT still steers left', tL2.hit && Math.sign(tL2.st) === Math.sign(kL), JSON.stringify(tL2));
  await ctx.close();
}
// 2) desktop: never shows overlay (even in a tall window)
{
  const ctx = await browser.newContext({ viewport: { width: 700, height: 1000 } }); await ctx.addInitScript(init);
  const p = await ctx.newPage(); await p.goto(BASE + '?nosw'); await p.waitForTimeout(800);
  ok('desktop (mouse) unaffected: never rotated, even in a tall window', await p.evaluate(() => !document.documentElement.classList.contains('rot') && window.__gpGame.renderer.getSize(new window.__gpGame.camera.position.constructor()).x === 700));
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
  await p.waitForFunction(() => document.querySelectorAll('#h-banner .note').length > 0, null, { timeout: 20000 }).catch(() => {});
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
