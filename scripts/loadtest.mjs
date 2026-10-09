// Load test: 20 fake players join, run around and shoot; a 21st must be turned away.
// Usage: node scripts/loadtest.mjs [ws://host:port] [seconds]
import WebSocket from 'ws';
import { SPAWNS } from '../shared/map.js';
import { createBody, stepBody } from '../shared/physics.js';
import { WEAPONS } from '../shared/weapons.js';
import { dirFromAngles } from '../shared/rng.js';
import { eyeHeight } from '../shared/constants.js';

const url = process.argv[2] || 'ws://localhost:2567';
const seconds = Number(process.argv[3] || 20);
const N = 20;

const stats = { joined: 0, kills: 0, snaps: 0, bytes: 0, corrections: 0, full: false, maxSnapBytes: 0 };

function bot(i) {
  return new Promise((resolve) => {
    const ws = new WebSocket(url);
    let body = null;
    let yaw = Math.random() * 6.28;
    let alive = false;
    let last = Date.now();
    let timer = null;
    ws.on('open', () => ws.send(JSON.stringify({ t: 'join', name: `Load${i}`, outfit: i % 4, primary: ['ak47', 'm4a1s', 'awp'][i % 3] })));
    ws.on('message', (data) => {
      stats.bytes += data.length;
      const m = JSON.parse(data);
      if (m.t === 'welcome') {
        stats.joined++;
        resolve(ws);
        timer = setInterval(() => {
          if (!alive || !body) return;
          const now = Date.now();
          const dt = Math.min(0.1, (now - last) / 1000);
          last = now;
          if (Math.random() < 0.05) yaw += (Math.random() - 0.5) * 2;
          stepBody(body, { fwd: 1, side: 0, yaw, jump: Math.random() < 0.02, crouch: false, walk: false, maxSpeed: WEAPONS.ak47.maxSpeed, scoped: false }, dt);
          ws.send(JSON.stringify({ t: 'in', x: body.x, y: body.y, z: body.z, yaw, pitch: 0, c: 0, w: 'ak47', g: body.onGround ? 1 : 0 }));
          if (Math.random() < 0.3) {
            const d = dirFromAngles(yaw, 0);
            ws.send(JSON.stringify({ t: 'fire', w: 'ak47', o: [body.x, body.y + eyeHeight(0), body.z], d, vt: 0 }));
          }
        }, 33);
      } else if (m.t === 'spawn' && m.id === stats[`id${i}`]) {
        body = createBody(m.x, m.z);
        alive = true;
      } else if (m.t === 'kill') {
        if (i === 0) stats.kills++;
        if (m.v === stats[`id${i}`]) alive = false;
      } else if (m.t === 'snap') {
        if (i === 0) {
          stats.snaps++;
          stats.maxSnapBytes = Math.max(stats.maxSnapBytes, data.length);
        }
      } else if (m.t === 'correct') {
        stats.corrections++;
        if (body) Object.assign(body, { x: m.x, y: m.y, z: m.z });
      }
      if (m.t === 'welcome') stats[`id${i}`] = m.id;
    });
    ws.on('close', () => clearInterval(timer));
  });
}

const sockets = [];
for (let i = 0; i < N; i++) sockets.push(await bot(i));
console.log(`joined ${stats.joined}/${N}`);

// 21st player must be refused
await new Promise((resolve) => {
  const ws = new WebSocket(url);
  ws.on('open', () => ws.send(JSON.stringify({ t: 'join', name: 'Extra', outfit: 0, primary: 'ak47' })));
  ws.on('message', (d) => {
    if (JSON.parse(d).t === 'full') stats.full = true;
  });
  ws.on('close', resolve);
  setTimeout(resolve, 3000);
});

const t0 = Date.now();
await new Promise((r) => setTimeout(r, seconds * 1000));
const secs = (Date.now() - t0) / 1000;
for (const ws of sockets) ws.close();
console.log({
  seconds: Math.round(secs),
  twentyFirstRefused: stats.full,
  killsSeen: stats.kills,
  snapshotsPerSec: +(stats.snaps / secs).toFixed(1),
  maxSnapshotBytes: stats.maxSnapBytes,
  downloadPerPlayerKBs: +((stats.bytes / N / secs) / 1024).toFixed(1),
  movementCorrections: stats.corrections,
});
process.exit(0);
