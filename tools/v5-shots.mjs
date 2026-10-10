// v5 screenshot: Settings showing the 4 control modes with PRO ASSIST selected (+ online lobby picker check)
import { chromium } from 'playwright-core';
const BASE = process.argv[2] || 'http://localhost:4173/gp-racing-legends/';
const OUT = new URL('../screenshots/', import.meta.url).pathname;
const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.addInitScript(() => { localStorage.setItem('gprl.profile.v1', '{"type":"experienced"}'); if (!localStorage.getItem('gprl.settings.v1')) localStorage.setItem('gprl.settings.v1', JSON.stringify({ graphics: 'LOW', autoGfx: false, music: 0, master: 0 })); });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto(BASE + '?nosw'); await p.click('[data-go=settingsScreen]'); await p.click('[data-seg=control] [data-v=PRO]');
const labels = await p.$$eval('[data-seg=control] button', x => x.map(e => e.textContent));
const desc = await p.textContent('#ctlDesc');
await p.screenshot({ path: OUT + 'v5-control-modes.png' });
await p.reload(); await p.click('[data-go=settingsScreen]');
const persisted = await p.textContent('[data-seg=control] button.on');
await p.click('[data-back]'); await p.click('[data-go=online]'); await p.click('#host'); await p.waitForSelector('#myctl');
const lobby = await p.textContent('#myctl [data-seg=control] button.on');
console.log(JSON.stringify({ labels, desc, persisted, lobby, errs }));
await b.close();
