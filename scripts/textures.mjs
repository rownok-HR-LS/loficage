// Compresses the CC0 Poly Haven source textures (assets-src/textures) into public/textures.
// Colour maps stay 1024px; normal and ARM (ao/rough/metal) maps drop to 512px.
import sharp from 'sharp';
import { readdirSync, mkdirSync } from 'node:fs';

const src = 'assets-src/textures';
const out = 'public/textures';
mkdirSync(out, { recursive: true });
for (const f of readdirSync(src)) {
  const size = f.includes('_Diffuse') ? 1024 : 512;
  const name = f.replace('_Diffuse', '_diff').replace('_nor_gl', '_nor').replace('_arm', '_arm');
  await sharp(`${src}/${f}`).resize(size, size).jpeg({ quality: 74, mozjpeg: true }).toFile(`${out}/${name}`);
}
console.log('textures done');
