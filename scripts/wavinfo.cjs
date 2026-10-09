// Prints format and length of every WAV in the sound library (handles BWF/extra chunks).
const fs = require('fs');
const path = require('path');
function info(file) {
  const b = fs.readFileSync(file);
  let i = 12, fmt = null, dataLen = 0;
  while (i + 8 <= b.length) {
    const id = b.toString('ascii', i, i + 4);
    const len = b.readUInt32LE(i + 4);
    if (id === 'fmt ') fmt = { tag: b.readUInt16LE(i + 8), ch: b.readUInt16LE(i + 10), sr: b.readUInt32LE(i + 12), bits: b.readUInt16LE(i + 22) };
    if (id === 'data') { dataLen = len; break; }
    i += 8 + len + (len % 2);
  }
  return { ...fmt, dur: fmt ? dataLen / (fmt.sr * fmt.ch * fmt.bits / 8) : 0 };
}
const root = process.argv[2];
for (const d of fs.readdirSync(root)) {
  const p = path.join(root, d);
  if (!fs.statSync(p).isDirectory()) continue;
  for (const f of fs.readdirSync(p).filter((f) => f.endsWith('.wav'))) {
    const x = info(path.join(p, f));
    console.log(d.padEnd(24), f.padEnd(10), `${x.ch}ch ${x.sr}Hz ${x.bits}bit fmt${x.tag} ${x.dur.toFixed(2)}s`);
  }
}
