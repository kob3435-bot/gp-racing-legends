import { RIDER_BY_ID, riderTeamId } from './data/riders.js';
// Applies one race classification to a season object (single-player or online). Idempotent per round.
export function commitRound(c, sum) {
  if (!c || c.committedFor === c.round + ':' + sum.trackId) return false;
  for (const r of sum.results) {
    c.points[r.riderId] = (c.points[r.riderId] || 0) + r.points;
    const tid = riderTeamId(r.rider || RIDER_BY_ID[r.riderId]);
    c.teamPoints[tid] = (c.teamPoints[tid] || 0) + r.points;
  }
  c.committedFor = c.round + ':' + sum.trackId;
  const me = sum.results.find(r => r.isPlayer);
  c.results[c.round] = { winner: sum.results[0].riderId, myPos: me ? me.pos : null, order: sum.results.map(r => r.riderId) };
  c.round++;
  return true;
}
