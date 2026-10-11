// Binary state packets for the unreliable channel: Float32Array [type, raceT, ...entries x 14]
// (~4 bytes/field vs ~7-9 for JSON text; no string building or JSON parse per packet).
export const W = 14;
const TYPES = ['', 'S', 'G'];
export function encodeState(type, raceT, entries) {
  const a = new Float32Array(2 + entries.length * W);
  a[0] = type === 'S' ? 1 : 2; a[1] = raceT;
  for (let k = 0; k < entries.length; k++) a.set(entries[k], 2 + k * W);
  return a.buffer;
}
export function isBinary(m) { return m instanceof ArrayBuffer || ArrayBuffer.isView(m); }
export function decodeState(m) {
  const a = m instanceof ArrayBuffer ? new Float32Array(m) : new Float32Array(m.buffer, m.byteOffset, m.byteLength >> 2);
  const e = []; for (let o = 2; o + W <= a.length; o += W) e.push(Array.from(a.subarray(o, o + W)));
  return { t: TYPES[a[0]] || '?', r: a[1], e };
}
