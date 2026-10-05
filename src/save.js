// Persistence (localStorage) for settings, stats, championship.
const K = { settings: 'gprl.settings.v1', stats: 'gprl.stats.v1', champ: 'gprl.championship.v1', profile: 'gprl.profile.v1', last: 'gprl.lastrace.v1' };
const read = (k, def) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? def; } catch { return def; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full / private mode */ } };

const isMobile = () => (navigator.maxTouchPoints > 0 && Math.min(screen.width, screen.height) < 820) || /Android|iPhone|iPad/i.test(navigator.userAgent);

export const DEFAULT_SETTINGS = () => ({
  control: 'SEMI', line: 'FULL', gear: 'AUTO', graphics: isMobile() ? 'LOW' : 'HIGH', autoGfx: true,
  camera: 'chase', master: 0.8, engine: 0.8, sfx: 0.7, music: 0.5, dynRes: true, tilt: false, showFps: false, units: 'kmh', difficulty: 'NORMAL',
});
export function loadSettings() { return { ...DEFAULT_SETTINGS(), ...read(K.settings, {}) }; }
export function saveSettings(s) { write(K.settings, s); }

export const DEFAULT_STATS = () => ({ races: 0, wins: 0, podiums: 0, fastestLaps: 0, poles: 0, distanceKm: 0, points: 0, championships: 0, bestLaps: {}, dnf: 0, lastPlayed: null });
export function loadStats() { return { ...DEFAULT_STATS(), ...read(K.stats, {}) }; }
export function saveStats(s) { write(K.stats, s); }

export function loadProfile() { return read(K.profile, null); }
export function saveProfile(p) { write(K.profile, p); }

export function loadChampionship() { return read(K.champ, null); }
export function saveChampionship(c) { if (c) write(K.champ, c); else localStorage.removeItem(K.champ); }
export function loadLastRace() { return read(K.last, null); }
export function saveLastRace(c) { write(K.last, c); }
export function resetAll() { for (const k of Object.values(K)) localStorage.removeItem(k); }
export { isMobile };
