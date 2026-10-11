// v6: PES-style near-miss parody names (ids unchanged -> saves stay valid). [id-or-prefix]: [name, number, nat, team?]
import fs from 'fs';
const CUR = {
  arrieta: ['Marc Marqués', 93, 'ESP', 'ful-factory'], bellandi: ['Pecco Bagnaya', 63, 'ITA', 'ful-factory'],
  vitale: ['Fabio Di Giannantonyo', 49, 'ITA', 'ful-apex'], ferran: ['Franco Morbidello', 21, 'ITA', 'ful-apex'],
  morimoto: ['Álex Marqués', 73, 'ESP', 'sei-arrow'], elorza: ['Fermín Aldeguar', 54, 'ESP', 'sei-arrow'],
  montero: ['Jorge Martyn', 89, 'ESP', 'ven-squadra'], ravelli: ['Marco Bezzeki', 72, 'ITA', 'ven-squadra'],
  takahashi: ['Ai Oguro', 79, 'JPN', 'ven-siam'], srisuk: ['Raúl Fernandes', 25, 'ESP', 'ven-siam'],
  ishida: ['Somkiat Chantraa', 35, 'THA', 'kai-tide'], fenzi: ['Johann Zarko', 5, 'FRA', 'kai-tide'],
  ferrer: ['Joan Mirr', 36, 'ESP', 'kai-works'], brandao: ['Luca Marinni', 10, 'ITA', 'kai-works'],
  rousselin: ['Fabio Quartarano', 20, 'FRA', 'sor-factory'], reyna: ['Álex Rinz', 42, 'ESP', 'sor-factory'],
  hartigan: ['Jack Millar', 43, 'AUS', 'sor-horizon'], saldanha: ['Miguel Olivera', 88, 'POR', 'sor-horizon'],
  almagro: ['Pedro Acoste', 37, 'ESP', 'bre-factory'], visagie: ['Brad Bindar', 33, 'RSA', 'bre-factory'],
  valdrighi: ['Enea Bastianinni', 23, 'ITA', 'bre-titan'], salvat: ['Maverick Viñalez', 12, 'ESP', 'bre-titan'],
  // rookies / next wave
  kaewdee: ['Toprak Razgatlioglou', 7, 'TUR'], paredes: ['Arón Canett', 44, 'ESP'], tanabe: ['Diogo Moreyra', 11, 'BRA'],
  carrow: ['Jake Dixxon', 96, 'GBR'], hakala: ['Manu Gonzales', 18, 'ESP'],
  // legends (all versions share the base id prefix)
  valtieri: ['Valentino Rossa', 46, 'ITA'], brennock: ['Casey Stonor', 27, 'AUS'], ortell: ['Jorge Lorenzi', 99, 'ESP'],
  pellicer: ['Dani Pedroza', 26, 'ESP'], harlan: ['Nicky Haydn', 69, 'USA'], bertolli: ['Max Biagio', 3, 'ITA'],
  serafini: ['Marco Simoncelly', 58, 'ITA'], ferrante: ['Andrea Doviziozo', 4, 'ITA'], campell: ['Sete Gibernao', 15, 'ESP'],
  rainer: ['Colin Edwardz', 5, 'USA'], morandi: ['Loris Capirozzi', 65, 'ITA'], rotella: ['Marco Melandry', 33, 'ITA'],
  graves: ['Ben Spiez', 11, 'USA'], whitcombe: ['Cal Crutchlowe', 35, 'GBR'], arakawa: ['Shinya Nakana', 56, 'JPN'],
  saeki: ['Makoto Tamado', 6, 'JPN'], ventura: ['Alex Barroz', 4, 'BRA'], lemaire: ['Johann Zarko', 5, 'FRA'],
};
const p = new URL('../src/data/riders.json', import.meta.url);
const R = JSON.parse(fs.readFileSync(p, 'utf8')); let n = 0;
for (const r of R) {
  const m = CUR[r.id] || CUR[r.id.split('-')[0]]; if (!m) { console.log('UNMAPPED', r.id); continue; }
  if (r.name !== m[0]) n++;
  r.name = m[0]; r.number = m[1]; r.nationality = m[2]; if (m[3] && r.kind === 'current') r.team = m[3];
}
fs.writeFileSync(p, JSON.stringify(R, null, 2) + '\n');
console.log('renamed', n, 'of', R.length);
