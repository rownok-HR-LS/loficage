// Realistic gun models built from side-profile outlines (real dimensions, metres).
// Profiles are drawn in a 2D plane: x = forward from the pistol grip, y = up. They are extruded across the
// gun's width with rounded edges and turned so the barrel points down -z. The grip is the origin.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { woodGrainTexture } from './materials.js';

// ---------------------------------------------------------------- materials

let MATS = null;
function wearTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  // roughness map multiplies the material roughness: keep it near 1 with light variation
  g.fillStyle = 'rgb(238,238,238)';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 5000; i++) {
    const v = 200 + Math.random() * 55;
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  g.strokeStyle = 'rgba(150,150,150,0.6)'; // fine polished scratches
  for (let i = 0; i < 70; i++) {
    g.beginPath();
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    g.moveTo(x, y);
    g.lineTo(x + (Math.random() - 0.5) * 40, y + (Math.random() - 0.5) * 8);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function gunMats() {
  if (MATS) return MATS;
  const wear = wearTexture();
  const metal = (color, rough, metalness = 0.85) =>
    new THREE.MeshStandardMaterial({ color, roughness: rough, metalness, roughnessMap: wear });
  const wood = woodGrainTexture('#7a3a16');
  MATS = {
    blued: metal('#2b2d31', 0.42),
    bluedDark: metal('#1a1b1d', 0.5),
    anodized: metal('#26272a', 0.55, 0.45),
    polymer: new THREE.MeshStandardMaterial({ color: '#1c1d1f', roughness: 0.75, metalness: 0.05, roughnessMap: wear }),
    akwood: new THREE.MeshPhysicalMaterial({ map: wood, color: '#b0623a', roughness: 0.55, clearcoat: 0.25, clearcoatRoughness: 0.45 }),
    bakelite: new THREE.MeshPhysicalMaterial({ color: '#4a1c0c', roughness: 0.45, clearcoat: 0.25, clearcoatRoughness: 0.4 }),
    green: new THREE.MeshStandardMaterial({ color: '#3a4630', roughness: 0.72, metalness: 0.05, roughnessMap: wear }),
    stainless: metal('#8e9398', 0.38, 1),
    steelDark: metal('#5a5f64', 0.38, 0.9),
    rubber: new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.9 }),
    lens: new THREE.MeshPhysicalMaterial({ color: '#203a5c', roughness: 0.05, metalness: 0.2, clearcoat: 1, iridescence: 0.6 }),
    lensBack: new THREE.MeshStandardMaterial({ color: '#05070a', roughness: 0.1, metalness: 0.6 }),
    blade: metal('#c9cdd1', 0.22, 1),
  };
  return MATS;
}

// ---------------------------------------------------------------- shape helpers

const V = (x, y) => new THREE.Vector2(x, y);

function poly(points) {
  const s = new THREE.Shape();
  s.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) s.lineTo(points[i][0], points[i][1]);
  s.closePath();
  return s;
}

/** Closed shape through points with smooth (spline) segments. */
function smooth(points) {
  const s = new THREE.Shape();
  s.moveTo(points[0][0], points[0][1]);
  s.splineThru(points.slice(1).map(([x, y]) => V(x, y)));
  s.closePath();
  return s;
}

function scaleUv(geo, k) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * k, uv.getY(i) * k);
}

/** Extrude a side profile across the gun (width), centred at x. */
function side(parent, shape, width, mat, { bevel = 0.003, x = 0, curve = 8 } = {}) {
  const depth = Math.max(0.0005, width - bevel * 2);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 2, curveSegments: curve,
  });
  geo.translate(0, 0, -depth / 2);
  geo.rotateY(Math.PI / 2);
  scaleUv(geo, 5);
  const m = new THREE.Mesh(geo, mat);
  m.position.x = x;
  parent.add(m);
  return m;
}

/** Cylinder along the barrel axis from f0 to f1 (forward distances), front radius r1, back radius r0. */
function tube(parent, r0, r1, f0, f1, y, mat, x = 0, seg = 20) {
  const geo = new THREE.CylinderGeometry(r1, r0, f1 - f0, seg);
  geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, -(f0 + f1) / 2);
  parent.add(m);
  return m;
}

/** Rounded block spanning f0..f1 forward, y0..y1 up, w wide. */
function blk(parent, f0, f1, y0, y1, w, mat, x = 0, r = 0.002) {
  const L = f1 - f0;
  const H = y1 - y0;
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, H, L, 2, Math.min(r, w / 2, H / 2, L / 2)), mat);
  m.position.set(x, (y0 + y1) / 2, -(f0 + f1) / 2);
  parent.add(m);
  return m;
}

/** Trigger guard: a thin loop with a hole. */
function triggerGuard(parent, f0, f1, depthY, mat, w = 0.008) {
  const outer = poly([[f0 - 0.004, 0.002], [f1 + 0.004, 0.002], [f1 + 0.002, -0.012], [f1 - 0.01, -depthY], [f0 + 0.004, -depthY - 0.002], [f0 - 0.006, -depthY + 0.014]]);
  const hole = new THREE.Path();
  hole.moveTo(f0 + 0.002, -0.004);
  hole.lineTo(f1 - 0.003, -0.004);
  hole.lineTo(f1 - 0.006, -0.012);
  hole.lineTo(f1 - 0.014, -depthY + 0.005);
  hole.lineTo(f0 + 0.006, -depthY + 0.004);
  hole.lineTo(f0, -depthY + 0.016);
  hole.closePath();
  outer.holes.push(hole);
  side(parent, outer, w, mat, { bevel: 0.0015 });
  side(parent, smooth([[f0 + 0.03, 0.0], [f0 + 0.037, 0.0], [f0 + 0.033, -0.018], [f0 + 0.024, -0.026], [f0 + 0.028, -0.012]]), 0.006, mat, { bevel: 0.001 });
}

function stockPart(mesh) {
  mesh.userData.stock = true; // hidden in first person (it sits behind the camera)
  return mesh;
}

// ---------------------------------------------------------------- AK-47 (AKM)

function ak47(g, m) {
  side(g, poly([[-0.085, 0.0], [0.2, 0.0], [0.212, 0.018], [0.212, 0.056], [-0.085, 0.056]]), 0.046, m.blued, { bevel: 0.002 });
  for (const x of [-0.0236, 0.0236]) blk(g, -0.06, 0.125, 0.012, 0.044, 0.0015, m.bluedDark, x, 0.0007); // stamped side recess
  side(g, smooth([[-0.09, 0.055], [0.17, 0.055], [0.172, 0.067], [0.15, 0.079], [0.02, 0.081], [-0.07, 0.079], [-0.09, 0.069]]), 0.043, m.blued);
  for (const f of [-0.05, 0.0, 0.05, 0.1]) blk(g, f, f + 0.006, 0.076, 0.082, 0.028, m.blued, 0, 0.001);
  side(g, poly([[0.16, 0.056], [0.27, 0.056], [0.27, 0.067], [0.2, 0.089], [0.16, 0.088]]), 0.03, m.blued);
  blk(g, 0.198, 0.226, 0.0, 0.06, 0.042, m.blued, 0, 0.003); // front trunnion
  side(g, smooth([[0.215, 0.0], [0.26, -0.003], [0.33, -0.004], [0.4, 0.0], [0.406, 0.022], [0.4, 0.048], [0.215, 0.048]]), 0.054, m.akwood, { bevel: 0.006 });
  tube(g, 0.027, 0.027, 0.4, 0.413, 0.025, m.blued);
  side(g, smooth([[0.27, 0.058], [0.42, 0.058], [0.43, 0.068], [0.42, 0.085], [0.28, 0.086], [0.27, 0.074]]), 0.038, m.akwood, { bevel: 0.006 });
  tube(g, 0.0115, 0.0115, 0.42, 0.47, 0.072, m.blued);
  side(g, poly([[0.465, 0.026], [0.5, 0.026], [0.5, 0.084], [0.48, 0.085], [0.465, 0.07]]), 0.03, m.blued);
  tube(g, 0.0105, 0.0105, 0.4, 0.666, 0.034, m.bluedDark);
  side(g, poly([[0.608, 0.022], [0.646, 0.022], [0.646, 0.05], [0.636, 0.07], [0.618, 0.07], [0.608, 0.05]]), 0.026, m.blued);
  blk(g, 0.625, 0.629, 0.068, 0.09, 0.003, m.bluedDark, 0, 0.0005);
  for (const x of [-0.0095, 0.0095]) blk(g, 0.618, 0.638, 0.064, 0.089, 0.004, m.blued, x, 0.001);
  tube(g, 0.0035, 0.0035, 0.43, 0.615, 0.018, m.blued, 0, 8);
  tube(g, 0.0135, 0.0125, 0.666, 0.705, 0.034, m.bluedDark);
  side(g, smooth([[-0.04, 0.002], [0.008, 0.002], [0.002, -0.04], [-0.016, -0.108], [-0.052, -0.113], [-0.057, -0.07], [-0.049, -0.02]]), 0.031, m.bakelite, { bevel: 0.006 });
  triggerGuard(g, 0.005, 0.07, 0.045, m.blued);
  side(g, poly([[-0.06, 0.036], [0.14, 0.036], [0.14, 0.044], [-0.03, 0.047], [-0.06, 0.045]]), 0.004, m.blued, { bevel: 0, x: 0.0255 }); // selector
  const ch = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.006, 0.03, 10).rotateZ(Math.PI / 2), m.blued);
  ch.position.set(0.035, 0.066, -0.13);
  g.add(ch);
  for (const f of [-0.04, 0.02, 0.09, 0.15]) {
    for (const x of [-0.0235, 0.0235]) {
      const r = new THREE.Mesh(new THREE.SphereGeometry(0.0032, 8, 6), m.blued);
      r.position.set(x, 0.008, -f);
      g.add(r);
    }
  }
  const mag = new THREE.Group();
  const magShape = new THREE.Shape();
  magShape.moveTo(0.078, 0.004);
  magShape.splineThru([V(0.083, -0.05), V(0.097, -0.11), V(0.12, -0.17), V(0.15, -0.22)]);
  magShape.lineTo(0.158, -0.229);
  magShape.lineTo(0.222, -0.206);
  magShape.lineTo(0.216, -0.195);
  magShape.splineThru([V(0.19, -0.14), V(0.172, -0.08), V(0.163, -0.03), V(0.158, 0.004)]);
  magShape.closePath();
  side(mag, magShape, 0.028, m.bakelite, { bevel: 0.004, curve: 16 });
  for (const t of [0.35, 0.55, 0.75]) {
    // raised stiffening ribs on the magazine body
    const f = 0.078 + (0.15 - 0.078) * t + 0.03;
    const y = -0.229 * t;
    const rib = blk(mag, f - 0.02, f + 0.02, y - 0.002, y + 0.002, 0.03, m.bakelite, 0, 0.001);
    rib.rotation.x = -0.35 * t;
  }
  g.add(mag);
  stockPart(side(g, smooth([[-0.08, 0.05], [-0.082, 0.002], [-0.15, -0.024], [-0.25, -0.05], [-0.335, -0.07], [-0.345, -0.071], [-0.345, 0.04], [-0.3, 0.046], [-0.2, 0.044]]), 0.04, m.akwood, { bevel: 0.007, curve: 12 }));
  stockPart(side(g, poly([[-0.356, -0.075], [-0.344, -0.075], [-0.344, 0.046], [-0.356, 0.046]]), 0.043, m.blued));
  return { muzzle: [0, 0.034, -0.71], mag };
}

// ---------------------------------------------------------------- M4A1-S

function m4a1s(g, m) {
  side(g, poly([[-0.075, 0.012], [-0.06, -0.006], [0.13, -0.006], [0.142, 0.01], [0.142, 0.036], [-0.075, 0.036]]), 0.036, m.anodized);
  side(g, poly([[0.038, 0.0], [0.135, 0.0], [0.13, -0.035], [0.045, -0.035]]), 0.04, m.anodized); // flared mag well
  side(g, poly([[-0.08, 0.035], [0.162, 0.035], [0.162, 0.074], [-0.08, 0.074]]), 0.032, m.anodized);
  blk(g, -0.01, 0.06, 0.04, 0.066, 0.002, m.bluedDark, 0.0165, 0.001); // ejection port cover
  tube(g, 0.008, 0.008, -0.03, 0.0, 0.055, m.anodized, 0.022, 10); // forward assist
  side(g, poly([[-0.095, 0.064], [-0.075, 0.064], [-0.075, 0.074], [-0.095, 0.074]]), 0.05, m.anodized, { bevel: 0.002 }); // charging handle
  // top rail with teeth
  blk(g, -0.078, 0.39, 0.074, 0.081, 0.022, m.anodized, 0, 0.001);
  for (let f = -0.072; f < 0.385; f += 0.0105) blk(g, f, f + 0.005, 0.081, 0.085, 0.022, m.anodized, 0, 0.0005);
  side(g, poly([[-0.065, 0.085], [-0.04, 0.085], [-0.042, 0.112], [-0.052, 0.116], [-0.063, 0.11]]), 0.02, m.anodized); // flip-up rear sight
  side(g, poly([[0.35, 0.085], [0.385, 0.085], [0.375, 0.125], [0.362, 0.128]]), 0.018, m.anodized); // front sight post
  // handguard with heat-shield rings
  tube(g, 0.027, 0.026, 0.165, 0.38, 0.052, m.polymer, 0, 24);
  for (let f = 0.19; f < 0.37; f += 0.025) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0268, 0.0018, 4, 24), m.polymer);
    ring.position.set(0, 0.052, -f);
    g.add(ring);
  }
  tube(g, 0.031, 0.031, 0.158, 0.17, 0.052, m.anodized); // delta ring
  tube(g, 0.01, 0.01, 0.38, 0.45, 0.052, m.bluedDark);
  tube(g, 0.019, 0.0185, 0.44, 0.66, 0.052, m.blued, 0, 24); // suppressor
  for (const f of [0.445, 0.655]) tube(g, 0.0195, 0.0195, f - 0.005, f + 0.005, 0.052, m.bluedDark, 0, 24);
  const mag = new THREE.Group();
  const ms = new THREE.Shape();
  ms.moveTo(0.047, -0.03);
  ms.splineThru([V(0.05, -0.09), V(0.058, -0.14), V(0.068, -0.172)]);
  ms.lineTo(0.074, -0.18);
  ms.lineTo(0.136, -0.172);
  ms.lineTo(0.132, -0.164);
  ms.splineThru([V(0.126, -0.12), V(0.122, -0.07), V(0.12, -0.03)]);
  ms.closePath();
  side(mag, ms, 0.025, m.anodized, { bevel: 0.003, curve: 12 });
  g.add(mag);
  side(g, smooth([[-0.038, 0.002], [0.002, 0.002], [-0.004, -0.035], [-0.022, -0.104], [-0.054, -0.108], [-0.058, -0.06], [-0.048, -0.015]]), 0.03, m.polymer, { bevel: 0.005 });
  triggerGuard(g, 0.003, 0.072, 0.042, m.anodized, 0.01);
  stockPart(tube(g, 0.015, 0.015, -0.27, -0.075, 0.05, m.anodized));
  stockPart(side(g, smooth([[-0.17, 0.068], [-0.27, 0.074], [-0.29, 0.07], [-0.292, -0.03], [-0.27, -0.036], [-0.21, -0.005], [-0.175, 0.028]]), 0.042, m.polymer, { bevel: 0.005 }));
  stockPart(side(g, poly([[-0.302, -0.034], [-0.291, -0.034], [-0.291, 0.074], [-0.302, 0.074]]), 0.044, m.rubber));
  return { muzzle: [0, 0.052, -0.665], mag };
}

// ---------------------------------------------------------------- AWP (Arctic Warfare)

function awp(g, m) {
  const stock = smooth([
    [0.46, 0.03], [0.46, -0.018], [0.3, -0.03], [0.15, -0.038], [0.06, -0.042], [0.02, -0.03], [-0.005, -0.045],
    [-0.025, -0.115], [-0.07, -0.122], [-0.062, -0.06], [-0.15, -0.052], [-0.3, -0.075], [-0.41, -0.094], [-0.425, -0.09],
    [-0.425, 0.058], [-0.36, 0.062], [-0.3, 0.08], [-0.15, 0.08], [-0.1, 0.045], [-0.06, 0.036], [0.2, 0.034],
  ]);
  const thumb = new THREE.Path();
  thumb.absellipse(-0.105, 0.0, 0.03, 0.022, 0, Math.PI * 2, false);
  stock.holes.push(thumb);
  const body = side(g, stock, 0.056, m.green, { bevel: 0.008, curve: 10 });
  void body;
  stockPart(side(g, poly([[-0.44, -0.095], [-0.425, -0.095], [-0.425, 0.06], [-0.44, 0.06]]), 0.058, m.rubber));
  blk(g, -0.06, 0.2, 0.03, 0.075, 0.042, m.blued, 0, 0.012); // action
  tube(g, 0.015, 0.0125, 0.2, 0.78, 0.052, m.bluedDark, 0, 24);
  tube(g, 0.019, 0.019, 0.78, 0.855, 0.052, m.blued, 0, 20);
  for (const f of [0.8, 0.83]) for (const x of [-0.016, 0.016]) blk(g, f, f + 0.012, 0.045, 0.06, 0.006, m.bluedDark, x, 0.001);
  // scope: tube, bells, turrets, rings, lenses
  tube(g, 0.016, 0.016, -0.05, 0.26, 0.128, m.bluedDark, 0, 24);
  tube(g, 0.016, 0.028, 0.26, 0.33, 0.128, m.bluedDark, 0, 28);
  tube(g, 0.028, 0.028, 0.33, 0.36, 0.128, m.bluedDark, 0, 28);
  tube(g, 0.021, 0.016, -0.12, -0.05, 0.128, m.bluedDark, 0, 24);
  tube(g, 0.021, 0.021, -0.14, -0.12, 0.128, m.rubber, 0, 24);
  tube(g, 0.026, 0.026, 0.359, 0.362, 0.128, m.lens, 0, 28);
  tube(g, 0.019, 0.019, -0.142, -0.14, 0.128, m.lensBack, 0, 24);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.03, 16), m.bluedDark);
  top.position.set(0, 0.155, -0.1);
  g.add(top);
  const wind = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.028, 16).rotateZ(Math.PI / 2), m.bluedDark);
  wind.position.set(0.027, 0.128, -0.1);
  g.add(wind);
  for (const f of [-0.02, 0.18]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.005, 8, 20), m.blued);
    ring.position.set(0, 0.128, -f);
    g.add(ring);
    blk(g, f - 0.012, f + 0.012, 0.075, 0.112, 0.022, m.blued, 0, 0.003);
  }
  const bolt = new THREE.Group();
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.06, 8).rotateZ(Math.PI / 2), m.stainless);
  stem.position.set(0.03, 0, 0);
  bolt.add(stem);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.013, 12, 10), m.bluedDark);
  knob.position.set(0.062, -0.008, 0);
  bolt.add(knob);
  bolt.position.set(0.012, 0.05, 0.03);
  g.add(bolt);
  const mag = new THREE.Group();
  blk(mag, 0.06, 0.13, -0.1, -0.035, 0.044, m.polymer, 0, 0.004);
  g.add(mag);
  triggerGuard(g, 0.005, 0.06, 0.04, m.blued);
  for (const x of [-0.012, 0.012]) tube(g, 0.004, 0.004, 0.22, 0.44, -0.035, m.blued, x, 8); // folded bipod legs
  return { muzzle: [0, 0.052, -0.86], mag, bolt };
}

// ---------------------------------------------------------------- Desert Eagle

function deagle(g, m) {
  side(g, poly([[-0.062, 0.036], [0.205, 0.036], [0.212, 0.046], [0.208, 0.075], [-0.046, 0.075], [-0.062, 0.066]]), 0.034, m.stainless, { bevel: 0.003 });
  side(g, poly([[-0.01, 0.074], [0.212, 0.074], [0.212, 0.082], [0.205, 0.09], [-0.005, 0.09]]), 0.02, m.stainless, { bevel: 0.004 }); // triangular barrel top
  for (let i = 0; i < 7; i++) {
    const f = -0.052 + i * 0.0062;
    for (const x of [-0.0172, 0.0172]) blk(g, f, f + 0.0028, 0.044, 0.072, 0.0015, m.steelDark, x, 0.0005);
  }
  side(g, poly([[-0.058, 0.002], [0.13, 0.002], [0.142, 0.016], [0.142, 0.037], [-0.06, 0.037], [-0.062, 0.012]]), 0.03, m.steelDark, { bevel: 0.002 });
  side(g, smooth([[-0.052, 0.003], [0.0, 0.003], [0.006, -0.02], [-0.004, -0.06], [-0.014, -0.128], [-0.064, -0.132], [-0.068, -0.07], [-0.062, -0.01]]), 0.034, m.rubber, { bevel: 0.006 });
  triggerGuard(g, 0.0, 0.065, 0.04, m.steelDark, 0.009);
  side(g, poly([[-0.074, 0.05], [-0.06, 0.048], [-0.058, 0.07], [-0.07, 0.074]]), 0.012, m.steelDark, { bevel: 0.001 }); // hammer
  blk(g, 0.195, 0.205, 0.09, 0.1, 0.004, m.steelDark, 0, 0.001); // front sight
  blk(g, -0.04, -0.028, 0.075, 0.088, 0.022, m.steelDark, 0, 0.001); // rear sight
  tube(g, 0.0085, 0.0085, 0.205, 0.214, 0.056, m.lensBack, 0, 14); // bore
  const mag = new THREE.Group();
  blk(mag, -0.068, -0.012, -0.142, -0.13, 0.03, m.steelDark, 0, 0.003);
  g.add(mag);
  return { muzzle: [0, 0.056, -0.218], mag };
}

// ---------------------------------------------------------------- knife

function knife(g, m) {
  side(g, poly([[-0.075, 0.012], [0.035, 0.016], [0.035, -0.02], [0.022, -0.024], [0.012, -0.017], [0.002, -0.024], [-0.008, -0.017], [-0.018, -0.024], [-0.028, -0.017], [-0.075, -0.02]]), 0.026, m.rubber, { bevel: 0.006 });
  side(g, poly([[0.035, -0.03], [0.047, -0.03], [0.047, 0.03], [0.035, 0.03]]), 0.03, m.bluedDark, { bevel: 0.002 }); // guard
  side(g, poly([[-0.09, -0.018], [-0.074, -0.02], [-0.074, 0.014], [-0.09, 0.012]]), 0.024, m.bluedDark, { bevel: 0.003 }); // pommel
  side(g, poly([[0.047, 0.013], [0.17, 0.013], [0.205, 0.002], [0.245, -0.004], [0.215, -0.013], [0.14, -0.022], [0.06, -0.023], [0.047, -0.018]]), 0.0055, m.blade, { bevel: 0.0012 });
  side(g, poly([[0.05, 0.013], [0.165, 0.013], [0.165, 0.006], [0.05, 0.006]]), 0.0062, m.bluedDark, { bevel: 0.0005 }); // dark spine
  side(g, poly([[0.06, -0.004], [0.15, -0.004], [0.15, -0.007], [0.06, -0.007]]), 0.0064, m.steelDark, { bevel: 0 }); // fuller groove
  return { muzzle: [0, 0.0, -0.245], mag: new THREE.Group() };
}

export const GUN_BUILDERS = { ak47, m4a1s, awp, deagle, knife };
