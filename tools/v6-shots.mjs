// Capture the v6 screenshots into screenshots/v6-*.png (online race shot comes from tests/online.mjs --v6)
import { chromium } from 'playwright-core';
const BASE = process.argv[2] || 'http://localhost:4173/gp-racing-legends/';
const OUT = new URL('../screenshots/', import.meta.url).pathname;
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ONLY = (process.argv[3] || '').split(',').filter(Boolean);
async function shot(name, fn, track = 'siam') {
  if (ONLY.length && !ONLY.some(o => name.includes(o))) return;
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  await ctx.addInitScript((t) => {
    localStorage.setItem('gprl.profile.v1', JSON.stringify({ type: 'casual' }));
    localStorage.setItem('gprl.settings.v1', JSON.stringify({ graphics: 'HIGH', autoGfx: false, control: 'SEMI', camera: 'chase', dynRes: false, master: 0, music: 0 }));
    localStorage.setItem('gprl.lastrace.v1', JSON.stringify({ riderId: 'arrieta', trackId: t, laps: 1 }));
  }, track);
  const page = await ctx.newPage(); page.on('pageerror', e => console.log('ERR', name, e.message));
  await fn(page); await ctx.close(); console.log('shot', name);
}
async function race(page, weather = 'SUNNY') {
  await page.goto(BASE + '?nosw'); await page.waitForSelector('[data-go=quick]');
  await page.click('[data-go=quick]'); await page.waitForSelector('#go');
  await page.click(`[data-seg=weather] [data-v=${weather}]`); await page.click('[data-seg=laps] [data-v="1"]');
  await page.click('#go'); await page.waitForSelector('#intro-skip', { timeout: 90000 }); await page.click('#intro-skip');
  await page.evaluate(() => { window.__gp.game.timeScale = 6; });
  await page.waitForFunction(() => window.__gp.race.phase === 'race', null, { timeout: 180000 });
  await page.evaluate(() => { window.__gp.race.autopilot = true; window.__gp.game.timeScale = 1; window.__gp.game.camMode = 'chase'; });
}
await shot('v6-menu', async (page) => { await page.goto(BASE + '?nosw'); await page.waitForSelector('[data-go=quick]'); await page.waitForTimeout(1800); await page.screenshot({ path: OUT + 'v6-menu.png' }); });
await shot('v6-race', async (page) => { await race(page); await page.waitForFunction(() => window.__gp.race.player.v > 60, null, { timeout: 120000 }); await page.waitForTimeout(500); await page.screenshot({ path: OUT + 'v6-race-golden.png' }); });
await shot('v6-sunset', async (page) => { await race(page); await page.waitForTimeout(6000); await page.screenshot({ path: OUT + 'v6-race-sunset.png' }); }, 'southern');
await shot('v6-cutin', async (page) => {
  await race(page); await page.waitForTimeout(3000);
  await page.evaluate(() => { const g = window.__gp.game, p = window.__gp.race.player; g.focusFx = 1; g.lastCutin = -9; g.cutin(p, 'OVERTAKE!', 'P3 · ON BAGNAYA'); });
  await page.waitForTimeout(260); await page.screenshot({ path: OUT + 'v6-overtake-cutin.png' });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { const g = window.__gp.game; g.post.impact(); g.post.im.style.transition = 'none'; clearTimeout(g.post.imT); });
  await page.screenshot({ path: OUT + 'v6-impact-frame.png' });
});
await shot('v6-rain', async (page) => { await race(page, 'HEAVY_RAIN'); await page.waitForTimeout(4500); await page.screenshot({ path: OUT + 'v6-race-rain.png' }); });
await shot('v6-db', async (page) => { await page.goto(BASE + '?nosw'); await page.waitForSelector('[data-go=db]'); await page.click('[data-go=db]'); await page.waitForTimeout(1200); await page.screenshot({ path: OUT + 'v6-rider-database.png' }); });
await browser.close();
