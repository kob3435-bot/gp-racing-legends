import RIDERS_RAW from './riders.json' with { type: 'json' };
import { computeOVR } from './attributes.js';
import { TEAM_BY_ID, TEAMS } from './teams.js';
import { BIKE_BY_ID, BIKES } from './bikes.js';
import { MANUFACTURER_BY_ID } from './manufacturers.js';

export const RIDERS = RIDERS_RAW.map(r => ({ ...r, ovr: computeOVR(r.attributes) }));
export const RIDER_BY_ID = Object.fromEntries(RIDERS.map(r => [r.id, r]));
export const CURRENT_GRID = RIDERS.filter(r => r.kind === 'current');
export const LEGENDS = RIDERS.filter(r => r.kind === 'legend');
export const ROOKIES = RIDERS.filter(r => r.kind === 'rookie');

export function displayName(r) { return r.version ? `${r.name} - ${r.version}` : r.name; }
export function shortName(r) { const p = r.name.split(' '); return (p.length > 1 ? p.slice(1).join(' ') : p[0]).toUpperCase(); }

const FACTORY_BY_MFR = {};
for (const b of BIKES) if (b.era === 2026 && !FACTORY_BY_MFR[b.manufacturer]) FACTORY_BY_MFR[b.manufacturer] = b.id;

// Resolve the bike a rider uses. mode: 'modern' (quick race / championship) or 'real' (era machine for legends).
export function riderBikeId(r, mode = 'modern') {
  if (r.team && TEAM_BY_ID[r.team]) return TEAM_BY_ID[r.team].bike;
  if (r.kind === 'legend') return mode === 'real' ? r.bike : FACTORY_BY_MFR[r.manufacturer] || 'ful-gp26';
  // rookies / test riders: wildcard on a satellite-spec machine
  const opts = ['sei-x26', 'kai-rc25', 'ven-gp25', 'bre-rr25', 'sor-m25'];
  return opts[r.number % opts.length];
}
export function riderBike(r, mode) { return BIKE_BY_ID[riderBikeId(r, mode)]; }
export function riderTeamName(r) {
  if (r.team && TEAM_BY_ID[r.team]) return TEAM_BY_ID[r.team].name;
  if (r.kind === 'legend') return `${MANUFACTURER_BY_ID[r.manufacturer]?.name || ''} Legends`;
  return 'Wildcard Entry';
}
export function riderTeamId(r) { return r.team || (r.kind === 'legend' ? 'legend-' + r.manufacturer : 'wildcard'); }
export function riderLivery(r) {
  if (r.team && TEAM_BY_ID[r.team]) return TEAM_BY_ID[r.team].colors;
  if (r.livery) return r.livery;
  return [r.helmet[0], r.helmet[1], '#151515'];
}
export { TEAMS };
