import './style.css';
import { Game } from './game/game.js';
import { UI } from './ui/screens.js';
import { RIDER_BY_ID } from './data/riders.js';
import { TRACKS } from './data/tracks.js';
import * as save from './save.js';
import { audio } from './game/audio.js';

class App {
  constructor() {
    this.settings = save.loadSettings();
    this.game = new Game(document.getElementById('gl'), document.getElementById('hud'), this.settings);
    this.game.onSettingsChanged = () => save.saveSettings(this.settings);
    this.ui = new UI(document.getElementById('ui'), this);
    this.fpsEl = document.getElementById('fps'); this.game.fpsEl = this.fpsEl;
    this.applySettings();
    if (!save.loadProfile()) this.ui.welcome(); else this.ui.main();
    document.getElementById('boot').remove();
  }
  lastRider() { return (save.loadLastRace() || {}).riderId || null; }
  applySettings() {
    this.fpsEl.style.display = this.settings.showFps ? 'block' : 'none';
    audio.setVolume({ master: this.settings.master, engine: this.settings.engine, sfx: this.settings.sfx });
  }
  race(cfg, back) {
    this.ui.hide();
    this.currentCfg = cfg;
    const start = () => this.game.startRace({ ...cfg, seed: (Math.random() * 1e9) | 0 }, {
      onResults: (sum) => this.onResults(sum, cfg, back, start),
      onQuit: () => back(),
      onRestart: () => start(),
    });
    start();
  }
  onResults(sum, cfg, back, restart) {
    this.game.disposeRace(); this.game.state = 'menu';
    const me = sum.results.find(r => r.isPlayer);
    if (me) {
      const st = save.loadStats();
      st.races++; if (me.pos === 1) st.wins++; if (me.pos <= 3) st.podiums++; if (me.fastest) st.fastestLaps++; if (me.grid === 1) st.poles++;
      st.distanceKm += sum.distanceKm; st.points += me.points; st.lastPlayed = Date.now();
      if (isFinite(me.bestLap) && !me.projected) { const pb = st.bestLaps[sum.trackId]; if (!pb || me.bestLap < pb.time) st.bestLaps[sum.trackId] = { time: me.bestLap, rider: me.riderId }; }
      save.saveStats(st);
    }
    let commit = null;
    if (cfg.mode === 'champ') {
      commit = () => {
        const c = save.loadChampionship(); if (!c || c.committedFor === c.round + ':' + sum.trackId) return;
        for (const r of sum.results) {
          c.points[r.riderId] = (c.points[r.riderId] || 0) + r.points;
          const tid = (r.rider.team) || (r.rider.kind === 'legend' ? 'legend-' + r.rider.manufacturer : 'wildcard');
          c.teamPoints[tid] = (c.teamPoints[tid] || 0) + r.points;
        }
        c.results[c.round] = { winner: sum.results[0].riderId, myPos: me ? me.pos : null };
        c.round++;
        if (c.round >= c.calendar.length) {
          const top = Object.entries(c.points).sort((a, b) => b[1] - a[1])[0];
          if (top && top[0] === c.riderId) { const st = save.loadStats(); st.championships++; save.saveStats(st); }
        }
        save.saveChampionship(c);
      };
    }
    const quickNext = () => { const i = TRACKS.findIndex(t => t.id === cfg.trackId); const nt = TRACKS[(i + 1) % TRACKS.length]; this.race({ ...cfg, trackId: nt.id, weather: cfg.weather }, back); };
    this.ui.results(sum, cfg, {
      onRetry: () => { this.ui.hide(); restart(); },
      onNext: cfg.mode === 'champ' ? () => { commit(); this.ui.champ(); } : cfg.mode === 'quick' ? quickNext : null,
      nextLabel: cfg.mode === 'champ' ? 'CONTINUE SEASON ▶' : 'NEXT TRACK ▶',
    });
    if (commit) { // menu also commits the round
      const m = document.querySelector('#menu'); if (m) m.onclick = () => { commit(); this.ui.main(); };
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  try { window.app = new App(); }
  catch (e) { console.error(e); document.getElementById('boot').innerHTML = '<p style="color:#fff;padding:2em">WebGL is required to play. ' + e.message + '</p>'; }
});
if ('serviceWorker' in navigator && location.protocol !== 'file:' && !location.search.includes('nosw')) {
  window.addEventListener('load', () => navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js', { scope: import.meta.env.BASE_URL }).catch(() => { }));
}
