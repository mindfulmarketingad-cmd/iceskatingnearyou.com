/**
 * Renders the favicon, app icons and social share image from the SVG logo
 * mark (src/assets/img/logo-mark.svg) using headless Chromium. Run once after
 * changing the logo; the PNG/ICO output is committed.
 *
 *   npm i --no-save playwright-core
 *   CHROMIUM_PATH=/path/to/chrome npm run icons
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const IMG = resolve(ROOT, 'src/assets/img');
const { chromium } = await import('playwright-core');
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const mark = readFileSync(resolve(IMG, 'logo-mark.svg'), 'utf8');

async function render(html, width, height, out) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.setContent(html, { waitUntil: 'load' });
  await page.waitForTimeout(300);
  const jpeg = out && out.endsWith('.jpg');
  const buf = await page.screenshot(jpeg ? { type: 'jpeg', quality: 82 } : { type: 'png', omitBackground: true });
  if (out) writeFileSync(resolve(IMG, out), buf);
  await page.close();
  return buf;
}

const iconHtml = (size, pad = 0) =>
  `<html><body style="margin:0;background:transparent"><div style="width:${size}px;height:${size}px;padding:${pad}px;box-sizing:border-box">${mark.replace('<svg ', `<svg width="${size - pad * 2}" height="${size - pad * 2}" `)}</div></body></html>`;

const pngs = {};
for (const size of [16, 32, 48]) pngs[size] = await render(iconHtml(size), size, size);
await render(iconHtml(180, 10).replace('background:transparent', 'background:#ffffff'), 180, 180, 'apple-touch-icon.png');
await render(iconHtml(192), 192, 192, 'icon-192.png');
await render(iconHtml(512), 512, 512, 'icon-512.png');

/* ICO container holding PNG images (supported by every current browser). */
const sizes = [16, 32, 48];
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((s, i) => {
  const e = 6 + i * 16;
  header.writeUInt8(s, e);
  header.writeUInt8(s, e + 1);
  header.writeUInt16LE(1, e + 4);
  header.writeUInt16LE(32, e + 6);
  header.writeUInt32LE(pngs[s].length, e + 8);
  header.writeUInt32LE(offset, e + 12);
  offset += pngs[s].length;
});
writeFileSync(resolve(IMG, 'favicon.ico'), Buffer.concat([header, ...sizes.map((s) => pngs[s])]));

/* 1200x630 share image: the hero photo, darkened, with the logo lockup. */
const photo = readFileSync(resolve(IMG, 'hero-poster.jpg')).toString('base64');
await render(
  `<html><head><link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@600;700&display=block" rel="stylesheet"></head>
  <body style="margin:0;width:1200px;height:630px;font-family:Fredoka,Arial,sans-serif;background:#0b3a75 url(data:image/jpeg;base64,${photo}) center/cover">
  <div style="position:absolute;inset:0;background:linear-gradient(100deg,rgba(6,30,64,.92) 0%,rgba(6,30,64,.65) 55%,rgba(6,30,64,.2) 100%)"></div>
  <div style="position:absolute;left:80px;top:150px;color:#fff">
    <div style="display:flex;align-items:center;gap:22px">${mark.replace('<svg ', '<svg width="110" height="110" ')}
      <div style="font-size:40px;font-weight:600;line-height:1.05">Ice Skating<br><span style="color:#9ccfff">Near You</span></div></div>
    <div style="font-size:84px;font-weight:700;margin-top:40px;letter-spacing:-1px">Ice Skating Near Me</div>
    <div style="font-size:32px;color:#d6e9ff;margin-top:8px;font-weight:600">Public ice rinks in every state, ranked honestly</div>
  </div></body></html>`,
  1200,
  630,
  'og-image.jpg'
);

await browser.close();
console.log('Wrote favicon.ico, apple-touch-icon.png, icon-192.png, icon-512.png and og-image.jpg to src/assets/img/');
