// PBR materials from the CC0 Poly Haven textures, plus small procedural canvas textures.
import * as THREE from 'three';

const loader = new THREE.TextureLoader();
const base = import.meta.env.BASE_URL;
let maxAniso = 8;

export function setAnisotropy(n) {
  maxAniso = n;
}

function tex(name, srgb) {
  const t = loader.load(`${base}textures/${name}`);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = maxAniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function pbr(set, opts = {}) {
  return new THREE.MeshStandardMaterial({
    map: tex(`${set}_diff.jpg`, true),
    normalMap: tex(`${set}_nor.jpg`),
    aoMap: tex(`${set}_arm.jpg`),
    roughnessMap: tex(`${set}_arm.jpg`),
    metalnessMap: tex(`${set}_arm.jpg`),
    roughness: 1,
    metalness: 1,
    normalScale: new THREE.Vector2(1, 1),
    ...opts,
  });
}

// texScale = metres covered by one texture tile
export const SURFACES = {
  sandstone: { set: 'sandstone_blocks_08', scale: 3 },
  plaster: { set: 'old_sandstone_02', scale: 3.2, tint: '#ffd8ae' },
  clay: { set: 'yellow_stone_wall', scale: 2.6 },
  white: { set: 'white_plaster_rough_01', scale: 3, tint: '#efe6d6' },
  concrete: { set: 'concrete_wall_008', scale: 3.5, tint: '#d8cfc2' },
  crate: { set: 'weathered_planks', scale: 1.1, tint: '#c79a68' },
  metal: { set: 'rusty_corrugated_iron', scale: 2.2 },
  door: { set: 'wooden_gate', scale: 2.4 },
  ground: { set: 'sandy_gravel_02', scale: 4 },
  paving: { set: 'red_sandstone_pavement', scale: 3, tint: '#e9d7c0' },
};

const cache = new Map();

/** Shared material for a surface. vc = uses per-vertex colour (dirt gradients, tint variation). */
export function surface(key, vc = false) {
  const ck = vc ? `${key}|vc` : key;
  if (cache.has(ck)) return cache.get(ck);
  let mat;
  if (vc) {
    mat = surface(key).clone();
    mat.vertexColors = true;
  } else if (key === 'cab') {
    mat = new THREE.MeshStandardMaterial({ color: '#8a3b2a', roughness: 0.55, metalness: 0.35 });
  } else if (key === 'wood') {
    mat = new THREE.MeshStandardMaterial({ map: woodGrainTexture('#5a3c26'), roughness: 0.85 });
  } else if (key === 'paint') {
    mat = new THREE.MeshStandardMaterial({ color: '#d8d2c6', roughness: 0.7 });
  } else if (key === 'lampglass') {
    mat = new THREE.MeshStandardMaterial({ color: '#fff1cf', emissive: '#ffc874', emissiveIntensity: 0.5, roughness: 0.25 });
  } else if (key === 'steel') {
    mat = new THREE.MeshStandardMaterial({ color: '#8d9399', roughness: 0.45, metalness: 0.8 });
  } else if (key === 'darksteel') {
    mat = new THREE.MeshStandardMaterial({ color: '#3a3d40', roughness: 0.55, metalness: 0.7 });
  } else {
    const s = SURFACES[key] || SURFACES.concrete;
    mat = pbr(s.set);
    if (s.tint) mat.color = new THREE.Color(s.tint);
  }
  cache.set(ck, mat);
  return mat;
}

// ---------------------------------------------------------------- canvas textures

function canvasTexture(size, draw, { srgb = true, repeat = false } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = maxAniso;
  return t;
}

function seeded(seed) {
  let a = seed;
  return () => {
    a = (a * 16807) % 2147483647;
    return (a - 1) / 2147483646;
  };
}

/** Camouflage cloth for an outfit: base colour with blotches. */
export function camoTexture(outfit, seed = 7) {
  const key = `camo-${outfit.id}`;
  if (cache.has(key)) return cache.get(key);
  const r = seeded(seed * 97 + outfit.id.length * 13);
  const t = canvasTexture(256, (g, s) => {
    g.fillStyle = outfit.shirt;
    g.fillRect(0, 0, s, s);
    const blotch = [outfit.pants, outfit.vest, outfit.accent];
    for (let i = 0; i < 70; i++) {
      g.fillStyle = blotch[i % 3];
      g.globalAlpha = 0.55;
      g.beginPath();
      const x = r() * s;
      const y = r() * s;
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2;
        const rad = 8 + r() * 18;
        g.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad * 0.7);
      }
      g.fill();
    }
    // weave noise
    g.globalAlpha = 0.08;
    for (let i = 0; i < 4000; i++) {
      g.fillStyle = r() < 0.5 ? '#000' : '#fff';
      g.fillRect(r() * s, r() * s, 1, 1);
    }
  }, { repeat: true });
  t.repeat.set(2, 2);
  cache.set(key, t);
  return t;
}

export function stripeTexture(color) {
  return canvasTexture(128, (g, s) => {
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? '#efe6d4' : color;
      g.fillRect((i * s) / 8, 0, s / 8, s);
    }
    g.globalAlpha = 0.12;
    for (let y = 0; y < s; y += 2) {
      g.fillStyle = y % 4 ? '#000' : '#fff';
      g.fillRect(0, y, s, 1);
    }
  }, { repeat: true });
}

export function leafTexture() {
  return canvasTexture(256, (g, s) => {
    g.clearRect(0, 0, s, s);
    // frond: central rib with leaflets
    g.strokeStyle = '#4c5a23';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(s / 2, s);
    g.lineTo(s / 2, 0);
    g.stroke();
    for (let y = 8; y < s - 6; y += 7) {
      const len = (Math.sin((y / s) * Math.PI) * s) / 2.1;
      const grad = g.createLinearGradient(s / 2, y, s / 2 + len, y);
      grad.addColorStop(0, '#556b26');
      grad.addColorStop(1, '#7c8f3a');
      g.strokeStyle = grad;
      g.lineWidth = 3;
      for (const dir of [-1, 1]) {
        g.beginPath();
        g.moveTo(s / 2, y + 3);
        g.quadraticCurveTo(s / 2 + dir * len * 0.5, y - 2, s / 2 + dir * len, y + 10);
        g.stroke();
      }
    }
  });
}

export function puffTexture() {
  return canvasTexture(64, (g, s) => {
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.55)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
  });
}

export function flashTexture() {
  return canvasTexture(128, (g, s) => {
    g.translate(s / 2, s / 2);
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, s / 2);
    grad.addColorStop(0, 'rgba(255,250,220,1)');
    grad.addColorStop(0.25, 'rgba(255,200,90,0.9)');
    grad.addColorStop(0.6, 'rgba(255,120,30,0.25)');
    grad.addColorStop(1, 'rgba(255,90,0,0)');
    g.fillStyle = grad;
    for (let i = 0; i < 6; i++) {
      g.rotate(Math.PI / 3);
      g.beginPath();
      g.moveTo(0, -6);
      g.lineTo(s / 2, 0);
      g.lineTo(0, 6);
      g.fill();
    }
    g.beginPath();
    g.arc(0, 0, s / 5, 0, Math.PI * 2);
    g.fill();
  });
}

export function decalTexture() {
  return canvasTexture(64, (g, s) => {
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grad.addColorStop(0, 'rgba(10,8,6,1)');
    grad.addColorStop(0.25, 'rgba(20,16,12,0.95)');
    grad.addColorStop(0.45, 'rgba(60,50,40,0.5)');
    grad.addColorStop(1, 'rgba(60,50,40,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
  });
}

export function woodGrainTexture(base = '#6b3a1e') {
  const key = `grain-${base}`;
  if (cache.has(key)) return cache.get(key);
  const r = seeded(1234);
  const t = canvasTexture(128, (g, s) => {
    g.fillStyle = base;
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 46; i++) {
      g.strokeStyle = `rgba(${r() < 0.5 ? '20,10,4' : '160,90,40'},${0.12 + r() * 0.2})`;
      g.lineWidth = 1 + r() * 2;
      g.beginPath();
      const y = r() * s;
      g.moveTo(0, y);
      for (let x = 0; x <= s; x += 16) g.lineTo(x, y + Math.sin(x * 0.05 + i) * 3);
      g.stroke();
    }
  }, { repeat: true });
  cache.set(key, t);
  return t;
}

export function barkTexture() {
  const r = seeded(77);
  return canvasTexture(128, (g, s) => {
    g.fillStyle = '#7b6650';
    g.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 8) {
      g.fillStyle = `rgba(40,28,18,${0.35 + r() * 0.3})`;
      g.fillRect(0, y, s, 2 + r() * 2);
      for (let x = 0; x < s; x += 16) {
        g.fillStyle = `rgba(170,150,120,${r() * 0.25})`;
        g.fillRect(x + r() * 8, y + 3, 10, 3);
      }
    }
  }, { repeat: true });
}
