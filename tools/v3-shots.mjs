// Capture the v3 anime screenshots into screenshots/v3-*.png
import { chromium } from 'playwright-core';
import { mkdirSync } from 'fs';
const BASE = process.argv[2] || 'http://localhost:4173/gp-racing-legends/';
const OUT = new URL('../screenshots/', import.meta.url).pathname; mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

const ONLY = (process.argv[3] || '').split(',').filter(Boolean);
async function shot(name, fn) {
  if (ONLY.length && !ONLY.some(o => name.includes(o))) return;
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  await ctx.addInitScript(() => {
    localStorage.setItem('gprl.profile.v1', JSON.stringify({ type: 'casual' }));
    localStorage.setItem('gprl.settings.v1', JSON.stringify({ graphics: 'HIGH', autoGfx: false, control: 'SEMI', camera: 'chase', dynRes: false }));
    localStorage.setItem('gprl.lastrace.v1', JSON.stringify({ riderId: 'srisuk', trackId: 'siam', laps: 1 }));
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('ERR', name, e.message));
  await fn(page, ctx);
  await ctx.close();
  console.log('shot', name);
}

await shot('v3-menu', async (page) => {
  await page.goto(BASE + '?nosw'); await page.waitForSelector('[data-go=quick]');
  await page.waitForTimeout(1800);
  await page.screenshot({ path: OUT + 'v3-menu.png' });
});

await shot('v3-race-sun', async (page) => {
  await page.goto(BASE + '?nosw'); await page.waitForSelector('[data-go=quick]');
  await page.click('[data-go=quick]'); await page.waitForSelector('#go');
  await page.click('[data-seg=weather] [data-v=SUNNY]'); await page.click('[data-seg=laps] [data-v="1"]');
  await page.click('#go'); await page.waitForSelector('#intro-skip', { timeout: 90000 }); await page.click('#intro-skip');
  await page.evaluate(() => { window.__gp.game.timeScale = 6; });
  await page.waitForFunction(() => window.__gp.race.phase === 'race', null, { timeout: 180000 });
  await page.evaluate(() => { window.__gp.race.autopilot = true; window.__gp.game.timeScale = 1; window.__gp.game.camMode = 'chase'; });
  await page.waitForFunction(() => window.__gp.race.player.v > 64, null, { timeout: 120000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: OUT + 'v3-race-sun.png' });
});

await shot('v3-race-rain', async (page) => {
  await page.goto(BASE + '?nosw'); await page.waitForSelector('[data-go=quick]');
  await page.click('[data-go=quick]'); await page.waitForSelector('#go');
  await page.click('[data-seg=weather] [data-v=HEAVY_RAIN]'); await page.click('[data-seg=laps] [data-v="1"]');
  await page.click('#go'); await page.waitForSelector('#intro-skip', { timeout: 90000 }); await page.click('#intro-skip');
  await page.evaluate(() => { window.__gp.game.timeScale = 6; });
  await page.waitForFunction(() => window.__gp.race.phase === 'race', null, { timeout: 180000 });
  await page.evaluate(() => { window.__gp.race.autopilot = true; window.__gp.game.timeScale = 1; });
  await page.waitForTimeout(4500);
  await page.screenshot({ path: OUT + 'v3-race-rain.png' });
});

await shot('v3-battle', async (page) => {
  await page.goto(BASE + '?nosw'); await page.waitForSelector('[data-go=quick]');
  await page.click('[data-go=quick]'); await page.waitForSelector('#go');
  await page.click('[data-seg=laps] [data-v="1"]'); await page.click('#go');
  await page.waitForSelector('#intro-skip', { timeout: 90000 }); await page.click('#intro-skip');
  await page.evaluate(() => { window.__gp.game.timeScale = 6; });
  await page.waitForFunction(() => window.__gp.race.phase === 'race', null, { timeout: 180000 });
  await page.evaluate(() => {
    const g = window.__gp.game, r = window.__gp.race;
    r.autopilot = true; g.timeScale = 1; g.camMode = 'chase';
    // teleport rivals close for a pack shot
    const me = r.player; const pack = r.order.filter(e => e !== me).slice(0, 3);
    pack.forEach((e, i) => { e.s = me.s + 4 + i * 2.2; e.d = (i - 1) * 1.4; e.v = me.v; });
  });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: OUT + 'v3-battle.png' });
});

if (!ONLY.length || ONLY.some(o => 'v3-mobile'.includes(o))) { // mobile landscape
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => {
    localStorage.setItem('gprl.profile.v1', JSON.stringify({ type: 'casual' }));
    localStorage.setItem('gprl.settings.v1', JSON.stringify({ graphics: 'MEDIUM', autoGfx: false, control: 'SEMI', camera: 'chase', dynRes: false }));
  });
  const page = await ctx.newPage();
  await page.goto(BASE + '?nosw');
  await page.waitForSelector('[data-go=quick], [data-x=casual]', { timeout: 30000 });
  if (await page.$('[data-x=casual]')) await page.tap('[data-x=casual]');
  await page.waitForSelector('[data-go=quick]'); await page.tap('[data-go=quick]'); await page.waitForSelector('#go'); await page.tap('#go');
  await page.waitForSelector('#intro-skip', { timeout: 90000 }); await page.tap('#intro-skip');
  await page.evaluate(() => { window.__gp.game.timeScale = 6; });
  await page.waitForFunction(() => window.__gp.race.phase === 'race', null, { timeout: 180000 });
  await page.evaluate(() => { window.__gp.race.autopilot = true; window.__gp.game.timeScale = 1; });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: OUT + 'v3-mobile-landscape.png' });
  await ctx.close(); console.log('shot v3-mobile-landscape');
}

await shot('v3-podium', async (page) => {
  await page.goto(BASE + '?nosw'); await page.waitForSelector('[data-go=quick]');
  await page.click('[data-go=quick]'); await page.waitForSelector('#go');
  await page.click('[data-seg=laps] [data-v="1"]'); await page.click('#go');
  await page.waitForSelector('#intro-skip', { timeout: 90000 }); await page.click('#intro-skip');
  await page.evaluate(() => { window.__gp.game.timeScale = 12; if (window.__gp.race.player) window.__gp.race.autopilot = true; });
  await page.waitForFunction(() => window.__gp.game.state === 'podium' || document.querySelector('#podium-skip'), null, { timeout: 300000 });
  await page.waitForTimeout(900);
  await page.screenshot({ path: OUT + 'v3-podium.png' });
});

await shot('v3-champ-calendar', async (page) => {
  await page.goto(BASE + '?nosw'); await page.waitForSelector('[data-go=champ]');
  await page.click('[data-go=champ]'); await page.waitForSelector('#go');
  await page.click('[data-seg=laps] [data-v=REAL]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: OUT + 'v3-champ-setup.png' });
  await page.click('#go'); await page.waitForSelector('.cal .calr');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: OUT + 'v3-champ-calendar.png' });
});

await browser.close();
console.log('done');
