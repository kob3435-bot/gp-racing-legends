// Frame-pacing benchmark per mode (headless SwiftShader => absolute ms are slow; compare before/after only).
// Records every rAF interval through the start sequence (lights -> green) and racing, plus menu/spectator/online.
// Reports p50/p95/p99 frame time and hitch count (frame > 2x median and > 50 ms) + long tasks.
// Usage: node tools/frame-bench.mjs [url] [presets=LOW,MEDIUM] [out.json]
import { chromium } from 'playwright-core';
import { startRelay } from '../tests/relay-server.mjs';
const url = process.argv[2] || 'http://localhost:4173/gp-racing-legends/';
const presets = (process.argv[3] || 'LOW,MEDIUM').split(',');
const OUTF = process.argv[4];
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const stats = (a) => { const s = a.slice().sort((x, y) => x - y), q = (p) => s[Math.min(s.length - 1, Math.floor(s.length * p))]; const med = q(0.5); return { n: a.length, p50: +med.toFixed(1), p95: +q(0.95).toFixed(1), p99: +q(0.99).toFixed(1), max: +s[s.length - 1].toFixed(1), hitches: a.filter(x => x > Math.max(50, 2 * med)).length }; };
const rec = (page, ms) => page.evaluate((ms) => new Promise(r => { const out = []; let lt = 0; const po = new PerformanceObserver(l => { lt += l.getEntries().length; }); try { po.observe({ entryTypes: ['longtask'] }); } catch { } let last = performance.now(); const t0 = last; const f = (t) => { if (t - last > 300) (window.__long = window.__long || []).push({ ms: Math.round(t - last), at: Math.round(t - t0), phase: window.__gp?.race?.phase, state: window.__gp?.game?.state, lt: window.__gp?.race ? +(window.__gp.race.t).toFixed(2) : null }); out.push(t - last); last = t; if (t - t0 < ms) requestAnimationFrame(f); else { po.disconnect(); r({ out: out.slice(1), lt }); } }; requestAnimationFrame(f); }), ms);
async function ctxFor(preset, extra = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(([preset, extra]) => {
    localStorage.setItem('gprl.profile.v1', JSON.stringify({ type: 'experienced' }));
    localStorage.setItem('gprl.settings.v1', JSON.stringify({ graphics: preset, autoGfx: false, control: 'SEMI', camera: 'chase', dynRes: false, master: 0, music: 0, ...extra }));
    localStorage.setItem('gprl.lastrace.v1', JSON.stringify({ riderId: 'srisuk', trackId: 'siam', laps: 3 }));
  }, [preset, extra]);
  const page = await ctx.newPage(); page.errors = []; page.on('pageerror', e => page.errors.push(e.message));
  return { ctx, page };
}
const res = {};
const put = (k, r) => { res[k] = { ...stats(r.out), longTasks: r.lt }; console.log(k.padEnd(28), JSON.stringify(res[k])); };
for (const P of (process.env.ONLY === 'online' ? [] : presets)) {
  const { ctx, page } = await ctxFor(P);
  await page.goto(url + '?nosw'); await page.waitForSelector('[data-go=quick]', { timeout: 30000 }); await page.waitForTimeout(1500);
  put(`${P} menu`, await rec(page, 5000));
  // quick race: intro end -> lights -> green -> racing (captures warm-up + start transition)
  await page.click('[data-go=quick]'); await page.waitForSelector('#go'); await page.evaluate(() => document.getElementById('go').click());
  await page.waitForSelector('#intro-skip', { timeout: 90000 }); await page.waitForTimeout(800);
  const pr = rec(page, 14000); await page.click('#intro-skip'); put(`${P} quick: start+race`, await pr);
  await page.evaluate(() => { window.__gp.race.autopilot = true; });
  put(`${P} quick: racing`, await rec(page, 8000));
  // finish transition: force-finish -> podium
  const fr = rec(page, 7000); await page.evaluate(() => { const r = window.__gp.race; r.projectFinish(); r.player.finished = true; }); put(`${P} finish->podium`, await fr);
  await ctx.close();
  // spectator
  { const { ctx, page } = await ctxFor(P); await page.goto(url + '?nosw'); await page.waitForSelector('[data-go=spectator]'); await page.click('[data-go=spectator]'); await page.waitForSelector('#go'); await page.evaluate(() => document.getElementById('go').click());
    await page.waitForSelector('#intro-skip', { timeout: 90000 }); await page.click('#intro-skip'); await page.waitForFunction(() => window.__gp?.race?.phase === 'race', null, { timeout: 60000 }); await page.waitForTimeout(2000);
    put(`${P} spectator`, await rec(page, 8000)); await ctx.close(); }
}
// online: host + guest in one browser (shared CPU), via the loopback relay, LOW preset; normal and degraded network
const relay = startRelay(9013);
for (const net of ['normal', 'degraded']) {
  const q = '&relay=ws://localhost:9013' + (net === 'degraded' ? '&netlag=150&netjit=50&netloss=0.05' : '');
  const H = await ctxFor('LOW'), G = await ctxFor('LOW');
  await H.page.goto(url + '?nosw' + q); await H.page.click('[data-go=online]'); await H.page.click('#host'); await H.page.waitForSelector('#room-code');
  const code = (await H.page.textContent('#room-code')).trim();
  await G.page.goto(url + '?nosw&room=' + code + q, { timeout: 120000, waitUntil: 'domcontentloaded' });
  await H.page.waitForFunction(() => document.querySelectorAll('.pl.on').length === 2, null, { timeout: 30000 });
  const cards = await H.page.$$eval('#rp .rcard', c => c.map(x => x.dataset.rid));
  await H.page.click(`#rp .rcard[data-rid="${cards[0]}"]`); await G.page.waitForTimeout(300); await G.page.click(`#rp .rcard[data-rid="${cards[1]}"]`);
  await H.page.click('[data-seg=rounds] [data-v="2"]'); await H.page.click('[data-seg=laps] [data-v="1"]'); await H.page.waitForTimeout(500);
  await H.page.click('#ready'); await G.page.click('#ready'); await H.page.waitForFunction(() => !document.querySelector('#startS').disabled); await H.page.click('#startS');
  await G.page.waitForSelector('.cal .calr'); await H.page.click('#go');
  await Promise.all([H, G].map(x => x.page.waitForFunction(() => window.__net && document.getElementById('intro-skip'), null, { timeout: 90000 })));
  const [hr, gr] = await Promise.all([rec(H.page, 14000), rec(G.page, 14000)]);
  console.log('long frames host', JSON.stringify(await H.page.evaluate(() => window.__long)), 'guest', JSON.stringify(await G.page.evaluate(() => window.__long)));
  put(`online ${net}: host start+race`, hr); put(`online ${net}: guest start+race`, gr);
  await Promise.all([H, G].map(x => x.page.evaluate(() => { window.__gp.race.autopilot = true; })));
  const n = await G.page.evaluate(() => ({ delay: Math.round(window.__net.delay * 1000), extrap: +(100 * window.__net.metrics.extrapSteps / Math.max(1, window.__net.metrics.steps)).toFixed(1), rtt: Math.round(window.__online.ping) }));
  res[`online ${net}: guest buffer`] = n; console.log(`online ${net}: guest buffer`, JSON.stringify(n));
  await H.ctx.close(); await G.ctx.close();
}
relay.close();
if (OUTF) (await import('fs')).writeFileSync(OUTF, JSON.stringify(res, null, 1));
await browser.close();
