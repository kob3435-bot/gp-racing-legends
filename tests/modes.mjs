// Mode-flow QA: Dream Grid (equal machinery), Spectator, and a Championship round with standings persistence.
// Usage: node tests/modes.mjs [baseUrl]   (expects `npm run preview` on :4173)
import { chromium } from 'playwright-core';
const BASE = process.argv[2] || process.env.BASE_URL || 'http://localhost:4173/gp-racing-legends/';
const OUT = new URL('../screenshots/', import.meta.url).pathname;
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const results = []; const ok = (name, cond, info = '') => { results.push({ name, pass: !!cond }); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name} ${info}`); };
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage(); const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(BASE + '?nosw'); await page.waitForSelector('[data-x=exp]', { timeout: 20000 });
await page.click('[data-x=exp]'); await page.waitForSelector('[data-go=quick]');

async function runRace(label, shot) {
  await page.waitForSelector('#intro-skip', { timeout: 30000 }); await page.click('#intro-skip');
  await page.waitForFunction(() => window.__gp.race && window.__gp.race.phase === 'race', null, { timeout: 60000 });
  await page.evaluate(() => { window.__gp.game.timeScale = 3; if (window.__gp.race.player) window.__gp.race.autopilot = true; });
  await page.waitForTimeout(2500);
  const info = await page.evaluate(() => { const r = window.__gp.race; return { n: r.entrants.length, moving: r.entrants.filter(e => e.v > 5).length, player: !!r.player }; });
  if (shot) await page.screenshot({ path: OUT + shot });
  ok(`${label}: race running`, info.moving >= Math.min(10, info.n - 2), JSON.stringify(info));
  await page.evaluate(() => { window.__gp.game.timeScale = 12; });
  await page.waitForSelector('.restable', { timeout: 400000 });
  const rows = await page.$$eval('.restable .rr:not(.head)', r => r.length);
  ok(`${label}: results shown`, rows === info.n, `${rows} rows`);
  return info;
}

// ---- Dream Grid: legend primes, equal machinery, 1 lap
await page.click('[data-go=dream]'); await page.waitForSelector('#dg-list');
await page.click('[data-p=primes]'); await page.click('[data-seg=machinery] [data-v=EQUAL]'); await page.click('[data-seg=laps] [data-v="1"]');
const cnt = await page.textContent('#dg-count'); ok('dream grid: legend primes fill the grid', cnt.startsWith('22'), cnt);
await page.click('#go'); await runRace('dream grid', '08-dream-grid-race.png');
await page.click('#menu'); await page.waitForSelector('[data-go=quick]');

// ---- Spectator: 1 lap
await page.click('[data-go=spectator]'); await page.waitForSelector('#go');
await page.click('[data-seg=laps] [data-v="1"]'); await page.click('#go');
const sp = await runRace('spectator', '09-spectator.png'); ok('spectator: no player bike', !sp.player);
await page.click('#menu'); await page.waitForSelector('[data-go=quick]');

// ---- Championship: 4 rounds x 2 laps, race round 1, check standings persist
await page.click('[data-go=champ]'); await page.waitForSelector('#go');
await page.click('[data-seg=rounds] [data-v="4"]'); await page.click('[data-seg=laps] [data-v="2"]'); await page.click('#go');
await page.waitForSelector('.calr'); ok('championship: hub with calendar', (await page.$$('.calr')).length === 4);
await page.click('#go'); await runRace('championship R1');
await page.click('#next'); await page.waitForSelector('.calr', { timeout: 30000 });
const hub = await page.textContent('#go'); ok('championship: advanced to round 2', /ROUND 2/.test(hub), hub);
const saved = await page.evaluate(() => { const k = Object.keys(localStorage).find(k => /champ/i.test(k)); const c = k && JSON.parse(localStorage.getItem(k)); return c && { round: c.round, total: Object.values(c.points).reduce((a, b) => a + b, 0), teams: Object.values(c.teamPoints).reduce((a, b) => a + b, 0) }; });
ok('championship: points saved (25+20+16+...+1 = 140 per round)', saved && saved.round === 1 && saved.total === 140, JSON.stringify(saved));
await page.screenshot({ path: OUT + '10-championship-hub.png' });
await page.reload(); await page.waitForSelector('[data-go=champ]'); await page.click('[data-go=champ]'); await page.waitForSelector('#go');
ok('championship: survives reload', /ROUND 2/.test(await page.textContent('#go')));
const stats = await page.evaluate(() => { const k = Object.keys(localStorage).find(k => /stat/i.test(k)); return k && JSON.parse(localStorage.getItem(k)); });
ok('statistics updated after races', stats && stats.races >= 2, JSON.stringify(stats));
ok('no console errors', errors.length === 0, errors.slice(0, 5).join(' | '));
await browser.close();
const f = results.filter(r => !r.pass).length; console.log(`\n${results.length - f}/${results.length} checks passed`); process.exit(f ? 1 : 0);
