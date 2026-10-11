// v7 landscape handling for phones/tablets (desktop untouched):
// - first tap: fullscreen + screen.orientation.lock('landscape') where supported (Android Chrome / installed PWA)
// - otherwise (iOS Safari): CSS-only full-screen "rotate your device" overlay in portrait (#rotate, media query),
//   which blocks input; a single-player race auto-pauses while the device is portrait.
// (A CSS 90deg-rotated container was rejected: it breaks touch coordinates, safe areas and the iOS keyboard/URL bar.)
export function installOrientation(getGame) {
  const coarse = matchMedia('(pointer: coarse)').matches;
  if (!coarse) return { coarse };
  const tryLock = async () => {
    try {
      const d = document.documentElement;
      if (!document.fullscreenElement && d.requestFullscreen) await d.requestFullscreen({ navigationUI: 'hide' });
    } catch { /* not allowed (iOS) */ }
    try { if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape'); } catch { /* unsupported -> overlay handles it */ }
  };
  addEventListener('pointerdown', tryLock, { once: true, capture: true });
  const mq = matchMedia('(orientation: portrait)');
  const onChange = () => { const g = getGame(); if (mq.matches && g && g.race && !g.net && !g.paused && g.state !== 'results' && g.state !== 'podium') g.pause(); };
  mq.addEventListener ? mq.addEventListener('change', onChange) : mq.addListener(onChange);
  return { coarse };
}
