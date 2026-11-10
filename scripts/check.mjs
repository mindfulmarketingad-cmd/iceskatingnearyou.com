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
 * - a blog post that uses og-image.jpg or has no hosted hero
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BLOG_FEATURED_POOL, DEFAULT_BLOG_FEATURED_ID, featuredImageForBlogPost, featuredImageForPath, loadLifestylePhotos, OUTDOOR_FEATURED_PAGES } from './lib/lifestyle.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const SITE_URL = 'https://www.iceskatingnearyou.com';
const listingsFile = join(ROOT, 'data/listings.json');
const listingsData = existsSync(listingsFile) ? JSON.parse(readFileSync(listingsFile, 'utf8')) : {};
const importedAt = listingsData.importedAt ? new Date(listingsData.importedAt) : null;
const DATA_DATE_LABEL = importedAt && !Number.isNaN(importedAt.getTime())
  ? importedAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
  : null;
loadLifestylePhotos(ROOT);
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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

function collectTyped(node, type, out) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) collectTyped(item, type, out);
    return;
  }
  const nodeType = node['@type'];
  if (nodeType === type || (Array.isArray(nodeType) && nodeType.includes(type))) out.push(node);
  for (const value of Object.values(node)) collectTyped(value, type, out);
}

function jsonLdTextHasStock(value) {
  return typeof value === 'string'
    && (value.includes('/assets/img/lifestyle/') || value.includes('images.pexels.com') || value.includes('googleusercontent.com'));
}

/** BlogPosting may name the hosted hero. IceSkatingRink and every other type may not. */
function scanJsonLdPhotos(node, hits) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) scanJsonLdPhotos(item, hits);
    return;
  }
  const nodeType = node['@type'];
  const types = Array.isArray(nodeType) ? nodeType : nodeType ? [nodeType] : [];
  if (types.includes('IceSkatingRink') && jsonLdTextHasStock(JSON.stringify(node))) {
    hits.add('stock or remote photo used in IceSkatingRink structured data');
  }
  const skipOwnStrings = types.includes('BlogPosting') || types.includes('IceSkatingRink');
  for (const value of Object.values(node)) {
    if (value && typeof value === 'object') scanJsonLdPhotos(value, hits);
    else if (!skipOwnStrings && jsonLdTextHasStock(value)) hits.add('stock or remote photo used in structured data');
  }
}

function checkRinkPage(file, html, path, rinkNodes) {
  const section = html.match(/<section class="rink-details"[\s\S]*?<\/section>/);
  if (!section) {
    warn(file, 'rink page is missing the Rink details block');
    return;
  }
  const block = section[0];
  if (!/<h2 id="rink-details-heading">Rink details<\/h2>/.test(block)) warn(file, 'Rink details heading is missing');
  if (DATA_DATE_LABEL && !block.includes(`Data last updated ${DATA_DATE_LABEL}.`)) {
    warn(file, `Data last updated note is missing or not ${DATA_DATE_LABEL}`);
  }
  if (/\bNot listed\b|\bundefined\b|\bnull\b/.test(block.replace(/<[^>]+>/g, ' '))) warn(file, 'Rink details block contains an empty or placeholder value');
  const pairs = [...block.matchAll(/<dt>([^<]*)<\/dt><dd>([\s\S]*?)<\/dd>/g)];
  if (!pairs.length) warn(file, 'Rink details block has no facts');
  for (const pair of pairs) {
    const label = pair[1].trim();
    const text = pair[2].replace(/<[^>]+>/g, '').trim();
    if (!label || !text) warn(file, 'Rink details block has an empty label or value');
  }
  if (rinkNodes.length !== 1) warn(file, `${rinkNodes.length} IceSkatingRink nodes`);
  const node = rinkNodes[0];
  if (!node) return;
  if (node.aggregateRating) warn(file, 'IceSkatingRink includes aggregateRating');
  if (node.mainEntityOfPage !== SITE_URL + path) warn(file, `mainEntityOfPage is ${node.mainEntityOfPage}`);
  const websiteHref = (block.match(/<dt>Website<\/dt><dd><a href="([^"]+)"/) || [])[1];
  const website = websiteHref ? websiteHref.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"') : '';
  if (website) {
    if (!Array.isArray(node.sameAs) || node.sameAs.length !== 1 || node.sameAs[0] !== website) {
      warn(file, 'sameAs does not match the rink website');
    }
    if (node.url !== website) warn(file, 'JSON-LD url is not the rink website');
  } else if (node.sameAs) {
    warn(file, 'sameAs is set without a website in Rink details');
  } else if (node.url !== SITE_URL + path) {
    warn(file, `JSON-LD url ${node.url} is not the www rink page`);
  }
  const amenityText = (block.match(/<dt>Amenities<\/dt><dd>([^<]*)<\/dd>/) || [])[1];
  if (amenityText) {
    const expected = amenityText.split(', ').map((name) => name.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"'));
    const got = Array.isArray(node.amenityFeature) ? node.amenityFeature : [];
    if (got.length !== expected.length) warn(file, 'amenityFeature count does not match the visible amenities');
    got.forEach((feature, i) => {
      if (!feature || feature['@type'] !== 'LocationFeatureSpecification' || feature.value !== true || feature.name !== expected[i]) {
        warn(file, `amenityFeature ${i} is not a real LocationFeatureSpecification`);
      }
    });
  } else if (node.amenityFeature) {
    warn(file, 'amenityFeature is set without a visible amenities row');
  }
  const priceText = (block.match(/<dt>Price<\/dt><dd>([^<]*)<\/dd>/) || [])[1];
  if (priceText) {
    if (!/^(\$|\$\$|\$\$\$|\$\$\$\$)$/.test(node.priceRange || '')) warn(file, `priceRange is ${JSON.stringify(node.priceRange)}`);
  } else if (node.priceRange) {
    warn(file, 'priceRange is set without a visible price');
  }
}

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
  if (html.includes('googleusercontent.com') || html.includes('streetviewpixels-pa.googleapis.com')) warn(file, 'hotlinked Google photo URL');
  if (html.includes('images.pexels.com')) warn(file, 'hotlinked Pexels photo URL');
  if (/<img\b[^>]*\ssrc="[^"]*\/fallbacks\/rink-/.test(markup)) warn(file, 'listing image src is still an SVG fallback');
  for (const img of markup.matchAll(/<img\b[^>]*\/assets\/img\/lifestyle\/[^>]*>/g)) {
    if (!/\balt="[^"]+"/.test(img[0])) warn(file, `lifestyle image missing alt text: ${img[0].slice(0, 120)}`);
  }
  if (html.includes('aggregateRating')) warn(file, 'third-party aggregateRating in schema');
  if (html.includes('https://iceskatingnearyou.com')) warn(file, 'absolute URL uses the apex host instead of www');

  const rinkNodes = [];
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      const parsed = JSON.parse(m[1]);
      const hits = new Set();
      scanJsonLdPhotos(parsed, hits);
      for (const hit of hits) warn(file, hit);
      collectTyped(parsed, 'IceSkatingRink', rinkNodes);
    } catch {
      warn(file, 'JSON-LD does not parse');
    }
  }
  if (rinkNodes.length) checkRinkPage(file, html, path, rinkNodes);

  if (path === '/') {
    for (const img of markup.matchAll(/<img\b[^>]*>/g)) {
      const alt = (img[0].match(/\balt="([^"]*)"/) || [])[1];
      if (!alt) warn(file, `image missing alt text: ${img[0].slice(0, 100)}`);
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
  if (!url.startsWith(`${SITE_URL}/`) && url !== `${SITE_URL}/`) errors.push(`sitemap.xml: ${url} is not on the www host`);
  if (!resolves(path)) errors.push(`sitemap.xml: ${url} does not exist`);
  if (noindexPaths.has(path)) errors.push(`sitemap.xml: ${url} is noindex`);
}
if (new Set(sitemapUrls).size !== sitemapUrls.length) errors.push('sitemap.xml: duplicate URLs');

/* root files */
const ads = readFileSync(join(DIST, 'ads.txt'), 'utf8').trim();
if (ads !== ADS_TXT) errors.push(`ads.txt is "${ads}"`);
if (!/Sitemap: https:\/\/www\.iceskatingnearyou\.com\/sitemap\.xml/.test(readFileSync(join(DIST, 'robots.txt'), 'utf8'))) errors.push('robots.txt has no www sitemap line');
if (sitemap.includes('googleusercontent.com') || sitemap.includes('https://iceskatingnearyou.com/')) errors.push('sitemap.xml contains a non-www or Google photo URL');

/* Outdoor hubs need a unique hosted hero, not the site-wide social image. */
const seenHeroes = new Set();
for (const pagePath of Object.keys(OUTDOOR_FEATURED_PAGES)) {
  const file = join(DIST, pagePath, 'index.html');
  if (!existsSync(file)) {
    errors.push(`${pagePath}: outdoor page is missing`);
    continue;
  }
  const html = readFileSync(file, 'utf8');
  const image = featuredImageForPath(pagePath);
  const absolute = `${SITE_URL}${image.hero}`;
  if (seenHeroes.has(image.hero)) errors.push(`${pagePath}: featured photo is reused`);
  seenHeroes.add(image.hero);
  if (!html.includes(`class="hub-hero-img"`) || !html.includes(`src="${image.hero}"`)) {
    errors.push(`${pagePath}: missing on-page featured image ${image.hero}`);
  }
  if (!html.includes(`alt="${esc(image.alt)}"`)) errors.push(`${pagePath}: featured image alt does not describe the scene`);
  if (image.author && !html.includes(`>${esc(image.author)}</a>`)) errors.push(`${pagePath}: photographer credit is missing`);
  const og = (html.match(/<meta property="og:image" content="([^"]*)"/) || [])[1];
  const tw = (html.match(/<meta name="twitter:image" content="([^"]*)"/) || [])[1];
  if (og !== absolute) errors.push(`${pagePath}: og:image is ${og || 'missing'}`);
  if (tw !== absolute) errors.push(`${pagePath}: twitter:image is ${tw || 'missing'}`);
  if (html.includes('/assets/img/og-image.jpg')) errors.push(`${pagePath}: still uses the generic og-image.jpg`);
  const width = (html.match(/<meta property="og:image:width" content="([^"]*)"/) || [])[1];
  const height = (html.match(/<meta property="og:image:height" content="([^"]*)"/) || [])[1];
  if (width !== String(image.width) || height !== String(image.height)) {
    errors.push(`${pagePath}: og:image dimensions are ${width}x${height}, expected ${image.width}x${image.height}`);
  }
  if (!html.includes('"@type":"CollectionPage"') && !html.includes('"@type": "CollectionPage"')) {
    errors.push(`${pagePath}: CollectionPage schema is missing`);
  }
}

/* Blog posts need a hosted hero and that same photo as the social image. */
const outdoorHeroFiles = new Set(Object.values(OUTDOOR_FEATURED_PAGES).map((id) => `/assets/img/lifestyle/${id}.webp`));
if (outdoorHeroFiles.has(`/assets/img/lifestyle/${DEFAULT_BLOG_FEATURED_ID}.webp`)) {
  errors.push('default blog featured photo reuses an outdoor page hero');
}
for (const id of BLOG_FEATURED_POOL) {
  if (outdoorHeroFiles.has(`/assets/img/lifestyle/${id}.webp`)) errors.push(`blog pool photo ${id} reuses an outdoor page hero`);
}
const autoA = featuredImageForBlogPost({ slug: 'future-skate-guide' });
const autoB = featuredImageForBlogPost({ slug: 'future-skate-guide' });
if (autoA.hero !== autoB.hero || autoA.width !== 1200 || autoA.height !== 675 || !autoA.hero.startsWith('/assets/img/lifestyle/')) {
  errors.push('blog posts without an image do not get a stable 1200x675 lifestyle hero');
}
if (!BLOG_FEATURED_POOL.includes(autoA.id)) errors.push(`default blog photo ${autoA.id} is outside the public-skate pool`);
const override = featuredImageForBlogPost({ slug: 'future-skate-guide', image: 'pexels-6015973' });
if (override.id !== 'pexels-6015973') errors.push('per-post blog featured image was ignored');
const blogPostPaths = htmlFiles.map(urlPathFor).filter((pagePath) => /^\/blog\/[^/]+\/$/.test(pagePath));
if (!blogPostPaths.length) errors.push('no blog post pages were built');
for (const pagePath of blogPostPaths) {
  const file = join(DIST, pagePath, 'index.html');
  const html = readFileSync(file, 'utf8');
  if (html.includes('/assets/img/og-image.jpg')) errors.push(`${pagePath}: still uses the generic og-image.jpg`);
  const headStart = html.indexOf('<div class="hub-hero-inner">');
  const heroAt = html.indexOf('class="hub-hero-img"');
  if (headStart === -1 || heroAt === -1 || !html.slice(headStart, heroAt).includes('<h1')) {
    errors.push(`${pagePath}: missing featured image next to the heading`);
  }
  const figure = (html.match(/<figure class="hub-hero-img">[\s\S]*?<\/figure>/) || [])[0] || '';
  const heroSrc = (figure.match(/<img src="([^"]+)"/) || [])[1];
  if (!heroSrc || !heroSrc.startsWith('/assets/img/lifestyle/')) {
    errors.push(`${pagePath}: hero is not a hosted lifestyle photo`);
    continue;
  }
  if (!figure.includes('width="1200"') || !figure.includes('height="675"')) {
    errors.push(`${pagePath}: hero is not marked at its 1200x675 size`);
  }
  if (!/Photo by <a [^>]*rel="noopener noreferrer">[^<]+<\/a>/.test(figure) || !figure.includes('https://www.pexels.com/')) {
    errors.push(`${pagePath}: photographer credit is missing`);
  }
  const absolute = `${SITE_URL}${heroSrc}`;
  const og = (html.match(/<meta property="og:image" content="([^"]*)"/) || [])[1];
  const tw = (html.match(/<meta name="twitter:image" content="([^"]*)"/) || [])[1];
  if (og !== absolute) errors.push(`${pagePath}: og:image is ${og || 'missing'}`);
  if (tw !== absolute) errors.push(`${pagePath}: twitter:image is ${tw || 'missing'}`);
  if (!String(og || '').startsWith(`${SITE_URL}/`)) errors.push(`${pagePath}: og:image is not an absolute www URL`);
  const width = (html.match(/<meta property="og:image:width" content="([^"]*)"/) || [])[1];
  const height = (html.match(/<meta property="og:image:height" content="([^"]*)"/) || [])[1];
  if (width !== '1200' || height !== '675') errors.push(`${pagePath}: og:image dimensions are ${width}x${height}, expected 1200x675`);
  const canonical = (html.match(/<link rel="canonical" href="([^"]*)"/) || [])[1];
  if (canonical !== `${SITE_URL}${pagePath}`) errors.push(`${pagePath}: canonical ${canonical || 'missing'} is not the www URL`);
  let postingImage = null;
  for (const match of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      const nodes = [];
      collectTyped(JSON.parse(match[1]), 'BlogPosting', nodes);
      if (nodes[0] && nodes[0].image) postingImage = nodes[0].image;
    } catch { /* parse errors are already reported */ }
  }
  if (postingImage !== absolute) errors.push(`${pagePath}: BlogPosting image is ${postingImage || 'missing'}`);
  if (pagePath === '/blog/how-much-does-ice-skating-cost/') {
    if (heroSrc !== `/assets/img/lifestyle/${DEFAULT_BLOG_FEATURED_ID}.webp`) {
      errors.push(`${pagePath}: expected the public-skate featured photo ${DEFAULT_BLOG_FEATURED_ID}`);
    }
    if (outdoorHeroFiles.has(heroSrc)) errors.push(`${pagePath}: featured photo reuses an outdoor page hero`);
  }
}

console.log(`Checked ${htmlFiles.length} HTML files, ${linkCount} internal links, ${sitemapUrls.length} sitemap URLs.`);
if (errors.length) {
  console.error(`\n${errors.length} problem(s):`);
  for (const e of errors.slice(0, 80)) console.error(`  - ${e}`);
  if (errors.length > 80) console.error(`  ...and ${errors.length - 80} more`);
  process.exit(1);
}
console.log('All checks passed.');
