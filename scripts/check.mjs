/**
 * Verifies the built site in dist/. Run after a build:
 *
 *   npm run check        (or `npm test` to build and check)
 *
 * Fails (exit 1) on:
 * - an internal link, image, script or stylesheet that does not resolve to a
 *   file in dist/, or an in-page #anchor with no matching id
 * - a target="_blank" link without rel="noopener"
 * - an indexable page without exactly one <h1>, a canonical tag pointing at
 *   itself, a <title> of 60 characters or less, or a meta description of
 *   150-160 characters
 * - JSON-LD that does not parse
 * - emoji anywhere in the HTML
 * - a sitemap.xml URL that does not exist or is marked noindex
 * - ads.txt not matching the required line exactly
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const SITE_URL = 'https://iceskatingnearyou.com';
const ADS_TXT = 'google.com, pub-9332749804326149, DIRECT, f08c47fec0942fa0';
const EMOJI = /\p{Extended_Pictographic}/u;

if (!existsSync(DIST)) {
  console.error('dist/ not found. Run `npm run build` first.');
  process.exit(1);
}

const files = [];
(function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else files.push(p);
  }
})(DIST);

const htmlFiles = files.filter((f) => f.endsWith('.html'));
const errors = [];
const warn = (file, msg) => errors.push(`${relative(DIST, file) || 'index.html'}: ${msg}`);

const urlPathFor = (file) => {
  const rel = '/' + relative(DIST, file).replace(/\\/g, '/');
  return rel.endsWith('/index.html') ? rel.slice(0, -'index.html'.length) : rel;
};

function resolves(target) {
  const clean = decodeURIComponent(target.split('#')[0].split('?')[0]);
  if (!clean) return true;
  const p = join(DIST, clean);
  if (existsSync(p) && statSync(p).isFile()) return true;
  return existsSync(join(p, 'index.html'));
}

const idsByFile = new Map();
const getIds = (file, html) => {
  if (!idsByFile.has(file)) idsByFile.set(file, new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])));
  return idsByFile.get(file);
};

const noindexPaths = new Set();
let linkCount = 0;

for (const file of htmlFiles) {
  const html = readFileSync(file, 'utf8');
  const path = urlPathFor(file);
  const isRedirectStub = /http-equiv="refresh"/.test(html);
  const noindex = /<meta name="robots" content="noindex/.test(html);
  if (noindex) noindexPaths.add(path);

  // Strip inline scripts/JSON so code is not read as markup.
  const markup = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '');

  for (const m of markup.matchAll(/\s(href|src)="([^"]*)"/g)) {
    const url = m[2].replace(/&amp;/g, '&');
    if (url.startsWith('/') && !url.startsWith('//')) {
      linkCount++;
      if (!resolves(url)) warn(file, `broken internal ${m[1]}: ${url}`);
      const hash = url.split('#')[1];
      if (hash) {
        const targetFile = url.split('#')[0] ? null : file;
        if (targetFile && !getIds(file, html).has(hash)) warn(file, `missing anchor: ${url}`);
      }
    } else if (url.startsWith('#') && url.length > 1) {
      linkCount++;
      if (!getIds(file, html).has(url.slice(1))) warn(file, `missing anchor: ${url}`);
    }
  }

  for (const m of markup.matchAll(/<a\b[^>]*>/g)) {
    const tag = m[0];
    if (/target="_blank"/.test(tag) && !/rel="[^"]*noopener/.test(tag)) warn(file, `target=_blank without noopener: ${tag.slice(0, 120)}`);
    const href = (tag.match(/href="([^"]*)"/) || [])[1] || '';
    if (/^https?:\/\//.test(href) && !href.startsWith(SITE_URL) && !/rel="/.test(tag)) warn(file, `external link without rel: ${href}`);
  }

  if (EMOJI.test(html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, ''))) warn(file, 'contains emoji');

  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      JSON.parse(m[1]);
    } catch {
      warn(file, 'JSON-LD does not parse');
    }
  }

  if (isRedirectStub) continue;

  const h1s = (markup.match(/<h1[\s>]/g) || []).length;
  if (h1s !== 1) warn(file, `${h1s} <h1> elements`);
  if (noindex) continue;

  const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
  const titleText = title.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
  if (!titleText || titleText.length > 60) warn(file, `title is ${titleText.length} chars: ${titleText}`);
  const desc = ((html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '')
    .replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
  if (desc.length < 150 || desc.length > 160) warn(file, `description is ${desc.length} chars: ${desc}`);
  const canonical = (html.match(/<link rel="canonical" href="([^"]*)"/) || [])[1];
  if (canonical !== SITE_URL + path) warn(file, `canonical ${canonical} != ${SITE_URL + path}`);
}

/* sitemap.xml */
const sitemap = readFileSync(join(DIST, 'sitemap.xml'), 'utf8');
const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
for (const url of sitemapUrls) {
  const path = url.replace(SITE_URL, '');
  if (!resolves(path)) errors.push(`sitemap.xml: ${url} does not exist`);
  if (noindexPaths.has(path)) errors.push(`sitemap.xml: ${url} is noindex`);
}
if (new Set(sitemapUrls).size !== sitemapUrls.length) errors.push('sitemap.xml: duplicate URLs');

/* root files */
const ads = readFileSync(join(DIST, 'ads.txt'), 'utf8').trim();
if (ads !== ADS_TXT) errors.push(`ads.txt is "${ads}"`);
if (!/Sitemap: https:\/\/iceskatingnearyou\.com\/sitemap\.xml/.test(readFileSync(join(DIST, 'robots.txt'), 'utf8'))) errors.push('robots.txt has no sitemap line');

console.log(`Checked ${htmlFiles.length} HTML files, ${linkCount} internal links, ${sitemapUrls.length} sitemap URLs.`);
if (errors.length) {
  console.error(`\n${errors.length} problem(s):`);
  for (const e of errors.slice(0, 80)) console.error(`  - ${e}`);
  if (errors.length > 80) console.error(`  ...and ${errors.length - 80} more`);
  process.exit(1);
}
console.log('All checks passed.');
