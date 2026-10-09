// Procedural guns and soldiers. Guns point down -z with the origin at the pistol grip.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { OUTFITS } from '../shared/constants.js';
import { camoTexture, woodGrainTexture } from './materials.js';

let M = null;
function mats() {
  if (M) return M;
  M = {
    metal: new THREE.MeshStandardMaterial({ color: '#222427', metalness: 0.7, roughness: 0.42 }),
    darkMetal: new THREE.MeshStandardMaterial({ color: '#141516', metalness: 0.7, roughness: 0.5 }),
    poly: new THREE.MeshStandardMaterial({ color: '#1c1d1f', metalness: 0.15, roughness: 0.62 }),
    wood: new THREE.MeshStandardMaterial({ map: woodGrainTexture('#7a3d18'), roughness: 0.42, metalness: 0.05 }),
    bakelite: new THREE.MeshStandardMaterial({ color: '#5a2610', roughness: 0.38, metalness: 0.1 }),
    green: new THREE.MeshStandardMaterial({ color: '#4a5a3a', roughness: 0.55, metalness: 0.2 }),
    chrome: new THREE.MeshStandardMaterial({ color: '#a9aeb3', roughness: 0.3, metalness: 1 }),
    frame: new THREE.MeshStandardMaterial({ color: '#5d6267', roughness: 0.38, metalness: 0.9 }),
    rubber: new THREE.MeshStandardMaterial({ color: '#121212', roughness: 0.85 }),
    lens: new THREE.MeshStandardMaterial({ color: '#1d3550', roughness: 0.04, metalness: 0.9 }),
    skin: new THREE.MeshStandardMaterial({ color: '#b98a68', roughness: 0.62 }),
    glove: new THREE.MeshStandardMaterial({ color: '#2b2622', roughness: 0.75 }),
    boot: new THREE.MeshStandardMaterial({ color: '#2a221b', roughness: 0.7 }),
    goggles: new THREE.MeshStandardMaterial({ color: '#0d1116', roughness: 0.1, metalness: 0.7 }),
  };
  return M;
}

const geoCache = new Map();
function rbGeo(w, h, d, r) {
  const k = `rb${w},${h},${d},${r}`;
  if (!geoCache.has(k)) geoCache.set(k, new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2)));
  return geoCache.get(k);
}
function cylGeo(r1, r2, len, seg = 14) {
  const k = `cy${r1},${r2},${len},${seg}`;
  if (!geoCache.has(k)) {
    const g = new THREE.CylinderGeometry(r1, r2, len, seg);
    g.rotateX(Math.PI / 2); // along z
    geoCache.set(k, g);
  }
  return geoCache.get(k);
}

function rb(parent, w, h, d, mat, x, y, z, rx = 0, r = 0.006) {
  const m = new THREE.Mesh(rbGeo(w, h, d, r), mat);
  m.position.set(x, y, z);
  m.rotation.x = rx;
  parent.add(m);
  return m;
}
function cyl(parent, r1, r2, len, mat, x, y, z, seg) {
  const m = new THREE.Mesh(cylGeo(r1, r2, len, seg), mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

// ---------------------------------------------------------------- guns

function ak47(g, m) {
  rb(g, 0.05, 0.072, 0.29, m.metal, 0, 0.03, -0.07);
  rb(g, 0.046, 0.032, 0.25, m.metal, 0, 0.074, -0.075, 0, 0.014);
  rb(g, 0.03, 0.022, 0.045, m.metal, 0, 0.088, -0.22);
  rb(g, 0.058, 0.058, 0.2, m.wood, 0, 0.022, -0.32, 0, 0.012);
  rb(g, 0.044, 0.036, 0.17, m.wood, 0, 0.075, -0.31, 0, 0.012);
  cyl(g, 0.011, 0.011, 0.3, m.darkMetal, 0, 0.03, -0.55);
  cyl(g, 0.013, 0.013, 0.09, m.metal, 0, 0.074, -0.43);
  rb(g, 0.012, 0.048, 0.018, m.metal, 0, 0.068, -0.63);
  cyl(g, 0.016, 0.016, 0.055, m.darkMetal, 0, 0.03, -0.72);
  // curved magazine
  const mag = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    rb(mag, 0.034, 0.058, 0.072, m.bakelite, 0, -i * 0.043, -i * i * 0.006 - i * 0.008, -i * 0.13, 0.008);
  }
  mag.position.set(0, -0.02, -0.12);
  g.add(mag);
  rb(g, 0.034, 0.1, 0.044, m.bakelite, 0, -0.045, 0.025, 0.32);
  rb(g, 0.01, 0.012, 0.07, m.metal, 0, -0.02, -0.04);
  rb(g, 0.044, 0.066, 0.17, m.wood, 0, 0.012, 0.16, -0.1, 0.012);
  rb(g, 0.046, 0.1, 0.12, m.wood, 0, -0.012, 0.28, -0.12, 0.014);
  rb(g, 0.048, 0.115, 0.018, m.darkMetal, 0, -0.022, 0.345, -0.12);
  cyl(g, 0.006, 0.006, 0.04, m.metal, 0.03, 0.05, -0.13).rotation.y = Math.PI / 2;
  return { muzzle: [0, 0.03, -0.76], mag, length: 1.1 };
}

function m4a1s(g, m) {
  rb(g, 0.046, 0.06, 0.24, m.poly, 0, 0.045, -0.06);
  rb(g, 0.04, 0.05, 0.18, m.poly, 0, 0.002, -0.04);
  rb(g, 0.026, 0.012, 0.37, m.darkMetal, 0, 0.082, -0.16, 0, 0.002);
  rb(g, 0.02, 0.03, 0.03, m.darkMetal, 0, 0.1, 0.02);
  rb(g, 0.016, 0.034, 0.02, m.darkMetal, 0, 0.098, -0.33);
  cyl(g, 0.028, 0.028, 0.26, m.poly, 0, 0.045, -0.31, 8);
  cyl(g, 0.01, 0.01, 0.08, m.darkMetal, 0, 0.045, -0.48);
  cyl(g, 0.019, 0.019, 0.21, m.metal, 0, 0.045, -0.6, 18);
  const mag = new THREE.Group();
  rb(mag, 0.028, 0.15, 0.062, m.darkMetal, 0, -0.06, 0, 0.12, 0.006);
  mag.position.set(0, -0.02, -0.1);
  g.add(mag);
  rb(g, 0.034, 0.095, 0.044, m.poly, 0, -0.045, 0.04, 0.32);
  rb(g, 0.01, 0.012, 0.07, m.poly, 0, -0.02, -0.02);
  cyl(g, 0.015, 0.015, 0.18, m.darkMetal, 0, 0.03, 0.15);
  rb(g, 0.042, 0.085, 0.13, m.poly, 0, 0.005, 0.25, 0, 0.012);
  rb(g, 0.044, 0.1, 0.02, m.rubber, 0, -0.002, 0.32);
  return { muzzle: [0, 0.045, -0.71], mag, length: 1.0 };
}

function awp(g, m) {
  rb(g, 0.06, 0.08, 0.55, m.green, 0, 0, -0.06, 0, 0.012);
  rb(g, 0.05, 0.13, 0.24, m.green, 0, -0.035, 0.27, 0, 0.016);
  rb(g, 0.045, 0.03, 0.18, m.green, 0, 0.055, 0.27, 0, 0.01);
  rb(g, 0.052, 0.16, 0.03, m.rubber, 0, -0.03, 0.4);
  cyl(g, 0.014, 0.016, 0.56, m.darkMetal, 0, 0.012, -0.61);
  cyl(g, 0.022, 0.022, 0.07, m.metal, 0, 0.012, -0.92);
  // scope
  cyl(g, 0.022, 0.022, 0.3, m.darkMetal, 0, 0.105, -0.06, 18);
  cyl(g, 0.036, 0.022, 0.09, m.darkMetal, 0, 0.105, -0.25, 18);
  cyl(g, 0.03, 0.022, 0.06, m.darkMetal, 0, 0.105, 0.12, 18);
  cyl(g, 0.033, 0.033, 0.004, m.lens, 0, 0.105, -0.296, 18);
  const tur = cyl(g, 0.012, 0.012, 0.03, m.darkMetal, 0, 0.135, -0.06);
  tur.rotation.x = 0;
  tur.rotation.set(Math.PI / 2, 0, 0);
  rb(g, 0.03, 0.04, 0.025, m.darkMetal, 0, 0.065, -0.15);
  rb(g, 0.03, 0.04, 0.025, m.darkMetal, 0, 0.065, 0.03);
  const bolt = new THREE.Group();
  const handle = cyl(bolt, 0.007, 0.007, 0.06, m.metal, 0.03, 0, 0);
  handle.rotation.y = Math.PI / 2;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 8), m.metal);
  knob.position.set(0.062, 0, 0);
  bolt.add(knob);
  bolt.position.set(0.02, 0.04, 0.09);
  g.add(bolt);
  const mag = new THREE.Group();
  rb(mag, 0.044, 0.07, 0.09, m.poly, 0, -0.03, 0);
  mag.position.set(0, -0.04, -0.03);
  g.add(mag);
  rb(g, 0.035, 0.09, 0.045, m.green, 0, -0.06, 0.12, 0.32);
  return { muzzle: [0, 0.012, -0.96], mag, bolt, length: 1.3 };
}

function deagle(g, m) {
  rb(g, 0.034, 0.046, 0.26, m.chrome, 0, 0.05, -0.08, 0, 0.005);
  rb(g, 0.025, 0.024, 0.17, m.chrome, 0, 0.083, -0.125, 0, 0.004); // triangular barrel top
  rb(g, 0.03, 0.03, 0.2, m.frame, 0, 0.014, -0.07, 0, 0.005);
  for (let i = 0; i < 6; i++) rb(g, 0.036, 0.034, 0.003, m.darkMetal, 0, 0.052, 0.01 + i * 0.007, 0, 0.001); // serrations
  rb(g, 0.006, 0.012, 0.012, m.darkMetal, 0, 0.1, -0.2);
  rb(g, 0.02, 0.012, 0.012, m.darkMetal, 0, 0.078, 0.035); // rear sight
  const grip = rb(g, 0.032, 0.12, 0.056, m.rubber, 0, -0.055, 0.03, 0.25, 0.01);
  grip.userData.keep = true;
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.004, 6, 16, Math.PI), m.chrome);
  guard.rotation.set(0, Math.PI / 2, Math.PI);
  guard.position.set(0, -0.0, -0.035);
  g.add(guard);
  const mag = new THREE.Group();
  rb(mag, 0.024, 0.03, 0.04, m.darkMetal, 0, 0, 0);
  mag.position.set(0, -0.12, 0.045);
  g.add(mag);
  return { muzzle: [0, 0.05, -0.215], mag, length: 0.27 };
}

function knife(g, m) {
  rb(g, 0.026, 0.032, 0.11, m.rubber, 0, -0.004, 0.02, 0, 0.01);
  for (let i = 0; i < 4; i++) rb(g, 0.028, 0.034, 0.006, m.darkMetal, 0, -0.004, -0.015 + i * 0.022, 0, 0.002); // grip rings
  rb(g, 0.03, 0.05, 0.012, m.darkMetal, 0, 0.004, -0.04, 0, 0.003); // guard
  rb(g, 0.022, 0.03, 0.012, m.darkMetal, 0, -0.004, 0.08, 0, 0.004); // pommel
  rb(g, 0.006, 0.034, 0.15, m.chrome, 0, 0.006, -0.12, 0, 0.002); // blade
  rb(g, 0.005, 0.022, 0.05, m.chrome, 0, 0.012, -0.21, 0, 0.002); // tip
  rb(g, 0.0065, 0.006, 0.14, m.darkMetal, 0, 0.022, -0.115, 0, 0.001); // spine
  return { muzzle: [0, 0.01, -0.24], mag: new THREE.Group(), length: 0.3 };
}

const BUILDERS = { ak47, m4a1s, awp, deagle, knife };

/** Build a gun model; userData has muzzle (Object3D), mag, bolt. */
export function buildGun(id) {
  const m = mats();
  const g = new THREE.Group();
  const info = BUILDERS[id](g, m);
  if (!info.mag.parent) g.add(info.mag);
  const muzzle = new THREE.Object3D();
  muzzle.position.fromArray(info.muzzle);
  g.add(muzzle);
  g.userData = { id, muzzle, mag: info.mag, bolt: info.bolt || null, magHome: info.mag.position.clone() };
  return g;
}

/**
 * Bake a group's direct child meshes into one mesh per material (child groups keep animating).
 * Cuts a soldier from ~60 draw calls to ~25.
 */
function mergeStatic(group) {
  const byMat = new Map();
  for (const child of [...group.children]) {
    if (!child.isMesh || child.children.length) continue;
    child.updateMatrix();
    const g = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    g.applyMatrix4(child.matrix);
    if (!byMat.has(child.material)) byMat.set(child.material, []);
    byMat.get(child.material).push(g);
    group.remove(child);
  }
  for (const [mat, list] of byMat) {
    const m = new THREE.Mesh(list.length > 1 ? mergeGeometries(list) : list[0], mat);
    m.castShadow = true;
    group.add(m);
  }
  for (const child of group.children) if (!child.isMesh) mergeStatic(child);
}

// ---------------------------------------------------------------- limbs

const _a = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
function limb(parent, a, b, r, mat) {
  const len = _a.subVectors(b, a).length();
  const geo = new THREE.CapsuleGeometry(r, Math.max(0.01, len - r * 2 + 0.04), 4, 10);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(_up, _a.normalize());
  parent.add(mesh);
  return mesh;
}

// ---------------------------------------------------------------- visibility rim light

/** Shared rim-light settings for every soldier (the "player highlight" option). */
export const RIM = { strength: { value: 0.55 }, color: { value: new THREE.Color('#fff1dc') } };

/** Adds a soft bright edge (fresnel) so soldiers stand out against walls. */
function withRim(mat) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.rimStrength = RIM.strength;
    shader.uniforms.rimColor = RIM.color;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float rimStrength;\nuniform vec3 rimColor;')
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n  float rimF = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 2.4);\n  totalEmissiveRadiance += rimColor * rimF * rimStrength;',
      );
  };
  mat.customProgramCacheKey = () => 'rim';
  return mat;
}

function outfitMats(index) {
  const o = OUTFITS[index] || OUTFITS[0];
  const key = `outfit-${o.id}`;
  if (geoCache.has(key)) return geoCache.get(key);
  const camo = camoTexture(o);
  const res = {
    shirt: withRim(new THREE.MeshStandardMaterial({ map: camo, roughness: 0.88 })),
    pants: withRim(new THREE.MeshStandardMaterial({ map: camo, color: '#d8d2c8', roughness: 0.9 })),
    vest: withRim(new THREE.MeshStandardMaterial({ color: o.vest, roughness: 0.78 })),
    helmet: withRim(new THREE.MeshStandardMaterial({ color: o.helmet, roughness: 0.62, metalness: 0.1 })),
    accent: withRim(new THREE.MeshStandardMaterial({ color: o.accent, roughness: 0.82 })),
    // first-person sleeve: same cloth without the rim glow
    sleeve: new THREE.MeshStandardMaterial({ map: camo, roughness: 0.88 }),
  };
  geoCache.set(key, res);
  return res;
}

let CM = null;
/** Skin, boots, gloves and straps for third-person soldiers (rim-lit copies). */
function charMats() {
  if (CM) return CM;
  const m = mats();
  CM = {
    skin: withRim(m.skin.clone()),
    boot: withRim(m.boot.clone()),
    glove: withRim(m.glove.clone()),
    rubber: withRim(m.rubber.clone()),
    goggles: m.goggles,
  };
  return CM;
}

/** Lathe shapes have zero-radius tips whose normals come out NaN, which breaks ambient occlusion. */
function fixNormals(geo) {
  const n = geo.attributes.normal;
  for (let i = 0; i < n.count; i++) {
    const x = n.getX(i);
    const y = n.getY(i);
    const z = n.getZ(i);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z) || x * x + y * y + z * z < 1e-6) {
      n.setXYZ(i, 0, geo.attributes.position.getY(i) > 0 ? 1 : -1, 0);
    }
  }
  return geo;
}

/** Tapered, rounded limb between two points (radius r1 at a, r2 at b). */
function taperLimb(parent, a, b, r1, r2, mat) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const pts = [];
  const steps = 6;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const ang = (1 - t) * Math.PI * 0.5;
    pts.push(new THREE.Vector2(Math.max(0.002, Math.cos(ang) * r1), -Math.sin(ang) * r1 * 0.9));
  }
  pts.push(new THREE.Vector2(r1 * 1.02, len * 0.3));
  pts.push(new THREE.Vector2((r1 + r2) / 2 * 1.04, len * 0.55));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const ang = t * Math.PI * 0.5;
    pts.push(new THREE.Vector2(Math.max(0.002, Math.cos(ang) * r2), len + Math.sin(ang) * r2 * 0.9));
  }
  const geo = fixNormals(new THREE.LatheGeometry(pts, 14));
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(a);
  mesh.quaternion.setFromUnitVectors(_up, dir.normalize());
  parent.add(mesh);
  return mesh;
}

/** Human torso: a lathe profile (waist to shoulders) flattened front-to-back. */
function torsoShell(parent, mat, scaleZ, grow = 0, y0 = 0) {
  const prof = [[0.0, -0.02], [0.155, 0.0], [0.165, 0.1], [0.185, 0.22], [0.21, 0.34], [0.215, 0.42], [0.18, 0.49], [0.09, 0.535], [0.0, 0.545]];
  const geo = fixNormals(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(Math.max(0.002, r + (r > 0 ? grow : 0)), y)), 20));
  geo.scale(1, 1, scaleZ);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = y0;
  parent.add(mesh);
  return mesh;
}

const POSES = {
  rifle: { slot: [0.1, 0.3, -0.2], rElbow: [0.25, 0.24, -0.04], lElbow: [-0.13, 0.24, -0.26], lHand: [0.08, 0.31, -0.44] },
  pistol: { slot: [0.03, 0.36, -0.42], rElbow: [0.2, 0.32, -0.2], lElbow: [-0.16, 0.31, -0.2], lHand: [0.02, 0.33, -0.39] },
};

/** Third-person soldier. Call setWeapon(id) and animate(dt, state). */
export function buildCharacter(outfitIndex) {
  const m = mats();
  const c = charMats();
  const o = outfitMats(outfitIndex);
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  const root = new THREE.Group();
  const pelvis = new THREE.Group();
  pelvis.position.y = 0.95;
  root.add(pelvis);
  const hips = new THREE.Mesh(new THREE.SphereGeometry(0.19, 18, 12), o.pants);
  hips.scale.set(1, 0.62, 0.72);
  pelvis.add(hips);
  rb(pelvis, 0.39, 0.055, 0.27, c.rubber, 0, 0.07, 0, 0, 0.025); // belt
  rb(pelvis, 0.06, 0.045, 0.02, m.darkMetal, 0, 0.07, -0.136, 0, 0.005); // buckle
  for (const x of [-0.16, 0.16]) rb(pelvis, 0.075, 0.1, 0.11, o.accent, x, 0.0, 0.07, 0, 0.025); // hip pouches
  rb(pelvis, 0.1, 0.12, 0.05, o.accent, 0, -0.01, 0.15, 0, 0.02); // dump pouch

  const legs = [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.1, -0.03, 0);
    pelvis.add(hip);
    taperLimb(hip, v(0, 0, 0), v(0, -0.43, 0), 0.105, 0.075, o.pants);
    rb(hip, 0.05, 0.13, 0.13, o.pants, side * 0.09, -0.22, -0.005, 0, 0.022); // cargo pocket
    if (side > 0) {
      rb(hip, 0.06, 0.16, 0.1, c.rubber, 0.105, -0.2, -0.01, 0, 0.02); // thigh holster
      rb(hip, 0.035, 0.05, 0.08, m.darkMetal, 0.112, -0.1, -0.01, 0, 0.01);
    }
    const knee = new THREE.Group();
    knee.position.y = -0.44;
    hip.add(knee);
    taperLimb(knee, v(0, 0, 0), v(0, -0.38, 0), 0.078, 0.058, o.pants);
    // boot: upper, toe and sole
    rb(knee, 0.12, 0.16, 0.13, c.boot, 0, -0.35, 0.0, 0, 0.04);
    rb(knee, 0.12, 0.09, 0.25, c.boot, 0, -0.43, -0.05, 0, 0.035);
    rb(knee, 0.13, 0.03, 0.27, c.rubber, 0, -0.475, -0.05, 0, 0.01);
    rb(knee, 0.13, 0.13, 0.07, c.rubber, 0, -0.01, -0.075, 0, 0.035); // knee pad
    legs.push({ hip, knee });
  }

  const torso = new THREE.Group();
  torso.position.y = 0.05;
  pelvis.add(torso);
  torsoShell(torso, o.shirt, 0.66);
  // plate carrier + cummerbund
  const carrier = torsoShell(torso, o.vest, 0.74, 0.025, 0.0);
  carrier.scale.y = 0.8;
  carrier.position.y = 0.08;
  rb(torso, 0.3, 0.3, 0.05, o.vest, 0, 0.3, -0.15, 0, 0.03); // front plate
  rb(torso, 0.3, 0.3, 0.05, o.vest, 0, 0.3, 0.15, 0, 0.03); // back plate
  for (const x of [-0.11, 0, 0.11]) {
    rb(torso, 0.09, 0.13, 0.055, o.accent, x, 0.22, -0.19, 0, 0.012); // magazine pouches
    rb(torso, 0.095, 0.035, 0.06, o.vest, x, 0.29, -0.19, 0, 0.01); // flaps
  }
  rb(torso, 0.07, 0.09, 0.05, o.accent, -0.13, 0.4, -0.18, 0, 0.012); // radio
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.32, 5), m.darkMetal);
  ant.position.set(-0.16, 0.56, 0.16);
  torso.add(ant);
  for (const x of [-0.12, 0.12]) rb(torso, 0.07, 0.03, 0.34, o.vest, x, 0.47, 0, 0, 0.012); // shoulder straps
  rb(torso, 0.3, 0.32, 0.15, o.accent, 0, 0.31, 0.24, 0, 0.05); // assault pack
  rb(torso, 0.26, 0.06, 0.04, o.vest, 0, 0.42, 0.32, 0, 0.012);
  for (const x of [-0.21, 0.21]) {
    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.085, 14, 10), o.shirt);
    shoulder.position.set(x, 0.43, 0);
    shoulder.scale.set(1, 0.9, 1);
    torso.add(shoulder);
  }
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.025, 8, 16), o.shirt);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 0.52;
  torso.add(collar);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.06, 0.11, 12), c.skin);
  neck.position.y = 0.55;
  torso.add(neck);

  const head = new THREE.Group();
  head.position.y = 0.6;
  torso.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.102, 20, 16), c.skin);
  skull.scale.set(0.92, 1.1, 1.0);
  skull.position.y = 0.085;
  head.add(skull);
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 12), c.skin);
  jaw.scale.set(1, 0.85, 1.05);
  jaw.position.set(0, 0.03, -0.022);
  head.add(jaw);
  rb(head, 0.022, 0.045, 0.03, c.skin, 0, 0.07, -0.105, 0.2, 0.01); // nose
  for (const x of [-0.094, 0.094]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), c.skin);
    ear.scale.set(0.5, 1, 0.8);
    ear.position.set(x, 0.075, 0.005);
    head.add(ear);
  }
  // helmet shell, brim and cover band
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.128, 24, 14, 0, Math.PI * 2, 0, Math.PI / 1.9), o.helmet);
  helmet.scale.set(1, 0.9, 1.08);
  helmet.position.y = 0.1;
  head.add(helmet);
  const brim = new THREE.Mesh(new THREE.TorusGeometry(0.126, 0.012, 6, 28), o.helmet);
  brim.rotation.x = Math.PI / 2;
  brim.scale.set(1, 1.08, 1);
  brim.position.y = 0.1;
  head.add(brim);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.124, 0.014, 6, 28), o.accent);
  band.rotation.x = Math.PI / 2;
  band.scale.set(1, 1.08, 1);
  band.position.y = 0.15;
  head.add(band);
  rb(head, 0.045, 0.035, 0.03, m.darkMetal, 0, 0.17, -0.13, 0, 0.008); // NVG mount
  rb(head, 0.17, 0.042, 0.045, m.goggles, 0, 0.112, -0.098, 0, 0.014); // goggles
  rb(head, 0.19, 0.016, 0.02, c.rubber, 0, 0.112, -0.085, 0, 0.004); // goggle strap
  const strap = new THREE.Mesh(new THREE.TorusGeometry(0.095, 0.006, 4, 20, Math.PI), c.rubber);
  strap.rotation.set(0, Math.PI / 2, Math.PI);
  strap.position.set(0, 0.085, 0.0);
  head.add(strap);

  const arms = new THREE.Group();
  torso.add(arms);
  const gunSlot = new THREE.Group();
  torso.add(gunSlot);

  const state = { phase: 0, deathT: 0, dead: false, deathDir: 1, weapon: null, gun: null, swingT: 1, swingKind: 'slash', swingDir: 1, slotZ: 0 };

  function setWeapon(id) {
    if (state.weapon === id) return;
    state.weapon = id;
    if (state.gun) gunSlot.remove(state.gun);
    state.gun = buildGun(id);
    state.gun.traverse((c) => {
      c.castShadow = true;
    });
    gunSlot.add(state.gun);
    const pose = id === 'deagle' || id === 'knife' ? POSES.pistol : POSES.rifle;
    gunSlot.position.fromArray(pose.slot);
    state.slotZ = pose.slot[2];
    arms.clear();
    const v = (a) => new THREE.Vector3().fromArray(a);
    const rS = v([0.22, 0.44, 0]);
    const lS = v([-0.22, 0.44, 0]);
    const rH = v(pose.slot).add(new THREE.Vector3(0.0, -0.02, 0.02));
    const lH = v(pose.lHand);
    taperLimb(arms, rS, v(pose.rElbow), 0.068, 0.058, o.shirt);
    taperLimb(arms, v(pose.rElbow), rH, 0.058, 0.045, o.shirt);
    taperLimb(arms, lS, v(pose.lElbow), 0.068, 0.058, o.shirt);
    taperLimb(arms, v(pose.lElbow), lH, 0.058, 0.045, o.shirt);
    for (const e of [pose.rElbow, pose.lElbow]) {
      const pad = new THREE.Mesh(new THREE.SphereGeometry(0.068, 10, 8), o.shirt);
      pad.position.copy(v(e));
      arms.add(pad);
    }
    for (const h of [rH, lH]) {
      const glove = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), charMats().glove);
      glove.position.copy(h);
      arms.add(glove);
    }
    mergeStatic(arms);
    mergeStatic(state.gun);
  }

  mergeStatic(root);

  /** speed m/s, crouch 0..1, pitch radians, dead bool */
  function animate(dt, { speed, crouch, pitch, dead }) {
    if (dead && !state.dead) {
      state.dead = true;
      state.deathT = 0;
      state.deathDir = Math.random() < 0.5 ? 1 : -1;
    } else if (!dead && state.dead) {
      state.dead = false;
      root.rotation.set(0, root.rotation.y, 0);
      root.position.y = 0;
    }
    if (state.dead) {
      state.deathT = Math.min(1, state.deathT + dt / 0.45);
      const e = 1 - Math.pow(1 - state.deathT, 3);
      root.rotation.x = state.deathDir * e * (Math.PI / 2) * 0.96;
      pelvis.position.y = 0.95 - e * 0.55;
      return;
    }
    const amp = Math.min(1, speed / 5) * 0.62;
    state.phase += dt * speed * 2.3;
    const s = Math.sin(state.phase);
    const c = crouch;
    pelvis.position.y = 0.95 - 0.4 * c + Math.abs(Math.cos(state.phase)) * 0.025 * amp;
    legs[0].hip.rotation.x = s * amp + 1.15 * c;
    legs[1].hip.rotation.x = -s * amp + 1.15 * c;
    legs[0].knee.rotation.x = -Math.max(0, -s) * amp * 1.3 - 1.9 * c;
    legs[1].knee.rotation.x = -Math.max(0, s) * amp * 1.3 - 1.9 * c;
    torso.rotation.x = pitch * 0.42 - 0.22 * c;
    head.rotation.x = pitch * 0.4;
    // knife: slash sweeps the blade across the body with a torso twist; stab thrusts forward
    const stab = state.swingKind === 'stab';
    state.swingT = Math.min(1, state.swingT + dt / (stab ? 0.6 : 0.42));
    const u = state.swingT;
    const lift = u < 0.3 ? u / 0.3 : Math.max(0, 1 - (u - 0.3) / 0.7);
    if (stab) {
      const thrust = u < 0.35 ? -u / 0.35 * 0.4 : u < 0.55 ? -0.4 + ((u - 0.35) / 0.2) * 1.4 : Math.max(0, 1 - (u - 0.55) / 0.45);
      gunSlot.position.z = state.slotZ - Math.max(0, thrust) * 0.28 + Math.max(0, -thrust) * 0.12;
      gunSlot.rotation.set(pitch * 0.45, 0, 0);
      torso.rotation.y = -Math.max(0, thrust) * 0.15;
    } else {
      const dir = state.swingDir;
      const across = u < 0.3 ? (u / 0.3) * 0.9 : u < 0.55 ? 0.9 - ((u - 0.3) / 0.25) * 2.0 : -1.1 * (1 - (u - 0.55) / 0.45);
      gunSlot.position.z = state.slotZ;
      gunSlot.rotation.set(pitch * 0.45 - lift * 0.5, across * dir, -across * dir * 0.6);
      torso.rotation.y = across * dir * 0.22;
    }
    arms.rotation.x = pitch * 0.12;
    arms.rotation.y = torso.rotation.y * 0.4;
  }

  const swing = (kind = 'slash') => {
    state.swingT = 0;
    state.swingKind = kind;
    state.swingDir = state.swingDir === 1 ? -1 : 1;
  };
  return { root, setWeapon, animate, swing, state, head };
}

// ---------------------------------------------------------------- first-person viewmodel

const VM_POSE = {
  ak47: { pos: [0.2, -0.125, -0.42], lHand: [0, -0.004, -0.33] },
  m4a1s: { pos: [0.2, -0.13, -0.42], lHand: [0, 0.005, -0.31] },
  awp: { pos: [0.2, -0.175, -0.5], lHand: [0, -0.03, -0.3] },
  deagle: { pos: [0.13, -0.115, -0.36], lHand: [-0.004, -0.07, 0.03] },
  knife: { pos: [0.17, -0.15, -0.34], lHand: null },
};

/**
 * First-person knife: a gloved fist wrapped round the handle, wrist and sleeve.
 * The holder's origin is the wrist, so the client's keyframed rotations read as real arm motion.
 */
function buildKnifeViewmodel(m, o) {
  const holder = new THREE.Group();
  const gun = buildGun('knife');
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  // fist (handle runs along z through the origin)
  rb(gun, 0.03, 0.07, 0.088, m.glove, 0.026, -0.006, 0.022, 0, 0.014); // back of the hand
  rb(gun, 0.05, 0.03, 0.088, m.glove, 0.006, -0.03, 0.022, 0, 0.012); // fingers under the handle
  rb(gun, 0.018, 0.046, 0.084, m.glove, -0.02, -0.008, 0.022, 0, 0.008); // fingertips on the far side
  for (let i = 0; i < 4; i++) {
    const k = new THREE.Mesh(new THREE.SphereGeometry(0.0125, 8, 6), m.glove);
    k.position.set(0.037, -0.02, -0.006 + i * 0.019); // knuckles
    gun.add(k);
  }
  limb(gun, v(0.026, 0.018, 0.05), v(-0.004, 0.024, -0.006), 0.012, m.glove); // thumb over the guard
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.04, 0.05, 14).rotateX(Math.PI / 2), m.glove);
  cuff.position.set(0.016, -0.008, 0.085);
  gun.add(cuff);
  limb(gun, v(0.016, -0.008, 0.1), v(0.07, -0.13, 0.45), 0.045, o.sleeve); // forearm
  const base = new THREE.Object3D();
  base.position.set(0, 0.008, -0.13); // trail covers the outer half of the blade
  gun.add(base);
  gun.userData.bladeBase = base;
  // resting grip: blade forward and up, tipped in toward the crosshair, edge down
  gun.rotation.set(0.55, 0.45, -0.55);
  holder.add(gun);
  holder.position.fromArray(VM_POSE.knife.pos);
  holder.userData = { gun, base: holder.position.clone(), id: 'knife' };
  holder.traverse((c) => {
    c.frustumCulled = false;
  });
  return holder;
}

/** First-person gun with gloved hands and sleeves. */
export function buildViewmodel(id, outfitIndex) {
  const m = mats();
  const o = outfitMats(outfitIndex);
  if (id === 'knife') return buildKnifeViewmodel(m, o);
  const holder = new THREE.Group();
  const gun = buildGun(id);
  // the stock sits behind the camera in first person and would fill the corner
  for (const part of gun.children) if (part.position.z > 0.125) part.visible = false;
  holder.add(gun);
  const pose = VM_POSE[id];
  const v = (a) => new THREE.Vector3().fromArray(a);
  // right hand on the grip, forearm runs back toward the lower right
  const rHand = v([0, -0.03, 0.03]);
  const rElbow = v([0.07, -0.2, 0.3]);
  limb(gun, rHand, rElbow, 0.04, o.sleeve);
  const rg = new THREE.Mesh(new RoundedBoxGeometry(0.06, 0.08, 0.09, 2, 0.02), m.glove);
  rg.position.copy(rHand);
  gun.add(rg);
  // left hand supports the handguard
  const lHand = v(pose.lHand);
  const lElbow = id === 'deagle' ? v([-0.12, -0.22, 0.2]) : v([-0.16, -0.2, lHand.z + 0.28]);
  limb(gun, lHand.clone().add(v([-0.01, -0.03, 0])), lElbow, 0.04, o.sleeve);
  const lg = new THREE.Mesh(new RoundedBoxGeometry(0.07, 0.06, 0.1, 2, 0.02), m.glove);
  lg.position.copy(lHand).add(v([0, -0.025, 0]));
  gun.add(lg);
  gun.rotation.y = id === 'deagle' ? 0.03 : 0.06; // angle the barrel toward the crosshair
  holder.position.fromArray(pose.pos);
  holder.userData = { gun, base: holder.position.clone(), id };
  holder.traverse((c) => {
    c.frustumCulled = false;
  });
  return holder;
}
