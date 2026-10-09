// All sounds are synthesised with Web Audio — no recorded samples.
let ctx = null;
let master = null;
let reverb = null;
let noise = null;
let volume = 0.7;

export function initAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain();
  master.gain.value = volume;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  master.connect(comp).connect(ctx.destination);

  // white noise buffer
  noise = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

  // outdoor slap-back reverb
  const len = ctx.sampleRate * 1.6;
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / ctx.sampleRate;
      const echo = t > 0.09 && t < 0.13 ? 2.2 : 1;
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2) * echo * 0.5;
    }
  }
  reverb = ctx.createConvolver();
  reverb.buffer = ir;
  const rvGain = ctx.createGain();
  rvGain.gain.value = 0.35;
  reverb.connect(rvGain).connect(master);
}

export function setVolume(v) {
  volume = v;
  if (master) master.gain.value = v;
}

export function setListener(pos, forward, up) {
  if (!ctx) return;
  const l = ctx.listener;
  const t = ctx.currentTime;
  if (l.positionX) {
    l.positionX.setValueAtTime(pos.x, t);
    l.positionY.setValueAtTime(pos.y, t);
    l.positionZ.setValueAtTime(pos.z, t);
    l.forwardX.setValueAtTime(forward.x, t);
    l.forwardY.setValueAtTime(forward.y, t);
    l.forwardZ.setValueAtTime(forward.z, t);
    l.upX.setValueAtTime(up.x, t);
    l.upY.setValueAtTime(up.y, t);
    l.upZ.setValueAtTime(up.z, t);
  } else {
    l.setPosition(pos.x, pos.y, pos.z);
    l.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
  }
}

/** Output node: direct for our own sounds, a 3D panner (+ distance muffling) for others. */
function output(pos, gain = 1, dist = 0, rev = 0) {
  const g = ctx.createGain();
  g.gain.value = gain;
  if (pos) {
    const p = ctx.createPanner();
    p.panningModel = dist < 25 ? 'HRTF' : 'equalpower'; // HRTF is costly; far sounds don't need it
    p.distanceModel = 'inverse';
    p.refDistance = 4;
    p.rolloffFactor = 1.1;
    p.maxDistance = 250;
    p.positionX.value = pos.x;
    p.positionY.value = pos.y;
    p.positionZ.value = pos.z;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = Math.max(1200, 18000 - dist * 260);
    g.connect(lp).connect(p).connect(master);
  } else {
    g.connect(master);
  }
  if (rev > 0) {
    const r = ctx.createGain();
    r.gain.value = rev;
    g.connect(r).connect(reverb);
  }
  return g;
}

function burst(out, t, { type = 'bandpass', freq = 1500, q = 0.7, attack = 0.001, decay = 0.1, gain = 1, endFreq }) {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (endFreq) f.frequency.exponentialRampToValueAtTime(endFreq, t + decay);
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0008, t + attack + decay);
  src.connect(f).connect(g).connect(out);
  src.start(t, Math.random() * 0.5);
  src.stop(t + attack + decay + 0.05);
}

function tone(out, t, { freq = 120, endFreq = 40, decay = 0.15, gain = 1, type = 'sine', attack = 0.002 }) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t + decay);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0008, t + attack + decay);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + attack + decay + 0.05);
}

const GUNS = {
  ak: (o, t) => {
    burst(o, t, { type: 'highpass', freq: 4200, decay: 0.035, gain: 0.9 });
    burst(o, t, { freq: 1500, q: 0.6, decay: 0.13, gain: 1.1, endFreq: 500 });
    tone(o, t, { freq: 140, endFreq: 45, decay: 0.16, gain: 1.0 });
  },
  m4: (o, t) => {
    burst(o, t, { type: 'lowpass', freq: 2600, decay: 0.05, gain: 0.55, endFreq: 700 });
    burst(o, t, { type: 'highpass', freq: 6000, decay: 0.015, gain: 0.25 });
    tone(o, t, { freq: 180, endFreq: 70, decay: 0.06, gain: 0.35 });
  },
  awp: (o, t) => {
    burst(o, t, { type: 'highpass', freq: 3500, decay: 0.05, gain: 1.1 });
    burst(o, t, { freq: 900, q: 0.5, decay: 0.38, gain: 1.3, endFreq: 200 });
    tone(o, t, { freq: 95, endFreq: 30, decay: 0.42, gain: 1.3 });
  },
  deagle: (o, t) => {
    burst(o, t, { type: 'highpass', freq: 3800, decay: 0.04, gain: 1.0 });
    burst(o, t, { freq: 1200, q: 0.6, decay: 0.2, gain: 1.2, endFreq: 350 });
    tone(o, t, { freq: 120, endFreq: 38, decay: 0.22, gain: 1.15 });
  },
};

/** pos null = our own gun. dist in metres for distance muffling. */
export function playShot(sound, pos = null, dist = 0) {
  if (!ctx) return;
  const quiet = sound === 'm4';
  const out = output(pos, pos ? 1.4 : 0.55, dist, quiet ? 0.15 : 0.6);
  GUNS[sound]?.(out, ctx.currentTime);
}

/** Knife swing; hit 0 = air, 1 = flesh, 2 = wall. */
export function playKnife(hit, pos = null, dist = 0) {
  if (!ctx) return;
  const out = output(pos, pos ? 0.9 : 0.5, dist);
  const t = ctx.currentTime;
  burst(out, t, { type: 'bandpass', freq: 900, endFreq: 3200, q: 1.4, attack: 0.03, decay: 0.16, gain: 0.7 });
  if (hit === 1) {
    burst(out, t + 0.06, { type: 'lowpass', freq: 700, decay: 0.12, gain: 1 });
    tone(out, t + 0.06, { freq: 140, endFreq: 60, decay: 0.12, gain: 0.6 });
  } else if (hit === 2) {
    tone(out, t + 0.05, { freq: 3100, endFreq: 2900, decay: 0.18, gain: 0.25, type: 'triangle' });
    burst(out, t + 0.05, { type: 'highpass', freq: 4000, decay: 0.03, gain: 0.5 });
  }
}

export function playFootstep(pos = null, dist = 0, loud = 1) {
  if (!ctx) return;
  const out = output(pos, (pos ? 0.9 : 0.22) * loud, dist);
  const t = ctx.currentTime;
  burst(out, t, { freq: 900 + Math.random() * 900, q: 1.2, decay: 0.05, gain: 0.8 });
  burst(out, t + 0.03, { type: 'highpass', freq: 3000, decay: 0.035, gain: 0.35 });
}

export function playLand(pos = null) {
  if (!ctx) return;
  const out = output(pos, pos ? 0.8 : 0.3);
  const t = ctx.currentTime;
  tone(out, t, { freq: 90, endFreq: 40, decay: 0.12, gain: 0.8 });
  burst(out, t, { freq: 700, q: 0.8, decay: 0.08, gain: 0.6 });
}

function click(out, t, freq = 2500, gain = 0.5, decay = 0.025) {
  burst(out, t, { freq, q: 3, decay, gain });
  tone(out, t, { freq: freq * 0.4, endFreq: freq * 0.2, decay: decay * 1.5, gain: gain * 0.4, type: 'square' });
}

/** Reload foley timed to the reload length. */
export function playReload(duration, sniper) {
  if (!ctx) return;
  const out = output(null, 0.5);
  const t = ctx.currentTime;
  click(out, t + duration * 0.15, 1800, 0.5);
  click(out, t + duration * 0.55, 1400, 0.7, 0.04);
  click(out, t + duration * 0.62, 2600, 0.4);
  if (sniper) {
    click(out, t + duration * 0.82, 1100, 0.6, 0.05);
    click(out, t + duration * 0.9, 1900, 0.5, 0.04);
  } else {
    click(out, t + duration * 0.86, 3000, 0.5, 0.03);
  }
}

export function playBolt() {
  if (!ctx) return;
  const out = output(null, 0.45);
  const t = ctx.currentTime;
  click(out, t + 0.25, 1200, 0.6, 0.05);
  click(out, t + 0.5, 1900, 0.5, 0.04);
}

export function playDry() {
  if (!ctx) return;
  click(output(null, 0.5), ctx.currentTime, 3200, 0.6, 0.02);
}

export function playDraw() {
  if (!ctx) return;
  const out = output(null, 0.35);
  const t = ctx.currentTime;
  burst(out, t, { freq: 2200, q: 1, decay: 0.08, gain: 0.4, endFreq: 1200 });
  click(out, t + 0.12, 2400, 0.4);
}

export function playZoom() {
  if (!ctx) return;
  click(output(null, 0.3), ctx.currentTime, 4200, 0.4, 0.015);
}

export function playHit(headshot, kill) {
  if (!ctx) return;
  const out = output(null, 0.5);
  const t = ctx.currentTime;
  if (headshot) {
    tone(out, t, { freq: 3300, endFreq: 3100, decay: 0.28, gain: 0.35, type: 'sine' });
    tone(out, t, { freq: 4950, endFreq: 4800, decay: 0.2, gain: 0.18, type: 'sine' });
    burst(out, t, { type: 'highpass', freq: 5000, decay: 0.02, gain: 0.4 });
  } else {
    burst(out, t, { type: 'lowpass', freq: 600, decay: 0.06, gain: 0.7 });
    tone(out, t, { freq: 1700, endFreq: 1500, decay: 0.03, gain: 0.12, type: 'triangle' });
  }
  if (kill) {
    tone(out, t + 0.06, { freq: 880, endFreq: 880, decay: 0.16, gain: 0.18, type: 'triangle' });
    tone(out, t + 0.13, { freq: 1320, endFreq: 1320, decay: 0.22, gain: 0.16, type: 'triangle' });
  }
}

export function playHurt(headshot) {
  if (!ctx) return;
  const out = output(null, 0.8);
  const t = ctx.currentTime;
  tone(out, t, { freq: 110, endFreq: 50, decay: 0.18, gain: 0.9 });
  burst(out, t, { type: 'lowpass', freq: 500, decay: 0.12, gain: 0.8 });
  if (headshot) tone(out, t, { freq: 2600, endFreq: 2400, decay: 0.3, gain: 0.2 });
}

export function playImpact(pos, dist, kind) {
  if (!ctx || dist > 40) return;
  const out = output(pos, 0.35, dist);
  const t = ctx.currentTime;
  if (kind === 'metal') {
    tone(out, t, { freq: 2200 + Math.random() * 800, endFreq: 1800, decay: 0.12, gain: 0.25, type: 'triangle' });
  }
  burst(out, t, { freq: kind === 'wood' ? 900 : 2400, q: 1, decay: 0.05, gain: 0.5 });
}

export function playUi(kind) {
  if (!ctx) return;
  const out = output(null, 0.4);
  const t = ctx.currentTime;
  if (kind === 'start') {
    tone(out, t, { freq: 660, endFreq: 660, decay: 0.12, gain: 0.25, type: 'triangle' });
    tone(out, t + 0.14, { freq: 990, endFreq: 990, decay: 0.25, gain: 0.25, type: 'triangle' });
  } else if (kind === 'end') {
    tone(out, t, { freq: 990, endFreq: 990, decay: 0.2, gain: 0.25, type: 'triangle' });
    tone(out, t + 0.2, { freq: 740, endFreq: 740, decay: 0.2, gain: 0.25, type: 'triangle' });
    tone(out, t + 0.4, { freq: 495, endFreq: 495, decay: 0.5, gain: 0.25, type: 'triangle' });
  } else if (kind === 'chat') {
    tone(out, t, { freq: 1400, endFreq: 1400, decay: 0.06, gain: 0.12, type: 'sine' });
  }
}
