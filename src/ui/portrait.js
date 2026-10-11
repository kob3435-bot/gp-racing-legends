// Procedural anime-style rider portrait: helmeted bust in team colours with a key-art background
// (speed lines, halftone, hard cel shadow, glossy visor streak). Deliberately helmeted: no real likeness.
const cache = new Map();
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
export function portraitSVG(r, size = 96) {
  const key = r.id + '|' + size; if (cache.has(key)) return cache.get(key);
  const [c0, c1, c2] = r.helmet, h = hash(r.id), id = 'p' + (h % 1e6);
  const ang = 18 + (h % 30), design = h % 3, tilt = ((h >> 3) % 9) - 4;
  const lines = Array.from({ length: 14 }, (_, i) => { const a = (i / 14) * Math.PI * 2 + (h % 7) * 0.1; return `<path d="M50 44 L${50 + Math.cos(a - 0.05) * 90} ${44 + Math.sin(a - 0.05) * 90} L${50 + Math.cos(a + 0.05) * 90} ${44 + Math.sin(a + 0.05) * 90}Z"/>`; }).join('');
  const deco = design === 0 ? `<path d="M22 40 Q50 14 78 40 L74 46 Q50 24 26 46Z" fill="${c1}"/>`
    : design === 1 ? `<path d="M48 12 L56 12 L60 56 L44 56Z" fill="${c1}"/><path d="M30 22 L38 18 L36 54 L28 52Z" fill="${c2}"/>`
    : `<circle cx="64" cy="30" r="9" fill="${c1}"/><path d="M24 34 L44 20 L46 28 L28 42Z" fill="${c2}"/>`;
  const svg = `<svg class="portrait" viewBox="0 0 100 100" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
<defs><clipPath id="${id}c"><rect width="100" height="100" rx="6"/></clipPath>
<pattern id="${id}h" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(${ang})"><circle cx="2.5" cy="2.5" r="1.1" fill="#1a1426" opacity=".22"/></pattern>
<linearGradient id="${id}v" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2b3a6e"/><stop offset=".55" stop-color="#0d1024"/><stop offset="1" stop-color="#3b1d4a"/></linearGradient></defs>
<g clip-path="url(#${id}c)">
<rect width="100" height="100" fill="${c0}"/><path d="M0 100 L100 ${30 + (h % 30)} L100 100Z" fill="${c2}" opacity=".85"/>
<g fill="#fff" opacity=".28">${lines}</g><rect width="100" height="100" fill="url(#${id}h)"/>
<g transform="rotate(${tilt} 50 60)" stroke="#1a1426" stroke-width="2.6" stroke-linejoin="round">
<path d="M8 104 Q12 74 34 70 L66 70 Q88 74 92 104Z" fill="${c0}"/><path d="M40 70 L46 104 L54 104 L60 70Z" fill="${c1}" stroke-width="2"/>
<path d="M50 8 C24 8 16 30 18 50 C19 62 28 72 50 72 C72 72 81 62 82 50 C84 30 76 8 50 8Z" fill="${c0}"/>
${deco.replace(/<path /g, '<path stroke="none" ').replace(/<circle /g, '<circle stroke="none" ')}
<path d="M50 8 C76 8 84 30 82 50 C81 62 72 72 50 72 C64 64 70 40 62 14Z" fill="#1a1426" opacity=".28" stroke="none"/>
<path d="M22 40 Q50 30 79 40 L77 55 Q50 50 24 55Z" fill="url(#${id}v)"/>
<path d="M30 42 L52 38 L44 44 L28 47Z" fill="#fff" opacity=".9" stroke="none"/><path d="M58 40 L66 40 L62 43Z" fill="#9fe8ff" stroke="none"/>
</g>
<text x="90" y="94" text-anchor="end" font-family="Arial Black,Arial" font-style="italic" font-weight="900" font-size="22" fill="#fff" stroke="#1a1426" stroke-width="3" paint-order="stroke">${r.number}</text>
</g><rect width="100" height="100" rx="6" fill="none" stroke="#1a1426" stroke-width="3"/></svg>`;
  cache.set(key, svg); return svg;
}
