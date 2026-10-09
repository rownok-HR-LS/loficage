// Headless check: spawns are clear, nav grid is connected, bots fight and kill each other.
import { Game } from '../shared/game.js';
import { SPAWNS, MAP_BOXES } from '../shared/map.js';
import { collides } from '../shared/physics.js';
import { NAV_NODES, findPath, nodePos } from '../shared/nav.js';

let bad = 0;
for (const s of SPAWNS) if (collides(s.x, 0, s.z, 1.8)) { console.log('BLOCKED SPAWN', s); bad++; }
console.log('boxes', MAP_BOXES.length, 'spawns', SPAWNS.length, 'blocked', bad, 'nav nodes', NAV_NODES.length);

// connectivity: every spawn can path to every other
let fails = 0;
for (const a of SPAWNS) for (const b of SPAWNS) if (a !== b && !findPath(a.x, a.z, b.x, b.z)) fails++;
console.log('unreachable spawn pairs', fails);

let fake = 0;
const game = new Game({ now: () => fake });
const inbox = [];
const conn = { send: (m) => inbox.push(m) };
const h = game.connect(conn);
h.message({ t: 'join', name: 'Tester<script>', outfit: 2, primary: 'awp' });
game.balanceBots();
console.log('players', game.players.size, 'welcome name', [...game.players.values()][0].name);
const me = [...game.players.values()].find((p) => !p.bot);
me.protectUntil = 1e9; // keep the stationary tester out of the fight
let kills = 0, shots = 0, hs = 0;
const t0 = Date.now();
for (let i = 0; i < 20 * 180; i++) {
  fake += 0.05;
  me.protectUntil = 1e9;
  game.update(0.05);
}
for (const m of inbox) { if (m.t === 'kill') { kills++; if (m.hs) hs++; } if (m.t === 'shot') shots++; }
console.log('3 sim minutes in', Date.now() - t0, 'ms; shots', shots, 'kills', kills, 'headshots', hs);
const stuck = [...game.players.values()].filter((p) => p.bot && collides(p.body.x, p.body.y + 0.02, p.body.z, 1.7, 0.25));
console.log('bots inside walls', stuck.length);
console.table([...game.players.values()].map((p) => ({ name: p.name, k: p.kills, d: p.deaths, w: p.primary, x: p.body.x.toFixed(1), z: p.body.z.toFixed(1) })));
