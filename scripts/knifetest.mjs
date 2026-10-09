// Headless knife checks: speeds, slash/stab damage, backstab, range.
import { Game } from '../shared/game.js';
import { WEAPONS } from '../shared/weapons.js';
import { eyeHeight } from '../shared/constants.js';

const U = 0.0254;
console.log('max speed (CS units/s):', Object.fromEntries(Object.values(WEAPONS).map((w) => [w.name, Math.round(w.maxSpeed / U)])));

let now = 100;
const game = new Game({ now: () => now });
const inbox = { a: [], b: [] };
const a = game.connect({ send: (m) => inbox.a.push(m) });
const b = game.connect({ send: (m) => inbox.b.push(m) });
a.message({ t: 'join', name: 'A', outfit: 0, primary: 'ak47' });
b.message({ t: 'join', name: 'B', outfit: 1, primary: 'ak47' });
for (const p of [...game.players.values()]) if (p.bot) game.players.delete(p.id);
const [A, B] = [...game.players.values()];

function setup(bFacing) {
  now += 5;
  for (const p of [A, B]) { p.alive = true; p.hp = 100; p.protectUntil = 0; p.history = []; p.lastShot = -10; p.lastSlash = -10; }
  A.body.x = 0; A.body.z = 0; A.body.y = 0; A.yaw = 0; // A looks toward -z
  B.body.x = 0; B.body.z = -1.0; B.body.y = 0; B.yaw = bFacing; // 0 = B faces away from A (A is behind)
  game.recordHistory(A); game.recordHistory(B);
  A.weapon = 'knife'; A.drawUntil = 0;
}
const swing = (k, pitch = -0.35) => {
  now += 1.1;
  const d = [0, Math.sin(pitch), -Math.cos(pitch)];
  a.message({ t: 'melee', k, o: [A.body.x, eyeHeight(0), A.body.z], d, vt: now });
};

setup(Math.PI); swing('slash'); const slash1 = 100 - B.hp;
now += 0.0; setup(Math.PI); swing('slash'); now -= 0.6; A.lastShot = -10; swing('slash'); const slashFollow = 100 - B.hp - slash1;
setup(Math.PI); swing('stab'); const stab = 100 - B.hp;
setup(0); swing('slash'); const backSlash = 100 - B.hp;
setup(0); swing('stab'); const backStab = { alive: B.alive, hp: B.hp };
setup(Math.PI); B.body.z = -3; game.recordHistory(B); swing('stab'); const outOfRange = 100 - B.hp;
setup(Math.PI); A.weapon = 'ak47'; swing('stab'); const notHolding = 100 - B.hp;
console.log({ slash: slash1, slashFollowup: slashFollow, stab, backstabSlash: backSlash, backstabStab: backStab, outOfRange, knifeNotEquipped: notHolding });
