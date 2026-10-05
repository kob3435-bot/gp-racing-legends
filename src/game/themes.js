// Environment themes: purely visual parameters per circuit look (data-driven; tracks reference them by `theme`).
// trees: relative weights of vegetation kinds; hills: terrain amplitude scale; mountains: distant backdrop ring.
export const THEMES = {
  TROPICAL: {
    grass: ['#3f7a2c', '#5c8f34'], far: '#2f5f2a', gravel: '#b59a72', hills: 0.7, density: 1.25,
    trees: { palm: 5, broadleaf: 4, shrub: 2 }, mountains: { h: 260, color: '#3d5a48', snow: false },
    sky: { turbidity: 9, rayleigh: 2.2, elev: 38, azim: 140 }, haze: '#d6e4ea',
  },
  TEMPERATE: {
    grass: ['#4f7f33', '#6b9440'], far: '#3c6634', gravel: '#a8977d', hills: 1.2, density: 1.1,
    trees: { pine: 4, broadleaf: 4, cypress: 1 }, mountains: { h: 520, color: '#4a5d64', snow: false },
    sky: { turbidity: 5, rayleigh: 1.6, elev: 32, azim: 200 }, haze: '#cfdde8',
  },
  COASTAL: {
    grass: ['#5d8a3a', '#86a052'], far: '#4c7038', gravel: '#c2ae86', hills: 0.9, density: 0.6,
    trees: { shrub: 5, pine: 2, broadleaf: 1 }, mountains: { h: 160, color: '#55705a', snow: false }, ocean: true,
    sky: { turbidity: 3, rayleigh: 1.4, elev: 30, azim: 250 }, haze: '#d8e6f0',
  },
  DESERT: {
    grass: ['#b89a6a', '#cfb07a'], far: '#a88a5c', gravel: '#d9c39a', hills: 0.35, density: 0.25, sand: true,
    trees: { palm: 3, shrub: 6 }, mountains: { h: 140, color: '#8a6e4e', snow: false },
    sky: { turbidity: 12, rayleigh: 1.2, elev: 22, azim: 260 }, haze: '#e6d6b8',
  },
  MEDITERRANEAN: {
    grass: ['#7f8a44', '#a39a58'], far: '#6d7440', gravel: '#cdb48a', hills: 0.9, density: 0.8,
    trees: { olive: 5, cypress: 2, shrub: 3, pine: 1 }, mountains: { h: 300, color: '#7a7764', snow: false },
    sky: { turbidity: 4, rayleigh: 1.3, elev: 44, azim: 160 }, haze: '#e7e1d0',
  },
  COASTAL_MED: {
    grass: ['#8a8f4a', '#b0a464'], far: '#737843', gravel: '#d4bc90', hills: 0.6, density: 0.7,
    trees: { olive: 3, palm: 3, shrub: 3 }, mountains: { h: 220, color: '#857d66', snow: false }, ocean: true,
    sky: { turbidity: 3.5, rayleigh: 1.3, elev: 40, azim: 120 }, haze: '#e4e6e2',
  },
  TUSCAN: {
    grass: ['#5f8436', '#8d9a4a'], far: '#57703a', gravel: '#c6a87c', hills: 1.6, density: 1.0,
    trees: { cypress: 5, olive: 3, broadleaf: 3 }, mountains: { h: 380, color: '#5f6b5c', snow: false },
    sky: { turbidity: 4.5, rayleigh: 1.5, elev: 36, azim: 220 }, haze: '#e2e3d8',
  },
  LOWLANDS: {
    grass: ['#4c8a34', '#62a03f'], far: '#3f7a30', gravel: '#b6a688', hills: 0.12, density: 0.7,
    trees: { broadleaf: 5, pine: 1 }, mountains: null,
    sky: { turbidity: 6, rayleigh: 2.0, elev: 28, azim: 210 }, haze: '#d9e2ea',
  },
  ALPINE: {
    grass: ['#4f8236', '#6f9a44'], far: '#41693a', gravel: '#a9a08c', hills: 1.8, density: 1.2,
    trees: { pine: 7, broadleaf: 1 }, mountains: { h: 1100, color: '#5b6672', snow: true },
    sky: { turbidity: 2.5, rayleigh: 1.2, elev: 40, azim: 170 }, haze: '#d4e2f0',
  },
  ARID: {
    grass: ['#9a9452', '#b8a868'], far: '#8a8650', gravel: '#c9ad82', hills: 0.45, density: 0.35,
    trees: { shrub: 5, broadleaf: 2 }, mountains: { h: 120, color: '#857a5e', snow: false },
    sky: { turbidity: 7, rayleigh: 1.6, elev: 46, azim: 230 }, haze: '#e8e0cc',
  },
  EUROPEAN: {
    grass: ['#477d30', '#5f9038'], far: '#3a6a2e', gravel: '#ae9f84', hills: 1.0, density: 1.2,
    trees: { broadleaf: 5, pine: 3 }, mountains: { h: 240, color: '#4d5f58', snow: false },
    sky: { turbidity: 6, rayleigh: 1.8, elev: 30, azim: 190 }, haze: '#d3dde6',
  },
};
export const themeOf = (track) => THEMES[track.theme] || THEMES.EUROPEAN;
