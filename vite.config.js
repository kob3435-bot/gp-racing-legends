import { defineConfig } from 'vite';
import { readdirSync, statSync, writeFileSync, readFileSync } from 'fs';
import { join, relative } from 'path';
import { createHash } from 'crypto';

// Emits dist/sw.js precaching every built asset so single-player works offline (installable PWA).
function serviceWorker() {
  return {
    name: 'gprl-sw',
    apply: 'build',
    closeBundle() {
      const dist = join(process.cwd(), 'dist');
      const files = [];
      const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else files.push(relative(dist, p).split('\\').join('/')); } };
      walk(dist);
      const list = files.filter(f => f !== 'sw.js');
      const hash = createHash('sha1'); for (const f of list) hash.update(f + readFileSync(join(dist, f)).length);
      const version = hash.digest('hex').slice(0, 10);
      const sw = `// generated at build time
const CACHE = 'gprl-${version}';
const ASSETS = ${JSON.stringify(['./', ...list.map(f => './' + f)])};
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request).then((res) => {
    if (res.ok && new URL(e.request.url).origin === location.origin) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match('./index.html'))));
});
`;
      writeFileSync(join(dist, 'sw.js'), sw);
      console.log(`[sw] precache ${list.length} files, version ${version}`);
    },
  };
}

export default defineConfig({
  // GitHub Pages project path; override with BASE_PATH=/ (or ./) for other hosts
  base: process.env.BASE_PATH || '/gp-racing-legends/',
  build: { outDir: 'dist', target: 'es2020', chunkSizeWarningLimit: 1500 },
  plugins: [serviceWorker()],
  server: { host: '0.0.0.0' },
  preview: { host: '0.0.0.0', port: 4173 },
});
