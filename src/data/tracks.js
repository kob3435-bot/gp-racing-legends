// Fictional circuits loosely inspired by real layouts. Control points (metres, map coords x=east, y=north) in
// driving order; the geometry builder fits a closed spline and scales it to `length`.
// character tags: stop-and-go | flowing | technical | heavy-braking | tire-killer | wet-prone | high-speed
// weather: probabilities for SUNNY / CLOUDY / LIGHT_RAIN / HEAVY_RAIN
// theme: environment look (see src/game/themes.js) — sky, terrain colours, vegetation, backdrop
export const TRACKS = [
  {
    id: 'siam', name: 'Siam Thunder Circuit', country: 'Thailand', flag: 'THA', inspiration: 'Thailand',
    length: 4550, width: 14, elevation: 4, grip: 0.98, temp: 'hot', night: false, theme: 'TROPICAL',
    character: ['stop-and-go', 'heavy-braking', 'high-speed'], weather: [0.45, 0.25, 0.2, 0.1],
    pts: [[0, -150], [0, 300], [0, 650], [15, 780], [90, 830], [180, 790], [290, 720], [400, 700], [700, 700], [1000, 690], [1080, 670], [1095, 610], [1040, 580], [800, 560], [640, 545], [580, 500], [575, 420], [620, 340], [600, 260], [480, 220], [400, 160], [380, 60], [300, -20], [250, -120], [180, -200], [110, -290], [40, -290], [0, -230]],
  },
  {
    id: 'kanto', name: 'Kanto Ridge Speedway', country: 'Japan', flag: 'JPN', inspiration: 'Japan',
    length: 4800, width: 14, elevation: 14, grip: 1.0, temp: 'mild', night: false, theme: 'TEMPERATE',
    character: ['stop-and-go', 'heavy-braking', 'technical'], weather: [0.4, 0.3, 0.2, 0.1],
    pts: [[60, 0], [450, 0], [800, 0], [860, -50], [850, -140], [780, -180], [600, -190], [520, -230], [500, -320], [560, -380], [700, -400], [900, -420], [1000, -470], [1000, -560], [930, -590], [800, -560], [500, -500], [200, -470], [80, -460], [20, -420], [30, -350], [120, -300], [250, -250], [260, -180], [180, -140], [60, -110], [-40, -90], [-70, -30], [-20, 5]],
  },
  {
    id: 'selangor', name: 'Selangor Monsoon Park', country: 'Malaysia', flag: 'MAS', inspiration: 'Malaysia',
    length: 5540, width: 15, elevation: 6, grip: 0.97, temp: 'hot', night: false, theme: 'TROPICAL',
    character: ['high-speed', 'wet-prone', 'tire-killer'], weather: [0.3, 0.25, 0.25, 0.2],
    pts: [[0, -400], [450, -400], [900, -400], [980, -420], [1000, -490], [950, -530], [890, -560], [880, -630], [920, -720], [1040, -760], [1130, -800], [1150, -880], [1110, -980], [1150, -1080], [1120, -1160], [1020, -1180], [900, -1170], [840, -1210], [870, -1280], [1000, -1300], [1250, -1290], [1320, -1220], [1320, -700], [1310, -260], [1270, -180], [1180, -180], [700, -200], [100, -210], [-60, -220], [-110, -290], [-70, -380]],
  },
  {
    id: 'southern', name: 'Southern Cliffs Circuit', country: 'Australia', flag: 'AUS', inspiration: 'Australia',
    length: 4450, width: 14, elevation: 18, grip: 1.0, temp: 'cool', night: false, theme: 'COASTAL',
    character: ['flowing', 'high-speed', 'tire-killer'], weather: [0.35, 0.35, 0.2, 0.1],
    pts: [[0, 0], [400, 0], [700, 0], [850, 40], [910, 150], [890, 300], [780, 390], [690, 395], [640, 330], [610, 250], [550, 215], [470, 255], [420, 330], [330, 330], [250, 260], [160, 300], [70, 340], [-10, 300], [-70, 200], [-90, 90], [-50, 10]],
  },
  {
    id: 'desert', name: 'Desert Lights Circuit', country: 'Qatar', flag: 'QAT', inspiration: 'Qatar',
    length: 5380, width: 14, elevation: 2, grip: 0.95, temp: 'hot', night: true, theme: 'DESERT',
    character: ['flowing', 'high-speed'], weather: [0.85, 0.12, 0.03, 0.0],
    pts: [[0, 0], [500, 0], [1000, 0], [1080, -20], [1100, -90], [1060, -160], [1060, -240], [1110, -310], [1060, -380], [950, -380], [850, -330], [740, -360], [660, -440], [540, -450], [450, -390], [350, -380], [260, -440], [170, -430], [150, -350], [210, -280], [160, -210], [60, -190], [-30, -150], [-80, -70], [-45, -5]],
  },
  {
    id: 'valle', name: 'Valle del Sol Circuit', country: 'Spain', flag: 'ESP', inspiration: 'Spain (Andalusia)',
    length: 4420, width: 12, elevation: 8, grip: 0.99, temp: 'warm', night: false, theme: 'MEDITERRANEAN',
    character: ['technical', 'stop-and-go'], weather: [0.65, 0.2, 0.1, 0.05],
    pts: [[0, 0], [300, 0], [600, 0], [680, -20], [700, -80], [650, -120], [600, -150], [590, -220], [620, -300], [700, -330], [780, -370], [790, -450], [740, -530], [600, -560], [400, -560], [300, -570], [265, -515], [320, -465], [450, -445], [545, -410], [560, -360], [490, -310], [400, -305], [300, -290], [200, -260], [100, -210], [30, -150], [-30, -80], [-25, -15]],
  },
  {
    id: 'tuscan', name: 'Tuscan Hills Autodromo', country: 'Italy', flag: 'ITA', inspiration: 'Italy (Tuscany)',
    length: 5245, width: 14, elevation: 34, grip: 1.0, temp: 'warm', night: false, theme: 'TUSCAN',
    character: ['flowing', 'high-speed', 'tire-killer'], weather: [0.6, 0.22, 0.12, 0.06],
    pts: [[0, 0], [550, 0], [1100, 0], [1180, -20], [1200, -90], [1150, -130], [1080, -160], [1060, -230], [1100, -300], [1050, -380], [980, -400], [900, -470], [820, -470], [740, -430], [700, -350], [640, -280], [560, -300], [500, -360], [420, -380], [360, -330], [300, -260], [240, -270], [180, -220], [80, -200], [-20, -150], [-60, -70], [-30, 0]],
  },
  {
    id: 'polder', name: 'Polder Ring', country: 'Netherlands', flag: 'NED', inspiration: 'Netherlands',
    length: 4540, width: 13, elevation: 3, grip: 1.0, temp: 'cool', night: false, theme: 'LOWLANDS',
    character: ['flowing', 'technical', 'wet-prone'], weather: [0.3, 0.35, 0.22, 0.13],
    pts: [[0, 0], [500, 0], [580, -20], [600, -90], [540, -120], [450, -140], [380, -180], [390, -260], [500, -300], [700, -280], [850, -250], [950, -300], [1000, -380], [940, -460], [820, -480], [700, -440], [600, -480], [480, -470], [400, -420], [300, -450], [200, -420], [110, -320], [60, -250], [90, -200], [40, -150], [-30, -110], [-40, -50]],
  },
  {
    id: 'alpine', name: 'Alpine Peak Ring', country: 'Austria', flag: 'AUT', inspiration: 'Austria',
    length: 4320, width: 14, elevation: 40, grip: 1.0, temp: 'mild', night: false, theme: 'ALPINE',
    character: ['stop-and-go', 'heavy-braking'], weather: [0.45, 0.3, 0.17, 0.08],
    pts: [[0, 0], [250, 30], [500, 60], [600, 60], [645, -20], [650, -200], [655, -420], [630, -500], [565, -470], [480, -380], [400, -300], [330, -260], [260, -300], [180, -400], [100, -480], [0, -470], [-60, -400], [-50, -300], [-20, -220], [-60, -130], [-80, -60], [-40, -10]],
  },
  {
    id: 'lonestar', name: 'Lone Star Grand Circuit', country: 'USA', flag: 'USA', inspiration: 'USA (Texas)',
    length: 5510, width: 15, elevation: 30, grip: 0.97, temp: 'warm', night: false, theme: 'ARID',
    character: ['technical', 'heavy-braking', 'tire-killer'], weather: [0.55, 0.25, 0.13, 0.07],
    pts: [[0, 0], [0, 300], [0, 520], [-10, 620], [-70, 650], [-120, 600], [-160, 520], [-240, 480], [-310, 540], [-390, 490], [-460, 540], [-530, 490], [-600, 440], [-620, 360], [-580, 300], [-620, 240], [-640, -300], [-650, -700], [-640, -790], [-580, -810], [-540, -760], [-480, -640], [-400, -660], [-340, -600], [-380, -520], [-300, -430], [-200, -380], [-150, -290], [-200, -200], [-210, -120], [-150, -50], [-60, -40]],
  },
  {
    id: 'albion', name: 'Albion Park Circuit', country: 'Great Britain', flag: 'GBR', inspiration: 'Great Britain',
    length: 5890, width: 15, elevation: 6, grip: 0.98, temp: 'cool', night: false, theme: 'EUROPEAN',
    character: ['flowing', 'high-speed', 'wet-prone'], weather: [0.3, 0.35, 0.22, 0.13],
    pts: [[0, 0], [400, 0], [520, -40], [640, -50], [730, -110], [730, -200], [660, -240], [590, -200], [540, -140], [450, -110], [200, -120], [-100, -140], [-190, -170], [-210, -260], [-150, -330], [-60, -330], [0, -390], [-20, -480], [-120, -540], [-200, -620], [-310, -640], [-420, -600], [-700, -420], [-800, -380], [-850, -300], [-800, -220], [-700, -170], [-580, -160], [-480, -100], [-300, -30], [-150, 0]],
  },
  {
    id: 'levante', name: 'Levante Bowl', country: 'Spain', flag: 'ESP', inspiration: 'Spain (east coast)',
    length: 4010, width: 12, elevation: 6, grip: 0.99, temp: 'warm', night: false, theme: 'COASTAL_MED',
    character: ['technical', 'stop-and-go'], weather: [0.65, 0.22, 0.09, 0.04],
    pts: [[0, 0], [350, 0], [650, 0], [740, 20], [760, 100], [720, 170], [700, 260], [620, 300], [520, 280], [440, 330], [380, 400], [300, 420], [180, 450], [100, 400], [60, 300], [100, 220], [60, 140], [-60, 80], [-80, 10], [-40, -5]],
  },
  {
    id: 'saxon', name: 'Saxon Valley Ring', country: 'Germany', flag: 'GER', inspiration: 'Germany',
    length: 3670, width: 12, elevation: 22, grip: 1.0, temp: 'mild', night: false, theme: 'EUROPEAN',
    character: ['technical', 'tire-killer'], weather: [0.4, 0.3, 0.2, 0.1],
    pts: [[0, 0], [250, 0], [500, 0], [580, 20], [600, 90], [540, 120], [460, 110], [380, 140], [360, 220], [380, 300], [440, 350], [520, 360], [560, 420], [520, 520], [400, 560], [250, 560], [100, 540], [0, 480], [-60, 400], [-80, 320], [-40, 260], [-100, 210], [-120, 120], [-90, 30], [-40, 0]],
  },
  {
    id: 'valles', name: 'Valles Grand Circuit', country: 'Spain', flag: 'ESP', inspiration: 'Spain (Catalonia)',
    length: 4660, width: 13, elevation: 20, grip: 0.96, temp: 'warm', night: false, theme: 'MEDITERRANEAN',
    character: ['high-speed', 'tire-killer', 'technical'], weather: [0.6, 0.23, 0.11, 0.06],
    pts: [[0, 0], [500, 0], [1000, 0], [1080, -30], [1100, -110], [1070, -170], [1100, -260], [1060, -360], [960, -400], [880, -380], [600, -360], [520, -370], [480, -430], [520, -480], [600, -520], [700, -560], [720, -640], [640, -680], [500, -690], [300, -700], [200, -700], [160, -650], [200, -560], [150, -480], [60, -420], [40, -300], [-20, -200], [-60, -100], [-30, -10]],
  },
];
export const TRACK_BY_ID = Object.fromEntries(TRACKS.map(t => [t.id, t]));

// Season calendar: every circuit in the database, in a realistic order through the year
// (night opener in the desert, Asian/American flyaways in spring, the European summer, autumn overseas swing, Spanish finale).
export const CALENDAR = [
  { id: 'desert', month: 'MAR' }, { id: 'siam', month: 'MAR' }, { id: 'lonestar', month: 'APR' }, { id: 'valle', month: 'APR' },
  { id: 'tuscan', month: 'MAY' }, { id: 'valles', month: 'MAY' }, { id: 'polder', month: 'JUN' }, { id: 'saxon', month: 'JUL' },
  { id: 'albion', month: 'AUG' }, { id: 'alpine', month: 'AUG' }, { id: 'kanto', month: 'SEP' }, { id: 'southern', month: 'OCT' },
  { id: 'selangor', month: 'OCT' }, { id: 'levante', month: 'NOV' },
];
// any track added later without a calendar slot still gets raced (appended before the finale)
for (const t of TRACKS) if (!CALENDAR.some(c => c.id === t.id)) CALENDAR.splice(CALENDAR.length - 1, 0, { id: t.id, month: 'OCT' });
export const MONTH_OF = Object.fromEntries(CALENDAR.map(c => [c.id, c.month]));
// realistic Grand Prix race distance (~110-120 km)
export function realLaps(t) { return Math.max(18, Math.min(30, Math.round(118000 / t.length))); }
export function seasonLaps(season, trackId) {
  if (season.lapsMode === 'REAL') return trackId ? realLaps(TRACK_BY_ID[trackId]) : 0;
  return Math.max(1, Math.min(99, Math.round(+season.laps || 3)));
}
export function lapsLabel(season) { return season.lapsMode === 'REAL' ? 'realistic race distance' : `${seasonLaps(season)} lap${seasonLaps(season) === 1 ? '' : 's'} per race`; }
