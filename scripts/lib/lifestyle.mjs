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
