// Small seeded PRNG (mulberry32) so spread and decoration are reproducible.
export function rng(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Direction for yaw/pitch (radians). Yaw 0 looks toward -z, positive pitch looks up. */
export function dirFromAngles(yaw, pitch) {
  const cp = Math.cos(pitch);
  return [-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp];
}

const DEG = Math.PI / 180;

/**
 * Bullet direction: view angles + recoil offset + random spread inside the inaccuracy cone.
 * recoil is [right, up] in degrees; inacc is the cone diameter in degrees.
 */
export function bulletDirection(yaw, pitch, recoil, inacc, rand) {
  const r = Math.sqrt(rand()) * (inacc / 2);
  const a = rand() * Math.PI * 2;
  const right = recoil[0] + Math.cos(a) * r;
  const up = recoil[1] + Math.sin(a) * r;
  return dirFromAngles(yaw - right * DEG, pitch + up * DEG);
}
