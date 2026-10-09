// Tracers, muzzle flashes, impact particles and bullet-hole decals (all pooled).
import * as THREE from 'three';
import { puffTexture, flashTexture, decalTexture } from './materials.js';

const MAX_DECALS = 96;
const MAX_PUFFS = 160;
const MAX_TRACERS = 32;

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.time = 0;

    // muzzle light (always in the scene so shaders never recompile)
    this.light = new THREE.PointLight('#ffb15e', 0, 9, 2);
    scene.add(this.light);
    this.lightUntil = 0;

    // particles
    const puffMat = new THREE.SpriteMaterial({ map: puffTexture(), transparent: true, depthWrite: false, fog: true });
    this.puffs = [];
    for (let i = 0; i < MAX_PUFFS; i++) {
      const s = new THREE.Sprite(puffMat.clone());
      s.visible = false;
      scene.add(s);
      this.puffs.push({ s, life: 0, max: 1, vel: new THREE.Vector3(), grow: 1, grav: 0 });
    }
    this.puffIdx = 0;

    // flashes for other players' guns
    const flashMat = new THREE.SpriteMaterial({ map: flashTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    this.flashes = [];
    for (let i = 0; i < 12; i++) {
      const s = new THREE.Sprite(flashMat.clone());
      s.visible = false;
      scene.add(s);
      this.flashes.push({ s, until: 0 });
    }
    this.flashIdx = 0;

    // tracers
    const tracerGeo = new THREE.CylinderGeometry(0.006, 0.006, 1, 4, 1, true);
    tracerGeo.translate(0, 0.5, 0);
    tracerGeo.rotateX(Math.PI / 2);
    this.tracers = [];
    for (let i = 0; i < MAX_TRACERS; i++) {
      const m = new THREE.Mesh(
        tracerGeo,
        new THREE.MeshBasicMaterial({ color: '#ffd9a0', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      m.visible = false;
      m.frustumCulled = false;
      scene.add(m);
      this.tracers.push({ m, life: 0, max: 0.07 });
    }
    this.tracerIdx = 0;

    // decals
    const decalGeo = new THREE.PlaneGeometry(0.09, 0.09);
    const decalMat = new THREE.MeshBasicMaterial({
      map: decalTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6,
    });
    this.decals = new THREE.InstancedMesh(decalGeo, decalMat, MAX_DECALS);
    this.decals.count = 0;
    this.decals.frustumCulled = false;
    this.decals.renderOrder = 2;
    scene.add(this.decals);
    this.decalIdx = 0;
    this._dummy = new THREE.Object3D();
  }

  muzzleLight(pos, strength = 1) {
    this.light.position.copy(pos);
    this.light.intensity = 14 * strength;
    this.lightUntil = this.time + 0.05;
  }

  remoteFlash(pos, scale = 1) {
    const f = this.flashes[this.flashIdx++ % this.flashes.length];
    f.s.position.copy(pos);
    f.s.scale.setScalar(0.45 * scale * (0.8 + Math.random() * 0.4));
    f.s.material.rotation = Math.random() * Math.PI;
    f.s.visible = true;
    f.until = this.time + 0.045;
  }

  tracer(from, to) {
    const len = from.distanceTo(to);
    if (len < 2) return;
    const t = this.tracers[this.tracerIdx++ % this.tracers.length];
    // draw only the front part of the path for a streak effect
    t.m.position.copy(from);
    t.m.lookAt(to);
    t.m.scale.set(1, 1, len);
    t.m.visible = true;
    t.life = 0;
    t.max = Math.min(0.09, 0.03 + len / 2500);
    t.m.material.opacity = 0.9;
  }

  puff(pos, { color = '#cbb79a', count = 6, size = 0.25, speed = 1.2, life = 0.7, normal = null, grav = 0.4, grow = 2 } = {}) {
    for (let i = 0; i < count; i++) {
      const p = this.puffs[this.puffIdx++ % this.puffs.length];
      p.s.visible = true;
      p.s.position.copy(pos);
      p.s.material.color.set(color);
      p.s.material.opacity = 0.75;
      p.s.material.rotation = Math.random() * Math.PI * 2;
      p.size = size * (0.6 + Math.random() * 0.8);
      p.s.scale.setScalar(p.size);
      p.vel.set(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).multiplyScalar(speed);
      if (normal) p.vel.addScaledVector(normal, speed * (0.6 + Math.random()));
      p.life = 0;
      p.max = life * (0.7 + Math.random() * 0.6);
      p.grav = grav;
      p.grow = grow;
    }
  }

  impact(pos, normal, kind) {
    const n = new THREE.Vector3().fromArray(normal);
    const at = pos.clone().addScaledVector(n, 0.02);
    if (kind === 'metal') {
      this.puff(at, { color: '#ffcf7a', count: 5, size: 0.05, speed: 4, life: 0.18, normal: n, grav: 6, grow: 0.2 });
      this.puff(at, { color: '#8a8580', count: 2, size: 0.18, speed: 0.6, life: 0.5, normal: n });
    } else if (kind === 'wood') {
      this.puff(at, { color: '#7a5532', count: 5, size: 0.06, speed: 2.5, life: 0.4, normal: n, grav: 7, grow: 0.3 });
      this.puff(at, { color: '#b79a78', count: 3, size: 0.2, speed: 0.6, life: 0.6, normal: n });
    } else {
      this.puff(at, { color: '#d2bd9c', count: 6, size: 0.24, speed: 0.9, life: 0.8, normal: n });
      this.puff(at, { color: '#8f7a5e', count: 4, size: 0.04, speed: 3, life: 0.35, normal: n, grav: 8, grow: 0.2 });
    }
    // bullet hole
    const d = this._dummy;
    d.position.copy(pos).addScaledVector(n, 0.004);
    d.lookAt(d.position.clone().add(n));
    d.rotateZ(Math.random() * Math.PI);
    d.scale.setScalar(0.8 + Math.random() * 0.5);
    d.updateMatrix();
    this.decals.setMatrixAt(this.decalIdx % MAX_DECALS, d.matrix);
    this.decalIdx++;
    this.decals.count = Math.min(MAX_DECALS, this.decalIdx);
    this.decals.instanceMatrix.needsUpdate = true;
  }

  blood(pos, dir, headshot) {
    const n = new THREE.Vector3().fromArray(dir);
    this.puff(pos, { color: '#7a0d08', count: headshot ? 9 : 5, size: headshot ? 0.32 : 0.22, speed: 1.2, life: 0.45, normal: n, grav: 2, grow: 1.6 });
    this.puff(pos, { color: '#4a0604', count: 4, size: 0.04, speed: 3, life: 0.35, normal: n, grav: 9, grow: 0.2 });
  }

  clearDecals() {
    this.decals.count = 0;
    this.decalIdx = 0;
  }

  update(dt) {
    this.time += dt;
    if (this.time > this.lightUntil) this.light.intensity = 0;
    for (const f of this.flashes) if (f.s.visible && this.time > f.until) f.s.visible = false;
    for (const t of this.tracers) {
      if (!t.m.visible) continue;
      t.life += dt;
      t.m.material.opacity = Math.max(0, 0.9 * (1 - t.life / t.max));
      if (t.life >= t.max) t.m.visible = false;
    }
    for (const p of this.puffs) {
      if (!p.s.visible) continue;
      p.life += dt;
      const k = p.life / p.max;
      if (k >= 1) {
        p.s.visible = false;
        continue;
      }
      p.vel.y -= p.grav * dt;
      p.vel.multiplyScalar(Math.max(0, 1 - dt * 2.2));
      p.s.position.addScaledVector(p.vel, dt);
      p.s.scale.setScalar(p.size * (1 + k * p.grow));
      p.s.material.opacity = 0.75 * (1 - k) * (1 - k);
    }
  }
}
