// Architectural and street detail that turns the collision boxes into a believable desert town.
// Everything here is visual only (no collision) and gets merged by material in bakeStatic().
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MAP_BOXES, ROADS, MAP_HALF } from '../shared/map.js';
import { collides } from '../shared/physics.js';
import { surface, SURFACES } from './materials.js';
import { boxGeometry, addTo, buildingTint } from './world.js';

const FACE_DIRS = [
  { n: [1, 0], axis: 0 },
  { n: [-1, 0], axis: 0 },
  { n: [0, 1], axis: 2 },
  { n: [0, -1], axis: 2 },
];

/** Is the wall point (on face f of box b at height y) open to the street? */
function exposed(b, f, along, y) {
  const out = f.n[0] + f.n[1] > 0 ? b.max[f.axis] : b.min[f.axis];
  if (Math.abs(out) > MAP_HALF - 0.4) return false;
  const px = f.axis === 0 ? out + f.n[0] * 0.7 : along;
  const pz = f.axis === 0 ? along : out + f.n[1] * 0.7;
  return !collides(px, Math.max(0, y - 0.5), pz, 1.0, 0.25);
}

/** Point on a face: [x, z] for "along" coordinate t, pushed out by off metres. */
function facePoint(b, f, t, off) {
  const out = f.n[0] + f.n[1] > 0 ? b.max[f.axis] : b.min[f.axis];
  return f.axis === 0 ? [out + f.n[0] * off, t] : [t, out + f.n[1] * off];
}

function faceRange(b, f) {
  const a = f.axis === 0 ? 2 : 0;
  return [b.min[a], b.max[a]];
}

function cyl(r1, r2, h, seg, x, y, z, rx = 0, ry = 0, rz = 0) {
  const g = new THREE.CylinderGeometry(r1, r2, h, seg);
  g.rotateX(rx);
  g.rotateY(ry);
  g.rotateZ(rz);
  g.translate(x, y, z);
  return g;
}

function plainBox(w, h, d, x, y, z, ry = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.rotateY(ry);
  g.translate(x, y, z);
  return g;
}

function flush(world, groups, cast = true) {
  for (const [key, list] of groups) {
    const [m, vc] = key.split('|');
    const mesh = new THREE.Mesh(mergeGeometries(list.map((x) => (x.index ? x.toNonIndexed() : x))), surface(m, vc === 'vc'));
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    world.add(mesh);
  }
}

// ---------------------------------------------------------------- buildings

function parapets(b, g, rand) {
  const [x1, , z1] = b.min;
  const [x2, h, z2] = b.max;
  const t = 0.24;
  const ph = 0.55 + rand() * 0.25;
  const tint = buildingTint(rand, 0.05);
  const s = SURFACES[b.m].scale;
  const k = `${b.m}|vc`;
  addTo(g, k, boxGeometry([x1 - 0.08, h, z1 - 0.08], [x2 + 0.08, h + ph, z1 + t], s, false, tint));
  addTo(g, k, boxGeometry([x1 - 0.08, h, z2 - t], [x2 + 0.08, h + ph, z2 + 0.08], s, false, tint));
  addTo(g, k, boxGeometry([x1 - 0.08, h, z1 + t], [x1 + t, h + ph, z2 - t], s, false, tint));
  addTo(g, k, boxGeometry([x2 - t, h, z1 + t], [x2 + 0.08, h + ph, z2 - t], s, false, tint));
  // coping stones
  const ct = buildingTint(rand, 0.03);
  for (const [a, c] of [
    [[x1 - 0.12, z1 - 0.12], [x2 + 0.12, z1 + t + 0.04]],
    [[x1 - 0.12, z2 - t - 0.04], [x2 + 0.12, z2 + 0.12]],
    [[x1 - 0.12, z1 + t], [x1 + t + 0.04, z2 - t]],
    [[x2 - t - 0.04, z1 + t], [x2 + 0.12, z2 - t]],
  ]) {
    addTo(g, 'concrete|vc', boxGeometry([a[0], h + ph, a[1]], [c[0], h + ph + 0.07, c[1]], 3, false, ct));
  }
}

/** Protruding roof beams (vigas) on adobe-style buildings. */
function vigas(b, g, rand) {
  const h = b.max[1];
  for (const f of FACE_DIRS) {
    const [lo, hi] = faceRange(b, f);
    for (let t = lo + 0.5; t < hi - 0.4; t += 0.85) {
      if (!exposed(b, f, t, h - 1)) continue;
      const [x, z] = facePoint(b, f, t, 0.2);
      const ry = f.axis === 0 ? Math.PI / 2 : 0;
      const beam = cyl(0.08 + rand() * 0.015, 0.09, 0.5, 8, 0, 0, 0, Math.PI / 2);
      beam.rotateY(ry);
      beam.translate(x, h - 0.55, z);
      addTo(g, 'wood', beam);
    }
  }
}

/** Alternating corner stones (quoins) on exposed corners. */
function quoins(b, g, rand) {
  const [x1, , z1] = b.min;
  const [x2, h, z2] = b.max;
  const mat = b.m === 'sandstone' ? 'concrete' : 'sandstone';
  const tint = buildingTint(rand, 0.04);
  for (const [cx, cz, sx, sz] of [[x1, z1, -1, -1], [x2, z1, 1, -1], [x1, z2, -1, 1], [x2, z2, 1, 1]]) {
    if (collides(cx + sx * 0.6, 0.5, cz + sz * 0.6, 1, 0.3)) continue;
    if (Math.abs(cx) > MAP_HALF - 0.5 || Math.abs(cz) > MAP_HALF - 0.5) continue;
    let i = 0;
    for (let y = 0.6; y < h - 0.5; y += 0.44, i++) {
      const lx = i % 2 ? 0.48 : 0.3;
      const lz = i % 2 ? 0.3 : 0.48;
      const xa = sx > 0 ? cx - lx : cx - 0.035;
      const xb = sx > 0 ? cx + 0.035 : cx + lx;
      const za = sz > 0 ? cz - lz : cz - 0.035;
      const zb = sz > 0 ? cz + 0.035 : cz + lz;
      addTo(g, `${mat}|vc`, boxGeometry([xa, y, za], [xb, y + 0.4, zb], 2, false, tint));
    }
  }
}

function rooftop(b, g, rand) {
  const [x1, , z1] = b.min;
  const [x2, h, z2] = b.max;
  const w = x2 - x1;
  const d = z2 - z1;
  if (w < 4 || d < 4) return;
  const at = () => [x1 + 1.5 + rand() * (w - 3), z1 + 1.5 + rand() * (d - 3)];
  if (rand() < 0.4) {
    // water tank on legs
    const [x, z] = at();
    addTo(g, 'steel', cyl(0.55, 0.55, 1.1, 18, x, h + 1.15, z));
    addTo(g, 'steel', cyl(0.57, 0.57, 0.06, 18, x, h + 1.72, z));
    for (const [ox, oz] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]]) addTo(g, 'darksteel', plainBox(0.06, 0.6, 0.06, x + ox, h + 0.3, z + oz));
  }
  const acs = rand() < 0.6 ? 1 + Math.floor(rand() * 2) : 0;
  for (let i = 0; i < acs; i++) {
    const [x, z] = at();
    const ry = Math.floor(rand() * 4) * (Math.PI / 2);
    addTo(g, 'paint', plainBox(0.85, 0.6, 0.55, x, h + 0.32, z, ry));
    addTo(g, 'darksteel', plainBox(0.5, 0.42, 0.57, x, h + 0.34, z, ry));
  }
  if (rand() < 0.3) {
    // satellite dish
    const [x, z] = at();
    addTo(g, 'darksteel', cyl(0.025, 0.025, 0.7, 6, x, h + 0.35, z));
    const dish = new THREE.SphereGeometry(0.42, 16, 8, 0, Math.PI * 2, 0, 0.8);
    dish.scale(1, 0.45, 1);
    dish.rotateX(-1.1);
    dish.rotateY(rand() * Math.PI * 2);
    dish.translate(x, h + 0.75, z);
    addTo(g, 'paint', dish);
  }
  if (rand() < 0.3) {
    // antenna mast
    const [x, z] = at();
    addTo(g, 'darksteel', cyl(0.025, 0.035, 2.8, 6, x, h + 1.4, z));
    for (let k = 0; k < 3; k++) addTo(g, 'darksteel', plainBox(0.9 - k * 0.2, 0.025, 0.025, x, h + 1.8 + k * 0.35, z));
  }
  if (rand() < 0.28 && w > 7 && d > 7) {
    // stair hut on the roof
    const [x, z] = at();
    const tint = buildingTint(rand, 0.05);
    addTo(g, `${b.m}|vc`, boxGeometry([x - 1.1, h, z - 1.1], [x + 1.1, h + 2.3, z + 1.1], SURFACES[b.m].scale, false, tint));
    addTo(g, 'concrete|vc', boxGeometry([x - 1.2, h + 2.3, z - 1.2], [x + 1.2, h + 2.42, z + 1.2], 3, false, tint));
    addTo(g, 'door', plainBox(0.9, 1.9, 0.05, x, h + 0.95, z + 1.12));
  }
}

function balconies(b, g, rand) {
  const h = b.max[1];
  if (h < 6) return;
  for (const f of FACE_DIRS) {
    const [lo, hi] = faceRange(b, f);
    if (hi - lo < 6 || rand() > 0.38) continue;
    const t = lo + 2 + rand() * (hi - lo - 4);
    if (!exposed(b, f, t, 3.5)) continue;
    const len = 2.4;
    const depth = 0.95;
    const y = 3.0;
    const ry = f.axis === 0 ? Math.PI / 2 : 0;
    const [cx, cz] = facePoint(b, f, t, depth / 2);
    addTo(g, 'concrete', plainBox(len, 0.14, depth, cx, y, cz, ry));
    // brackets
    for (const s of [-1, 1]) {
      const [bx, bz] = facePoint(b, f, t + s * (len / 2 - 0.2), 0.3);
      addTo(g, 'concrete', plainBox(0.12, 0.35, 0.55, bx, y - 0.24, bz, ry));
    }
    // railing: posts + rails along the front and sides
    const [fx, fz] = facePoint(b, f, t, depth - 0.03);
    const along = f.axis === 0 ? [0, 1] : [1, 0];
    for (let k = -len / 2 + 0.05; k <= len / 2; k += 0.16) {
      addTo(g, 'darksteel', plainBox(0.025, 0.9, 0.025, fx + along[0] * k, y + 0.52, fz + along[1] * k));
    }
    addTo(g, 'darksteel', plainBox(len, 0.05, 0.05, fx, y + 0.98, fz, ry));
    addTo(g, 'darksteel', plainBox(len, 0.03, 0.03, fx, y + 0.2, fz, ry));
    for (const s of [-1, 1]) {
      const [sx, sz] = facePoint(b, f, t + s * (len / 2), depth / 2);
      addTo(g, 'darksteel', plainBox(f.axis === 0 ? depth : 0.04, 0.05, f.axis === 0 ? 0.04 : depth, sx, y + 0.98, sz));
    }
  }
}

function drainpipes(b, g, rand) {
  const h = b.max[1];
  for (const f of FACE_DIRS) {
    if (rand() > 0.3) continue;
    const [lo, hi] = faceRange(b, f);
    const t = rand() < 0.5 ? lo + 0.35 : hi - 0.35;
    if (!exposed(b, f, t, 1.5)) continue;
    const [x, z] = facePoint(b, f, t, 0.09);
    addTo(g, 'darksteel', cyl(0.055, 0.055, h - 0.25, 8, x, (h - 0.25) / 2 + 0.2, z));
    for (let y = 1.2; y < h - 0.5; y += 1.6) addTo(g, 'darksteel', cyl(0.07, 0.07, 0.05, 8, x, y, z));
    const [ex, ez] = facePoint(b, f, t, 0.2);
    addTo(g, 'darksteel', plainBox(0.14, 0.14, 0.14, ex, 0.18, ez));
  }
}

function lamps(b, g, rand) {
  for (const f of FACE_DIRS) {
    if (rand() > 0.22) continue;
    const [lo, hi] = faceRange(b, f);
    if (hi - lo < 3) continue;
    const t = lo + 1 + rand() * (hi - lo - 2);
    if (!exposed(b, f, t, 2.8)) continue;
    const ry = f.axis === 0 ? Math.PI / 2 : 0;
    const [ax, az] = facePoint(b, f, t, 0.18);
    addTo(g, 'darksteel', plainBox(0.05, 0.05, 0.36, ax, 2.95, az, ry));
    const [lx, lz] = facePoint(b, f, t, 0.36);
    addTo(g, 'darksteel', plainBox(0.2, 0.06, 0.2, lx, 2.98, lz));
    addTo(g, 'lampglass', plainBox(0.16, 0.24, 0.16, lx, 2.8, lz));
  }
}

/** Arched tunnel mouths: an arch-shaped infill and a stone band where a lintel spans a passage. */
function arches(world, g) {
  for (const b of MAP_BOXES) {
    if (b.kind !== 'lintel') continue;
    const alongX = b.max[0] - b.min[0] > b.max[2] - b.min[2];
    const width = alongX ? b.max[2] - b.min[2] : b.max[0] - b.min[0];
    const top = b.min[1];
    const spring = top - 0.95;
    const shape = new THREE.Shape();
    shape.moveTo(0, top + 0.001);
    shape.lineTo(width, top + 0.001);
    shape.lineTo(width, spring);
    shape.absellipse(width / 2, spring, width / 2, top - spring - 0.08, 0, Math.PI, false);
    shape.lineTo(0, top + 0.001);
    const band = new THREE.Shape();
    band.absellipse(width / 2, spring, width / 2 + 0.01, top - spring + 0.1, 0, Math.PI, false);
    band.absellipse(width / 2, spring, width / 2 - 0.16, top - spring - 0.1, Math.PI, 0, true);
    for (const end of [0, 1]) {
      for (const [sh, depth, mat, out] of [[shape, 0.3, `${b.m}`, 0.02], [band, 0.12, 'concrete', 0.08]]) {
        const geo = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false, curveSegments: 18 });
        const uv = geo.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 3, uv.getY(i) / 3);
        // local x = across the opening, y = height, z = depth into the tunnel
        if (alongX) {
          geo.rotateY(end === 0 ? Math.PI / 2 : -Math.PI / 2);
          const x = end === 0 ? b.min[0] - out : b.max[0] + out;
          geo.translate(x, 0, end === 0 ? b.max[2] : b.min[2]);
        } else {
          geo.rotateY(end === 0 ? 0 : Math.PI);
          const z = end === 0 ? b.min[2] - out : b.max[2] + out;
          geo.translate(end === 0 ? b.min[0] : b.max[0], 0, z);
        }
        addTo(g, mat, geo);
      }
    }
  }
  void world;
}

// ---------------------------------------------------------------- street level

/** Low kerb stones where a road meets a block. */
function kerbs(g) {
  const blocks = [[-46, -26], [-18, -4], [4, 18], [26, 46]];
  const tint = new THREE.Color(0.92, 0.9, 0.86);
  for (const r of ROADS) {
    const vertical = r[3] - r[1] > r[2] - r[0];
    for (const [a, c] of blocks) {
      if (vertical) {
        addTo(g, 'concrete|vc', boxGeometry([r[0] - 0.28, 0, a], [r[0], 0.08, c], 1.5, false, tint));
        addTo(g, 'concrete|vc', boxGeometry([r[2], 0, a], [r[2] + 0.28, 0.08, c], 1.5, false, tint));
      } else {
        addTo(g, 'concrete|vc', boxGeometry([a, 0, r[1] - 0.28], [c, 0.08, r[1]], 1.5, false, tint));
        addTo(g, 'concrete|vc', boxGeometry([a, 0, r[3]], [c, 0.08, r[3] + 0.28], 1.5, false, tint));
      }
    }
  }
}

/** Wooden crates with a proper frame instead of plain blocks. */
function crates(g, rand) {
  for (const b of MAP_BOXES) {
    if (b.kind !== 'crate') continue;
    const [x1, y1, z1] = b.min;
    const [x2, y2, z2] = b.max;
    const i = 0.035;
    addTo(g, 'crate', boxGeometry([x1 + i, y1 + i, z1 + i], [x2 - i, y2 - i, z2 - i], x2 - x1, true));
    const t = 0.075;
    const w = x2 - x1;
    const h = y2 - y1;
    const d = z2 - z1;
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;
    const cz = (z1 + z2) / 2;
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) addTo(g, 'wood', plainBox(w, t, t, cx, cy + sy * (h / 2 - t / 2), cz + sz * (d / 2 - t / 2)));
      for (const sx of [-1, 1]) addTo(g, 'wood', plainBox(t, t, d, cx + sx * (w / 2 - t / 2), cy + sy * (h / 2 - t / 2), cz));
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) addTo(g, 'wood', plainBox(t, h, t, cx + sx * (w / 2 - t / 2), cy, cz + sz * (d / 2 - t / 2)));
    // diagonal brace on two faces
    const len = Math.hypot(w, h) - 0.1;
    const brace = new THREE.BoxGeometry(t * 0.9, len, t * 0.6);
    brace.rotateZ(Math.atan2(w, h) * (rand() < 0.5 ? 1 : -1));
    for (const sz of [-1, 1]) addTo(g, 'wood', brace.clone().translate(cx, cy, cz + sz * (d / 2 + 0.005)));
  }
}

/** Scattered stones and broken bits along wall bases. */
function rubble(g, rand) {
  const rock = new THREE.IcosahedronGeometry(1, 0);
  let placed = 0;
  for (let n = 0; n < 900 && placed < 260; n++) {
    const b = MAP_BOXES[Math.floor(rand() * MAP_BOXES.length)];
    if (b.kind !== 'building' && b.kind !== 'lowwall' && b.kind !== 'platform') continue;
    const f = FACE_DIRS[Math.floor(rand() * 4)];
    const [lo, hi] = faceRange(b, f);
    const t = lo + rand() * (hi - lo);
    if (!exposed(b, f, t, 0.5)) continue;
    const [x, z] = facePoint(b, f, t, 0.08 + rand() * 0.5);
    const s = 0.04 + Math.pow(rand(), 2) * 0.14;
    const geo = rock.clone();
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setXYZ(i, pos.getX(i) * (0.8 + rand() * 0.4), pos.getY(i) * (0.5 + rand() * 0.3), pos.getZ(i) * (0.8 + rand() * 0.4));
    geo.computeVertexNormals();
    geo.scale(s, s, s);
    geo.rotateY(rand() * Math.PI);
    geo.translate(x, s * 0.3, z);
    addTo(g, rand() < 0.5 ? 'sandstone' : 'concrete', geo);
    placed++;
  }
}

/** Wind-blown sand over the paving next to walls and in corners. */
function sandDrifts(world, rand) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#000';
  x.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 40; i++) {
    const r = 10 + rand() * 30;
    const px = 64 + (rand() - 0.5) * 60;
    const py = 64 + (rand() - 0.5) * 60;
    const grad = x.createRadialGradient(px, py, 0, px, py, r);
    grad.addColorStop(0, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = grad;
    x.fillRect(0, 0, 128, 128);
  }
  const alpha = new THREE.CanvasTexture(c);
  alpha.channel = 1;
  const base = surface('ground');
  const mat = new THREE.MeshStandardMaterial({
    map: base.map, normalMap: base.normalMap, roughness: 1, alphaMap: alpha, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
  });
  const geos = [];
  let placed = 0;
  for (let n = 0; n < 600 && placed < 90; n++) {
    const b = MAP_BOXES[Math.floor(rand() * MAP_BOXES.length)];
    if (b.kind !== 'building' && b.kind !== 'lowwall' && b.kind !== 'perimeter') continue;
    const f = FACE_DIRS[Math.floor(rand() * 4)];
    const [lo, hi] = faceRange(b, f);
    const t = lo + rand() * (hi - lo);
    if (!exposed(b, f, t, 0.5)) continue;
    const size = 1.6 + rand() * 2.6;
    const [px, pz] = facePoint(b, f, t, size * 0.32);
    const geo = new THREE.PlaneGeometry(size, size * (0.6 + rand() * 0.5));
    geo.rotateZ(rand() * Math.PI);
    geo.rotateX(-Math.PI / 2);
    geo.translate(px, 0.016, pz);
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    const uv1 = new Float32Array(uv.array);
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / SURFACES.ground.scale, pos.getZ(i) / SURFACES.ground.scale);
    geo.setAttribute('uv1', new THREE.BufferAttribute(uv1, 2));
    geos.push(geo);
    placed++;
  }
  const mesh = new THREE.Mesh(mergeGeometries(geos), mat);
  mesh.receiveShadow = true;
  mesh.renderOrder = 1;
  mesh.userData.noBake = true;
  world.add(mesh);
}

/** Shop signs with painted lettering. */
function signs(g, world, rand) {
  const words = ['CAFE', 'BAKERY', 'HOTEL', 'PHARMACY', 'MARKET', 'TEA HOUSE', 'TAILOR', 'GARAGE'];
  const colors = ['#8a2f22', '#1f4f6b', '#2f5d34', '#6b4a1f', '#3c2f5a'];
  let k = 0;
  for (let n = 0; n < 400 && k < words.length; n++) {
    const b = MAP_BOXES[Math.floor(rand() * MAP_BOXES.length)];
    if (b.kind !== 'building') continue;
    const f = FACE_DIRS[Math.floor(rand() * 4)];
    const [lo, hi] = faceRange(b, f);
    if (hi - lo < 5) continue;
    const t = lo + 1.8 + rand() * (hi - lo - 3.6);
    if (!exposed(b, f, t, 3.2)) continue;
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 128;
    const x = c.getContext('2d');
    x.fillStyle = colors[k % colors.length];
    x.fillRect(0, 0, 512, 128);
    x.strokeStyle = 'rgba(255,240,210,0.8)';
    x.lineWidth = 6;
    x.strokeRect(10, 10, 492, 108);
    x.fillStyle = '#f3e6c8';
    x.font = 'bold 64px Oxanium, Arial, sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(words[k], 256, 68);
    // weathering
    for (let i = 0; i < 900; i++) {
      x.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`;
      x.fillRect(Math.random() * 512, Math.random() * 128, 2, 2);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }));
    const [sx, sz] = facePoint(b, f, t, 0.07);
    sign.position.set(sx, 3.35, sz);
    sign.rotation.y = f.axis === 0 ? (f.n[0] > 0 ? Math.PI / 2 : -Math.PI / 2) : f.n[1] > 0 ? 0 : Math.PI;
    sign.userData.noBake = true;
    world.add(sign);
    const [bx, bz] = facePoint(b, f, t, 0.035);
    addTo(g, 'darksteel', plainBox(f.axis === 0 ? 0.06 : 2.5, 0.7, f.axis === 0 ? 2.5 : 0.06, bx, 3.35, bz));
    k++;
  }
}

/** Washing lines and cables strung across the narrow alleys. */
function lines(world, rand) {
  const spans = [
    [[-37, 4.2, -42], [-34, 4.0, -42]], [[-37, 4.6, -36], [-34, 4.4, -36]], [[-37, 3.9, -30], [-34, 4.0, -30]],
    [[-10, 4.4, 30], [-7, 4.2, 30]], [[-10, 4.0, 38], [-7, 4.1, 38]],
    [[30, 4.3, 34], [30, 4.4, 37]], [[38, 4.0, 34], [38, 4.1, 37]],
    [[-38, 3.6, 8], [-35, 3.7, 8]], [[-38, 3.8, 14], [-35, 3.6, 14]],
  ];
  const ropeMat = new THREE.LineBasicMaterial({ color: '#2a2420' });
  const clothColors = ['#b8432f', '#e8e1d2', '#2f6d8a', '#d9a441', '#6b8f4a', '#7a4b8c'];
  const cloth = new Map();
  for (const [a, b] of spans) {
    const A = new THREE.Vector3(...a);
    const B = new THREE.Vector3(...b);
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const p = A.clone().lerp(B, i / 12);
      p.y -= Math.sin((i / 12) * Math.PI) * 0.35;
      pts.push(p);
    }
    world.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), ropeMat));
    const n = 2 + Math.floor(rand() * 3);
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5 + (rand() - 0.5) * 0.4) / n;
      const p = A.clone().lerp(B, u);
      p.y -= Math.sin(u * Math.PI) * 0.35;
      const w = 0.45 + rand() * 0.35;
      const h = 0.5 + rand() * 0.45;
      const geo = new THREE.PlaneGeometry(w, h, 1, 2);
      const pos = geo.attributes.position;
      for (let k = 0; k < pos.count; k++) pos.setZ(k, Math.sin((pos.getY(k) / h) * Math.PI) * 0.04);
      geo.translate(0, -h / 2, 0);
      const dir = B.clone().sub(A);
      geo.rotateY(Math.atan2(-dir.z, dir.x));
      geo.translate(p.x, p.y, p.z);
      const col = clothColors[Math.floor(rand() * clothColors.length)];
      if (!cloth.has(col)) cloth.set(col, []);
      cloth.get(col).push(geo);
    }
  }
  for (const [col, list] of cloth) {
    const m = new THREE.Mesh(mergeGeometries(list), new THREE.MeshStandardMaterial({ color: col, roughness: 0.95, side: THREE.DoubleSide }));
    m.castShadow = true;
    world.add(m);
  }
}

// ---------------------------------------------------------------- entry points

export function addArchitecture(world, rand) {
  const g = new Map();
  for (const b of MAP_BOXES) {
    if (b.kind !== 'building') continue;
    parapets(b, g, rand);
    if ((b.m === 'clay' || b.m === 'plaster') && rand() < 0.75) vigas(b, g, rand);
    else quoins(b, g, rand);
    rooftop(b, g, rand);
    balconies(b, g, rand);
    drainpipes(b, g, rand);
    lamps(b, g, rand);
  }
  arches(world, g);
  kerbs(g);
  crates(g, rand);
  rubble(g, rand);
  signs(g, world, rand);
  flush(world, g);
  sandDrifts(world, rand);
  lines(world, rand);
}

/** Procedural cloud layer high above the town, drifting slowly. */
export function cloudLayer() {
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: false,
    uniforms: { time: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vPos;
      void main() {
        vPos = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float time;
      varying vec2 vPos;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
      }
      float fbm(vec2 p) {
        float v = 0.0; float a = 0.5;
        for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
        return v;
      }
      void main() {
        vec2 p = vPos / 700.0 + vec2(time * 0.004, time * 0.0015);
        float n = fbm(p * 3.0);
        float cloud = smoothstep(0.5, 0.78, n);
        float fade = 1.0 - smoothstep(900.0, 1900.0, length(vPos));
        float shade = mix(0.82, 1.0, smoothstep(0.5, 0.9, n));
        gl_FragColor = vec4(vec3(shade), cloud * fade * 0.85);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), mat);
  mesh.rotation.x = Math.PI / 2;
  mesh.position.y = 260;
  mesh.renderOrder = -1;
  mesh.onBeforeRender = () => {
    mat.uniforms.time.value = performance.now() / 1000;
  };
  return mesh;
}
