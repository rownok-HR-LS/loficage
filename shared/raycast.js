// Ray tests against the box world and player hitboxes.
import { MAP_BOXES } from './map.js';
import { bodyHeight } from './constants.js';

/** Slab test. Returns { t, axis, sign } for the entry face, or null. */
export function rayBox(ox, oy, oz, dx, dy, dz, min, max, maxT) {
  let tmin = 0;
  let tmax = maxT;
  let axis = -1;
  let sign = 0;
  const o = [ox, oy, oz];
  const d = [dx, dy, dz];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < min[i] || o[i] > max[i]) return null;
      continue;
    }
    const inv = 1 / d[i];
    let t1 = (min[i] - o[i]) * inv;
    let t2 = (max[i] - o[i]) * inv;
    let s = -1;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
      s = 1;
    }
    if (t1 > tmin) {
      tmin = t1;
      axis = i;
      sign = s;
    }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (axis === -1) return null; // origin inside the box
  return { t: tmin, axis, sign };
}

/** Nearest world hit along a normalised ray, or null. Includes the ground plane (y = 0). */
export function rayWorld(ox, oy, oz, dx, dy, dz, maxT = 200) {
  let best = null;
  for (const b of MAP_BOXES) {
    const hit = rayBox(ox, oy, oz, dx, dy, dz, b.min, b.max, best ? best.t : maxT);
    if (hit && (!best || hit.t < best.t)) best = { t: hit.t, axis: hit.axis, sign: hit.sign, box: b };
  }
  if (dy < 0) {
    const t = -oy / dy;
    if (t > 0 && t < (best ? best.t : maxT)) best = { t, axis: 1, sign: 1, box: null };
  }
  if (best) {
    best.normal = [0, 0, 0];
    best.normal[best.axis] = best.sign;
  }
  return best;
}

/** True if nothing solid blocks the segment between two points. */
export function lineOfSight(ax, ay, az, bx, by, bz) {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) return true;
  const hit = rayWorld(ax, ay, az, dx / len, dy / len, dz / len, len);
  return !hit;
}

function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const lx = ox - cx;
  const ly = oy - cy;
  const lz = oz - cz;
  const b = lx * dx + ly * dy + lz * dz;
  const c = lx * lx + ly * ly + lz * lz - r * r;
  const disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : null;
}

/** Hitbox parts for a player standing with feet at (x, y, z). */
export function hitboxes(x, y, z, crouch) {
  const h = bodyHeight(crouch);
  return [
    { group: 'head', sphere: [x, y + h * 0.905, z], r: 0.125 },
    { group: 'chest', min: [x - 0.23, y + h * 0.62, z - 0.2], max: [x + 0.23, y + h * 0.84, z + 0.2] },
    { group: 'stomach', min: [x - 0.2, y + h * 0.47, z - 0.18], max: [x + 0.2, y + h * 0.62, z + 0.18] },
    { group: 'legs', min: [x - 0.2, y, z - 0.16], max: [x + 0.2, y + h * 0.47, z + 0.16] },
  ];
}

/** Nearest hitbox hit on one player, or null. */
export function rayPlayer(ox, oy, oz, dx, dy, dz, px, py, pz, crouch, maxT) {
  let best = null;
  for (const part of hitboxes(px, py, pz, crouch)) {
    let t = null;
    if (part.sphere) {
      t = raySphere(ox, oy, oz, dx, dy, dz, part.sphere[0], part.sphere[1], part.sphere[2], part.r);
    } else {
      const hit = rayBox(ox, oy, oz, dx, dy, dz, part.min, part.max, maxT);
      t = hit ? hit.t : null;
    }
    if (t !== null && t < maxT && (!best || t < best.t)) best = { t, group: part.group };
  }
  return best;
}
