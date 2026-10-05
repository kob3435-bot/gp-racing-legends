// Attribute definitions and OVR computation (OVR is ALWAYS computed, never stored by hand).
export const ATTRS = [
  'speed', 'acceleration', 'braking', 'cornerEntry', 'midCorner', 'cornerExit', 'throttleControl',
  'racePace', 'qualifying', 'overtaking', 'defending', 'racecraft', 'consistency', 'wet',
  'tireManagement', 'bikeControl', 'aggression', 'reaction', 'mental', 'clutch',
];
export const HIDDEN = ['riskTaking', 'lateBrakingConfidence', 'slipstreamUsage', 'pressureResistance', 'startReaction'];

export const ATTR_LABEL = {
  speed: 'Speed', acceleration: 'Acceleration', braking: 'Braking', cornerEntry: 'Corner Entry',
  midCorner: 'Mid Corner', cornerExit: 'Corner Exit', throttleControl: 'Throttle Control',
  racePace: 'Race Pace', qualifying: 'Qualifying', overtaking: 'Overtaking', defending: 'Defending',
  racecraft: 'Racecraft', consistency: 'Consistency', wet: 'Wet Weather', tireManagement: 'Tire Mgmt',
  bikeControl: 'Bike Control', aggression: 'Aggression', reaction: 'Reaction', mental: 'Mental',
  clutch: 'Clutch / Launch',
};

export const OVR_WEIGHTS = {
  racePace: 0.15, bikeControl: 0.12, braking: 0.09, cornerEntry: 0.08, midCorner: 0.07,
  cornerExit: 0.08, racecraft: 0.10, consistency: 0.07, overtaking: 0.06, qualifying: 0.05,
  tireManagement: 0.05, mental: 0.04, wet: 0.04,
};

export function computeOVR(a) {
  let s = 0, w = 0;
  for (const k in OVR_WEIGHTS) { s += (a[k] ?? 70) * OVR_WEIGHTS[k]; w += OVR_WEIGHTS[k]; }
  return Math.round(s / w);
}

export function ovrTier(o) {
  if (o >= 98) return 'GOAT';
  if (o >= 96) return 'ALL-TIME GREAT';
  if (o >= 94) return 'CHAMPION';
  if (o >= 91) return 'CONTENDER';
  if (o >= 88) return 'ELITE WINNER';
  if (o >= 85) return 'STRONG';
  if (o >= 81) return 'COMPETITIVE';
  if (o >= 76) return 'MIDFIELD';
  return 'DEVELOPING';
}

export const STYLE_TAGS = [
  'Late Brake Master', 'Corner Speed Specialist', 'Smooth Operator', 'Aggressive Attacker',
  'Tire Whisperer', 'Wet Master', 'Defensive Master', 'Launch Specialist', 'Qualifying Ace', 'Front-End Feel',
];
export const PERSONALITIES = ['AGGRESSIVE', 'CALCULATED', 'SMOOTH', 'DEFENSIVE', 'LATE BRAKER', 'TIRE SAVER', 'RAIN MASTER', 'QUALIFYING SPECIALIST'];
