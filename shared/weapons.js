// Weapon stats, modelled on CS2 values. Angles are in degrees.
// recoil: cumulative [right, up] offset of the bullet for each shot in a spray.

const U = 0.0254; // CS units to metres

function pattern(points, scale = 1) {
  return points.map(([x, y]) => [x * scale, y * scale]);
}

const AK_PATTERN = pattern([
  [0, 0], [0, 0.35], [0.05, 0.9], [-0.1, 1.6], [-0.05, 2.4], [0.1, 3.2], [0.3, 3.9], [-0.2, 4.5],
  [-0.9, 5.0], [-1.5, 5.3], [-2.2, 5.5], [-1.6, 5.7], [-0.6, 5.8], [0.6, 5.9], [1.6, 6.0], [2.4, 6.0],
  [2.9, 6.1], [2.4, 6.2], [1.6, 6.2], [0.8, 6.3], [1.4, 6.4], [2.0, 6.4], [1.4, 6.5], [0.4, 6.5],
  [-0.6, 6.6], [-1.6, 6.6], [-2.4, 6.6], [-2.0, 6.7], [-1.2, 6.7], [-0.4, 6.8],
]);

const M4_PATTERN = pattern([
  [0, 0], [0, 0.3], [0.02, 0.75], [-0.05, 1.3], [0, 1.9], [0.1, 2.5], [0.25, 3.0], [-0.1, 3.4],
  [-0.6, 3.7], [-1.0, 3.9], [-1.3, 4.0], [-0.9, 4.1], [-0.3, 4.2], [0.4, 4.3], [1.0, 4.3], [1.4, 4.4],
  [1.1, 4.4], [0.6, 4.5], [0.1, 4.5], [-0.3, 4.6],
]);

const DEAGLE_PATTERN = pattern([
  [0, 0], [0.15, 2.2], [-0.25, 3.8], [0.35, 5.0], [-0.3, 5.9], [0.25, 6.5], [-0.2, 7.0],
]);

const AWP_PATTERN = pattern([[0, 0], [0, 3.5], [0, 5], [0, 6], [0, 6.5]]);

export const WEAPONS = {
  ak47: {
    id: 'ak47', index: 0, name: 'AK-47', slot: 'primary', auto: true,
    damage: 36, armorPen: 0.775, rangeMod: 0.98, rpm: 600,
    mag: 30, reserve: 90, reloadTime: 2.45, drawTime: 0.7,
    maxSpeed: 215 * U,
    inacc: { stand: 0.22, crouch: 0.15, move: 7.0, air: 14, perShot: 0.32, maxShot: 2.2 },
    recovery: 0.32, // seconds for per-shot inaccuracy to fade
    recoil: AK_PATTERN, recoilReset: 0.42, viewKick: 0.5,
    sound: 'ak',
  },
  m4a1s: {
    id: 'm4a1s', index: 1, name: 'M4A1-S', slot: 'primary', auto: true, silenced: true,
    damage: 38, armorPen: 0.7, rangeMod: 0.99, rpm: 600,
    mag: 20, reserve: 80, reloadTime: 3.05, drawTime: 0.7,
    maxSpeed: 225 * U,
    inacc: { stand: 0.18, crouch: 0.12, move: 6.0, air: 13, perShot: 0.24, maxShot: 1.7 },
    recovery: 0.3,
    recoil: M4_PATTERN, recoilReset: 0.38, viewKick: 0.45,
    sound: 'm4',
  },
  awp: {
    id: 'awp', index: 2, name: 'AWP', slot: 'primary', auto: false, sniper: true,
    damage: 115, armorPen: 0.975, rangeMod: 0.99, rpm: 41,
    mag: 5, reserve: 30, reloadTime: 3.65, drawTime: 0.9,
    maxSpeed: 200 * U,
    inacc: { stand: 0.02, crouch: 0.015, move: 9.0, air: 22, perShot: 0, maxShot: 0, unscoped: 6.5 },
    recovery: 0.2,
    recoil: AWP_PATTERN, recoilReset: 1.6, viewKick: 0.6,
    zoomFov: [40, 10], // CS horizontal fov at 4:3 for the two scope levels
    sound: 'awp',
  },
  deagle: {
    id: 'deagle', index: 3, name: 'Desert Eagle', slot: 'secondary', auto: false,
    damage: 53, armorPen: 0.932, rangeMod: 0.81, rpm: 267,
    mag: 7, reserve: 35, reloadTime: 2.2, drawTime: 0.55,
    maxSpeed: 230 * U,
    inacc: { stand: 0.3, crouch: 0.22, move: 4.2, air: 11, perShot: 2.3, maxShot: 5 },
    recovery: 0.5,
    recoil: DEAGLE_PATTERN, recoilReset: 0.55, viewKick: 0.55,
    sound: 'deagle',
  },
  knife: {
    id: 'knife', index: 4, name: 'Knife', slot: 'melee', melee: true, auto: false,
    // CS2: slash 40 (25 if you keep slashing), backstab 90; stab 65, backstab 180
    slash: { damage: 40, followup: 25, backstab: 90, range: 1.5, interval: 0.4, followupWindow: 1.0 },
    stab: { damage: 65, backstab: 180, range: 1.1, interval: 1.0 },
    damage: 0, armorPen: 0.85, rangeMod: 1, rpm: 150,
    mag: 0, reserve: 0, reloadTime: 0, drawTime: 0.4,
    maxSpeed: 250 * U,
    inacc: { stand: 0, crouch: 0, move: 0, air: 0, perShot: 0, maxShot: 0 },
    recovery: 1,
    recoil: [[0, 0]], recoilReset: 1, viewKick: 0,
    sound: 'knife',
  },
};

export const WEAPON_LIST = [WEAPONS.ak47, WEAPONS.m4a1s, WEAPONS.awp, WEAPONS.deagle, WEAPONS.knife];
export const PRIMARIES = ['ak47', 'm4a1s', 'awp'];
export const SIDEARM = 'deagle';
export const KNIFE = 'knife';

/** Knife damage: backstab when the attacker is behind the victim; armour soaks 15%. */
export function knifeDamage(kind, backstab, followup) {
  const k = WEAPONS.knife[kind];
  const base = backstab ? k.backstab : kind === 'slash' && followup ? k.followup : k.damage;
  return Math.floor(base * WEAPONS.knife.armorPen);
}

export const HITGROUP = { head: 4, chest: 1, stomach: 1.25, legs: 0.75 };

export function fireInterval(w) {
  return 60 / w.rpm;
}

/** Damage after range falloff, hitgroup multiplier and armor (everyone has kevlar + helmet). */
export function computeDamage(w, distance, group) {
  const units = distance / U;
  let dmg = w.damage * Math.pow(w.rangeMod, units / 500) * HITGROUP[group];
  if (group !== 'legs') dmg *= w.armorPen;
  return Math.max(1, Math.floor(dmg));
}

/** Recoil offset [right, up] in degrees for a (possibly fractional) spray index. */
export function recoilAt(w, index) {
  const p = w.recoil;
  if (index <= 0) return [0, 0];
  const i = Math.min(Math.floor(index), p.length - 1);
  const j = Math.min(i + 1, p.length - 1);
  const f = Math.min(index - Math.floor(index), 1);
  return [p[i][0] + (p[j][0] - p[i][0]) * f, p[i][1] + (p[j][1] - p[i][1]) * f];
}

/**
 * Current inaccuracy cone (degrees). speed is horizontal speed in m/s.
 * Like CS, you are fully accurate below ~34% of the gun's max speed.
 */
export function inaccuracy(w, { speed, crouch, airborne, scoped, shotPenalty }) {
  const a = w.inacc;
  let base = crouch > 0.5 ? a.crouch : a.stand;
  if (w.sniper && !scoped) base = a.unscoped;
  const threshold = w.maxSpeed * 0.34;
  const moveT = Math.min(1, Math.max(0, (speed - threshold) / (w.maxSpeed - threshold)));
  let total = base + a.move * moveT;
  if (airborne) total += a.air;
  total += shotPenalty || 0;
  return total;
}
