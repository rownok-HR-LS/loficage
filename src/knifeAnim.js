// Keyframed first-person knife animation (draw, two alternating slashes, stab, inspect) plus a blade trail.
// Poses are offsets of the viewmodel holder: p = position (m), r = rotation (rad, XYZ).
import * as THREE from 'three';

const IDLE = { p: [0, 0, 0], r: [0, 0, 0] };

const EASE = {
  linear: (s) => s,
  in: (s) => s * s * s, // accelerate into the strike
  out: (s) => 1 - Math.pow(1 - s, 3), // decelerate (wind-up, follow-through)
  inout: (s) => s * s * (3 - 2 * s),
  back: (s) => 1 + 2.2 * Math.pow(s - 1, 3) + 1.2 * Math.pow(s - 1, 2),
};

const key = (t, p, r, ease = 'inout') => ({ t, p, r, ease });

export const KNIFE_ANIMS = {
  // forehand: cock up to the right, whip down-left across the screen
  slashA: {
    dur: 0.46,
    strike: [0.14, 0.42],
    roll: 0.03,
    keys: [
      key(0, IDLE.p, IDLE.r),
      key(0.14, [0.06, 0.07, 0.05], [0.4, -0.5, 0.7], 'out'),
      key(0.34, [-0.17, -0.025, -0.07], [-0.25, 0.9, -0.85], 'in'),
      key(0.56, [-0.19, -0.05, -0.03], [-0.32, 0.98, -0.98], 'out'),
      key(1, IDLE.p, IDLE.r, 'inout'),
    ],
  },
  // backhand: cock to the left, sweep back across to the right
  slashB: {
    dur: 0.46,
    strike: [0.16, 0.42],
    roll: -0.03,
    keys: [
      key(0, IDLE.p, IDLE.r),
      key(0.16, [-0.13, 0.06, 0.02], [0.35, 0.75, -1.0], 'out'),
      key(0.36, [0.06, -0.025, -0.08], [-0.22, -0.6, 0.5], 'in'),
      key(0.58, [0.08, -0.05, -0.03], [-0.3, -0.68, 0.6], 'out'),
      key(1, IDLE.p, IDLE.r, 'inout'),
    ],
  },
  // stab: draw back, drive forward to the crosshair, hold, recover
  stab: {
    dur: 0.72,
    strike: [0.3, 0.52],
    roll: 0,
    keys: [
      key(0, IDLE.p, IDLE.r),
      key(0.3, [0.03, 0.03, 0.11], [0.45, 0.12, 0.25], 'out'),
      key(0.44, [-0.1, 0.045, -0.25], [-0.2, 0.42, -0.1], 'in'),
      key(0.6, [-0.1, 0.04, -0.23], [-0.18, 0.4, -0.1], 'out'),
      key(1, IDLE.p, IDLE.r, 'inout'),
    ],
  },
  // draw: the knife flips up into the hand
  draw: {
    dur: 0.5,
    strike: null,
    roll: 0,
    keys: [
      key(0, [0.06, -0.24, 0.06], [1.1, -0.5, 2.9]),
      key(0.72, [0, 0.012, 0], [-0.08, 0, -0.12], 'out'),
      key(1, IDLE.p, IDLE.r, 'inout'),
    ],
  },
  // inspect: turn the blade to look at one side, flip it, look at the other
  inspect: {
    dur: 2.8,
    strike: null,
    roll: 0,
    keys: [
      key(0, IDLE.p, IDLE.r),
      key(0.16, [-0.11, 0.06, -0.02], [0.2, 0.8, 1.15], 'inout'),
      key(0.44, [-0.11, 0.065, -0.025], [0.25, 0.9, 1.25], 'linear'),
      key(0.6, [-0.09, 0.07, -0.03], [0.15, 0.55, -0.95], 'inout'),
      key(0.86, [-0.09, 0.065, -0.03], [0.1, 0.5, -1.05], 'linear'),
      key(1, IDLE.p, IDLE.r, 'inout'),
    ],
  },
};

/** Pose of an animation at progress u (0..1). */
export function samplePose(anim, u) {
  const k = anim.keys;
  let i = 0;
  while (i < k.length - 2 && u > k[i + 1].t) i++;
  const a = k[i];
  const b = k[i + 1];
  const s = Math.min(1, Math.max(0, (u - a.t) / Math.max(1e-6, b.t - a.t)));
  const e = EASE[b.ease](s);
  const lerp = (x, y) => x + (y - x) * e;
  return {
    p: [lerp(a.p[0], b.p[0]), lerp(a.p[1], b.p[1]), lerp(a.p[2], b.p[2])],
    r: [lerp(a.r[0], b.r[0]), lerp(a.r[1], b.r[1]), lerp(a.r[2], b.r[2])],
  };
}

/** Fading ribbon that follows the blade edge during a strike. */
export class BladeTrail {
  constructor(scene, segments = 14) {
    this.n = segments;
    this.hist = [];
    const pos = new Float32Array(this.n * 2 * 3);
    const col = new Float32Array(this.n * 2 * 3);
    const idx = [];
    for (let i = 0; i < this.n - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(
      g,
      new THREE.MeshBasicMaterial({
        vertexColors: true, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    scene.add(this.mesh);
    this._a = new THREE.Vector3();
    this._b = new THREE.Vector3();
  }

  /** active: record the blade this frame; otherwise let the trail shrink away. */
  update(tip, base, active) {
    if (active && tip && base) {
      tip.getWorldPosition(this._a);
      base.getWorldPosition(this._b);
      this.hist.unshift([this._a.toArray(), this._b.toArray()]);
      if (this.hist.length > this.n) this.hist.pop();
    } else if (this.hist.length) {
      this.hist.pop();
      if (this.hist.length) this.hist.pop();
    }
    const pos = this.mesh.geometry.attributes.position;
    const col = this.mesh.geometry.attributes.color;
    const len = this.hist.length;
    this.mesh.visible = len > 1;
    if (len < 2) return;
    for (let i = 0; i < this.n; i++) {
      const [t, b] = this.hist[Math.min(i, len - 1)];
      pos.setXYZ(i * 2, t[0], t[1], t[2]);
      pos.setXYZ(i * 2 + 1, b[0], b[1], b[2]);
      const f = i < len ? Math.pow(1 - i / len, 1.6) : 0;
      col.setXYZ(i * 2, f, f * 0.96, f * 0.9);
      col.setXYZ(i * 2 + 1, f * 0.15, f * 0.15, f * 0.15);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
  }

  clear() {
    this.hist = [];
    this.mesh.visible = false;
  }
}
