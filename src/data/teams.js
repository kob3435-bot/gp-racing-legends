// Fictional teams, sponsors and liveries.
export const TEAMS = [
  { id: 'ful-factory', name: 'Fulminor Corse Factory', short: 'FUL', sponsor: 'NOVARA ENERGY', manufacturer: 'fulminor', bike: 'ful-gp26', colors: ['#c8102e', '#f2f2f2', '#1a1a1a'] },
  { id: 'ful-apex', name: 'Apex Fulminor Racing', short: 'APX', sponsor: 'APEX TELECOM', manufacturer: 'fulminor', bike: 'ful-gp25', colors: ['#6a1fb5', '#ffd400', '#111111'] },
  { id: 'kai-works', name: 'Kairyu Works Team', short: 'KAI', sponsor: 'TIDECORE OIL', manufacturer: 'kairyu', bike: 'kai-rc26', colors: ['#ff6a00', '#0b2a6f', '#f5f5f5'] },
  { id: 'kai-tide', name: 'Tidewave Kairyu', short: 'TDW', sponsor: 'TIDEWAVE', manufacturer: 'kairyu', bike: 'kai-rc25', colors: ['#00a3e0', '#ffffff', '#e4002b'] },
  { id: 'sor-factory', name: 'Sorami Factory Racing', short: 'SOR', sponsor: 'BLUEPEAK', manufacturer: 'sorami', bike: 'sor-m26', colors: ['#1546c7', '#0a0a0a', '#e8e8e8'] },
  { id: 'sor-horizon', name: 'Horizon Sorami Satellite', short: 'HOR', sponsor: 'HORIZON AIR', manufacturer: 'sorami', bike: 'sor-m25', colors: ['#00c389', '#101820', '#ffffff'] },
  { id: 'sei-arrow', name: 'Seiran Blue Arrow', short: 'SEI', sponsor: 'ARROWLINE', manufacturer: 'seiran', bike: 'sei-x26', colors: ['#14a6b8', '#c0c6cc', '#0d1b2a'] },
  { id: 'bre-factory', name: 'Brennwerk Factory Racing', short: 'BRE', sponsor: 'GRANITBRAU', manufacturer: 'brennwerk', bike: 'bre-rr26', colors: ['#ff7f11', '#121212', '#ffffff'] },
  { id: 'bre-titan', name: 'Titan Brennwerk Junior', short: 'TTN', sponsor: 'TITAN TOOLS', manufacturer: 'brennwerk', bike: 'bre-rr25', colors: ['#b0b7bf', '#ff7f11', '#1c1c1c'] },
  { id: 'ven-squadra', name: 'Ventara Racing Squadra', short: 'VEN', sponsor: 'LIMEFROST', manufacturer: 'ventara', bike: 'ven-gp26', colors: ['#111111', '#9be000', '#ffffff'] },
  { id: 'ven-siam', name: 'Siam Velocity Ventara', short: 'SVV', sponsor: 'SIAM VELOCITY', manufacturer: 'ventara', bike: 'ven-gp25', colors: ['#b3001b', '#d4af37', '#0e0e0e'] },
  // Legends era teams (for legend versions, used in Dream Grid / database)
  { id: 'leg-kai', name: 'Kairyu Heritage', short: 'KHR', sponsor: 'HERITAGE', manufacturer: 'kairyu', bike: 'kai-990', colors: ['#ffcc00', '#0a3d91', '#ffffff'] },
  { id: 'leg-sor', name: 'Sorami Heritage', short: 'SHR', sponsor: 'HERITAGE', manufacturer: 'sorami', bike: 'sor-990', colors: ['#1d3fa8', '#ffffff', '#ffd200'] },
  { id: 'leg-ful', name: 'Fulminor Heritage', short: 'FHR', sponsor: 'HERITAGE', manufacturer: 'fulminor', bike: 'ful-800', colors: ['#cf0a0a', '#ffffff', '#222222'] },
];
export const TEAM_BY_ID = Object.fromEntries(TEAMS.map(t => [t.id, t]));
export const CURRENT_TEAMS = TEAMS.filter(t => !t.id.startsWith('leg-'));
