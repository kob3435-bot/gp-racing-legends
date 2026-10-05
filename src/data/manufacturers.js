// Fictional manufacturers. engine = audio archetype. character drives rider-bike compatibility.
export const MANUFACTURERS = [
  { id: 'fulminor', name: 'FULMINOR', country: 'ITA', engine: 'V4', color: '#d01c1f', desc: 'Brutal V4 power and stopping force. Rewards hard brakers.' },
  { id: 'kairyu', name: 'KAIRYU', country: 'JPN', engine: 'V4', color: '#ff7a00', desc: 'Razor front end, demanding rear. Needs a fearless rider.' },
  { id: 'sorami', name: 'SORAMI', country: 'JPN', engine: 'I4', color: '#1f5fd6', desc: 'Silky inline-four, sublime corner speed, short on grunt.' },
  { id: 'seiran', name: 'SEIRAN', country: 'JPN', engine: 'I4', color: '#19b3c4', desc: 'Gentle on tyres, neutral and friendly, lacks top speed.' },
  { id: 'brennwerk', name: 'BRENNWERK', country: 'AUT', engine: 'V4', color: '#ff8c1a', desc: 'Stiff chassis built for late braking and point-and-shoot.' },
  { id: 'ventara', name: 'VENTARA', country: 'ITA', engine: 'V4', color: '#8bd400', desc: 'Aero-led agile V4 that turns like a supersport.' },
];
export const MANUFACTURER_BY_ID = Object.fromEntries(MANUFACTURERS.map(m => [m.id, m]));
