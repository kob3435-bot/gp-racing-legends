// Fictional bikes. Stats 0-99. character: frontEnd / rearSteer / cornerSpeed / hardBraking (0-100 emphasis).
// era: used by DREAM GRID "REAL" machinery (legends keep their era machine).
const B = (id, name, mfr, era, s, character) => ({
  id, name, manufacturer: mfr, era,
  power: s[0], topSpeed: s[1], acceleration: s[2], braking: s[3], turning: s[4], cornerSpeed: s[5],
  traction: s[6], aero: s[7], stability: s[8], tireWear: s[9], electronics: s[10],
  character: { frontEnd: character[0], rearSteer: character[1], cornerSpeed: character[2], hardBraking: character[3] },
});
//                                                      pow top acc brk trn csp tra aero stab tyre elec
export const BIKES = [
  // ---- current factory machines
  B('ful-gp26', 'FULMINOR GP-26', 'fulminor', 2026, [96, 97, 92, 94, 85, 86, 90, 94, 92, 85, 94], [70, 55, 50, 90]),
  B('kai-rc26', 'KAIRYU RX-26', 'kairyu', 2026, [92, 92, 90, 91, 89, 84, 84, 88, 84, 82, 89], [92, 85, 45, 70]),
  B('sor-m26', 'SORAMI ZR-M26', 'sorami', 2026, [86, 88, 87, 87, 93, 95, 89, 86, 90, 90, 88], [60, 30, 95, 35]),
  B('sei-x26', 'SEIRAN SX-26', 'seiran', 2026, [87, 88, 88, 88, 91, 92, 92, 85, 90, 95, 87], [65, 40, 85, 45]),
  B('bre-rr26', 'BRENNWERK RR-26', 'brennwerk', 2026, [93, 93, 92, 95, 86, 85, 88, 90, 91, 85, 90], [75, 60, 45, 95]),
  B('ven-gp26', 'VENTARA AV-26', 'ventara', 2026, [90, 91, 89, 89, 93, 91, 88, 93, 87, 86, 89], [75, 50, 80, 55]),
  // ---- satellite / previous-spec machines
  B('ful-gp25', 'FULMINOR GP-25', 'fulminor', 2025, [94, 95, 90, 93, 84, 85, 88, 92, 91, 84, 92], [70, 55, 50, 88]),
  B('kai-rc25', 'KAIRYU RX-25 SAT', 'kairyu', 2025, [90, 90, 88, 89, 87, 82, 82, 85, 82, 80, 86], [92, 85, 45, 70]),
  B('sor-m25', 'SORAMI ZR-M25 SAT', 'sorami', 2025, [84, 86, 85, 86, 91, 93, 87, 84, 88, 89, 86], [60, 30, 95, 35]),
  B('bre-rr25', 'BRENNWERK RR-25 SAT', 'brennwerk', 2025, [91, 91, 90, 93, 84, 83, 86, 88, 89, 83, 88], [75, 60, 45, 93]),
  B('ven-gp25', 'VENTARA AV-25 SAT', 'ventara', 2025, [88, 89, 87, 88, 91, 89, 86, 90, 85, 85, 87], [75, 50, 80, 55]),
  // ---- era machines for legends (REAL machinery in Dream Grid)
  B('kai-990', 'KAIRYU RX-990 (2002)', 'kairyu', 2002, [85, 86, 86, 82, 86, 86, 78, 60, 82, 80, 55], [80, 70, 65, 60]),
  B('sor-990', 'SORAMI ZR-990 (2005)', 'sorami', 2005, [83, 84, 84, 82, 90, 92, 80, 62, 86, 84, 60], [65, 40, 90, 40]),
  B('ful-800', 'FULMINOR GP-800 (2007)', 'fulminor', 2007, [92, 95, 88, 86, 80, 82, 82, 66, 84, 78, 72], [65, 70, 45, 80]),
  B('kai-800', 'KAIRYU RX-800 (2008)', 'kairyu', 2008, [87, 87, 89, 86, 89, 86, 82, 66, 84, 82, 74], [85, 65, 60, 65]),
  B('sor-800', 'SORAMI ZR-800 (2010)', 'sorami', 2010, [84, 85, 86, 85, 92, 94, 84, 68, 89, 87, 76], [60, 30, 95, 35]),
  B('kai-1000', 'KAIRYU RX-1000 (2014)', 'kairyu', 2014, [90, 90, 90, 89, 90, 87, 85, 72, 86, 83, 82], [90, 80, 50, 75]),
  B('sor-1000', 'SORAMI ZR-1000 (2015)', 'sorami', 2015, [86, 87, 87, 87, 93, 94, 87, 74, 90, 88, 83], [60, 30, 95, 35]),
  B('ful-1000', 'FULMINOR GP-1000 (2017)', 'fulminor', 2017, [94, 96, 90, 92, 82, 83, 87, 80, 90, 84, 86], [70, 55, 45, 90]),
  B('kai-2019', 'KAIRYU RX-19', 'kairyu', 2019, [92, 92, 91, 90, 88, 85, 85, 80, 84, 82, 86], [95, 90, 40, 75]),
  B('sor-2021', 'SORAMI ZR-21', 'sorami', 2021, [85, 86, 87, 87, 94, 95, 88, 84, 90, 89, 87], [60, 30, 95, 35]),
  B('sei-2020', 'SEIRAN SX-20', 'seiran', 2020, [86, 87, 88, 88, 92, 93, 91, 80, 91, 94, 85], [65, 40, 85, 45]),
  B('ful-2023', 'FULMINOR GP-23', 'fulminor', 2023, [96, 97, 92, 94, 86, 87, 90, 93, 92, 85, 93], [70, 55, 50, 90]),
];
export const BIKE_BY_ID = Object.fromEntries(BIKES.map(b => [b.id, b]));
export const BIKE_STATS = ['power', 'topSpeed', 'acceleration', 'braking', 'turning', 'cornerSpeed', 'traction', 'aero', 'stability', 'tireWear', 'electronics'];

// Equal machinery reference bike (field average of current factory bikes)
export function equalBike() {
  const cur = BIKES.filter(b => b.era === 2026);
  const out = { id: 'equal', name: 'SPEC GP PROTOTYPE', manufacturer: 'spec', era: 2026, character: { frontEnd: 70, rearSteer: 50, cornerSpeed: 65, hardBraking: 60 } };
  for (const k of BIKE_STATS) out[k] = Math.round(cur.reduce((a, b) => a + b[k], 0) / cur.length);
  return out;
}
// Balanced: pull each stat 70% of the way towards the reference
export function balancedBike(b) {
  const ref = equalBike();
  const out = { ...b, character: { ...b.character }, id: b.id + '-bal' };
  for (const k of BIKE_STATS) out[k] = Math.round(ref[k] + (b[k] - ref[k]) * 0.3);
  return out;
}
