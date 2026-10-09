// Cuts single gunshots out of the CC0 "Free Firearm Sound Library" recordings (assets-src/sfx/lib)
// and writes short 48 kHz stereo 16-bit WAVs to public/sfx, plus a waveform contact sheet for checking.
// Candidates are scored on punch (low-end weight), cleanliness (low background noise) and having no
// second shot inside the clip.
// Usage: node scripts/sfx.mjs
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const LIB = 'assets-src/sfx/lib/Prepared SFX Library';
const OUT = 'public/sfx';
const RATE = 48000;

// weapon -> source folders (first is preferred), clip length (s), takes to keep
const PLAN = [
  { id: 'ak', dirs: ['AK-47'], len: 1.2, keep: 3 },
  { id: 'm4', dirs: ['AR-15'], len: 0.9, keep: 3 },
  { id: 'awp', dirs: ['Mosin Nagant', 'Tikka', 'SKS'], len: 1.9, keep: 3 },
  { id: 'deagle', dirs: ['1911', 'Smith & Wesson 642', 'Walther PPQ'], len: 1.2, keep: 3 },
];

function readWav(file) {
  const b = fs.readFileSync(file);
  let i = 12;
  let fmt = null;
  let data = null;
  while (i + 8 <= b.length) {
    const id = b.toString('ascii', i, i + 4);
    const len = b.readUInt32LE(i + 4);
    if (id === 'fmt ') fmt = { ch: b.readUInt16LE(i + 10), sr: b.readUInt32LE(i + 12), bits: b.readUInt16LE(i + 22) };
    if (id === 'data') {
      data = b.subarray(i + 8, i + 8 + len);
      break;
    }
    i += 8 + len + (len % 2);
  }
  const bytes = fmt.bits / 8;
  const frames = Math.floor(data.length / (bytes * fmt.ch));
  const chans = [new Float32Array(frames), new Float32Array(frames)];
  for (let f = 0; f < frames; f++) {
    for (let c = 0; c < 2; c++) {
      const src = Math.min(c, fmt.ch - 1);
      const o = (f * fmt.ch + src) * bytes;
      let v;
      if (fmt.bits === 24) v = data.readIntLE(o, 3) / 8388608;
      else if (fmt.bits === 16) v = data.readInt16LE(o) / 32768;
      else v = data.readFloatLE(o);
      chans[c][f] = v;
    }
  }
  return { sr: fmt.sr, chans };
}

/** Resample by averaging (fine for an integer ratio like 96k -> 48k). */
function resample(x, from, to) {
  const ratio = from / to;
  const n = Math.floor(x.length / ratio);
  const y = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * ratio);
    const b = Math.max(a + 1, Math.floor((i + 1) * ratio));
    let s = 0;
    for (let k = a; k < b; k++) s += x[k];
    y[i] = s / (b - a);
  }
  return y;
}

/** Onsets: sharp rises in a 1 ms peak envelope, at least 0.12 s apart. */
function onsets(x) {
  const win = Math.round(RATE * 0.001);
  const env = [];
  for (let i = 0; i < x.length; i += win) {
    let m = 0;
    for (let k = i; k < Math.min(x.length, i + win); k++) m = Math.max(m, Math.abs(x[k]));
    env.push(m);
  }
  let peak = 0;
  for (const v of env) peak = Math.max(peak, v);
  const found = [];
  let last = -1e9;
  for (let i = 5; i < env.length; i++) {
    let before = 0;
    for (let k = i - 5; k < i; k++) before = Math.max(before, env[k]);
    if (env[i] > peak * 0.3 && env[i] > before * 4 && i - last > 120) {
      found.push({ at: i * win, level: env[i] / peak });
      last = i;
    }
  }
  return found;
}

/** Share of energy below ~250 Hz in the first 150 ms: how much "thump" the shot has. */
function weight(clip) {
  const n = Math.min(clip.length, Math.round(RATE * 0.15));
  const a = Math.exp((-2 * Math.PI * 250) / RATE);
  let lp = 0;
  let low = 0;
  let all = 0;
  for (let i = 0; i < n; i++) {
    lp = (1 - a) * clip[i] + a * lp;
    low += lp * lp;
    all += clip[i] * clip[i];
  }
  return all > 0 ? low / all : 0;
}

/** RMS of the last 150 ms relative to the blast: background noise / hiss. */
function noise(clip, peak) {
  const n = Math.round(RATE * 0.15);
  let s = 0;
  for (let i = clip.length - n; i < clip.length; i++) s += clip[i] * clip[i];
  return Math.sqrt(s / n) / peak;
}

function writeWav(file, L, R) {
  const n = L.length;
  const b = Buffer.alloc(44 + n * 4);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + n * 4, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(2, 22);
  b.writeUInt32LE(RATE, 24);
  b.writeUInt32LE(RATE * 4, 28);
  b.writeUInt16LE(4, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i])) * 32767), 44 + i * 4);
    b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i])) * 32767), 46 + i * 4);
  }
  fs.writeFileSync(file, b);
}

fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) if (f.endsWith('.wav')) fs.unlinkSync(path.join(OUT, f));
const sheet = [];
for (const w of PLAN) {
  const candidates = [];
  w.dirs.forEach((dir, rank) => {
    const folder = path.join(LIB, dir);
    for (const f of fs.readdirSync(folder).filter((n) => n.endsWith('.wav'))) {
      const { sr, chans } = readWav(path.join(folder, f));
      const L = resample(chans[0], sr, RATE);
      const R = resample(chans[1], sr, RATE);
      const x = L.map((v, i) => (v + R[i]) / 2);
      const list = onsets(x);
      list.forEach((o, k) => {
        const next = list[k + 1] ? list[k + 1].at : x.length;
        // align on the main blast (the loudest sample in the first 80 ms), not a precursor click
        let maxAt = o.at;
        for (let i = o.at; i < Math.min(x.length, o.at + RATE * 0.08); i++) if (Math.abs(x[i]) > Math.abs(x[maxAt])) maxAt = i;
        let st = maxAt;
        const thr = Math.abs(x[maxAt]) * 0.012;
        while (st > maxAt - RATE * 0.01 && Math.abs(x[st]) > thr) st--;
        const start = Math.max(0, st - Math.round(RATE * 0.0015));
        const room = next - start - Math.round(RATE * 0.01);
        const len = Math.min(Math.round(w.len * RATE), room);
        if (len < RATE * 0.45) return; // a second shot follows too soon (full-auto burst)
        const clip = x.slice(start, start + len);
        let peak = 0;
        for (const v of clip) peak = Math.max(peak, Math.abs(v));
        let later = 0;
        for (let i = Math.round(RATE * 0.04); i < clip.length; i++) later = Math.max(later, Math.abs(clip[i]));
        if (later > peak * 0.5) return; // a second shot inside the clip
        const wt = weight(clip);
        const nz = noise(clip, peak);
        const score = (len / (w.len * RATE)) * 1.5 + wt * 4 - nz * 25 - (later / peak) * 0.8 - rank * 0.35;
        candidates.push({ L: L.slice(start, start + len), R: R.slice(start, start + len), mono: clip, score, wt, nz, peak, src: `${dir}/${f}@${(o.at / RATE).toFixed(2)}s` });
      });
    }
  });
  candidates.sort((a, b) => b.score - a.score);
  candidates.slice(0, w.keep).forEach((c, k) => {
    const g = 0.89 / c.peak;
    const n = c.L.length;
    const fadeStart = Math.floor(n * 0.7);
    const fade = (i) => (i < fadeStart ? 1 : Math.cos(((i - fadeStart) / (n - fadeStart)) * Math.PI * 0.5));
    const L = new Float32Array(n);
    const R = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      L[i] = c.L[i] * g * fade(i);
      R[i] = c.R[i] * g * fade(i);
    }
    const name = `${w.id}${k + 1}.wav`;
    writeWav(path.join(OUT, name), L, R);
    sheet.push({ name, out: L.map((v, i) => (v + R[i]) / 2) });
    console.log(`${name.padEnd(12)} ${c.src.padEnd(36)} ${(n / RATE).toFixed(2)}s  thump ${(c.wt * 100).toFixed(0)}%  noise ${(c.nz * 100).toFixed(1)}%`);
  });
  console.log(`  (${candidates.length} clean single shots considered for ${w.id})`);
}

const W = 600;
const H = 80;
const img = Buffer.alloc(W * H * sheet.length * 3, 18);
sheet.forEach((s, row) => {
  const per = s.out.length / W;
  for (let xpx = 0; xpx < W; xpx++) {
    let m = 0;
    for (let i = Math.floor(xpx * per); i < Math.floor((xpx + 1) * per); i++) m = Math.max(m, Math.abs(s.out[i]));
    const h = Math.round(m * (H / 2 - 2));
    for (let y = H / 2 - h; y <= H / 2 + h; y++) {
      const o = ((row * H + y) * W + xpx) * 3;
      img[o] = 255;
      img[o + 1] = 150;
      img[o + 2] = 70;
    }
  }
});
await sharp(img, { raw: { width: W, height: H * sheet.length, channels: 3 } }).png().toFile('assets-src/sfx/waveforms.png');
const total = fs.readdirSync(OUT).reduce((s, f) => s + fs.statSync(path.join(OUT, f)).size, 0);
console.log(`total ${(total / 1024).toFixed(0)} KB`);
