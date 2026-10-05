// Loads a deployed URL in headless Chromium: checks console errors, main menu, PWA manifest + service worker scope.
// Usage: node tools/verify-live.mjs <url> [screenshot.png]
import { chromium } from 'playwright-core';
const url = process.argv[2]; const shot = process.argv[3];
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1366, height: 768 } })).newPage();
const errors = []; const failed = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('response', r => { if (r.status() >= 400) failed.push(r.status() + ' ' + r.url()); });
await page.goto(url, { waitUntil: 'load' });
await page.waitForSelector('[data-x=casual]', { timeout: 30000 }); await page.click('[data-x=casual]');
await page.waitForSelector('[data-go=quick]', { timeout: 15000 });
const items = await page.$$eval('.mm-item b', els => els.map(e => e.textContent));
const pwa = await page.evaluate(async () => {
  const reg = await Promise.race([navigator.serviceWorker.ready, new Promise(r => setTimeout(() => r(null), 15000))]);
  const href = document.querySelector('link[rel=manifest]').href; const m = await (await fetch(href)).json();
  return { swScope: reg && reg.scope, swScript: reg && reg.active && reg.active.scriptURL, manifest: href, startUrl: new URL(m.start_url, href).href, scope: new URL(m.scope, href).href, caches: await caches.keys() };
});
await page.mouse.move(5, 760); await page.waitForTimeout(1500);
if (shot) await page.screenshot({ path: shot });
console.log(JSON.stringify({ menu: items, pwa, errors, failed }, null, 2));
await browser.close();
process.exit(errors.length || failed.length || items.length !== 7 ? 1 : 0);
