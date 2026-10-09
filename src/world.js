// Renderer, sky, lighting and the static desert town built from the shared map.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MAP_BOXES, MAP_DECOR, ROADS, MAP_HALF } from '../shared/map.js';
import { collides } from '../shared/physics.js';
import { rng } from '../shared/rng.js';
import {
  surface, SURFACES, setAnisotropy, stripeTexture, leafTexture, barkTexture, woodGrainTexture,
} from './materials.js';
import { addArchitecture, cloudLayer } from './details.js';

export const SUN_DIR = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 40), THREE.MathUtils.degToRad(125));

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.autoClear = false;
  setAnisotropy(Math.min(8, renderer.capabilities.getMaxAnisotropy()));
  return renderer;
}

export function applyQuality(renderer, sun, quality) {
  const dpr = window.devicePixelRatio || 1;
  if (quality === 'high') {
    renderer.setPixelRatio(Math.min(dpr, 1.5));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    setShadowSize(sun, 4096);
  } else if (quality === 'medium') {
    renderer.setPixelRatio(1);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    setShadowSize(sun, 2048);
  } else {
    renderer.setPixelRatio(Math.min(dpr, 1) * 0.75);
    renderer.shadowMap.enabled = false;
  }
  sun.castShadow = quality !== 'low';
  renderer.shadowMap.needsUpdate = true;
}

function setShadowSize(sun, size) {
  if (sun.shadow.mapSize.x === size) return;
  sun.shadow.mapSize.set(size, size);
  sun.shadow.map?.dispose();
  sun.shadow.map = null;
}

// ---------------------------------------------------------------- geometry helpers

/**
 * Box with planar world-space UVs so textures tile continuously and at real scale.
 * tint (THREE.Color) adds vertex colours: the tint, darkened by dirt toward the ground and under the roof edge.
 */
export function boxGeometry(min, max, scale, local = false, tint = null) {
  const w = max[0] - min[0];
  const h = max[1] - min[1];
  const d = max[2] - min[2];
  const cx = (min[0] + max[0]) / 2;
  const cy = (min[1] + max[1]) / 2;
  const cz = (min[2] + max[2]) / 2;
  // extra height segments so the dirt gradient stays near the ground instead of spanning the wall
  const segs = tint ? Math.max(1, Math.min(8, Math.ceil(h / 1.2))) : 1;
  const g = new THREE.BoxGeometry(w, h, d, 1, segs, 1);
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i) + (local ? w / 2 : cx);
    const py = pos.getY(i) + (local ? h / 2 : cy);
    const pz = pos.getZ(i) + (local ? d / 2 : cz);
    const nx = nor.getX(i);
    const ny = nor.getY(i);
    let u;
    let v;
    if (Math.abs(nx) > 0.5) {
      u = nx > 0 ? -pz : pz;
      v = py;
    } else if (Math.abs(ny) > 0.5) {
      u = px;
      v = pz;
    } else {
      u = nor.getZ(i) > 0 ? px : -px;
      v = py;
    }
    uv.setXY(i, u / scale, v / scale);
  }
  if (tint) {
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) + cy;
      const vertical = Math.abs(nor.getY(i)) < 0.5;
      let k = 1;
      if (vertical) {
        const fromGround = y - Math.max(0, min[1]);
        k *= 0.66 + 0.34 * THREE.MathUtils.smoothstep(fromGround, 0, 1.6);
        k *= 1 - 0.1 * THREE.MathUtils.smoothstep(y, max[1] - 0.9, max[1]);
      }
      col[i * 3] = tint.r * k;
      col[i * 3 + 1] = tint.g * k;
      col[i * 3 + 2] = tint.b * k;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  g.translate(cx, cy, cz);
  return g;
}

/** Slightly different tint per building so the town isn't one flat colour. */
export function buildingTint(rand, amount = 0.07) {
  const v = 1 - amount + rand() * amount * 2;
  const warm = (rand() - 0.5) * 0.06;
  return new THREE.Color(v + warm, v, v - warm);
}

export function addTo(groups, key, geo) {
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(geo);
}

function shadowMesh(geo, mat, cast = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = true;
  m.matrixAutoUpdate = false;
  m.updateMatrix();
  return m;
}

const FACES = [
  { n: [1, 0], axis: 0, rot: Math.PI / 2 },
  { n: [-1, 0], axis: 0, rot: -Math.PI / 2 },
  { n: [0, 1], axis: 2, rot: 0 },
  { n: [0, -1], axis: 2, rot: Math.PI },
];

// ---------------------------------------------------------------- world

export function createWorld(scene, renderer) {
  const world = new THREE.Group();
  scene.add(world);

  // sky + environment lighting
  const sky = new Sky();
  sky.scale.setScalar(5000);
  const u = sky.material.uniforms;
  u.turbidity.value = 3.2;
  u.rayleigh.value = 1.5;
  u.mieCoefficient.value = 0.004;
  u.mieDirectionalG.value = 0.86;
  u.sunPosition.value.copy(SUN_DIR);
  // the physical sky drives reflections; what you see is a richer painted gradient dome
  scene.add(skyDome());

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const envSky = new Sky();
  envSky.scale.setScalar(5000);
  Object.assign(envSky.material.uniforms.sunPosition.value, SUN_DIR);
  for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG']) envSky.material.uniforms[k].value = u[k].value;
  envScene.add(envSky);
  const env = pmrem.fromScene(envScene, 0.02).texture;
  scene.environment = env;
  scene.environmentIntensity = 0.18; // the sky HDR is bright; keep it for reflections, light with sun + hemisphere
  pmrem.dispose();

  scene.fog = new THREE.FogExp2('#cdd6df', 0.0019);
  scene.add(cloudLayer());

  const sun = new THREE.DirectionalLight('#ffeed6', 3.6);
  sun.position.copy(SUN_DIR).multiplyScalar(90);
  sun.castShadow = true;
  const sc = sun.shadow.camera;
  sc.left = -62;
  sc.right = 62;
  sc.top = 62;
  sc.bottom = -62;
  sc.near = 10;
  sc.far = 200;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.bias = -0.00025;
  sun.shadow.normalBias = 0.035;
  scene.add(sun);
  scene.add(sun.target);
  scene.add(new THREE.HemisphereLight('#e4e3dc', '#9c8466', 1.1));

  // ground + roads
  const groundGeo = new THREE.PlaneGeometry(420, 420);
  groundGeo.rotateX(-Math.PI / 2);
  scaleUV(groundGeo, 420 / SURFACES.ground.scale);
  world.add(shadowMesh(groundGeo, surface('ground'), false));

  const roadGeos = [];
  const xRoads = ROADS.filter((r) => r[3] - r[1] > r[2] - r[0]);
  for (const r of ROADS) {
    if (xRoads.includes(r)) {
      roadGeos.push(roadQuad(r[0], r[1], r[2], r[3]));
    } else {
      // split horizontal roads at the vertical ones so nothing overlaps
      const cuts = xRoads.map((v) => [v[0], v[2]]).sort((a, b) => a[0] - b[0]);
      let x = r[0];
      for (const [a, b] of cuts) {
        if (a > x) roadGeos.push(roadQuad(x, r[1], a, r[3]));
        x = Math.max(x, b);
      }
      if (x < r[2]) roadGeos.push(roadQuad(x, r[1], r[2], r[3]));
    }
  }
  const pave = surface('paving').clone();
  pave.polygonOffset = true;
  pave.polygonOffsetFactor = -2;
  pave.polygonOffsetUnits = -2;
  world.add(shadowMesh(mergeGeometries(roadGeos), pave, false));

  // static boxes merged by material
  const groups = new Map();
  const rand = rng(1337);
  const barrels = [];
  for (const b of MAP_BOXES) {
    if (b.kind === 'palm' || b.kind === 'pole' || b.kind === 'crate') continue;
    if (b.kind === 'barrel') {
      barrels.push(b);
      continue;
    }
    const s = SURFACES[b.m];
    const local = b.kind === 'stalltable';
    const tint = b.m === 'cab' ? null : buildingTint(rand, b.kind === 'building' ? 0.08 : 0.04);
    addTo(groups, tint ? `${b.m}|vc` : b.m, boxGeometry(b.min, b.max, s ? s.scale : 3, local, tint));
    if (b.kind === 'building' || b.kind === 'perimeter') {
      // cornice and plinth bands make the blocks read as buildings
      const trim = b.m === 'sandstone' ? 'concrete' : 'sandstone';
      const top = b.max[1];
      const t2 = buildingTint(rand, 0.03);
      addTo(groups, `${trim}|vc`, boxGeometry([b.min[0] - 0.14, top - 0.28, b.min[2] - 0.14], [b.max[0] + 0.14, top + 0.06, b.max[2] + 0.14], 3, false, t2));
      addTo(groups, `${trim}|vc`, boxGeometry([b.min[0] - 0.05, 0, b.min[2] - 0.05], [b.max[0] + 0.05, 0.55, b.max[2] + 0.05], 3, false, t2));
    }
  }
  for (const [key, list] of groups) {
    const [m, vc] = key.split('|');
    world.add(shadowMesh(mergeGeometries(list), surface(m, vc === 'vc')));
  }
  addArchitecture(world, rand);

  addContactShadows(world);
  addFacadeDetails(world, rand);
  addBarrels(world, barrels, rand);
  addDecor(world, rand);
  addSkyline(world, rand);
  bakeStatic(world);

  return { world, sun, sky };
}

/** Merge every plain static mesh in the world by material + shadow flags: far fewer draw calls. */
function bakeStatic(world) {
  world.updateMatrixWorld(true);
  const groups = new Map();
  const remove = [];
  world.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.userData.noBake) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    if (!g.attributes.uv) return;
    const keep = o.material.vertexColors ? ['position', 'normal', 'uv', 'color'] : ['position', 'normal', 'uv'];
    for (const k of Object.keys(g.attributes)) if (!keep.includes(k)) g.deleteAttribute(k);
    if (o.material.vertexColors && !g.attributes.color) {
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
    }
    g.applyMatrix4(o.matrixWorld);
    const key = `${o.material.uuid}|${o.castShadow ? 1 : 0}|${o.receiveShadow ? 1 : 0}|${o.renderOrder}`;
    if (!groups.has(key)) groups.set(key, { mat: o.material, cast: o.castShadow, recv: o.receiveShadow, order: o.renderOrder, list: [] });
    groups.get(key).list.push(g);
    remove.push(o);
  });
  for (const o of remove) o.parent.remove(o);
  for (const { mat, cast, recv, order, list } of groups.values()) {
    const m = new THREE.Mesh(list.length > 1 ? mergeGeometries(list) : list[0], mat);
    m.castShadow = cast;
    m.receiveShadow = recv;
    m.renderOrder = order;
    m.matrixAutoUpdate = false;
    world.add(m);
  }
}

function scaleUV(geo, s) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * s, uv.getY(i) * s);
}

function roadQuad(x1, z1, x2, z2) {
  const g = new THREE.PlaneGeometry(x2 - x1, z2 - z1);
  g.rotateX(-Math.PI / 2);
  const uv = g.attributes.uv;
  const pos = g.attributes.position;
  const cx = (x1 + x2) / 2;
  const cz = (z1 + z2) / 2;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) + cx) / SURFACES.paving.scale, (pos.getZ(i) + cz) / SURFACES.paving.scale);
  g.translate(cx, 0.004, cz);
  return g;
}

/** Soft dark strips on the ground along walls and crates: cheap ambient occlusion. */
function addContactShadows(world) {
  const geos = [];
  for (const b of MAP_BOXES) {
    if (b.min[1] > 0.01 || b.kind === 'palm' || b.kind === 'pole' || b.kind === 'perimeter') continue;
    const reach = b.kind === 'crate' || b.kind === 'barrel' ? 0.45 : 0.9;
    const [x1, , z1] = b.min;
    const [x2, , z2] = b.max;
    const strips = [
      [x1, z2, x2, z2 + reach, 0], [x1, z1 - reach, x2, z1, 2],
      [x2, z1, x2 + reach, z2, 1], [x1 - reach, z1, x1, z2, 3],
    ];
    for (const [a, c, bb, d, dir] of strips) {
      const g = new THREE.PlaneGeometry(bb - a, d - c);
      g.rotateX(-Math.PI / 2);
      const uv = g.attributes.uv;
      const pos = g.attributes.position;
      for (let i = 0; i < uv.count; i++) {
        const px = pos.getX(i) > 0 ? 1 : 0;
        const pz = pos.getZ(i) > 0 ? 1 : 0;
        // u = 0 at the wall, 1 away from it
        const t = dir === 0 ? pz : dir === 2 ? 1 - pz : dir === 1 ? px : 1 - px;
        uv.setXY(i, t, 0.5);
      }
      g.translate((a + bb) / 2, 0.012, (c + d) / 2);
      geos.push(g);
    }
  }
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 4;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 64, 0);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(0.35, 'rgba(0,0,0,0.22)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 4);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
  const mesh = new THREE.Mesh(mergeGeometries(geos), mat);
  mesh.renderOrder = 1;
  world.add(mesh);
}

/** Windows, shutters, sills and doors on every exposed building wall (instanced). */
function addFacadeDetails(world, rand) {
  const windows = [];
  const doors = [];
  for (const b of MAP_BOXES) {
    if (b.kind !== 'building') continue;
    const h = b.max[1];
    for (const f of FACES) {
      const along = f.axis === 0 ? 2 : 0;
      const lo = b.min[along];
      const hi = b.max[along];
      const len = hi - lo;
      if (len < 3) continue;
      const faceCoord = f.n[0] + f.n[1] > 0 ? b.max[f.axis] : b.min[f.axis];
      if (Math.abs(faceCoord) > MAP_HALF - 0.5) continue;
      const count = Math.floor((len - 1.6) / 3.1);
      const start = lo + (len - (count - 1) * 3.1) / 2;
      for (let i = 0; i < count; i++) {
        const t = start + i * 3.1;
        for (let y = 1.5; y + 1.6 < h; y += 3) {
          const probe = [0, 0];
          probe[f.axis === 0 ? 0 : 1] = faceCoord + (f.n[0] + f.n[1]) * 0.7;
          probe[f.axis === 0 ? 1 : 0] = t;
          const px = f.axis === 0 ? probe[0] : probe[1];
          const pz = f.axis === 0 ? probe[1] : probe[0];
          if (collides(px, y - 1, pz, 2.2, 0.3)) continue;
          const x = f.axis === 0 ? faceCoord : t;
          const z = f.axis === 0 ? t : faceCoord;
          if (y < 2 && rand() < 0.22 && !collides(px, 0, pz, 2.4, 0.5)) {
            doors.push({ x, z, rot: f.rot, n: f.n });
          } else if (rand() < 0.88) {
            windows.push({ x, y: y + 0.65, z, rot: f.rot, n: f.n, shutter: rand() < 0.45, color: rand() });
          }
        }
      }
    }
  }

  const dummy = new THREE.Object3D();
  const place = (mesh, i, item, y, out, sx = 1) => {
    dummy.position.set(item.x + item.n[0] * out, y, item.z + item.n[1] * out);
    dummy.rotation.set(0, item.rot, 0);
    dummy.scale.set(sx, 1, 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  };

  const glassMat = new THREE.MeshStandardMaterial({ color: '#141a20', roughness: 0.08, metalness: 0.9, envMapIntensity: 1.2 });
  const glass = new THREE.InstancedMesh(new THREE.BoxGeometry(0.95, 1.25, 0.04), glassMat, windows.length);
  const frameGeo = mergeGeometries([
    new THREE.BoxGeometry(1.15, 0.09, 0.1).translate(0, 0.67, 0),
    new THREE.BoxGeometry(1.15, 0.09, 0.1).translate(0, -0.67, 0),
    new THREE.BoxGeometry(0.09, 1.35, 0.1).translate(-0.53, 0, 0),
    new THREE.BoxGeometry(0.09, 1.35, 0.1).translate(0.53, 0, 0),
    new THREE.BoxGeometry(0.05, 1.25, 0.06).translate(0, 0, 0),
  ]);
  const frameMat = new THREE.MeshStandardMaterial({ map: woodGrainTexture('#5c3b22'), roughness: 0.8 });
  const frames = new THREE.InstancedMesh(frameGeo, frameMat, windows.length);
  const sills = new THREE.InstancedMesh(new THREE.BoxGeometry(1.35, 0.09, 0.22), surface('concrete'), windows.length);
  const lintels = new THREE.InstancedMesh(new THREE.BoxGeometry(1.45, 0.2, 0.14), surface('sandstone'), windows.length);
  const shutterList = windows.filter((w) => w.shutter);
  const shutterMat = new THREE.MeshStandardMaterial({ map: woodGrainTexture('#c8c0b0'), roughness: 0.75 });
  const shutters = new THREE.InstancedMesh(new THREE.BoxGeometry(0.56, 1.32, 0.045), shutterMat, shutterList.length * 2);
  const paints = ['#3f6f8f', '#4f7a52', '#8f4a3a', '#6b5a8a', '#2f5a6a', '#9a7a3a'].map((c) => new THREE.Color(c));
  windows.forEach((w, i) => {
    place(glass, i, w, w.y, 0.0);
    place(frames, i, w, w.y, 0.04);
    place(sills, i, w, w.y - 0.72, 0.09);
    place(lintels, i, w, w.y + 0.82, 0.06);
  });
  shutterList.forEach((w, i) => {
    for (const side of [-1, 1]) {
      const k = i * 2 + (side > 0 ? 1 : 0);
      const ox = Math.cos(w.rot) * side * 0.86;
      const oz = -Math.sin(w.rot) * side * 0.86;
      dummy.position.set(w.x + w.n[0] * 0.05 + ox, w.y, w.z + w.n[1] * 0.05 + oz);
      dummy.rotation.set(0, w.rot, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      shutters.setMatrixAt(k, dummy.matrix);
      shutters.setColorAt(k, paints[Math.floor(w.color * paints.length)]);
    }
  });

  const doorMat = surface('door').clone();
  const doorGeo = new THREE.BoxGeometry(1.35, 2.3, 0.08);
  const doorMesh = new THREE.InstancedMesh(doorGeo, doorMat, doors.length);
  const doorFrame = new THREE.InstancedMesh(
    mergeGeometries([
      new THREE.BoxGeometry(1.65, 0.16, 0.16).translate(0, 1.23, 0),
      new THREE.BoxGeometry(0.15, 2.4, 0.16).translate(-0.75, 0.05, 0),
      new THREE.BoxGeometry(0.15, 2.4, 0.16).translate(0.75, 0.05, 0),
    ]),
    surface('concrete'),
    doors.length,
  );
  doors.forEach((d, i) => {
    place(doorMesh, i, d, 1.15, 0.0);
    place(doorFrame, i, d, 1.15, 0.05);
  });

  for (const m of [glass, frames, sills, lintels, shutters, doorMesh, doorFrame]) {
    m.castShadow = false;
    m.receiveShadow = true;
    world.add(m);
  }
}

function addBarrels(world, barrels, rand) {
  const geo = new THREE.CylinderGeometry(0.3, 0.3, 0.95, 20);
  geo.translate(0, 0.475, 0);
  const ribGeo = new THREE.TorusGeometry(0.305, 0.018, 6, 24);
  const mat = new THREE.MeshStandardMaterial({ color: '#7a3424', roughness: 0.55, metalness: 0.6, map: surface('metal').map });
  const blue = mat.clone();
  blue.color = new THREE.Color('#3a5a78');
  for (const b of barrels) {
    const x = (b.min[0] + b.max[0]) / 2;
    const z = (b.min[2] + b.max[2]) / 2;
    const m = new THREE.Mesh(geo, rand() < 0.5 ? mat : blue);
    m.position.set(x, 0, z);
    m.rotation.y = rand() * Math.PI;
    m.castShadow = m.receiveShadow = true;
    world.add(m);
    for (const y of [0.3, 0.65]) {
      const r = new THREE.Mesh(ribGeo, m.material);
      r.rotation.x = Math.PI / 2;
      r.position.set(x, y, z);
      world.add(r);
    }
  }
}

function addDecor(world, rand) {
  const leaf = new THREE.MeshStandardMaterial({ map: leafTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8 });
  const bark = new THREE.MeshStandardMaterial({ map: barkTexture(), roughness: 0.95 });
  bark.map.repeat.set(2, 6);
  const poleMat = new THREE.MeshStandardMaterial({ map: woodGrainTexture('#4a3626'), roughness: 0.9 });
  const tire = new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.9 });
  const rim = new THREE.MeshStandardMaterial({ color: '#8a8a86', roughness: 0.4, metalness: 0.8 });
  const darkGlass = new THREE.MeshStandardMaterial({ color: '#0e1318', roughness: 0.05, metalness: 0.9 });
  const poles = [];

  for (const d of MAP_DECOR) {
    if (d.type === 'palm') world.add(palm(d.x, d.z, bark, leaf, rand));
    if (d.type === 'pole') {
      const g = new THREE.Group();
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.15, 7.5, 10), poleMat);
      p.position.y = 3.75;
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.12, 0.12), poleMat);
      bar.position.y = 7.0;
      g.add(p, bar);
      g.position.set(d.x, 0, d.z);
      g.traverse((o) => {
        o.castShadow = true;
      });
      world.add(g);
      poles.push(new THREE.Vector3(d.x, 6.95, d.z));
    }
    if (d.type === 'stall') world.add(stall(d, poleMat));
    if (d.type === 'awning') world.add(awning(d, poleMat));
    if (d.type === 'truck') {
      for (const [ox, oz] of [[-1.15, -2.2], [1.15, -2.2], [-1.15, 0.2], [1.15, 0.2], [-1.12, 3.2], [1.12, 3.2]]) {
        const wx = d.alongZ ? ox : oz;
        const wz = d.alongZ ? oz : ox;
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.32, 20), tire);
        w.rotation.z = Math.PI / 2;
        if (!d.alongZ) w.rotation.set(Math.PI / 2, 0, 0);
        w.position.set(d.x + wx, 0.48, d.z + wz);
        w.castShadow = true;
        const r = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.34, 14), rim);
        r.rotation.copy(w.rotation);
        r.position.copy(w.position);
        world.add(w, r);
      }
      const ws = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.8, 0.05), darkGlass);
      ws.position.set(d.x, 1.75, d.z + 4.12);
      world.add(ws);
    }
  }

  // sagging wires between nearby poles
  const wireMat = new THREE.LineBasicMaterial({ color: '#1b1714' });
  for (let i = 0; i < poles.length; i++) {
    for (let j = i + 1; j < poles.length; j++) {
      const a = poles[i];
      const b = poles[j];
      if (a.distanceTo(b) > 30) continue;
      for (const off of [-0.8, 0.8]) {
        const pts = [];
        for (let k = 0; k <= 16; k++) {
          const t = k / 16;
          const p = a.clone().lerp(b, t);
          p.x += off;
          p.y -= Math.sin(t * Math.PI) * 1.1;
          pts.push(p);
        }
        world.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireMat));
      }
    }
  }
}

function palm(x, z, bark, leaf, rand) {
  const g = new THREE.Group();
  const lean = (rand() - 0.5) * 0.25;
  const segs = 7;
  let px = 0;
  let py = 0;
  for (let i = 0; i < segs; i++) {
    const h = 0.95;
    const r0 = 0.2 - i * 0.012;
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(r0 - 0.02, r0, h, 10), bark);
    px += lean * 0.35 * i * 0.2;
    seg.position.set(px, py + h / 2, 0);
    seg.rotation.z = -lean * 0.4;
    seg.castShadow = true;
    g.add(seg);
    py += h * 0.97;
  }
  const crown = new THREE.Group();
  crown.position.set(px, py, 0);
  const frondGeo = new THREE.PlaneGeometry(1.4, 3.6, 1, 8);
  frondGeo.translate(0, 1.8, 0);
  const pos = frondGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    pos.setZ(i, -Math.pow(y / 3.6, 2) * 1.6);
  }
  frondGeo.computeVertexNormals();
  for (let i = 0; i < 11; i++) {
    const f = new THREE.Mesh(frondGeo, leaf);
    f.rotation.order = 'YXZ';
    f.rotation.y = (i / 11) * Math.PI * 2 + rand() * 0.3;
    f.rotation.x = -0.9 - rand() * 0.5;
    f.castShadow = true;
    crown.add(f);
  }
  g.add(crown);
  g.position.set(x, 0, z);
  return g;
}

function stall(d, wood) {
  const g = new THREE.Group();
  const cloth = new THREE.MeshStandardMaterial({ map: stripeTexture(d.color), side: THREE.DoubleSide, roughness: 0.9 });
  for (const [x, z] of [[-1.5, -1], [1.5, -1], [-1.5, 1], [1.5, 1]]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.5, 6), wood);
    p.position.set(x, 1.25 + (z > 0 ? -0.15 : 0.15), z);
    p.castShadow = true;
    g.add(p);
  }
  const roof = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 2.6), cloth);
  roof.rotation.x = -Math.PI / 2 + 0.22;
  roof.position.y = 2.45;
  roof.castShadow = true;
  roof.receiveShadow = true;
  g.add(roof);
  g.position.set(d.x, 0, d.z);
  g.rotation.y = d.rot;
  return g;
}

function awning(d, wood) {
  const g = new THREE.Group();
  const cloth = new THREE.MeshStandardMaterial({ map: stripeTexture('#9c3b2c'), side: THREE.DoubleSide, roughness: 0.9 });
  cloth.map.repeat.set(d.w / 2, 1);
  const roof = new THREE.Mesh(new THREE.PlaneGeometry(d.w, 1.8), cloth);
  roof.rotation.x = -Math.PI / 2 - 0.35;
  roof.position.set(0, 3.0, 0.85);
  roof.castShadow = true;
  g.add(roof);
  for (const x of [-d.w / 2 + 0.1, d.w / 2 - 0.1]) {
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.9, 6), wood);
    s.rotation.x = Math.PI / 2 - 0.35;
    s.position.set(x, 2.98, 0.85);
    g.add(s);
  }
  const rot = { 'z+': 0, 'z-': Math.PI, 'x+': Math.PI / 2, 'x-': -Math.PI / 2 }[d.side];
  g.rotation.y = rot;
  g.position.set(d.x, 0, d.z);
  return g;
}

/** Rooftops beyond the perimeter wall and distant dunes, so the town doesn't end in a box. */
function addSkyline(world, rand) {
  const groups = new Map();
  const mats = ['plaster', 'sandstone', 'clay', 'white'];
  for (let i = 0; i < 70; i++) {
    const side = i % 4;
    const t = (rand() - 0.5) * 150;
    const dist = 52 + rand() * 28;
    const w = 6 + rand() * 10;
    const d = 6 + rand() * 10;
    const h = 11 + rand() * 9;
    const cx = side === 0 ? dist : side === 1 ? -dist : t;
    const cz = side === 2 ? dist : side === 3 ? -dist : t;
    const m = mats[Math.floor(rand() * mats.length)];
    addTo(groups, m, boxGeometry([cx - w / 2, 0, cz - d / 2], [cx + w / 2, h, cz + d / 2], SURFACES[m].scale));
  }
  for (const [key, list] of groups) {
    const mesh = new THREE.Mesh(mergeGeometries(list), surface(key));
    mesh.receiveShadow = false;
    world.add(mesh);
  }
  // dunes
  const geo = new THREE.RingGeometry(140, 420, 96, 6);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);
    const a = Math.atan2(z, x);
    const hgt = (Math.sin(a * 5) * 0.5 + Math.sin(a * 13 + 1) * 0.3 + Math.sin(a * 2.3) * 0.6 + 1.2) * (r - 140) * 0.09;
    pos.setY(i, Math.max(0, hgt));
  }
  geo.computeVertexNormals();
  const dune = new THREE.MeshStandardMaterial({ color: '#d2b38a', roughness: 1 });
  world.add(new THREE.Mesh(geo, dune));
}

/** Visible sky: deep blue overhead fading to a pale horizon, with a soft glow around the sun. */
function skyDome() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      sunDir: { value: SUN_DIR.clone() },
      zenith: { value: new THREE.Color('#2f6fb8') },
      mid: { value: new THREE.Color('#79aee0') },
      horizon: { value: new THREE.Color('#dbe7ef') },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 sunDir, zenith, mid, horizon;
      varying vec3 vDir;
      void main() {
        float h = max(vDir.y, 0.0);
        vec3 c = mix(horizon, mid, smoothstep(0.0, 0.18, h));
        c = mix(c, zenith, smoothstep(0.18, 0.75, h));
        float s = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
        c += vec3(1.0, 0.93, 0.8) * (pow(s, 600.0) * 4.0 + pow(s, 12.0) * 0.22);
        if (vDir.y < 0.0) c = horizon * 0.95;
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), mat);
  mesh.renderOrder = -2;
  mesh.frustumCulled = false;
  mesh.onBeforeRender = (r, sc, cam) => mesh.position.copy(cam.position);
  return mesh;
}
