import { chromium } from 'playwright-core';
const [url, out, w = 1700, h = 1300] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: +w, height: +h } });
await p.goto(url); await p.waitForTimeout(300);
await p.screenshot({ path: out, fullPage: true }); await b.close();
