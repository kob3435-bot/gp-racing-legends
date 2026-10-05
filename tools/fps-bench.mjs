// Rough relative FPS per graphics preset in headless Chromium (software GL => absolute numbers are far below real GPUs).
// Usage: node tools/fps-bench.mjs [url] [presets=LOW,MEDIUM,HIGH,ULTRA] [weather=SUNNY]
import { chromium } from 'playwright-core';
const url = process.argv[2] || 'http://localhost:4173/gp-racing-legends/';
const presets = (process.argv[3] || 'LOW,MEDIUM,HIGH,ULTRA').split(',');
const W = +(process.env.W || 1280), H = +(process.env.H || 720);
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
const out = {};
for (const p of presets) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await ctx.addInitScript((preset) => {
    localStorage.setItem('gprl.profile.v1', JSON.stringify({ type: 'experienced' }));
    localStorage.setItem('gprl.settings.v1', JSON.stringify({ graphics: preset, autoGfx: false, control: 'SEMI', camera: 'chase', dynRes: false }));
    localStorage.setItem('gprl.lastrace.v1', JSON.stringify({ riderId: 'srisuk', trackId: 'siam', laps: 3 }));
  }, p);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(url + (url.includes('?') ? '&' : '?') + 'nosw');
  await page.waitForSelector('[data-go=quick]', { timeout: 30000 });
  // menu FPS
  const menuFps = await page.evaluate(() => new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else r(n / ((performance.now() - t0) / 1000)); }; requestAnimationFrame(f); }));
  await page.click('[data-go=quick]'); await page.waitForSelector('#go');
  await page.waitForTimeout(500);
  await page.evaluate(() => document.getElementById('go').click());
  await page.waitForSelector('#intro-skip', { timeout: 60000 }); await page.click('#intro-skip');
  await page.evaluate(() => { window.__gp.game.timeScale = 6; });
  await page.waitForFunction(() => window.__gp?.race?.phase === 'race', null, { timeout: 180000 });
  await page.evaluate(() => { window.__gp.race.autopilot = true; window.__gp.game.timeScale = 1; });
  await page.waitForTimeout(4000);
  const raceFps = await page.evaluate(() => new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 8000) requestAnimationFrame(f); else r(n / ((performance.now() - t0) / 1000)); }; requestAnimationFrame(f); }));
  const info = await page.evaluate(() => { const g = window.__gp.game; const i = g.renderer.info; return { calls: i.render.calls, tris: i.render.triangles, pr: g.renderer.getPixelRatio() }; });
  out[p] = { menuFps: +menuFps.toFixed(1), raceFps: +raceFps.toFixed(1), ...info, errors: errors.length };
  console.log(p, JSON.stringify(out[p]));
  await ctx.close();
}
await browser.close();
