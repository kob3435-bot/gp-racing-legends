import { portraitSVG } from './portrait.js';
// Manga-panel cut-in close-up (DOM + CSS transform/opacity animation only => no GPU cost, never blocks the sim).
// Brief (~1.1 s) and skippable (tap / any key). Off by default in online races.
let current = null;
export function showCutin(root, rider, title, sub = '') {
  if (current) current.remove();
  const el = document.createElement('div'); el.className = 'cutin';
  el.innerHTML = `<div class="ci-panel"><div class="ci-art">${portraitSVG(rider, 160)}</div><div class="ci-txt"><b>${title}</b><span>${rider.name}</span><small>${sub}</small></div></div>`;
  const kill = () => { if (el.isConnected) el.remove(); if (current === el) current = null; removeEventListener('keydown', kill, true); };
  el.addEventListener('pointerdown', kill); addEventListener('keydown', kill, true);
  el.addEventListener('animationend', (e) => { if (e.animationName === 'ciOut') kill(); });
  root.appendChild(el); current = el;
  return el;
}
