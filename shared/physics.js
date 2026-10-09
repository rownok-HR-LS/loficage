// Source-style player movement against the box world. Pure JS, shared by client and server bots.
import {
  PLAYER_RADIUS, STEP_HEIGHT, GRAVITY, JUMP_SPEED, ACCELERATE, AIR_ACCELERATE, AIR_WISH_CAP,
  FRICTION, STOP_SPEED, WALK_FACTOR, CROUCH_FACTOR, SCOPED_FACTOR, bodyHeight,
} from './constants.js';
import { MAP_BOXES, MAP_HALF } from './map.js';

const EPS = 0.001;

/** A fresh physics body standing at (x, z). */
export function createBody(x = 0, z = 0) {
  return { x, y: 0, z, vx: 0, vy: 0, vz: 0, crouch: 0, onGround: true, jumpHeld: false };
}

function overlaps(b, x, y, z, h, r = PLAYER_RADIUS) {
  return (
    x + r > b.min[0] + EPS && x - r < b.max[0] - EPS &&
    y + h > b.min[1] + EPS && y < b.max[1] - EPS &&
    z + r > b.min[2] + EPS && z - r < b.max[2] - EPS
  );
}

/** True if a player box with feet at (x, y, z) and height h hits the map. */
export function collides(x, y, z, h, r = PLAYER_RADIUS) {
  if (y < -EPS) return true;
  for (const b of MAP_BOXES) if (overlaps(b, x, y, z, h, r)) return true;
  return false;
}

function accelerate(body, wx, wz, wishSpeed, accel, dt) {
  const current = body.vx * wx + body.vz * wz;
  const add = wishSpeed - current;
  if (add <= 0) return;
  const step = Math.min(accel * dt * wishSpeed, add);
  body.vx += step * wx;
  body.vz += step * wz;
}

// Quake/Source air control: the speed cap applies to the gain, not the acceleration rate.
function airAccelerate(body, wx, wz, wishSpeed, dt) {
  const capped = Math.min(wishSpeed, AIR_WISH_CAP);
  const current = body.vx * wx + body.vz * wz;
  const add = capped - current;
  if (add <= 0) return;
  const step = Math.min(AIR_ACCELERATE * wishSpeed * dt, add);
  body.vx += step * wx;
  body.vz += step * wz;
}

function applyFriction(body, dt) {
  const speed = Math.hypot(body.vx, body.vz);
  if (speed < 0.01) {
    body.vx = 0;
    body.vz = 0;
    return;
  }
  const control = Math.max(speed, STOP_SPEED);
  const drop = control * FRICTION * dt;
  const scale = Math.max(speed - drop, 0) / speed;
  body.vx *= scale;
  body.vz *= scale;
}

/** Move along one horizontal axis, stepping up small ledges (stairs, kerbs). */
function moveHorizontal(body, axis, delta, h) {
  if (delta === 0) return;
  const nx = axis === 0 ? body.x + delta : body.x;
  const nz = axis === 2 ? body.z + delta : body.z;
  if (!collides(nx, body.y, nz, h)) {
    body.x = nx;
    body.z = nz;
    return;
  }
  // try stepping up
  if (body.onGround) {
    for (let s = 0.1; s <= STEP_HEIGHT + EPS; s += 0.08) {
      if (!collides(nx, body.y + s, nz, h)) {
        // settle back down onto the step
        let y = body.y + s;
        while (y - 0.02 > body.y - EPS && !collides(nx, y - 0.02, nz, h)) y -= 0.02;
        body.x = nx;
        body.z = nz;
        body.y = y;
        return;
      }
    }
  }
  // blocked: slide up to the wall using a binary search
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 8; i++) {
    const mid = (lo + hi) / 2;
    const tx = axis === 0 ? body.x + delta * mid : body.x;
    const tz = axis === 2 ? body.z + delta * mid : body.z;
    if (collides(tx, body.y, tz, h)) hi = mid;
    else lo = mid;
  }
  if (axis === 0) {
    body.x += delta * lo;
    body.vx = 0;
  } else {
    body.z += delta * lo;
    body.vz = 0;
  }
}

/**
 * One movement step.
 * input: { fwd, side } in -1..1, yaw (radians), jump, crouch, walk (bools), maxSpeed, scoped
 */
export function stepBody(body, input, dt) {
  // crouch transition; standing up needs head room
  const wantCrouch = input.crouch ? 1 : 0;
  if (wantCrouch > body.crouch) {
    const before = bodyHeight(body.crouch);
    body.crouch = Math.min(1, body.crouch + dt * 8);
    // crouching in the air pulls the legs up (crouch-jump)
    if (!body.onGround) body.y += before - bodyHeight(body.crouch);
  } else if (wantCrouch < body.crouch) {
    const next = Math.max(0, body.crouch - dt * 8);
    if (!collides(body.x, body.y, body.z, bodyHeight(next))) body.crouch = next;
  }
  const h = bodyHeight(body.crouch);

  // wish direction from yaw (yaw 0 looks toward -z)
  const sin = Math.sin(input.yaw);
  const cos = Math.cos(input.yaw);
  let wx = -sin * input.fwd + cos * input.side;
  let wz = -cos * input.fwd - sin * input.side;
  const len = Math.hypot(wx, wz);
  if (len > 0) {
    wx /= len;
    wz /= len;
  }
  let wishSpeed = len > 0 ? input.maxSpeed : 0;
  if (input.walk) wishSpeed *= WALK_FACTOR;
  if (body.crouch > 0.5) wishSpeed *= CROUCH_FACTOR;
  if (input.scoped) wishSpeed *= SCOPED_FACTOR;

  if (body.onGround) {
    if (input.jump && !body.jumpHeld) {
      body.vy = JUMP_SPEED;
      body.onGround = false;
      body.jumpHeld = true;
    } else {
      applyFriction(body, dt);
      accelerate(body, wx, wz, wishSpeed, ACCELERATE, dt);
    }
  } else {
    airAccelerate(body, wx, wz, wishSpeed, dt);
  }
  if (!input.jump) body.jumpHeld = false;

  // gravity + vertical move
  body.vy -= GRAVITY * dt;
  const ny = body.y + body.vy * dt;
  if (collides(body.x, ny, body.z, h)) {
    if (body.vy < 0) {
      // land: find the surface
      let lo = ny;
      let hi = body.y;
      for (let i = 0; i < 10; i++) {
        const mid = (lo + hi) / 2;
        if (collides(body.x, mid, body.z, h)) lo = mid;
        else hi = mid;
      }
      body.y = hi;
      body.onGround = true;
    }
    body.vy = 0;
  } else {
    body.y = ny;
    body.onGround = false;
  }
  if (body.y <= 0) {
    body.y = 0;
    if (body.vy <= 0) {
      body.vy = 0;
      body.onGround = true;
    }
  }

  moveHorizontal(body, 0, body.vx * dt, h);
  moveHorizontal(body, 2, body.vz * dt, h);

  // still standing on something?
  if (body.onGround && body.y > 0 && !collides(body.x, body.y - 0.05, body.z, h)) {
    body.onGround = false;
  }

  const lim = MAP_HALF - PLAYER_RADIUS;
  body.x = Math.max(-lim, Math.min(lim, body.x));
  body.z = Math.max(-lim, Math.min(lim, body.z));
  return body;
}

