// Tiny WebSocket relay used as the offline/CI loopback transport for the online mode (?relay=ws://localhost:PORT).
// One room = one host + one guest; messages are forwarded verbatim. Not used in production.
import { WebSocketServer } from 'ws';
export function startRelay(port = 9012) {
  const rooms = new Map(); const wss = new WebSocketServer({ port });
  wss.on('connection', (ws) => {
    ws.on('message', (buf) => {
      const txt = buf.toString();
      if (!ws.room) {
        const { join, role } = JSON.parse(txt); let r = rooms.get(join);
        if (role === 'host') { if (r && r.host && r.host.readyState === 1) return ws.send('{"sys":"taken"}'); r = r || {}; r.host = ws; rooms.set(join, r); }
        else { if (!r || !r.host || r.host.readyState !== 1) { ws.send('{"sys":"no-room"}'); return setTimeout(() => ws.close(), 50); } if (r.guest && r.guest.readyState === 1) r.guest.close(); r.guest = ws; }
        ws.room = join; ws.role = role;
        if (r.host && r.guest && r.host.readyState === 1 && r.guest.readyState === 1) { r.host.send('{"sys":"peer-open"}'); r.guest.send('{"sys":"peer-open"}'); }
        return;
      }
      const r = rooms.get(ws.room); const other = r && (ws.role === 'host' ? r.guest : r.host);
      if (other && other.readyState === 1) other.send(txt);
    });
    ws.on('close', () => { const r = rooms.get(ws.room); if (!r) return; const other = ws.role === 'host' ? r.guest : r.host; if (r[ws.role] === ws) r[ws.role] = null; if (other && other.readyState === 1) other.send('{"sys":"peer-close"}'); });
  });
  return wss;
}
if (import.meta.url === `file://${process.argv[1]}`) { startRelay(+(process.argv[2] || 9012)); console.log('relay on', process.argv[2] || 9012); }
