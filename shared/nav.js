// Walkable grid + A* for bots. Built once from the map boxes.
import { collides } from './physics.js';
import { STAND_HEIGHT } from './constants.js';
import { MAP_HALF } from './map.js';

const STEP = 2;
const CLEAR = 0.42; // extra clearance so bots don't scrape corners
const N = Math.floor((MAP_HALF * 2 - 2) / STEP) + 1;
const ORIGIN = -MAP_HALF + 1;

const walkable = new Uint8Array(N * N);
const neighbors = [];

function nodeX(i) {
  return ORIGIN + (i % N) * STEP;
}
function nodeZ(i) {
  return ORIGIN + Math.floor(i / N) * STEP;
}

function free(x, z) {
  return !collides(x, 0, z, STAND_HEIGHT, CLEAR);
}

/** Straight walk check, sampled every 0.4 m. */
export function clearPath(ax, az, bx, bz) {
  const len = Math.hypot(bx - ax, bz - az);
  const n = Math.max(1, Math.ceil(len / 0.4));
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    if (!free(ax + (bx - ax) * t, az + (bz - az) * t)) return false;
  }
  return true;
}

for (let i = 0; i < N * N; i++) walkable[i] = free(nodeX(i), nodeZ(i)) ? 1 : 0;
for (let i = 0; i < N * N; i++) {
  const list = [];
  if (walkable[i]) {
    const cx = i % N;
    const cz = Math.floor(i / N);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = cx + dx;
        const nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
        const j = nz * N + nx;
        if (!walkable[j]) continue;
        if (clearPath(nodeX(i), nodeZ(i), nodeX(j), nodeZ(j))) list.push(j);
      }
    }
  }
  neighbors.push(list);
}

export const NAV_NODES = [];
for (let i = 0; i < N * N; i++) if (walkable[i] && neighbors[i].length) NAV_NODES.push(i);

export function nodePos(i) {
  return [nodeX(i), nodeZ(i)];
}

export function nearestNode(x, z) {
  const cx = Math.round((x - ORIGIN) / STEP);
  const cz = Math.round((z - ORIGIN) / STEP);
  let best = -1;
  let bestD = Infinity;
  for (let r = 0; r < 4 && best < 0; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const nx = cx + dx;
        const nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
        const j = nz * N + nx;
        if (!walkable[j] || !neighbors[j].length) continue;
        const d = Math.hypot(nodeX(j) - x, nodeZ(j) - z);
        if (d < bestD) {
          bestD = d;
          best = j;
        }
      }
    }
  }
  return best;
}

/** A* from world point to world point; returns a smoothed list of [x, z] waypoints (or null). */
export function findPath(ax, az, bx, bz) {
  const start = nearestNode(ax, az);
  const goal = nearestNode(bx, bz);
  if (start < 0 || goal < 0) return null;
  const g = new Map([[start, 0]]);
  const came = new Map();
  const open = [[start, 0]];
  const closed = new Set();
  const gx = nodeX(goal);
  const gz = nodeZ(goal);
  while (open.length) {
    let bi = 0;
    for (let k = 1; k < open.length; k++) if (open[k][1] < open[bi][1]) bi = k;
    const [cur] = open.splice(bi, 1)[0];
    if (cur === goal) break;
    if (closed.has(cur)) continue;
    closed.add(cur);
    for (const nb of neighbors[cur]) {
      if (closed.has(nb)) continue;
      const cost = g.get(cur) + Math.hypot(nodeX(nb) - nodeX(cur), nodeZ(nb) - nodeZ(cur));
      if (cost < (g.get(nb) ?? Infinity)) {
        g.set(nb, cost);
        came.set(nb, cur);
        open.push([nb, cost + Math.hypot(gx - nodeX(nb), gz - nodeZ(nb))]);
      }
    }
  }
  if (!came.has(goal) && start !== goal) return null;
  const nodes = [goal];
  let c = goal;
  while (c !== start) {
    c = came.get(c);
    nodes.push(c);
  }
  nodes.reverse();
  const pts = nodes.map(nodePos);
  // string-pull: skip waypoints we can walk straight past
  const out = [];
  let from = [ax, az];
  let k = 0;
  while (k < pts.length) {
    let far = k;
    for (let m = pts.length - 1; m > k; m--) {
      if (clearPath(from[0], from[1], pts[m][0], pts[m][1])) {
        far = m;
        break;
      }
    }
    out.push(pts[far]);
    from = pts[far];
    k = far + 1;
  }
  return out;
}

export function randomNode(rand) {
  return NAV_NODES[Math.floor(rand() * NAV_NODES.length)];
}
