// Full-season championship QA: every circuit in the database, laps-per-race setting, points / team points
// bookkeeping after every round, save + reload mid-season, and the champion screen at the end.
// Races are simulated quickly (autopilot rides the player's bike, high time-scale, LOW graphics).
// Usage: node tests/championship.mjs [baseUrl]
import { chromium } from 'playwright-core';
const BASE = process.argv[2] || process.env.BASE_URL || 'http://localhost:4173/gp-racing-legends/';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const OUT = new URL('../screenshots/', import.meta.url).pathname;
const results = []; const ok = (name, cond, info = '') => { results.push({ name, pass: !!cond }); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name} ${info}`); };
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.addInitScript(() => {
  if (!localStorage.getItem('gprl.profile.v1')) localStorage.setItem('gprl.profile.v1', JSON.stringify({ type: 'experienced' }));
  if (!localStorage.getItem('gprl.settings.v1')) localStorage.setItem('gprl.settings.v1', JSON.stringify({ graphics: 'LOW', autoGfx: false, control: 'SEMI', camera: 'chase', dynRes: false, music: 0, master: 0 }));
});
const page = await ctx.newPage(); const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
const champ = () => page.evaluate(() => { const k = Object.keys(localStorage).find(k => /champ/i.test(k)); return k ? JSON.parse(localStorage.getItem(k)) : null; });
const POINTS_PER_ROUND = 25 + 20 + 16 + 13 + 11 + 10 + 9 + 8 + 7 + 6 + 5 + 4 + 3 + 2 + 1; // 140

await page.goto(BASE + '?nosw'); await page.waitForSelector('[data-go=champ]', { timeout: 30000 });

// ---- laps settings: REALISTIC and CUSTOM are stored with the season and drive the race length
await page.click('[data-go=champ]'); await page.waitForSelector('#go');
const fullLabel = await page.textContent('[data-seg=rounds] button.on');
ok('setup: default is the FULL season', /FULL/.test(fullLabel), fullLabel);
await page.click('[data-seg=laps] [data-v=REAL]');
const prevRows = await page.$$eval('#calPrev .calr', r => r.map(x => x.textContent));
ok('setup: calendar preview lists every circuit', prevRows.length >= 14, `${prevRows.length} rounds`);
await page.click('#go'); await page.waitForSelector('.cal .calr');
let c = await champ();
ok('REALISTIC laps saved with season', c.lapsMode === 'REAL', JSON.stringify({ lapsMode: c.lapsMode, laps: c.laps }));
const calLaps = await page.$$eval('.cal .calr .lp', r => r.map(x => parseInt(x.textContent)));
ok('REALISTIC laps vary per circuit (18-30)', calLaps.every(n => n >= 18 && n <= 30) && new Set(calLaps).size > 3, calLaps.join(','));
page.once('dialog', d => d.accept()); await page.click('#abandon'); await page.waitForSelector('[data-seg=laps]');
await page.click('[data-seg=laps] [data-v=CUSTOM]'); await page.fill('#customLaps', '7'); await page.dispatchEvent('#customLaps', 'input');
await page.click('#go'); await page.waitForSelector('.cal .calr');
c = await champ(); ok('CUSTOM laps (7) saved with season', c.lapsMode === 'FIXED' && c.laps === 7, JSON.stringify({ lapsMode: c.lapsMode, laps: c.laps }));
page.once('dialog', d => d.accept()); await page.click('#abandon'); await page.waitForSelector('[data-seg=laps]');

// ---- the real season: FULL, 1 lap per race
await page.click('[data-seg=rounds] [data-v=FULL]'); await page.click('[data-seg=laps] [data-v="1"]');
await page.click('#go'); await page.waitForSelector('.cal .calr');
c = await champ();
const N = c.calendar.length;
const dbCount = await page.evaluate(() => window.__gpData.trackCount);
ok('season covers every circuit in the database, no duplicates', N === dbCount && new Set(c.calendar).size === N, `${N}/${dbCount} rounds: ${c.calendar.join(' > ')}`);
await page.screenshot({ path: OUT + 'v3-champ-hub-start.png' });
let expectedTotal = 0, reloadDone = false;
for (let r = 0; r < N; r++) {
  const t0 = Date.now();
  await page.click('#go');
  await page.waitForSelector('#intro-skip', { timeout: 120000 }); await page.click('#intro-skip');
  await page.waitForFunction(() => window.__gp.race && window.__gp.race.phase !== 'loading', null, { timeout: 60000 });
  const info = await page.evaluate(() => { const g = window.__gp.game, rc = window.__gp.race; rc.autopilot = true; g.timeScale = 40; return { laps: rc.laps, track: g.track.id }; });
  await page.waitForSelector('#podium-skip, .restable', { timeout: 600000 });
  if (await page.$('#podium-skip')) await page.click('#podium-skip');
  await page.waitForSelector('#next', { timeout: 60000 });
  const awarded = await page.$$eval('.restable .rr:not(.head)', rows => rows.map(x => x.textContent));
  await page.click('#next'); await page.waitForSelector(r === N - 1 ? '#new' : '.cal .calr', { timeout: 60000 });
  const after = await champ();
  expectedTotal += POINTS_PER_ROUND;
  const total = Object.values(after.points).reduce((a, b) => a + b, 0), teams = Object.values(after.teamPoints).reduce((a, b) => a + b, 0);
  // team points must equal the sum of their riders' points
  const byTeam = {}; await page.evaluate(() => 0);
  const teamMap = await page.evaluate((ids) => ids.map(id => [id, window.__gpData.teamOf(id)]), Object.keys(after.points));
  for (const [id, tid] of teamMap) if (tid) byTeam[tid] = (byTeam[tid] || 0) + after.points[id];
  const teamsConsistent = Object.entries(byTeam).every(([tid, p]) => after.teamPoints[tid] === p);
  ok(`R${r + 1}/${N} ${info.track}: ${info.laps} lap, round saved, points ${total}/${expectedTotal}, teams ${teams}${teamsConsistent ? ' (= riders per team)' : ' MISMATCH'}`,
    info.laps === 1 && info.track === c.calendar[r] && after.round === r + 1 && total === expectedTotal && teams === expectedTotal && teamsConsistent && awarded.length >= 15, `${((Date.now() - t0) / 1000).toFixed(0)}s`);
  if (r === Math.floor(N / 2) && !reloadDone) { // save + reload mid-season
    reloadDone = true;
    await page.reload(); await page.waitForSelector('[data-go=champ]'); await page.click('[data-go=champ]'); await page.waitForSelector('#go');
    const reloaded = await champ();
    ok('mid-season reload keeps round + standings', reloaded.round === r + 1 && Object.values(reloaded.points).reduce((a, b) => a + b, 0) === expectedTotal && /ROUND/.test(await page.textContent('#go')));
  }
}
// ---- champion screen
const end = await champ();
const standings = Object.entries(end.points).sort((a, b) => b[1] - a[1]);
const h2 = await page.textContent('.center-col h2');
const champName = await page.evaluate((id) => window.__gpData.riderName(id), standings[0][0]);
ok('champion screen names the points leader', /World Champion/i.test(h2) && h2.includes(champName), `${h2} (${standings[0][1]} pts)`);
ok('champion screen shows teams standings', (await page.$$('.champ-tables .sr, .champ-tables tr, .champ-tables .calr')).length > 0 || /TEAMS/.test(await page.textContent('.champ-tables')));
ok('final points total = 140 x rounds', standings.reduce((a, b) => a + b[1], 0) === POINTS_PER_ROUND * N, `${standings.reduce((a, b) => a + b[1], 0)} = 140 x ${N}`);
await page.screenshot({ path: OUT + 'v3-champion.png' });
const relevant = errors.filter(e => !/favicon|GPU stall|WebGL.*performance|swiftshader|AudioContext/i.test(e));
ok('no console errors', relevant.length === 0, relevant.slice(0, 3).join(' | '));
await browser.close();
const passed = results.filter(r => r.pass).length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
