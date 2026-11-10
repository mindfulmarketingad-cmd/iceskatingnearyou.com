// Hosted ice-skating photos. Google listing photo URLs are signed and are not
// published. Cards and rink pages use this catalog instead. Files live in
// src/assets/img/lifestyle and are committed. Credits and the Pexels License:
// data/lifestyle-photos.json. Attribution is not required by the license;
// the site credits photographers anyway.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

let photos = null;

export function loadLifestylePhotos(root) {
  if (!photos) photos = JSON.parse(readFileSync(join(root, 'data/lifestyle-photos.json'), 'utf8'));
  return photos;
}

/** A path we host ourselves. Remote Google and Pexels URLs are not own photos. */
export function isOwnHostedPhoto(src) {
  return typeof src === 'string' && src.startsWith('/assets/') && !src.includes('..');
}

function themeFor(l, hash) {
  const features = new Set(l.features || []);
  const figure = features.has('Figure skating');
  const hockey = features.has('Hockey');
  const outdoor = features.has('Outdoor rink') || features.has('Seasonal rink');
  if (figure && hockey) return hash(`${l.id || l.slug}|theme`) % 2 === 0 ? 'figure' : 'hockey';
  if (figure) return 'figure';
  if (hockey) return 'hockey';
  if (outdoor) return 'outdoor';
  if (features.has('Indoor rink')) return 'indoor';
  return 'general';
}

function poolFor(all, theme) {
  const specific = all.filter((p) => p.themes.includes(theme));
  if (specific.length >= 8) return specific;
  const ids = new Set(specific.map((p) => p.id));
  return specific.concat(all.filter((p) => p.themes.includes('general') && !ids.has(p.id)));
}

/**
 * Stable photo for one listing. The same id always maps to the same file.
 * Theme comes from the listing's own feature tags when they match a pool.
 * An already-hosted first-party path in `ownSrc` wins over the stock pool.
 */
export function imageForListing(l, hash, ownSrc = null) {
  if (isOwnHostedPhoto(ownSrc)) {
    return {
      id: 'own',
      card: ownSrc,
      hero: ownSrc,
      alt: `Photo of ${l.name} in ${l.city}, ${l.state}`,
      author: null,
      sourceUrl: null,
      own: true,
      theme: 'own',
    };
  }
  const all = photos || [];
  if (!all.length) throw new Error('lifestyle photo catalog is empty');
  const theme = themeFor(l, hash);
  const pool = poolFor(all, theme);
  const key = String(l.id || l.placeId || l.slug || l.name);
  const photo = pool[hash(key) % pool.length];
  return {
    id: photo.id,
    card: `/assets/img/lifestyle/${photo.cardFile}`,
    hero: `/assets/img/lifestyle/${photo.file}`,
    alt: photo.alt,
    author: photo.author || null,
    sourceUrl: photo.sourceUrl,
    own: false,
    theme,
  };
}

/**
 * Page-level heroes for the outdoor hubs and the national outdoor guide.
 * Each page gets a different outdoor or festive scene from the hosted pool.
 * Indoor arenas and outdoor hockey stay off these pages.
 * Hero files are the catalog's 1200×675 WebP. Card files stay for listings.
 */
export const OUTDOOR_FEATURED_PAGES = {
  // Night rink and Ferris wheel. The Christmas-tree file crops the ice out of the 16:9 hero.
  '/outdoor-ice-skating/': 'pexels-30085175',
  // Night rink under string lights.
  '/near/new-york/outdoor-ice-rinks/': 'pexels-6289775',
  // Skaters on an outdoor city rink.
  '/near/chicago/outdoor-ice-rinks/': 'pexels-10556559',
  // Outdoor skate in daylight. The festive clock-tower file crops the ice out of the hero.
  '/near/san-francisco/outdoor-ice-rinks/': 'pexels-14906334',
  // Daylight outdoor public skate.
  '/near/boston/outdoor-ice-rinks/': 'pexels-3824731',
  // Frozen lake, matching the pond listings in this circle.
  '/near/minneapolis/outdoor-ice-rinks/': 'pexels-15494504',
  // Night outdoor skating.
  '/near/washington-dc/outdoor-ice-rinks/': 'pexels-10637954',
  // Open winter ice, matching the seasonal park listings.
  '/north-dakota/fargo/outdoor-ice-rinks/': 'pexels-30924007',
  // Distinct from the Chicago metro hero.
  '/illinois/chicago/outdoor-ice-rinks/': 'pexels-6712033',
};

const outdoorFeaturedIds = Object.values(OUTDOOR_FEATURED_PAGES);
if (new Set(outdoorFeaturedIds).size !== outdoorFeaturedIds.length) {
  throw new Error('outdoor featured photos must be unique');
}

export const HERO_WIDTH = 1200;
export const HERO_HEIGHT = 675;

function catalogPhoto(id) {
  const all = photos || [];
  if (!all.length) throw new Error('lifestyle photo catalog is empty');
  const photo = all.find((item) => item.id === id);
  if (!photo) throw new Error(`featured photo ${id} is not in the lifestyle catalog`);
  const themes = photo.themes || [];
  if (!themes.includes('outdoor')) throw new Error(`${id} is not tagged outdoor`);
  if (themes.includes('hockey')) throw new Error(`${id} is an outdoor hockey scene`);
  return photo;
}

/** Hosted hero for one outdoor hub, or null when the path has no featured photo. */
export function featuredImageForPath(path) {
  const id = OUTDOOR_FEATURED_PAGES[path];
  if (!id) return null;
  const photo = catalogPhoto(id);
  return {
    id: photo.id,
    card: `/assets/img/lifestyle/${photo.cardFile}`,
    hero: `/assets/img/lifestyle/${photo.file}`,
    alt: photo.alt,
    author: photo.author || null,
    sourceUrl: photo.sourceUrl,
    width: HERO_WIDTH,
    height: HERO_HEIGHT,
  };
}

/**
 * Public-skate scenes for blog posts. These are people skating, not outdoor
 * hockey, and none of them is already the hero of an outdoor page.
 * The first id is the default photo on the cost guide.
 */
export const DEFAULT_BLOG_FEATURED_ID = 'pexels-6539264';

export const BLOG_FEATURED_POOL = [
  DEFAULT_BLOG_FEATURED_ID,
  'pexels-6015973',
  'pexels-6541490',
  'pexels-6541474',
];

const outdoorHeroIds = new Set(Object.values(OUTDOOR_FEATURED_PAGES));
if (BLOG_FEATURED_POOL.some((id) => outdoorHeroIds.has(id))) {
  throw new Error('blog featured photos must not reuse an outdoor page hero');
}
if (new Set(BLOG_FEATURED_POOL).size !== BLOG_FEATURED_POOL.length) {
  throw new Error('blog featured photos must be unique');
}

const BLOG_PHOTO_NOTE = 'A stock photo of ice skating, not a photograph of a specific rink.';

function stableHash(seed) {
  let hash = 0;
  const text = String(seed || '');
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  return hash;
}

function blogCatalogPhoto(id) {
  const all = photos || [];
  if (!all.length) throw new Error('lifestyle photo catalog is empty');
  const photo = all.find((item) => item.id === id);
  if (!photo) throw new Error(`blog featured photo ${id} is not in the lifestyle catalog`);
  return photo;
}

function blogFeaturedId(image, slug) {
  if (typeof image === 'string' && image.trim()) {
    const value = image.trim();
    const fromPath = value.match(/(pexels-\d+)\.webp$/);
    if (fromPath) return fromPath[1];
    if (/^pexels-\d+$/.test(value)) return value;
    throw new Error(`blog featured image "${value}" is not a lifestyle catalog id`);
  }
  // Same slug, same file. The pool is public-skate scenes only.
  return BLOG_FEATURED_POOL[stableHash(slug) % BLOG_FEATURED_POOL.length];
}

/**
 * Hosted hero for one blog post.
 * Front matter `image` may be a catalog id (`pexels-6539264`) or a path to
 * that photo under /assets/img/lifestyle/. Without one, the slug picks a
 * stable photo from the public-skate pool, so a new post still gets a hero.
 */
export function featuredImageForBlogPost({ slug, image } = {}) {
  const photo = blogCatalogPhoto(blogFeaturedId(image, slug));
  return {
    id: photo.id,
    card: `/assets/img/lifestyle/${photo.cardFile}`,
    hero: `/assets/img/lifestyle/${photo.file}`,
    alt: photo.alt,
    author: photo.author || null,
    sourceUrl: photo.sourceUrl,
    width: HERO_WIDTH,
    height: HERO_HEIGHT,
    note: BLOG_PHOTO_NOTE,
  };
}
