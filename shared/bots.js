// Server-side bots: roam the nav grid, spot enemies, react, aim with error, and shoot like CS players
// (stop to shoot, short bursts, strafe between bursts).
import { WEAPONS, recoilAt, inaccuracy, fireInterval } from './weapons.js';
import { eyeHeight, bodyHeight } from './constants.js';
import { stepBody } from './physics.js';
import { lineOfSight } from './raycast.js';
import { findPath, randomNode, nodePos } from './nav.js';
import { bulletDirection } from './rng.js';

const DEG = Math.PI / 180;
const VIEW_RANGE = 70;
const FOV_COS = Math.cos(80 * DEG);

export function createBrain(rand) {
  return {
    rand,
    path: null,
    pathIdx: 0,
    repathAt: 0,
    target: null,
    lastSeen: 0,
    visible: false,
    reactAt: 0,
    errYaw: 0,
    errPitch: 0,
    aimHead: false,
    nextThink: 0,
    burstLeft: 0,
    pauseUntil: 0,
    strafe: 1,
    strafeUntil: 0,
    spray: 0,
    lastShot: -10,
    stuckCheckAt: 0,
    stuckX: 0,
    stuckZ: 0,
    jump: false,
    crouchUntil: 0,
    hurtBy: 0,
    skill: 0.75 + rand() * 0.5, // 0.75..1.25
  };
}

function angleTo(ex, ey, ez, tx, ty, tz) {
  const dx = tx - ex;
  const dz = tz - ez;
  return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(ty - ey, Math.hypot(dx, dz)) };
}

function wrap(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function turnToward(cur, target, maxStep) {
  const d = wrap(target - cur);
  return cur + Math.max(-maxStep, Math.min(maxStep, d));
}

function aimPoint(q, head) {
  const h = bodyHeight(q.body.crouch);
  return [q.body.x, q.body.y + h * (head ? 0.9 : 0.7), q.body.z];
}

function canSee(game, bot, q) {
  const ey = bot.body.y + eyeHeight(bot.body.crouch);
  const qh = bodyHeight(q.body.crouch);
  return (
    lineOfSight(bot.body.x, ey, bot.body.z, q.body.x, q.body.y + qh * 0.9, q.body.z) ||
    lineOfSight(bot.body.x, ey, bot.body.z, q.body.x, q.body.y + qh * 0.6, q.body.z)
  );
}

function think(game, bot, b, t) {
  const ex = bot.body.x;
  const ey = bot.body.y + eyeHeight(bot.body.crouch);
  const ez = bot.body.z;
  const fx = -Math.sin(bot.yaw);
  const fz = -Math.cos(bot.yaw);
  let best = null;
  let bestD = Infinity;
  for (const q of game.players.values()) {
    if (q === bot || !q.alive) continue;
    const dx = q.body.x - ex;
    const dz = q.body.z - ez;
    const d = Math.hypot(dx, dz);
    if (d > VIEW_RANGE) continue;
    const facing = (dx * fx + dz * fz) / Math.max(d, 1e-3);
    const noticed = facing > FOV_COS || d < 5 || q.id === b.hurtBy || (t - q.lastShot < 0.6 && d < 35);
    if (!noticed) continue;
    if (d < bestD && canSee(game, bot, q)) {
      best = q;
      bestD = d;
    }
  }
  if (best) {
    if (b.target !== best || !b.visible) {
      b.reactAt = t + (0.22 + b.rand() * 0.28) / b.skill;
      b.errYaw = (b.rand() - 0.5) * 9 * DEG / b.skill;
      b.errPitch = (b.rand() - 0.5) * 5 * DEG / b.skill;
      b.aimHead = b.rand() < 0.3 * b.skill;
    }
    b.target = best;
    b.visible = true;
    b.lastSeen = t;
    b.hurtBy = 0;
  } else {
    b.visible = false;
    if (b.target && t - b.lastSeen > 3) b.target = null;
  }
}

function roam(game, bot, b, t, input) {
  if (!b.path || b.pathIdx >= b.path.length || t > b.repathAt) {
    let gx;
    let gz;
    if (b.target && !b.visible) {
      // hunt the last place we saw them
      gx = b.target.body.x;
      gz = b.target.body.z;
    } else {
      [gx, gz] = nodePos(randomNode(b.rand));
    }
    b.path = findPath(bot.body.x, bot.body.z, gx, gz);
    b.pathIdx = 0;
    b.repathAt = t + 8 + b.rand() * 6;
    if (!b.path) return;
  }
  const [wx, wz] = b.path[b.pathIdx];
  const dx = wx - bot.body.x;
  const dz = wz - bot.body.z;
  if (Math.hypot(dx, dz) < 0.9) {
    b.pathIdx++;
    return;
  }
  const want = Math.atan2(-dx, -dz);
  bot.yaw = turnToward(bot.yaw, want, 6 * (1 / 20) * 3);
  bot.pitch = turnToward(bot.pitch, 0, 0.1);
  input.fwd = Math.cos(wrap(want - bot.yaw)) > 0.3 ? 1 : 0.3;
  input.walk = false;

  // unstick
  if (t > b.stuckCheckAt) {
    if (Math.hypot(bot.body.x - b.stuckX, bot.body.z - b.stuckZ) < 0.4) {
      input.jump = true;
      b.path = null;
    }
    b.stuckX = bot.body.x;
    b.stuckZ = bot.body.z;
    b.stuckCheckAt = t + 1.2;
  }
}

function fight(game, bot, b, t, dt, input) {
  const q = b.target;
  const w = WEAPONS[bot.weapon];
  const ey = bot.body.y + eyeHeight(bot.body.crouch);
  const [tx, ty, tz] = aimPoint(q, b.aimHead);
  const want = angleTo(bot.body.x, ey, bot.body.z, tx, ty, tz);
  // aim error shrinks while tracking
  const decay = Math.exp(-dt * 2.6 * b.skill);
  b.errYaw *= decay;
  b.errPitch *= decay;
  const turn = (300 + 220 * b.skill) * DEG * dt;
  bot.yaw = turnToward(bot.yaw, want.yaw + b.errYaw, turn);
  bot.pitch = turnToward(bot.pitch, want.pitch + b.errPitch, turn);

  const dist = Math.hypot(tx - bot.body.x, tz - bot.body.z);
  const offYaw = Math.abs(wrap(want.yaw - bot.yaw)) * dist;
  const offPitch = Math.abs(want.pitch - bot.pitch) * dist;
  const onTarget = offYaw < 0.35 && offPitch < 0.45;

  // movement: strafe between bursts, stop when shooting
  const shooting = b.burstLeft > 0 && t >= b.pauseUntil;
  if (!shooting) {
    if (t > b.strafeUntil) {
      b.strafe = b.rand() < 0.5 ? -1 : 1;
      b.strafeUntil = t + 0.35 + b.rand() * 0.6;
    }
    input.side = w.sniper ? 0 : b.strafe;
    if (dist > 30 && !w.sniper) input.fwd = 0.5;
  }
  if (t < b.crouchUntil) input.crouch = true;

  if (t < b.reactAt || !onTarget) return;
  const a = bot.ammo[w.id];
  if (a.mag <= 0) {
    game.startReload(bot);
    return;
  }
  if (bot.reloadUntil > t || t < bot.drawUntil) return;
  if (b.burstLeft <= 0) {
    if (t < b.pauseUntil) return;
    b.burstLeft = w.auto ? (dist > 25 ? 2 + Math.floor(b.rand() * 2) : 3 + Math.floor(b.rand() * 4)) : 1;
    if (b.rand() < 0.15) b.crouchUntil = t + 1.2;
  }
  const speed = Math.hypot(bot.body.vx, bot.body.vz);
  if (speed > w.maxSpeed * 0.34 && !w.sniper) {
    input.side = 0;
    input.fwd = 0;
    return; // counter-strafe first
  }
  if (w.sniper && speed > 0.6) {
    input.side = 0;
    input.fwd = 0;
    return;
  }
  const interval = w.auto ? fireInterval(w) : Math.max(fireInterval(w), w.sniper ? 0 : 0.42);
  if (t - b.lastShot < interval) return;
  fireBot(game, bot, w, b, t, speed);
  b.burstLeft--;
  if (b.burstLeft <= 0) b.pauseUntil = t + (w.auto ? 0.25 + b.rand() * 0.25 : w.sniper ? 0.4 : 0.15);
}

function fireBot(game, bot, w, b, t, speed) {
  const a = bot.ammo[w.id];
  // spray index decays between shots, like the player's recoil
  const since = t - b.lastShot;
  b.spray = since > w.recoilReset ? 0 : Math.max(0, b.spray - since * 8);
  const recoil = recoilAt(w, b.spray);
  // bots only partly compensate recoil
  const comp = 0.55 * b.skill;
  const inacc = inaccuracy(w, {
    speed,
    crouch: bot.body.crouch,
    airborne: !bot.body.onGround,
    scoped: true,
    shotPenalty: Math.min(w.inacc.maxShot, b.spray * w.inacc.perShot),
  });
  const ey = bot.body.y + eyeHeight(bot.body.crouch);
  const dir = bulletDirection(bot.yaw, bot.pitch, [recoil[0] * (1 - comp), recoil[1] * (1 - comp)], inacc, b.rand);
  a.mag--;
  bot.lastShot = t;
  b.lastShot = t;
  b.spray += 1;
  bot.protectUntil = 0;
  game.resolveShot(bot, w, [bot.body.x, ey, bot.body.z], dir, t, false);
}

export function updateBot(game, bot, dt, t) {
  const b = bot.brain;
  const w = WEAPONS[bot.weapon];
  const input = { fwd: 0, side: 0, yaw: bot.yaw, jump: false, crouch: false, walk: false, maxSpeed: w.maxSpeed, scoped: false };

  if (t >= b.nextThink) {
    b.nextThink = t + 0.12;
    think(game, bot, b, t);
  }
  if (b.target && !b.target.alive) {
    b.target = null;
    b.visible = false;
  }
  if (b.target && b.visible) fight(game, bot, b, t, dt, input);
  else {
    roam(game, bot, b, t, input);
    const a = bot.ammo[w.id];
    if (a.mag < w.mag * 0.4 && a.reserve > 0) game.startReload(bot);
  }
  input.yaw = bot.yaw;
  stepBody(bot.body, input, dt);
  game.recordHistory(bot);
}
