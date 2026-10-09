// LOFICAGE game server: one public deathmatch room over WebSockets.
// Render (or any Node host) runs `npm start`; PORT comes from the environment.
import http from 'node:http';
import { WebSocketServer } from 'ws';
import { Game } from '../shared/game.js';
import { GAME_NAME, MAX_HUMANS } from '../shared/constants.js';

const PORT = Number(process.env.PORT) || 2567;
const started = Date.now();

const game = new Game({
  now: () => performance.now() / 1000,
  log: (...a) => console.log(new Date().toISOString(), ...a),
});
// measure how long each simulation tick takes (logged once a minute while people play)
const tickStats = { ms: 0, max: 0, n: 0 };
const update = game.update.bind(game);
game.update = (dt) => {
  const t = performance.now();
  update(dt);
  const ms = performance.now() - t;
  tickStats.ms += ms;
  tickStats.max = Math.max(tickStats.max, ms);
  tickStats.n++;
};
setInterval(() => {
  if (game.humans() > 0 && tickStats.n) {
    console.log(`tick avg ${(tickStats.ms / tickStats.n).toFixed(2)} ms, max ${tickStats.max.toFixed(2)} ms, players ${game.players.size}`);
  }
  Object.assign(tickStats, { ms: 0, max: 0, n: 0 });
}, Number(process.env.TICK_LOG_MS) || 60000);
game.start();

const server = http.createServer((req, res) => {
  // health check + a tiny status page (also what wakes a sleeping free server)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({
    game: GAME_NAME,
    ok: true,
    players: game.humans(),
    max: MAX_HUMANS,
    uptime: Math.round((Date.now() - started) / 1000),
  }));
});

const wss = new WebSocketServer({ server, maxPayload: 4096, perMessageDeflate: false });

wss.on('connection', (ws) => {
  ws.isAlive = true;
  const conn = {
    send: (obj) => ws.readyState === 1 && ws.send(JSON.stringify(obj)),
    sendRaw: (str) => ws.readyState === 1 && ws.send(str),
    close: () => ws.close(),
  };
  const handler = game.connect(conn);
  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    handler.message(msg);
  });
  ws.on('pong', () => {
    ws.isAlive = true;
  });
  ws.on('close', () => handler.close());
  ws.on('error', () => {});
});

// drop dead connections
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 10000);

server.listen(PORT, () => console.log(`${GAME_NAME} server on :${PORT}`));
