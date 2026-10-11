// v7 QA: portrait phones get the rotate overlay (blocks play), desktop unaffected, and every mid-race message
// (lap / sector / best lap / overtake ...) stays in the top band or a side corner, never in the central play area.
import { chromium } from 'playwright-core';
const BASE = process.argv[2] || 'http://localhost:4173/gp-racing-legends/';
const OUT = new URL('../screenshots/', import.meta.url).pathname;
const results = []; const ok = (n, c, i = '') => { results.push(!!c); console.log(`${c ? 'PASS' : 'FAIL'}  ${n} ${i}`); };
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const init = () => { localStorage.setItem('gprl.profile.v1', '{"type":"experienced"}'); localStorage.setItem('gprl.settings.v1', JSON.stringify({ graphics: 'LOW', autoGfx: false, master: 0, music: 0, control: 'SEMI' })); localStorage.setItem('gprl.lastrace.v1', JSON.stringify({ riderId: 'arrieta', trackId: 'siam', laps: 3 })); };
const errs = [];
// 1) portrait phone
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }); await ctx.addInitScript(init);
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); await p.goto(BASE + '?nosw'); await p.waitForTimeout(1500);
  const r = await p.evaluate(() => { const el = document.getElementById('rotate'), b = el.getBoundingClientRect(), cs = getComputedStyle(el); const top = document.elementFromPoint(innerWidth / 2, innerHeight * 0.8); return { shown: cs.display !== 'none', cover: b.width >= innerWidth && b.height >= innerHeight, blocks: el.contains(top), text: el.innerText }; });
  ok('portrait phone: rotate overlay shown, full-screen, blocks input', r.shown && r.cover && r.blocks, JSON.stringify(r).slice(0, 120));
  await p.screenshot({ path: OUT + 'v7-portrait.png' });
  const man = await (await p.request.get(BASE + 'manifest.webmanifest')).json(); ok('manifest orientation = landscape', man.orientation === 'landscape');
  // rotate to landscape: overlay disappears, game usable
  await p.setViewportSize({ width: 844, height: 390 }); await p.waitForTimeout(400);
  ok('rotating to landscape removes the overlay', await p.evaluate(() => getComputedStyle(document.getElementById('rotate')).display === 'none'));
  await ctx.close();
}
// 2) desktop: never shows overlay (even in a tall window)
{
  const ctx = await browser.newContext({ viewport: { width: 700, height: 1000 } }); await ctx.addInitScript(init);
  const p = await ctx.newPage(); await p.goto(BASE + '?nosw'); await p.waitForTimeout(800);
  ok('desktop (mouse) unaffected: no overlay even in a tall window', await p.evaluate(() => getComputedStyle(document.getElementById('rotate')).display === 'none'));
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
