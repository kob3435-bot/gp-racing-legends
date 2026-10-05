import { chromium } from 'playwright-core';
const html = (s) => `<html><body style="margin:0"><div style="width:${s}px;height:${s}px;display:flex;flex-direction:column;align-items:center;justify-content:center;background:radial-gradient(circle at 30% 20%,#2a0b0a,#0b0c0f 70%);font-family:Arial Black,Arial;color:#fff;transform-origin:0 0">
<div style="font:italic 900 ${s * 0.36}px Arial Black;letter-spacing:-${s * 0.01}px;line-height:1;transform:skewX(-8deg)">GP</div>
<div style="background:#e10600;padding:${s * 0.02}px ${s * 0.05}px;font:italic 900 ${s * 0.1}px Arial;letter-spacing:${s * 0.01}px;transform:skewX(-8deg)">LEGENDS</div></div></body></html>`;
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
for (const s of [192, 512]) { const p = await b.newPage({ viewport: { width: s, height: s } }); await p.setContent(html(s)); await p.screenshot({ path: `public/icons/icon-${s}.png` }); await p.close(); }
await b.close(); console.log('icons ok');
