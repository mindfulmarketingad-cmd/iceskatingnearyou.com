// Download the curated Pexels photos listed in data/lifestyle-photos.json and write
// WebP files the site actually serves:
//   src/assets/img/lifestyle/<id>.webp       1200x675  detail heroes
//   src/assets/img/lifestyle/<id>-card.webp   640x400  cards and thumbs
// The production build does not run this step and does not need a Pexels API key.
// Re-run it after editing the catalog:
//   node scripts/fetch-lifestyle-photos.mjs
//   node scripts/fetch-lifestyle-photos.mjs --force
import sharp from 'sharp';
import { mkdirSync, existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'src/assets/img/lifestyle');
const force = process.argv.includes('--force');
const photos = JSON.parse(readFileSync(path.join(ROOT, 'data/lifestyle-photos.json'), 'utf8'));

mkdirSync(OUT, { recursive: true });

async function download(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'iceskatingnearyou-asset-fetch/1.0', Accept: 'image/jpeg,image/*,*/*', Referer: 'https://www.pexels.com/' },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const type = res.headers.get('content-type') || '';
  const buf = Buffer.from(await res.arrayBuffer());
  if (!type.startsWith('image/') || buf.length < 8000) throw new Error(`not an image (${type}, ${buf.length} bytes) ${url}`);
  return buf;
}

async function writeSized(buf, dest, width, height, quality) {
  const encode = async (q, position) => sharp(buf).rotate().resize(width, height, { fit: 'cover', position }).webp({ quality: q, effort: 5 }).toFile(dest);
  try {
    await encode(quality, 'attention');
  } catch {
    await encode(quality, 'centre');
  }
  // Noisy scenes (trees, night lights) can blow past a sensible hero size.
  if (!dest.endsWith('-card.webp')) {
    let q = quality;
    while (statSync(dest).size > 90000 && q > 40) {
      q -= 8;
      try { await encode(q, 'attention'); } catch { await encode(q, 'centre'); }
    }
  }
}

let made = 0;
let skipped = 0;
for (const photo of photos) {
  const hero = path.join(OUT, photo.file);
  const card = path.join(OUT, photo.cardFile);
  if (!force && existsSync(hero) && existsSync(card)) { skipped++; continue; }
  const buf = await download(photo.downloadUrl);
  await writeSized(buf, hero, 1200, 675, 66);
  await writeSized(buf, card, 640, 400, 64);
  made++;
  console.log('wrote', photo.file, photo.cardFile);
}
console.log(`Lifestyle photos: ${made} written, ${skipped} already present, ${photos.length} in the catalog.`);
