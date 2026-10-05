// Authoring helper: expands compact rider profiles into explicit attribute data (src/data/riders.json).
// The JSON is the shipped data layer; edit it directly or re-run this tool. Target tiers are only an
// authoring aid used to calibrate the base level — the OVR in game is ALWAYS computed from attributes.
import { writeFileSync } from 'fs';
import { ATTRS, HIDDEN, computeOVR } from '../src/data/attributes.js';

const AB = { sp: 'speed', ac: 'acceleration', br: 'braking', ce: 'cornerEntry', mc: 'midCorner', cx: 'cornerExit', tc: 'throttleControl', rp: 'racePace', q: 'qualifying', ov: 'overtaking', de: 'defending', rc: 'racecraft', cn: 'consistency', wt: 'wet', tm: 'tireManagement', bc: 'bikeControl', ag: 'aggression', re: 'reaction', me: 'mental', cl: 'clutch', rk: 'riskTaking', lb: 'lateBrakingConfidence', ss: 'slipstreamUsage', pr: 'pressureResistance', st: 'startReaction' };
function parseMods(s) { const o = {}; for (const t of (s || '').split(/\s+/).filter(Boolean)) { const m = t.match(/^([a-z]+)([+-]\d+)$/); if (!m) throw new Error('bad mod ' + t); o[AB[m[1]]] = +m[2]; } return o; }
function hash(str) { let h = 2166136261; for (const c of str) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let s = seed; return () => { s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9) >>> 0; s ^= s >>> 13; return (s >>> 0) / 4294967296; }; }

// kind: current | rookie | legend
// [id, name, num, nat, kind, version, team, bike, styles, personality, helmet[3], targetOVR, mods, hiddenMods, extra]
const R = [];
const add = (o) => R.push(o);
const cur = (id, name, num, nat, team, styles, pers, helmet, target, mods, hid, extra = {}) => add({ id, name, number: num, nationality: nat, kind: 'current', team, styles, personality: pers, helmet, target, mods, hid, ...extra });
const rook = (id, name, num, nat, styles, pers, helmet, target, mods, hid, extra = {}) => add({ id, name, number: num, nationality: nat, kind: 'rookie', team: null, styles, personality: pers, helmet, target, mods, hid, ...extra });
const leg = (id, name, num, nat, version, primeYear, eraYears, bike, mfr, styles, pers, helmet, livery, target, mods, hid, extra = {}) => add({ id, name, number: num, nationality: nat, kind: 'legend', version, primeYear, eraYears, bike, manufacturer: mfr, styles, personality: pers, helmet, livery, target, mods, hid, ...extra });

// ---------------- CURRENT GRID (fictional 2026 season) ----------------
cur('arrieta', 'Mateo Arrieta', 39, 'ESP', 'ful-factory', ['Aggressive Attacker', 'Front-End Feel'], 'AGGRESSIVE', ['#ff2d2d', '#111111', '#ffd400'], 95, 'br+3 ce+4 ov+4 bc+5 rc+3 ag+8 cn-6 tm-8 wt-2 q+2 me+2 re-3', 'rk+14 lb+12 ss+2 pr+4 st+2', { age: 33, strengths: 'Superhuman front-end saves, ruthless late-race attacks.', weaknesses: 'Pushes beyond the limit; tyres can fade when he chases.' });
cur('bellandi', 'Nico Bellandi', 18, 'ITA', 'ful-factory', ['Late Brake Master', 'Smooth Operator'], 'LATE BRAKER', ['#ffffff', '#c8102e', '#1a1a1a'], 93, 'br+6 ce+4 cx+1 mc-1 cn+2 q+3 de+1 ov-2 wt-8 tm+1 cl-3', 'rk+2 lb+12 ss+0 pr-2 st+0', { age: 29, strengths: 'Ferocious braking stability and front-running pace.', weaknesses: 'Can lose confidence when the front tyre talks back; average in the wet.' });
cur('vitale', 'Tommaso Vitale', 49, 'ITA', 'ful-apex', ['Smooth Operator'], 'CALCULATED', ['#ffd400', '#6a1fb5', '#ffffff'], 85, 'cn+3 tm+3 q-2 ov-1 mc+2', 'rk-4 lb+0', { age: 27, strengths: 'Tidy and consistent over race distance.', weaknesses: 'Lacks a killer qualifying lap.' });
cur('ferran', 'Joaquín Ferrán', 33, 'ARG', 'ful-apex', ['Aggressive Attacker'], 'AGGRESSIVE', ['#74acdf', '#ffffff', '#f6b40e'], 81, 'ag+8 ov+4 cn-4 rc+1 tm-2', 'rk+8 lb+5', { age: 25, strengths: 'Brave in close fights, great on lap one.', weaknesses: 'Erratic consistency, wears the rear tyre.' });
cur('ferrer', 'Jordi Ferrer', 36, 'ESP', 'kai-works', ['Tire Whisperer', 'Smooth Operator'], 'TIRE SAVER', ['#f4c300', '#0b2a6f', '#ffffff'], 85, 'tm+7 cn+4 rp+1 q-4 sp-2 ag-2', 'rk-4', { age: 28, strengths: 'Brilliant tyre conservation, strong in the final laps.', weaknesses: 'Weak qualifier, starts too far back.' });
cur('brandao', 'Lucas Brandão', 10, 'BRA', 'kai-works', ['Corner Speed Specialist'], 'SMOOTH', ['#009c3b', '#ffdf00', '#002776'], 82, 'mc+4 cx+2 br-2 ov-1', 'rk+0', { age: 26, strengths: 'Fluid mid-corner speed in fast sweepers.', weaknesses: 'Struggles in hard braking zones.' });
cur('ishida', 'Takeru Ishida', 32, 'JPN', 'kai-tide', ['Smooth Operator'], 'CALCULATED', ['#ffffff', '#bc002d', '#111111'], 79, 'cn+4 tm+2 ag-4 ov-2', 'rk-6', { age: 25, strengths: 'Rarely makes mistakes.', weaknesses: 'Too polite when overtaking.' });
cur('hartigan', 'Ollie Hartigan', 43, 'AUS', 'kai-tide', ['Aggressive Attacker', 'Launch Specialist'], 'AGGRESSIVE', ['#00843d', '#ffcd00', '#012169'], 81, 'cl+8 re+5 ag+7 ov+3 cn-5 wt+3', 'rk+10 st+10', { age: 31, strengths: 'Rocket starts and fearless dives.', weaknesses: 'Crashes and fades in long runs.' });
cur('rousselin', 'Théo Rousselin', 27, 'FRA', 'sor-factory', ['Corner Speed Specialist', 'Qualifying Ace'], 'SMOOTH', ['#0055a4', '#ffffff', '#ef4135'], 91, 'mc+6 ce+3 cx+2 q+5 ov-3 de-2 br-2 tm+1', 'rk+0 lb-3', { age: 27, strengths: 'Sublime corner speed and qualifying laps.', weaknesses: 'Finds it hard to overtake on slower straights.' });
cur('reyna', 'Álex Reyna', 42, 'ESP', 'sor-factory', ['Smooth Operator'], 'CALCULATED', ['#1546c7', '#ffffff', '#f2a900'], 84, 'mc+2 tm+2 wt+3 cn-1', 'rk+0', { age: 30, strengths: 'Good feel in mixed conditions.', weaknesses: 'Peaks and troughs in form.' });
cur('fenzi', 'Dario Fenzi', 21, 'ITA', 'sor-horizon', ['Smooth Operator'], 'SMOOTH', ['#00c389', '#ffffff', '#101820'], 80, 'mc+3 tm+2 ag-3', 'rk-2', { age: 31, strengths: 'Silky on a Sorami.', weaknesses: 'Lacks aggression in battles.' });
cur('saldanha', 'Rui Saldanha', 81, 'POR', 'sor-horizon', ['Defensive Master'], 'DEFENSIVE', ['#006600', '#ff0000', '#ffcc00'], 82, 'de+7 rc+2 q-2 wt+2', 'rk-2', { age: 30, strengths: 'Very hard to pass.', weaknesses: 'Qualifying pace is ordinary.' });
cur('morimoto', 'Kenta Morimoto', 26, 'JPN', 'sei-arrow', ['Tire Whisperer'], 'TIRE SAVER', ['#14a6b8', '#ffffff', '#0d1b2a'], 78, 'tm+6 cn+2 sp-2 q-3', 'rk-4', { age: 29, strengths: 'Looks after tyres.', weaknesses: 'Slow over one lap.' });
cur('srisuk', 'Thanakorn Srisuk', 41, 'THA', 'sei-arrow', ['Wet Master', 'Aggressive Attacker'], 'RAIN MASTER', ['#2d2a4a', '#ed1c24', '#ffffff'], 79, 'wt+12 ag+4 ov+3 cn-3 q-1', 'rk+4', { age: 22, potential: 90, strengths: 'Fearless and fast when it rains; improving every race.', weaknesses: 'Raw consistency and race management.' });
cur('almagro', 'Pedro Almagro', 71, 'ESP', 'bre-factory', ['Aggressive Attacker', 'Late Brake Master'], 'AGGRESSIVE', ['#ff7f11', '#ffffff', '#111111'], 89, 'br+4 ov+6 ag+8 bc+3 cn-5 tm-4 me-1 re+3', 'rk+12 lb+10 st+4', { age: 22, potential: 97, strengths: 'Generational talent, ferocious overtaker.', weaknesses: 'Young: tyre management and patience still developing.' });
cur('visagie', 'Ruan Visagie', 13, 'RSA', 'bre-factory', ['Late Brake Master', 'Defensive Master'], 'LATE BRAKER', ['#007a4d', '#ffb612', '#000000'], 86, 'br+6 de+5 ov+3 mc-3 q-2', 'rk+6 lb+12', { age: 30, strengths: 'Outrageous late braking, tough racer.', weaknesses: 'Mid-corner speed and qualifying.' });
cur('valdrighi', 'Enea Valdrighi', 23, 'ITA', 'bre-titan', ['Tire Whisperer'], 'TIRE SAVER', ['#b0b7bf', '#ff7f11', '#1c1c1c'], 85, 'tm+8 rp+2 q-4 cn-2 cx+2', 'rk+0', { age: 28, strengths: 'Ferocious final laps on worn tyres.', weaknesses: 'Starts slowly, weak qualifying.' });
cur('salvat', 'Iker Salvat', 12, 'ESP', 'bre-titan', ['Qualifying Ace', 'Corner Speed Specialist'], 'QUALIFYING SPECIALIST', ['#0a0a0a', '#ff3c00', '#ffffff'], 85, 'q+7 mc+3 cn-5 me-4 cl-3', 'rk+0 pr-6 st-4', { age: 31, strengths: 'Stunning single-lap speed.', weaknesses: 'Inconsistent starts and race-day form.' });
cur('montero', 'Raúl Montero', 78, 'ESP', 'ven-squadra', ['Qualifying Ace', 'Launch Specialist'], 'QUALIFYING SPECIALIST', ['#9be000', '#111111', '#ffffff'], 92, 'q+7 cl+6 re+5 br+2 ag+3 tm-3 wt-2 cn-2', 'rk+6 lb+6 st+10', { age: 28, strengths: 'Explosive starts and one-lap speed.', weaknesses: 'Tyre life in long races.' });
cur('ravelli', 'Gianluca Ravelli', 72, 'ITA', 'ven-squadra', ['Smooth Operator', 'Corner Speed Specialist'], 'SMOOTH', ['#ffffff', '#9be000', '#000000'], 88, 'mc+4 cx+2 cn-1 tm+2', 'rk+2', { age: 27, strengths: 'Fast and flowing, great in fast sweepers.', weaknesses: 'Occasional off-days.' });
cur('takahashi', 'Sora Takahashi', 57, 'JPN', 'ven-siam', ['Smooth Operator', 'Tire Whisperer'], 'CALCULATED', ['#ffffff', '#d4af37', '#b3001b'], 83, 'tm+5 cn+4 rc+2 q-3 ag-3', 'rk-4', { age: 25, strengths: 'Mature, intelligent racer.', weaknesses: 'Lacks single-lap aggression.' });
cur('elorza', 'Santi Elorza', 54, 'ESP', 'ven-siam', ['Aggressive Attacker'], 'AGGRESSIVE', ['#d4af37', '#b3001b', '#ffffff'], 84, 'ov+5 ag+7 br+3 cn-4 tm-2', 'rk+10 lb+8', { age: 21, potential: 92, strengths: 'Bold and quick to learn.', weaknesses: 'Overcooks it under pressure.' });
// ---------------- ROOKIES / TEST RIDERS ----------------
rook('kaewdee', 'Nattapong Kaewdee', 94, 'THA', ['Wet Master'], 'RAIN MASTER', ['#ffffff', '#0033a0', '#ed1c24'], 74, 'wt+10 ag+3 cn-4 rc-3', 'rk+4', { age: 19, potential: 91, strengths: 'Natural feel in the rain, huge potential.', weaknesses: 'Raw racecraft and consistency.' });
rook('paredes', 'Diego Paredes', 96, 'ESP', ['Aggressive Attacker'], 'AGGRESSIVE', ['#c60b1e', '#ffc400', '#000000'], 76, 'ag+7 ov+4 cn-4', 'rk+8', { age: 20, potential: 89, strengths: 'Fearless rookie.', weaknesses: 'Crash-prone.' });
rook('tanabe', 'Hiro Tanabe', 30, 'JPN', ['Smooth Operator'], 'CALCULATED', ['#ffffff', '#111111', '#bc002d'], 78, 'cn+5 tm+3 ag-5 q-2', 'rk-6', { age: 34, strengths: 'Experienced test rider, precise feedback.', weaknesses: 'Not a natural racer.' });
rook('carrow', 'Finn Carrow', 4, 'GBR', ['Late Brake Master'], 'LATE BRAKER', ['#012169', '#c8102e', '#ffffff'], 75, 'br+5 wt+5 cn-3', 'lb+8', { age: 20, potential: 90, strengths: 'Late on the brakes, good in the wet.', weaknesses: 'Mid-corner speed.' });
rook('hakala', 'Sami Hakala', 8, 'FIN', ['Defensive Master'], 'DEFENSIVE', ['#ffffff', '#003580', '#99ccff'], 73, 'de+6 wt+4 q-3', 'rk-2', { age: 19, potential: 88, strengths: 'Cool head, good defender.', weaknesses: 'Lacks top-end pace.' });

// ---------------- LEGENDS 2000-2025 (prime versions) ----------------
const VAL = ['#ffe500', '#1a1a1a', '#2fbf4a'];
leg('valtieri-2002', 'Enzo Valtieri', 64, 'ITA', '2002 Rising', 2002, '2000-2012', 'kai-990', 'kairyu', ['Aggressive Attacker', 'Smooth Operator'], 'CALCULATED', VAL, ['#ffcc00', '#0a3d91', '#ffffff'], 93, 'rc+5 ov+5 me+4 tm+1 q-8 cl-5 wt-3 re-4 ag+3', 'rk+4 lb+6 pr+8', { strengths: 'Supreme racecraft and mind games.', weaknesses: 'Qualifying not yet his forte.' });
leg('valtieri-2005', 'Enzo Valtieri', 64, 'ITA', '2005 Prime', 2005, '2000-2012', 'sor-990', 'sorami', ['Smooth Operator', 'Aggressive Attacker', 'Tire Whisperer'], 'CALCULATED', VAL, ['#1d3fa8', '#ffffff', '#ffd200'], 97, 'rc+5 ov+4 me+5 tm+3 q-9 re-7 cl-6 sp-4 wt-3 cn+1', 'rk+2 lb+6 pr+10', { strengths: 'Unmatched race intelligence and tyre feel; late-race killer.', weaknesses: 'Qualifying was rarely his weapon.' });
leg('valtieri-2009', 'Enzo Valtieri', 64, 'ITA', '2009 Veteran', 2009, '2000-2012', 'sor-800', 'sorami', ['Smooth Operator', 'Defensive Master'], 'CALCULATED', VAL, ['#1d3fa8', '#ffffff', '#ffd200'], 93, 'rc+6 de+4 me+5 tm+3 q-9 sp-6 re-7 ac-5', 'rk-2 lb+4 pr+10', { strengths: 'Racecraft and experience peak.', weaknesses: 'Raw speed starting to fade.' });
const ARR = ['#ff2d2d', '#111111', '#ffd400'];
leg('arrieta-2013', 'Mateo Arrieta', 39, 'ESP', '2013 Rookie', 2013, '2013-2026', 'kai-1000', 'kairyu', ['Aggressive Attacker', 'Front-End Feel'], 'AGGRESSIVE', ARR, ['#ff6a00', '#0b2a6f', '#f5f5f5'], 92, 'br+4 bc+6 ag+10 ov+5 cn-8 tm-9 me-3 de-4', 'rk+18 lb+14', { strengths: 'Astonishing saves and audacious passes.', weaknesses: 'Rookie impatience, tyre abuse.' });
leg('arrieta-2014', 'Mateo Arrieta', 39, 'ESP', '2014 Prime', 2014, '2013-2026', 'kai-1000', 'kairyu', ['Aggressive Attacker', 'Front-End Feel', 'Qualifying Ace'], 'AGGRESSIVE', ARR, ['#ff6a00', '#0b2a6f', '#f5f5f5'], 96, 'br+4 bc+6 ag+8 ov+4 q+3 cn-6 tm-9 wt-4 de-4', 'rk+16 lb+14 st+2', { strengths: 'Relentless winning streak form; unreal front-end feel.', weaknesses: 'Can push the tyres beyond their limit.' });
leg('arrieta-2019', 'Mateo Arrieta', 39, 'ESP', '2019 Prime', 2019, '2013-2026', 'kai-2019', 'kairyu', ['Aggressive Attacker', 'Front-End Feel'], 'CALCULATED', ARR, ['#ff6a00', '#0b2a6f', '#f5f5f5'], 97, 'br+3 bc+6 ag+5 ov+4 q+2 tm-7 wt-5 de-3 me+3', 'rk+10 lb+12 pr+6', { strengths: 'Complete package: speed, saves, and maturity.', weaknesses: 'Tyre management only good, not great.' });
const BRN = ['#ffffff', '#c8102e', '#0b2a6f'];
leg('brennock-2006', 'Callum Brennock', 17, 'AUS', '2006 Rookie', 2006, '2006-2012', 'kai-990', 'kairyu', ['Corner Speed Specialist', 'Front-End Feel'], 'SMOOTH', BRN, ['#00a3e0', '#ffffff', '#e4002b'], 86, 'bc+6 mc+4 cx+4 cn-8 rc-3 me-3', 'rk+10', { strengths: 'Breathtaking natural speed.', weaknesses: 'Crashes a lot as a rookie.' });
leg('brennock-2007', 'Callum Brennock', 17, 'AUS', '2007 Prime', 2007, '2006-2012', 'ful-800', 'fulminor', ['Corner Speed Specialist', 'Front-End Feel'], 'SMOOTH', BRN, ['#cf0a0a', '#ffffff', '#222222'], 95, 'bc+7 cx+5 tc+5 mc+3 rc-6 de-9 me-4 tm-3 q+1', 'rk+4 lb+2', { strengths: 'Tames any machine; inch-perfect throttle control.', weaknesses: 'Prefers to lead from the front rather than scrap.' });
leg('brennock-2011', 'Callum Brennock', 17, 'AUS', '2011 Prime', 2011, '2006-2012', 'kai-800', 'kairyu', ['Corner Speed Specialist', 'Front-End Feel', 'Qualifying Ace'], 'CALCULATED', BRN, ['#ff6a00', '#0b2a6f', '#f5f5f5'], 95, 'bc+6 cx+4 tc+4 q+3 rc-5 de-8 me-3', 'rk+2', { strengths: 'Fastest man on the grid, devastating qualifying.', weaknesses: 'Close-quarter battles are not his favourite.' });
const ORT = ['#e1e1e1', '#ff0099', '#111111'];
leg('ortell-2008', 'Javi Ortell', 48, 'ESP', '2008 Rookie', 2008, '2008-2019', 'sor-800', 'sorami', ['Smooth Operator', 'Qualifying Ace'], 'SMOOTH', ORT, ['#1d3fa8', '#ffffff', '#ffd200'], 88, 'mc+4 q+5 cn-3 wt-6 ov-3 ag-3', 'rk+4', { strengths: 'Precise lines and qualifying pace.', weaknesses: 'Big crashes as a rookie, poor in the wet.' });
leg('ortell-2010', 'Javi Ortell', 48, 'ESP', '2010 Prime', 2010, '2008-2019', 'sor-800', 'sorami', ['Smooth Operator', 'Corner Speed Specialist'], 'SMOOTH', ORT, ['#1d3fa8', '#ffffff', '#ffd200'], 95, 'mc+6 cn+5 ce+3 q+3 wt-12 ov-8 ag-12 de-5', 'rk-4', { strengths: 'Metronomic consistency, perfect lines.', weaknesses: 'Weak in rain and in tight brawls.' });
leg('ortell-2015', 'Javi Ortell', 48, 'ESP', '2015 Prime', 2015, '2008-2019', 'sor-1000', 'sorami', ['Smooth Operator', 'Corner Speed Specialist', 'Launch Specialist'], 'SMOOTH', ORT, ['#1d3fa8', '#ffffff', '#ffd200'], 96, 'mc+6 cn+5 ce+3 cl+6 re+4 q+3 wt-11 ov-8 ag-12 de-4', 'rk-4 st+8', { strengths: 'Lights-to-flag precision; leads and disappears.', weaknesses: 'Vulnerable in the wet and in aggressive dogfights.' });
const PEL = ['#ffffff', '#ff6a00', '#111111'];
leg('pellicer-2007', 'Dario Pellicer', 22, 'ESP', '2007 Prime', 2007, '2006-2018', 'kai-800', 'kairyu', ['Launch Specialist', 'Smooth Operator'], 'CALCULATED', PEL, ['#ff6a00', '#0b2a6f', '#f5f5f5'], 91, 'cl+9 re+6 ac+5 q+3 de-9 ov-7 wt-10 ag-10 bc-3', 'rk-4 st+12', { strengths: 'Explosive starts and corner exits.', weaknesses: 'Light frame: struggles in wheel-to-wheel fights and rain.' });
leg('pellicer-2012', 'Dario Pellicer', 22, 'ESP', '2012 Prime', 2012, '2006-2018', 'kai-1000', 'kairyu', ['Launch Specialist', 'Smooth Operator'], 'CALCULATED', PEL, ['#ff6a00', '#0b2a6f', '#f5f5f5'], 93, 'cl+9 re+6 ac+5 q+3 de-9 ov-6 wt-9 ag-9', 'rk-2 st+12', { strengths: 'Peak form: blistering pace and launches.', weaknesses: 'Defending and rain remain weaknesses.' });
const HAR = ['#ffffff', '#c8102e', '#002868'];
leg('harlan-2003', 'Wade Harlan', 96, 'USA', '2003 Rookie', 2003, '2003-2016', 'kai-990', 'kairyu', ['Aggressive Attacker'], 'AGGRESSIVE', HAR, ['#ffcc00', '#0a3d91', '#ffffff'], 82, 'ag+6 rc+3 cn-2 q-4 tm-2', 'rk+6', { strengths: 'Hard-charging dirt-track style.', weaknesses: 'Rookie inconsistency.' });
leg('harlan-2006', 'Wade Harlan', 96, 'USA', '2006 Prime', 2006, '2003-2016', 'kai-990', 'kairyu', ['Defensive Master', 'Smooth Operator'], 'DEFENSIVE', HAR, ['#ffcc00', '#0a3d91', '#ffffff'], 90, 'cn+6 rc+4 de+5 me+5 q-7 sp-5 ov-2', 'rk-2 pr+8', { strengths: 'Relentlessly consistent title-winning season.', weaknesses: 'Lacks raw one-lap speed.' });
leg('bertolli-2001', 'Massimo Bertolli', 31, 'ITA', '2001 Prime', 2001, '2000-2005', 'sor-990', 'sorami', ['Smooth Operator', 'Corner Speed Specialist'], 'SMOOTH', ['#111111', '#c0c0c0', '#c8102e'], ['#1d3fa8', '#ffffff', '#ffd200'], 91, 'mc+4 cn+3 q+3 wt-9 rc-3 me-5', 'rk-2 pr-6', { strengths: 'Exceptionally smooth and precise.', weaknesses: 'Wet weather and pressure moments.' });
leg('serafini-2011', 'Luca Serafini', 85, 'ITA', '2011 Prime', 2011, '2008-2011', 'kai-800', 'kairyu', ['Aggressive Attacker', 'Late Brake Master'], 'AGGRESSIVE', ['#ff7300', '#111111', '#ffffff'], ['#ff6a00', '#ffffff', '#111111'], 87, 'ag+10 ov+6 br+4 cn-6 tm-3 de+2', 'rk+14 lb+12', { strengths: 'Spectacular, fearless overtaker.', weaknesses: 'Contact-prone and inconsistent.' });
leg('ferrante-2017', 'Paolo Ferrante', 14, 'ITA', '2017 Prime', 2017, '2008-2020', 'ful-1000', 'fulminor', ['Late Brake Master', 'Tire Whisperer'], 'CALCULATED', ['#c8102e', '#ffffff', '#00a651'], ['#cf0a0a', '#ffffff', '#222222'], 91, 'br+6 tm+4 rc+4 me+3 mc-7 q-6 ce+2', 'rk-2 lb+10', { strengths: 'Last-lap braking ambushes, clever strategist.', weaknesses: 'Mid-corner speed and qualifying.' });
leg('rousselin-2021', 'Théo Rousselin', 27, 'FRA', '2021 Prime', 2021, '2019-2026', 'sor-2021', 'sorami', ['Corner Speed Specialist', 'Qualifying Ace'], 'SMOOTH', ['#0055a4', '#ffffff', '#ef4135'], ['#1546c7', '#0a0a0a', '#e8e8e8'], 93, 'mc+6 ce+3 cx+3 q+5 ov-6 de-5 br-3 cn+1', 'rk+0', { strengths: 'Title-winning corner speed.', weaknesses: 'Overtaking on straights.' });
leg('bellandi-2023', 'Nico Bellandi', 18, 'ITA', '2023 Prime', 2023, '2019-2026', 'ful-2023', 'fulminor', ['Late Brake Master', 'Smooth Operator'], 'LATE BRAKER', ['#ffffff', '#c8102e', '#1a1a1a'], ['#c8102e', '#f2f2f2', '#1a1a1a'], 95, 'br+6 ce+4 cn+3 q+3 tm+2 wt-8 ov-3 cl-4', 'rk+0 lb+12', { strengths: 'Championship-level braking and pace.', weaknesses: 'Occasional front-end crashes; average wet pace.' });
leg('montero-2024', 'Raúl Montero', 78, 'ESP', '2024 Prime', 2024, '2019-2026', 'ful-2023', 'fulminor', ['Qualifying Ace', 'Launch Specialist'], 'QUALIFYING SPECIALIST', ['#9be000', '#111111', '#ffffff'], ['#6a1fb5', '#ffd400', '#111111'], 94, 'q+7 cl+6 re+5 br+3 cn+1 tm-8 wt-6 de-3', 'rk+4 lb+6 st+10', { strengths: 'Title-winning speed with new-found consistency.', weaknesses: 'Tyre life over full distance.' });
leg('campell-2004', 'Sergi Campell', 15, 'ESP', '2004 Prime', 2004, '2000-2009', 'kai-990', 'kairyu', ['Late Brake Master', 'Qualifying Ace'], 'LATE BRAKER', ['#111111', '#f2c300', '#ffffff'], ['#00a3e0', '#ffffff', '#e4002b'], 89, 'br+4 q+4 wt+4 me-4 cn-1', 'lb+8 pr-8', { strengths: 'Brave on the brakes, good in the wet.', weaknesses: 'Cracks under title pressure.' });
leg('rainer-2008', 'Colt Rainer', 5, 'USA', '2008 Prime', 2008, '2003-2014', 'sor-800', 'sorami', ['Smooth Operator', 'Tire Whisperer'], 'TIRE SAVER', ['#ffffff', '#002868', '#bf0a30'], ['#1d3fa8', '#ffffff', '#ffd200'], 85, 'tm+6 cn+4 wt+4 q-3 ov-3', 'rk-4', { strengths: 'Superb feedback, tyre saver.', weaknesses: 'Rarely converts to wins.' });
leg('morandi-2006', 'Renzo Morandi', 65, 'ITA', '2006 Prime', 2006, '2000-2010', 'ful-800', 'fulminor', ['Late Brake Master', 'Launch Specialist'], 'LATE BRAKER', ['#ff0000', '#111111', '#ffffff'], ['#cf0a0a', '#ffffff', '#222222'], 88, 'br+6 cl+5 sp+3 mc-4 tm-2', 'lb+10 st+6', { strengths: 'Brave braking and rocket launches.', weaknesses: 'Mid-corner speed, tyre wear.' });
leg('rotella-2005', 'Gianni Rotella', 33, 'ITA', '2005 Prime', 2005, '2002-2011', 'kai-990', 'kairyu', ['Wet Master', 'Corner Speed Specialist'], 'RAIN MASTER', ['#ffffff', '#00a3e0', '#ff6600'], ['#00a3e0', '#ffffff', '#e4002b'], 88, 'wt+9 mc+3 cn-3 me-3', 'rk+2', { strengths: 'Brilliant in changing conditions.', weaknesses: 'Form can disappear on some bikes.' });
leg('graves-2011', 'Tyler Graves', 11, 'USA', '2011 Prime', 2011, '2010-2013', 'sor-800', 'sorami', ['Smooth Operator'], 'CALCULATED', ['#ffffff', '#0033a0', '#ff0000'], ['#1d3fa8', '#ffffff', '#ffd200'], 85, 'mc+3 cn+2 tm+2 ov-2 me-2', 'rk-2', { strengths: 'Smooth superbike-style lines.', weaknesses: 'Tight overtakes.' });
leg('whitcombe-2016', 'Ross Whitcombe', 35, 'GBR', '2016 Prime', 2016, '2011-2020', 'kai-1000', 'kairyu', ['Wet Master', 'Late Brake Master'], 'RAIN MASTER', ['#012169', '#ffffff', '#c8102e'], ['#00a3e0', '#ffffff', '#e4002b'], 86, 'wt+11 br+4 ag+3 cn-4 q-2', 'rk+6 lb+6', { strengths: 'Rain specialist with brave braking.', weaknesses: 'Crashes when pushing in the dry.' });
leg('ferrer-2020', 'Jordi Ferrer', 36, 'ESP', '2020 Prime', 2020, '2019-2026', 'sei-2020', 'seiran', ['Tire Whisperer', 'Smooth Operator'], 'TIRE SAVER', ['#f4c300', '#0b2a6f', '#ffffff'], ['#14a6b8', '#c0c6cc', '#0d1b2a'], 90, 'tm+8 cn+5 rc+3 q-5 sp-2 ag-2', 'rk-4 pr+6', { strengths: 'Title-winning tyre management and consistency.', weaknesses: 'Qualifying puts him in traffic.' });
leg('salvat-2017', 'Iker Salvat', 12, 'ESP', '2017 Prime', 2017, '2015-2026', 'sor-1000', 'sorami', ['Qualifying Ace', 'Corner Speed Specialist'], 'QUALIFYING SPECIALIST', ['#0a0a0a', '#ff3c00', '#ffffff'], ['#1d3fa8', '#ffffff', '#ffd200'], 90, 'q+7 mc+4 cn-4 me-3 cl-3', 'pr-4 st-4', { strengths: 'Electric pace on a corner-speed bike.', weaknesses: 'Bad starts and form swings.' });
leg('arakawa-2004', 'Kenji Arakawa', 56, 'JPN', '2004 Prime', 2004, '2001-2009', 'kai-990', 'kairyu', ['Smooth Operator'], 'SMOOTH', ['#ffffff', '#111111', '#22aa22'], ['#2a7d2e', '#ffffff', '#111111'], 84, 'cn+3 mc+2 ov-3 me-2', 'rk-2', { strengths: 'Smooth and tidy.', weaknesses: 'Lacks a racing edge.' });
leg('saeki-2004', 'Haruto Saeki', 6, 'JPN', '2004 Prime', 2004, '2002-2008', 'kai-990', 'kairyu', ['Late Brake Master'], 'LATE BRAKER', ['#ffffff', '#bc002d', '#111111'], ['#ffffff', '#00a0e9', '#111111'], 86, 'br+8 ov+3 cn-4 tm-3', 'lb+14 rk+6', { strengths: 'Ferocious late braking.', weaknesses: 'Inconsistent across a season.' });
leg('ventura-2004', 'Caio Ventura', 4, 'BRA', '2004 Prime', 2004, '2000-2007', 'kai-990', 'kairyu', ['Aggressive Attacker', 'Late Brake Master'], 'AGGRESSIVE', ['#009c3b', '#ffdf00', '#002776'], ['#ffcc00', '#0a3d91', '#ffffff'], 86, 'br+4 ag+5 ov+3 tm-3 cn-2', 'lb+8', { strengths: 'Brave, hard-braking veteran.', weaknesses: 'Tyre wear late on.' });
leg('lemaire-2017', 'Hugo Lemaire', 5, 'FRA', '2017 Prime', 2017, '2017-2026', 'sor-1000', 'sorami', ['Aggressive Attacker', 'Wet Master'], 'AGGRESSIVE', ['#0055a4', '#ffffff', '#ffd200'], ['#00c389', '#101820', '#ffffff'], 87, 'wt+6 ag+5 ov+3 cn-3 tm-3', 'rk+6', { strengths: 'Spectacular rookie season charge.', weaknesses: 'Tyre management.' });
leg('valdrighi-2022', 'Enea Valdrighi', 23, 'ITA', '2022 Prime', 2022, '2020-2026', 'ful-1000', 'fulminor', ['Tire Whisperer'], 'TIRE SAVER', ['#b0b7bf', '#ff7f11', '#1c1c1c'], ['#00a3e0', '#ffffff', '#c8102e'], 88, 'tm+9 rp+2 q-4 cx+2 cn-1', 'rk+0', { strengths: 'Tyre whisperer with a late-race surge.', weaknesses: 'Qualifying.' });

// ---------------- expand ----------------
function build(r) {
  const mods = parseMods(r.mods), hid = parseMods(r.hid);
  const rand = rng(hash(r.id));
  const jit = {};
  for (const k of ATTRS) jit[k] = Math.round((rand() - 0.5) * 4);
  const mk = (base) => {
    const a = {};
    for (const k of ATTRS) {
      let v = base + (mods[k] || 0) + jit[k];
      // non-core attributes relate loosely to base
      a[k] = Math.max(40, Math.min(98, Math.round(v)));
    }
    return a;
  };
  let base = r.target, a = mk(base);
  for (let i = 0; i < 60; i++) { const o = computeOVR(a); if (o === r.target) break; base += (r.target - o) * 0.7; a = mk(base); }
  // Only the very best primes can touch 99 in a signature attribute (extremely rare).
  if (r.target >= 97) { const best = Object.keys(mods).sort((x, y) => mods[y] - mods[x])[0]; if (best && a[best] >= 97) a[best] = 99; }
  const h = {};
  for (const k of HIDDEN) {
    const ref = k === 'riskTaking' ? a.aggression : k === 'lateBrakingConfidence' ? a.braking : k === 'slipstreamUsage' ? a.racecraft : k === 'pressureResistance' ? a.mental : a.reaction;
    h[k] = Math.max(35, Math.min(99, Math.round(ref - 4 + (hid[k] || 0) + (rand() - 0.5) * 4)));
  }
  const out = { id: r.id, name: r.name, number: r.number, nationality: r.nationality, kind: r.kind };
  if (r.version) { out.version = r.version; out.primeYear = r.primeYear; out.eraYears = r.eraYears; }
  if (r.age) out.age = r.age;
  if (r.potential) out.potential = r.potential;
  out.team = r.team || null;
  if (r.bike) out.bike = r.bike;
  if (r.manufacturer) out.manufacturer = r.manufacturer;
  out.helmet = r.helmet;
  if (r.livery) out.livery = r.livery;
  out.styles = r.styles; out.personality = r.personality;
  out.attributes = a; out.hidden = h;
  out.strengths = r.strengths; out.weaknesses = r.weaknesses;
  return out;
}
const riders = R.map(build);
writeFileSync(new URL('../src/data/riders.json', import.meta.url), JSON.stringify(riders, null, 1));
for (const r of riders) console.log(String(computeOVR(r.attributes)).padStart(3), r.kind.padEnd(8), r.name + (r.version ? ' - ' + r.version : ''));
console.log('total', riders.length, 'legends', riders.filter(r => r.kind === 'legend').length);
