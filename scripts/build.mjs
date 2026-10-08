/**
 * Static site generator for iceskatingnearyou.com.
 *
 *   node scripts/build.mjs
 *
 * Reads data/listings.json (written by scripts/import-outscraper.mjs) and the
 * page sources in src/pages/**.html (each opens with a JSON <!--meta --> front
 * matter block), wraps everything in src/templates/base.html and writes every
 * page to dist/. Nothing is rendered at request time.
 *
 * URL map (all generated from the data except the hand-written pages):
 *   /                                   homepage (src/pages/index.html)
 *   /states/                            state hub (src/pages/states.html)
 *   /states/<state>/                    state money page: ranked listicle
 *   /<state>/<city>/                    city listicle
 *   /<state>/<city>/<rink>/             one page per listing
 *   /<state>/                           redirect stub to /states/<state>/
 *   /find/  /find/<type>/  /find/<type>/<state>/   feature pages (filter chips)
 *   /map/   /map/<state>/               Leaflet maps
 *   /search/                            client-side search
 *   /blog/  /blog/<post>/               informational guides only
 */
import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { slugify, STATES, STATE_NEIGHBORS, DAYS, distanceMiles } from './lib/listings.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const DIST = join(ROOT, 'dist');
const DATA_FILE = process.env.LISTINGS_FILE ? resolve(process.env.LISTINGS_FILE) : join(ROOT, 'data/listings.json');

const SITE_URL = 'https://iceskatingnearyou.com';
const SITE_NAME = 'Ice Skating Near You';
const CONTACT_EMAIL = 'hello@iceskatingnearyou.com';
const SOCIAL = {
  instagram: 'https://www.instagram.com/iceskatingnearyou/',
  twitter: 'https://twitter.com/iceskatingnear',
  facebook: 'https://www.facebook.com/iceskatingnearyou',
};
const ASSET_VERSION = String(Date.now()).slice(-7);
const NOW = new Date();
const BUILD_DATE = NOW.toISOString().slice(0, 10);
const YEAR = NOW.getUTCFullYear();

/* AdSense. The loader script goes on every page. Manual units render only
   once their slot IDs are filled in here (create them under Ads > By ad unit
   in AdSense); until then they output nothing, rather than an empty box.
   Each unit sits in a container with a reserved min-height (see .ad-slot in
   style.css) so a late fill never pushes content down. */
const AD_CLIENT = 'ca-pub-9332749804326149';
const AD_SLOTS = {
  display: process.env.ADSENSE_SLOT_DISPLAY || '',
  inFeed: process.env.ADSENSE_SLOT_INFEED || '',
  inArticle: process.env.ADSENSE_SLOT_INARTICLE || '',
};
const AD_INFEED_LAYOUT_KEY = process.env.ADSENSE_INFEED_LAYOUT_KEY || '';

/* Google listing photos (lh3.googleusercontent.com) are signed URLs that stop
   working after roughly four weeks. Past this age the build stops using them
   and every image falls back to the local illustrations; re-run the import
   to get fresh URLs. Every <img> also swaps to the fallback on error. */
const PHOTO_MAX_AGE_DAYS = 25;
const FALLBACK_IMAGES = [1, 2, 3, 4].map((n) => `/assets/img/fallbacks/rink-${n}.svg`);

/* ------------------------------------------------------------------ inputs */

const data = JSON.parse(readFileSync(DATA_FILE, 'utf8'));
const listings = (data.listings || []).filter((l) => l && l.name && l.state && l.city && Number.isFinite(l.lat) && Number.isFinite(l.lng));
const importedAt = data.importedAt ? new Date(data.importedAt) : null;
const DATA_DATE = importedAt ? importedAt.toISOString().slice(0, 10) : null;
const DATA_DATE_LABEL = importedAt
  ? importedAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
  : null;
const photosFetchedAt = data.photosFetchedAt ? new Date(data.photosFetchedAt) : importedAt;
const photoAgeDays = photosFetchedAt ? (NOW - photosFetchedAt) / 86400000 : Infinity;
const photosFresh = photoAgeDays <= PHOTO_MAX_AGE_DAYS;
if (!photosFresh) for (const l of listings) l.photo = null;

const categories = JSON.parse(readFileSync(join(SRC, 'data/categories.json'), 'utf8'));
const faqs = JSON.parse(readFileSync(join(SRC, 'data/faqs.json'), 'utf8'));
const template = readFileSync(join(SRC, 'templates/base.html'), 'utf8');
const hasData = listings.length > 0;

/* --------------------------------------------------------------- utilities */

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const attr = (s) => esc(s).replace(/'/g, '&#39;');
const num = (n) => Number(n).toLocaleString('en-US');
const plural = (n, one, many) => (n === 1 ? one : many);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const stripTags = (html) => html.replace(/<[^>]+>/g, '');

function joinNatural(words) {
  if (words.length <= 1) return words[0] || '';
  if (words.length === 2) return `${words[0]} and ${words[1]}`;
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

function seededHash(seed) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return hash;
}

function writePage(urlPath, html) {
  const rel = urlPath === '/' ? 'index.html' : urlPath.endsWith('.html') ? urlPath.slice(1) : join(urlPath.replace(/^\/|\/$/g, ''), 'index.html');
  const out = join(DIST, rel);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
}

/** Picks the first title candidate that fits in 60 characters. */
function fitTitle(...candidates) {
  return candidates.find((t) => t.length <= 60) || candidates[candidates.length - 1].slice(0, 60);
}

/**
 * Meta descriptions must land between 150 and 160 characters. Takes a lead
 * sentence plus optional clauses and tries every in-order combination,
 * returning the first that fits (preferring more clauses). The check script
 * fails the build output if a page still ends up outside the range.
 */
function fitDescription(leads, optional = []) {
  const leadList = Array.isArray(leads) ? leads : [leads];
  // Short closers that can always fill a gap of a few characters.
  const opts = [...optional, ...SHORT_FILLERS].filter((v, i, a) => a.indexOf(v) === i).slice(0, 11);
  for (const lead of leadList) {
    const fits = [];
    for (let mask = 0; mask < 1 << opts.length; mask++) {
      let s = lead;
      let count = 0;
      for (let i = 0; i < opts.length; i++) if (mask & (1 << i)) { s += ` ${opts[i]}`; count++; }
      if (s.length >= 150 && s.length <= 160) fits.push({ s, count });
    }
    // Prefer the page-specific clauses (earlier in the list) and fewer fillers.
    if (fits.length) return fits.sort((a, b) => a.count - b.count || b.s.length - a.s.length)[0].s;
  }
  // Last resort: the shortest lead, cut at a sentence or word boundary.
  const shortest = [...leadList].sort((a, b) => a.length - b.length)[0];
  if (shortest.length <= 160) return shortest;
  const cut = shortest.slice(0, 159);
  return cut.slice(0, cut.lastIndexOf(' ')).replace(/[,:;]$/, '') + '.';
}
const SHORT_FILLERS = ['Free to use.', 'Plan ahead.', 'Updated often.', 'Check before you go.', 'Go skate.'];

/* ------------------------------------------------------------------ paths */

const stateSlug = (stateName) => slugify(stateName);
const statePath = (stateName) => `/states/${stateSlug(stateName)}/`;
const cityPath = (stateName, cityName) => `/${stateSlug(stateName)}/${slugify(cityName)}/`;
const findPath = (cat) => `/find/${cat.slug}/`;
const findStatePath = (cat, stateName) => `/find/${cat.slug}/${stateSlug(stateName)}/`;
const mapStatePath = (stateName) => `/map/${stateSlug(stateName)}/`;
const postPath = (slug) => `/blog/${slug}/`;
const directionsUrl = (l) => `https://www.google.com/maps/dir/?api=1&destination=${l.lat},${l.lng}${l.placeId ? `&destination_place_id=${encodeURIComponent(l.placeId)}` : ''}`;

/* Listing URLs: /<state>/<city>/<rink-name>/, de-duplicated per city. */
{
  const used = new Map();
  for (const l of listings) {
    const bucket = `${stateSlug(l.state)}/${slugify(l.city)}`;
    if (!used.has(bucket)) used.set(bucket, new Set());
    const taken = used.get(bucket);
    const base = slugify(l.name) || 'ice-rink';
    let slug = base;
    let n = 2;
    while (taken.has(slug)) slug = `${base}-${n++}`;
    taken.add(slug);
    l.url = `/${bucket}/${slug}/`;
    l.anchor = `rink-${slugify(l.slug || slug)}`;
  }
}

/* ---------------------------------------------------------------- ranking */

/* Rating weighted by review volume (a Bayesian average): a 5.0 from three
   reviews does not outrank a 4.7 from 900. Unrated listings go last. */
const rated = listings.filter((l) => l.rating && l.reviews);
const MEAN_RATING = rated.length ? rated.reduce((s, l) => s + l.rating, 0) / rated.length : 4.3;
const PRIOR_REVIEWS = 25;
for (const l of listings) {
  l.score = l.rating && l.reviews ? (l.rating * l.reviews + MEAN_RATING * PRIOR_REVIEWS) / (l.reviews + PRIOR_REVIEWS) : 0;
}
const rank = (items) =>
  [...items].sort((a, b) => b.score - a.score || (b.reviews || 0) - (a.reviews || 0) || a.name.localeCompare(b.name));

/* -------------------------------------------------------- data aggregates */

const byState = new Map();
const byCity = new Map(); // "state|city" -> listings
for (const l of listings) {
  if (!byState.has(l.state)) byState.set(l.state, []);
  byState.get(l.state).push(l);
  const key = `${l.state}|${l.city}`;
  if (!byCity.has(key)) byCity.set(key, []);
  byCity.get(key).push(l);
}
for (const [k, v] of byState) byState.set(k, rank(v));
for (const [k, v] of byCity) byCity.set(k, rank(v));
const stateNames = [...byState.keys()].sort();
const codeOf = (stateName) => Object.keys(STATES).find((c) => STATES[c] === stateName);

const citiesInState = (stateName) =>
  [...byCity.entries()]
    .filter(([k]) => k.startsWith(`${stateName}|`))
    .map(([k, items]) => ({ city: k.slice(stateName.length + 1), items }))
    .sort((a, b) => b.items.length - a.items.length || a.city.localeCompare(b.city));

const centroid = (items) => ({
  lat: items.reduce((s, l) => s + l.lat, 0) / items.length,
  lng: items.reduce((s, l) => s + l.lng, 0) / items.length,
});

/** Other cities in the same state, nearest first. */
function nearbyCities(stateName, cityName, count) {
  const here = centroid(byCity.get(`${stateName}|${cityName}`));
  return citiesInState(stateName)
    .filter((c) => c.city !== cityName)
    .map((c) => ({ ...c, miles: distanceMiles(here.lat, here.lng, ...Object.values(centroid(c.items))) }))
    .sort((a, b) => a.miles - b.miles)
    .slice(0, count);
}

/** Nearest listings to a point, any state, excluding a set of slugs. */
function nearestListings(lat, lng, count, exclude = new Set(), maxMiles = 60) {
  return listings
    .filter((o) => !exclude.has(o.slug))
    .map((o) => ({ l: o, miles: distanceMiles(lat, lng, o.lat, o.lng) }))
    .filter((x) => x.miles <= maxMiles)
    .sort((a, b) => a.miles - b.miles)
    .slice(0, count);
}

const hasFeature = (l, cat) => (l.features || []).includes(cat.feature);
const catByFeature = new Map(categories.map((c) => [c.feature, c]));
const featureCount = (items, cat) => items.filter((l) => hasFeature(l, cat)).length;

/* A /find/<type>/<state>/ page exists only where at least one listing has
   that tag, so every chip that links to one resolves. */
const findStatePages = new Set();
for (const cat of categories) for (const s of stateNames) if (featureCount(byState.get(s), cat)) findStatePages.add(`${cat.slug}|${s}`);
const findPageFor = (cat, stateName) =>
  stateName && findStatePages.has(`${cat.slug}|${stateName}`) ? findStatePath(cat, stateName) : featureCount(listings, cat) ? findPath(cat) : null;

/* ------------------------------------------------------------------ hours */

const DAY_SHORT = { monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun' };
const isClosed = (v) => /^closed$/i.test(String(v || '').trim());

/** Groups consecutive days with identical hours: [{ label: 'Mon-Fri', value }]. */
function groupedHours(hours) {
  if (!hours) return [];
  const rows = DAYS.map((d) => ({ day: d, value: hours[d] || 'Not listed' }));
  const groups = [];
  for (const r of rows) {
    const last = groups[groups.length - 1];
    if (last && last.value === r.value) last.end = r.day;
    else groups.push({ start: r.day, end: r.day, value: r.value });
  }
  return groups.map((g) => ({
    label: g.start === g.end ? DAY_SHORT[g.start] : `${DAY_SHORT[g.start]}-${DAY_SHORT[g.end]}`,
    value: g.value,
  }));
}

const openDays = (l) => (l.hours ? DAYS.filter((d) => l.hours[d] && !isClosed(l.hours[d])) : []);

/** "6:30AM" style -> "06:30" (24h). Returns null when it cannot parse safely. */
function parseClock(text, fallbackMeridiem) {
  const m = String(text).trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] || 0);
  const mer = (m[3] || fallbackMeridiem || '').toUpperCase();
  if (!mer || h > 12 || min > 59) return null;
  if (mer === 'AM' && h === 12) h = 0;
  if (mer === 'PM' && h !== 12) h += 12;
  return { h, min, text: `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}` };
}

/** schema.org OpeningHoursSpecification, or null if any day is ambiguous. */
function openingHoursSpec(hours) {
  if (!hours) return null;
  const specs = [];
  for (const day of DAYS) {
    const v = hours[day];
    if (!v) return null;
    if (isClosed(v)) continue;
    if (/open 24 hours/i.test(v)) { specs.push({ day, opens: '00:00', closes: '23:59' }); continue; }
    for (const win of v.split(/\s*\/\s*|,\s*/)) {
      const [a, b] = win.split(/\s*-\s*/);
      if (!a || !b) return null;
      const end = parseClock(b);
      if (!end) return null;
      const endMer = /pm/i.test(b) ? 'PM' : 'AM';
      let start = parseClock(a, endMer);
      if (start && !/(am|pm)/i.test(a) && start.h * 60 + start.min > end.h * 60 + end.min && end.h !== 0) start = parseClock(a, 'AM');
      if (!start) return null;
      specs.push({ day, opens: start.text, closes: end.text });
    }
  }
  return specs.map((s) => ({
    '@type': 'OpeningHoursSpecification',
    dayOfWeek: `https://schema.org/${cap(s.day)}`,
    opens: s.opens,
    closes: s.closes,
  }));
}

/* ----------------------------------------------------------------- images */

const fallbackFor = (l) => FALLBACK_IMAGES[seededHash(l.slug || l.name) % FALLBACK_IMAGES.length];
const IMAGE_SIZES = { thumb: [320, 200], card: [480, 300], hero: [960, 540] };

function resizedPhotoUrl(url, w, h) {
  if (!url || !url.includes('googleusercontent.com')) return url;
  return /=w\d+-h\d+/.test(url) ? url.replace(/=w\d+-h\d+[^&]*$/, `=w${w}-h${h}-k-no`) : url;
}

function listingImage(l, { size = 'card', className = '', eager = false } = {}) {
  const [w, h] = IMAGE_SIZES[size];
  const fallback = fallbackFor(l);
  const src = l.photo ? resizedPhotoUrl(l.photo, w, h) : fallback;
  const alt = l.photo ? `${l.name} in ${l.city}, ${l.stateCode}` : '';
  return `<img class="${className}" src="${attr(src)}" alt="${attr(alt)}" width="${w}" height="${h}"${eager ? ' fetchpriority="high"' : ' loading="lazy"'} decoding="async"${l.photo ? ` referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${fallback}';this.alt='';var c=this.closest('figure');if(c&&c.querySelector('figcaption'))c.querySelector('figcaption').textContent='Illustration. No current photo is available for this rink.';"` : ''}>`;
}

/* -------------------------------------------------------------------- ads */

function renderAdSlot(type) {
  const slot = AD_SLOTS[type];
  if (!slot) return '';
  const format =
    type === 'inFeed' && AD_INFEED_LAYOUT_KEY
      ? `data-ad-format="fluid" data-ad-layout-key="${attr(AD_INFEED_LAYOUT_KEY)}"`
      : type === 'inArticle'
        ? 'data-ad-format="fluid" data-ad-layout="in-article"'
        : 'data-ad-format="auto" data-full-width-responsive="true"';
  return `<div class="ad-slot ad-slot-${type}" aria-label="Advertisement">
  <span class="ad-label">Advertisement</span>
  <ins class="adsbygoogle" style="display:block" data-ad-client="${AD_CLIENT}" data-ad-slot="${attr(slot)}" ${format}></ins>
  <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
</div>`;
}

/* After the opening paragraph, and again before the middle H2 of a long
   article: natural breaks where the reader has already committed. */
function injectArticleAds(bodyHtml) {
  const ad = renderAdSlot('inArticle');
  if (!ad) return bodyHtml;
  let out = bodyHtml;
  const h2s = [...out.matchAll(/<h2[\s>]/g)].map((m) => m.index);
  if (h2s.length >= 4) {
    const mid = h2s[Math.floor(h2s.length / 2)];
    out = out.slice(0, mid) + ad + '\n' + out.slice(mid);
  }
  const firstP = out.indexOf('</p>');
  if (firstP !== -1) out = out.slice(0, firstP + 4) + '\n' + ad + out.slice(firstP + 4);
  return out;
}

/* ---------------------------------------------------- listing summaries */

const stars = (r) => `<span class="stars" style="--rating:${Number(r).toFixed(1)}" aria-hidden="true"></span>`;

function ratingHtml(l) {
  if (!l.rating) return '<span class="missing">No Google rating yet</span>';
  return `${stars(l.rating)} <strong>${l.rating.toFixed(1)}</strong> out of 5`;
}

const article = (word) => (/^[aeiou]/i.test(word) ? 'an' : 'a');

/** Kind of venue in plain words, from the listing's own category/tags. */
function venueNoun(l) {
  const f = l.features || [];
  if (f.includes('Outdoor rink')) return 'outdoor ice rink';
  if (f.includes('Seasonal rink')) return 'seasonal ice rink';
  if (f.includes('Indoor rink')) return 'indoor ice rink';
  if (l.category && /curling/i.test(l.category)) return 'curling venue';
  if (l.category && /arena|stadium/i.test(l.category)) return 'arena';
  return 'ice rink';
}

/** Where a listing sits among the rated rinks of a set, for honest context. */
function standing(l, peers) {
  const ratedPeers = peers.filter((p) => p.rating);
  if (!l.rating || ratedPeers.length < 4) return '';
  const lower = ratedPeers.filter((p) => p.rating < l.rating).length;
  const pct = Math.round((lower / ratedPeers.length) * 100);
  const byReviews = [...ratedPeers].sort((a, b) => (b.reviews || 0) - (a.reviews || 0));
  const reviewRank = byReviews.indexOf(l) + 1;
  const where = `we list in ${esc(l.state)}`;
  if (reviewRank === 1) return `the most-reviewed rink ${where}`;
  if (reviewRank <= 3) return `one of the three most-reviewed rinks ${where}`;
  if (pct >= 75) return `rated higher than ${pct}% of the rinks ${where}`;
  return '';
}

/**
 * The write-up for one listing. Every sentence restates a field we actually
 * hold; anything missing is said to be missing rather than guessed.
 */
function summaryHtml(l, peers) {
  const noun = venueNoun(l);
  const where = l.street ? `at ${esc(l.street)} in ${esc(l.city)}` : `in ${esc(l.city)}, ${esc(l.stateCode)}`;
  const lead = `${esc(l.name)} is ${article(noun)} ${noun} ${where}${l.category && !/ice skating rink/i.test(l.category) ? `, listed on Google as ${article(l.category)} ${esc(l.category.toLowerCase())}` : ''}.`;

  let ratingS;
  if (l.rating && l.reviews) {
    const st = peers ? standing(l, peers) : '';
    ratingS = ` Google reviewers give it ${l.rating.toFixed(1)} out of 5 across ${num(l.reviews)} ${plural(l.reviews, 'review', 'reviews')}${st ? `, ${st}` : ''}.`;
    if (l.reviews < 10) ratingS += ' That is a small sample, so weigh it lightly.';
  } else {
    ratingS = ' It has no Google rating on file yet.';
  }

  const NON_PROGRAM = ['Indoor rink', 'Outdoor rink', 'Seasonal rink', 'Wheelchair accessible', 'Good for kids'];
  const extras = (l.features || []).filter((f) => !NON_PROGRAM.includes(f));
  const featureS = extras.length
    ? ` Its listing mentions ${joinNatural(extras.map((f) => esc(f.toLowerCase())))}.`
    : ' Its listing does not mention programs such as hockey, lessons or skate rental, so ask the rink what runs during public sessions.';
  const googleTags = [
    (l.features || []).includes('Wheelchair accessible') ? 'a wheelchair accessible entrance' : null,
    (l.features || []).includes('Good for kids') ? 'being good for kids' : null,
  ].filter(Boolean);
  const accessS = googleTags.length ? ` Google lists it for ${joinNatural(googleTags)}.` : '';

  const tagsS = (l.reviewTags || []).length
    ? ` Topics reviewers bring up most often: ${joinNatural(l.reviewTags.slice(0, 4).map((t) => esc(t.toLowerCase())))}.`
    : '';

  const days = openDays(l);
  let hoursS;
  if (!l.hours) hoursS = ' No opening hours are listed, so check the rink\'s schedule before you go.';
  else if (days.length === 7) hoursS = ' It lists opening hours on all seven days.';
  else if (days.length === 0) hoursS = ' Its listing currently shows it closed every day, which often means it is between seasons.';
  else {
    const closed = DAYS.filter((d) => !days.includes(d) && l.hours[d] && isClosed(l.hours[d])).map((d) => cap(d));
    hoursS = ` It lists hours on ${days.length} ${plural(days.length, 'day', 'days')} a week${closed.length ? ` and shows ${joinNatural(closed)} as closed` : ''}.`;
  }
  const statusS = l.status === 'CLOSED_TEMPORARILY'
    ? ' Google currently marks it as temporarily closed, which is common for seasonal rinks outside their season.'
    : '';

  const desc = l.description ? `<p>In its own words: "${esc(l.description)}"</p>` : '';
  return `<p>${lead}${ratingS}${featureS}${accessS}</p>${desc}<p>${tagsS.trim() ? `${tagsS.trim()} ` : ''}${hoursS.trim()}${statusS}</p>`;
}

/* ---------------------------------------------------------- components */

function chipsHtml(l, stateName) {
  const chips = (l.features || [])
    .map((f) => catByFeature.get(f))
    .filter(Boolean)
    .map((cat) => {
      const href = findPageFor(cat, stateName);
      return href ? `<a class="chip" href="${href}">${esc(cat.chip)}</a>` : '';
    })
    .join('');
  return chips ? `<div class="chip-row">${chips}</div>` : '';
}

function contactFacts(l) {
  const address = l.fullAddress || [l.street, `${l.city}, ${l.stateCode}`, l.postalCode].filter(Boolean).join(', ');
  return `<div><dt>Address</dt><dd>${l.street || l.fullAddress ? esc(address) : `<span class="missing">Street address not listed</span> (${esc(l.city)}, ${esc(l.stateCode)})`}</dd></div>
      <div><dt>Phone</dt><dd>${l.phone ? `<a href="tel:${attr(l.phone.replace(/[^\d+]/g, ''))}">${esc(l.phone)}</a>` : '<span class="missing">Not listed</span>'}</dd></div>
      <div><dt>Website</dt><dd>${l.website ? `<a href="${attr(l.website)}" target="_blank" rel="nofollow noopener noreferrer">${esc(prettyDomain(l.website))}</a>` : '<span class="missing">Not listed</span>'}</dd></div>`;
}

function prettyDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'Visit website';
  }
}

/* Openers cycle so a long ranked list does not read as one template
   repeated. Index 0 is only ever used for #1. */
const BLURB_OPENERS = [
  (name, place) => `${name}${place} takes the top spot`,
  (name, place) => `${name}${place} is next up`,
  (name, place) => `${name}${place} rounds out this stretch of the list`,
  (name, place) => `${name}${place} is another strong option`,
  (name, place) => `${name}${place} is also worth a look`,
];

/** One or two data-grounded sentences for a ranked entry. */
function blurbFor(l, position, stateName) {
  const place = stateName ? ` in ${esc(l.city)}` : ` in ${esc(l.city)}, ${esc(l.stateCode)}`;
  const opener = (position === 1 ? BLURB_OPENERS[0] : BLURB_OPENERS[1 + ((position - 2) % (BLURB_OPENERS.length - 1))])(esc(l.name), place);
  const rating = l.rating && l.reviews
    ? `, rated ${l.rating.toFixed(1)} out of 5 from ${num(l.reviews)} ${plural(l.reviews, 'review', 'reviews')}.`
    : '. It has no Google rating yet.';
  const programs = (l.features || []).filter((f) => !['Indoor rink', 'Outdoor rink', 'Seasonal rink', 'Wheelchair accessible', 'Good for kids'].includes(f));
  const features = programs.length ? ` Its listing mentions ${joinNatural(programs.slice(0, 3).map((f) => esc(f.toLowerCase())))}.` : '';
  return `${opener}${rating}${features}`;
}

/** "Perfect for" line, built only from tags on the listing. */
function perfectFor(l) {
  const f = l.features || [];
  const parts = [
    f.includes('Outdoor rink') || f.includes('Seasonal rink') ? 'a classic outdoor skate' : null,
    f.includes('Hockey') ? 'hockey' : null,
    f.includes('Figure skating') ? 'figure skaters' : null,
    f.includes('Skating lessons') ? 'learning to skate' : null,
    f.includes('Good for kids') ? 'families with kids' : null,
    f.includes('Birthday parties') ? 'birthday parties' : null,
    f.includes('Curling') ? 'trying curling' : null,
  ].filter(Boolean);
  if (parts.length) return `Perfect for ${joinNatural(parts.slice(0, 3))}.`;
  if (l.rating >= 4.7 && l.reviews >= 100) return 'Perfect for a reliably great skate, based on reviews.';
  return '';
}

function hoursLine(l) {
  const groups = groupedHours(l.hours);
  if (!groups.length) return '<span class="missing">Hours not listed. Confirm directly before you go.</span>';
  return `<b>Hours:</b> ${groups.map((g) => `${g.label} ${esc(g.value)}`).join(' <span aria-hidden="true">&middot;</span> ')}`;
}

/** One numbered entry in a listicle: rating, review count, address, phone,
 *  website, hours, a short summary and clickable type chips. */
function renderEntry(l, position, { stateName, headingTag = 'h3', peers = null, detail = false } = {}) {
  const address = l.street ? [l.street, `${l.city}, ${l.stateCode}`, l.postalCode].filter(Boolean).join(', ') : null;
  const tel = l.phone ? l.phone.replace(/[^\d+]/g, '') : '';
  const sep = ' <span aria-hidden="true">&middot;</span> ';
  const fit = perfectFor(l);
  return `<li class="entry" id="${attr(l.anchor)}" data-lat="${l.lat}" data-lng="${l.lng}" data-rank="${position}" data-name="${attr(l.name.toLowerCase())}" data-city="${attr(l.city.toLowerCase())}" data-types="${attr((l.features || []).map((f) => catByFeature.get(f)?.slug).filter(Boolean).join(' '))}" data-rating="${l.rating || 0}" data-reviews="${l.reviews || 0}">
  <span class="entry-rank" aria-hidden="true">${position}</span>
  <a class="entry-thumb" href="${l.url}" tabindex="-1" aria-hidden="true">${listingImage(l, { size: 'thumb' })}</a>
  <div class="entry-body">
    <${headingTag} class="entry-title"><a href="${l.url}">${esc(l.name)}</a></${headingTag}>
    <p class="entry-line">${l.rating ? `${stars(l.rating)} <b>${l.rating.toFixed(1)}</b>` : '<span class="missing">No rating yet</span>'}${l.reviews ? ` ${l.reviewsUrl ? `<a href="${attr(l.reviewsUrl)}" target="_blank" rel="nofollow noopener noreferrer">${num(l.reviews)} ${plural(l.reviews, 'review', 'reviews')}</a>` : `${num(l.reviews)} ${plural(l.reviews, 'review', 'reviews')}`}` : ''}${sep}<a href="${cityPath(l.state, l.city)}">${esc(l.city)}</a>, <a href="${statePath(l.state)}">${esc(l.stateCode)}</a><span class="entry-distance" hidden></span></p>
    <p class="entry-line">${address ? `<a href="${attr(directionsUrl(l))}" target="_blank" rel="nofollow noopener noreferrer">${esc(address)}</a>` : '<span class="missing">Street address not listed</span>'}</p>
    <p class="entry-line">${[
      l.phone ? `<a href="tel:${attr(tel)}">${esc(l.phone)}</a>` : '<span class="missing">Phone not listed</span>',
      l.website ? `<a href="${attr(l.website)}" target="_blank" rel="nofollow noopener noreferrer">Visit website</a>` : '<span class="missing">Website not listed</span>',
      l.mapsUrl && l.photosCount ? `<a href="${attr(l.mapsUrl)}" target="_blank" rel="nofollow noopener noreferrer">Photos (${num(l.photosCount)})</a>` : '',
    ].filter(Boolean).join(sep)}</p>
    <p class="entry-hours">${hoursLine(l)}</p>
    ${l.status === 'CLOSED_TEMPORARILY' ? '<p class="status-flag">Temporarily closed on Google</p>' : ''}
    ${fit ? `<p class="entry-fit">${fit}</p>` : ''}
    <p class="entry-blurb">${blurbFor(l, position, stateName)}</p>
    ${detail ? `<div class="entry-detail">${summaryHtml(l, peers)}</div>` : ''}
    ${chipsHtml(l, stateName)}
  </div>
</li>`;
}

/** Ranked list with in-feed ads after #3, #8 and then every 10 entries. */
function entryList(items, opts) {
  const parts = [];
  items.forEach((l, i) => {
    parts.push(renderEntry(l, i + 1, opts));
    const n = i + 1;
    if (n < items.length && (n === 3 || n === 8 || (n > 8 && (n - 8) % 10 === 0))) {
      const ad = renderAdSlot('inFeed');
      if (ad) parts.push(`<li class="entry-ad">${ad}</li>`);
    }
  });
  return `<ol class="entries" data-sortable>\n${parts.join('\n')}\n</ol>`;
}

function renderCard(l, { miles = null } = {}) {
  return `<article class="card rink-card">
  <a class="card-media" href="${l.url}" tabindex="-1" aria-hidden="true">${listingImage(l, { size: 'card' })}</a>
  <div class="card-body">
    <h3><a href="${l.url}">${esc(l.name)}</a></h3>
    <p class="card-place">${esc(l.city)}, ${esc(l.stateCode)}${miles != null ? ` <span class="card-miles">${miles < 1 ? 'under 1' : Math.round(miles)} mi away</span>` : ''}</p>
    <p class="card-rating">${l.rating ? `${stars(l.rating)} ${l.rating.toFixed(1)}${l.reviews ? ` <span>(${num(l.reviews)})</span>` : ''}` : '<span class="missing">No rating yet</span>'}</p>
  </div>
</article>`;
}

function stateFilterChips(items, stateName, current = null) {
  const present = categories.map((c) => ({ c, n: featureCount(items, c) })).filter((x) => x.n);
  if (!present.length) return '';
  return `<nav class="filter-chips" aria-label="Filter by type">
  <span class="filter-label">Filter:</span>
  <a class="chip${current ? '' : ' is-active'}" href="${statePath(stateName)}"${current ? '' : ' aria-current="page"'}>All rinks <span>${items.length}</span></a>
${present.map(({ c, n }) => `  <a class="chip${current === c.slug ? ' is-active' : ''}" href="${findStatePath(c, stateName)}"${current === c.slug ? ' aria-current="page"' : ''}>${esc(c.chip)} <span>${n}</span></a>`).join('\n')}
</nav>`;
}

function cityLinkGrid(stateName) {
  return `<ul class="link-grid">
${citiesInState(stateName).map(({ city, items }) => `  <li><a href="${cityPath(stateName, city)}">${esc(city)}</a> <span>${items.length}</span></li>`).join('\n')}
</ul>`;
}

function faqBlock(items, heading = 'Frequently asked questions') {
  if (!items.length) return '';
  return `<section class="faq" id="faq-h"${heading ? '' : ' aria-label="Frequently asked questions"'}>
  ${heading ? `<h2>${esc(heading)}</h2>` : ''}
${items.map((f) => `  <details class="faq-item"><summary>${esc(f.q)}</summary><div><p>${esc(f.a)}</p></div></details>`).join('\n')}
</section>`;
}

const faqJsonLd = (items) =>
  items.length
    ? {
        '@type': 'FAQPage',
        mainEntity: items.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
      }
    : null;

function itemListJsonLd(items, limit = 50) {
  return {
    '@type': 'ItemList',
    numberOfItems: items.length,
    itemListOrder: 'https://schema.org/ItemListOrderDescending',
    itemListElement: items.slice(0, limit).map((l, i) => ({ '@type': 'ListItem', position: i + 1, url: SITE_URL + l.url, name: l.name })),
  };
}

/** A scoped Leaflet map; data is inlined so the map needs no fetch. */
function mapEmbed(items, { height = 'tall', lazy = false } = {}) {
  const pts = items.map((l) => ({ n: l.name, u: l.url, c: `${l.city}, ${l.stateCode}`, a: l.lat, o: l.lng, r: l.rating, k: l.slug }));
  return `<div class="map-shell map-${height}"><div id="rink-map" class="rink-map"${lazy ? ' data-lazy' : ''} role="region" aria-label="Map of ice rinks"></div></div>
<script type="application/json" id="map-data">${JSON.stringify(pts).replace(/</g, '\\u003c')}</script>`;
}
/** Search, city/type filters, sort (including distance) and the List/Map
 *  toggle that sit above every ranked list. All client-side over the
 *  server-rendered entries, so the full list is always in the HTML. */
function listTools(items, stateName, { showCity = true } = {}) {
  const cities = [...new Set(items.map((l) => l.city))].sort();
  const cats = categories.map((c) => ({ c, n: featureCount(items, c) })).filter((x) => x.n);
  const label = `${items.length} ${plural(items.length, 'rink', 'rinks')}`;
  return `<div class="lt-top">
  <p class="lt-page-count">${label} on this page</p>
  <div class="view-toggle" role="group" aria-label="View">
    <button type="button" class="is-active" data-view-btn="list" aria-pressed="true">List</button>
    <button type="button" data-view-btn="map" aria-pressed="false">Map</button>
  </div>
</div>
<form class="list-tools" data-list-tools role="search" onsubmit="return false">
  <label class="visually-hidden" for="lt-q">Search by rink name or city</label>
  <input class="lt-q" id="lt-q" type="search" placeholder="Search by name or city..." autocomplete="off" data-q>
  <div class="lt-controls">
    ${showCity && cities.length > 1 ? `<label class="lt-control"><span>City</span><select data-city-filter><option value="">All cities</option>${cities.map((c) => `<option value="${attr(c.toLowerCase())}">${esc(c)}</option>`).join('')}</select></label>` : ''}
    ${cats.length ? `<label class="lt-control"><span>Type</span><select data-type-filter><option value="">All</option>${cats.map(({ c, n }) => `<option value="${c.slug}">${esc(c.name)} (${n})</option>`).join('')}</select></label>` : ''}
    <label class="lt-control"><span>Sort</span><select data-sort><option value="rank">Top rated</option><option value="reviews">Most reviewed</option><option value="name">Name A-Z</option><option value="distance">Nearest to me</option></select></label>
    <button class="lt-btn" type="button" data-reset>Reset</button>
    <button class="lt-btn" type="button" data-show-distance>Show distance from me</button>
  </div>
  <p class="lt-count" data-count role="status">${label}</p>
</form>`;
}

/** Tools + ranked list + lazy map, for city and type pages. */
function listSection(items, opts) {
  return `${listTools(items, opts.stateName, opts)}
<div class="list-view" data-view="list">
  ${entryList(items, opts)}
  <p class="empty-state" data-empty hidden><strong>No rinks match.</strong> Try a different search or <button type="button" class="btn-link" data-reset>reset the filters</button>.</p>
</div>
<div class="map-view" data-view="map" hidden>${mapEmbed(items, { lazy: true })}</div>`;
}

const listToolScripts = () => `<script src="/assets/js/list-tools.js?v=${ASSET_VERSION}" defer></script>`;

const mapScripts = () =>
  `<link rel="stylesheet" href="/assets/vendor/leaflet/leaflet.css?v=${ASSET_VERSION}">\n<script src="/assets/vendor/leaflet/leaflet.js?v=${ASSET_VERSION}" defer></script>\n<script src="/assets/js/map.js?v=${ASSET_VERSION}" defer></script>`;

/* ------------------------------------------------------------ page shell */

function breadcrumbs(trail) {
  if (!trail || !trail.length) return '';
  const items = [{ label: 'Home', href: '/' }, ...trail];
  return `<nav class="breadcrumbs" aria-label="Breadcrumb"><ol>${items
    .map((i, idx) => (idx === items.length - 1 || !i.href ? `<li aria-current="page">${esc(i.label)}</li>` : `<li><a href="${i.href}">${esc(i.label)}</a></li>`))
    .join('')}</ol></nav>`;
}

function breadcrumbJsonLd(trail, currentPath) {
  const items = [{ label: 'Home', href: '/' }, ...(trail || [])];
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((i, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      name: i.label,
      item: SITE_URL + (idx === items.length - 1 ? currentPath : i.href),
    })),
  };
}

/* Paragraphs are capped at roughly 3-4 rendered lines (about 300 characters
   at 18px in the reading column) by splitting long ones at sentence
   boundaries. Only bare <p> is touched, never mid-sentence and never inside
   an open inline tag. Ported from the reference site's generator. */
const PARA_TARGET_CHARS = 300;
const PARA_MIN_TAIL_CHARS = 90;
const PARA_ABBREVIATIONS = new Set(['etc', 'vs', 'al', 'approx', 'est', 'no', 'ft', 'mi', 'lb', 'oz', 'min', 'max', 'inc', 'ltd', 'co', 'jr', 'sr', 'mr', 'mrs', 'ms', 'dr', 'st', 'mt', 'ave', 'rd', 'blvd']);

function sentenceBreaks(inner) {
  const breaks = [];
  let depth = 0;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === '<') {
      const close = inner.indexOf('>', i);
      if (close === -1) break;
      const tag = inner.slice(i, close + 1);
      if (!/^<[^>]*\/>$/.test(tag) && !/^<(br|img|hr|wbr)\b/i.test(tag)) depth += tag[1] === '/' ? -1 : 1;
      i = close;
      continue;
    }
    if (depth !== 0 || (ch !== '.' && ch !== '!' && ch !== '?')) continue;
    if (!/^[.!?]["'\u201d\u2019)]?\s+[A-Z\u201c"'(]/.test(inner.slice(i))) continue;
    if (ch === '.') {
      const before = inner.slice(0, i);
      if (!/[a-z0-9)\]"'\u201d\u2019]$/.test(before)) continue;
      const word = (before.match(/([A-Za-z]+)$/) || [])[1];
      if (word && PARA_ABBREVIATIONS.has(word.toLowerCase())) continue;
    }
    const after = inner.slice(i + 1).match(/^["'\u201d\u2019)]?\s+/);
    breaks.push(i + 1 + (after ? after[0].length : 0));
  }
  return breaks;
}

function splitLongParagraphs(html) {
  return html.replace(/<p>([\s\S]*?)<\/p>/g, (whole, inner) => {
    if (stripTags(inner).trim().length <= PARA_TARGET_CHARS) return whole;
    const breaks = sentenceBreaks(inner);
    if (!breaks.length) return whole;
    const sentences = [];
    let prev = 0;
    for (const at of breaks) { sentences.push(inner.slice(prev, at)); prev = at; }
    sentences.push(inner.slice(prev));
    const chunks = [];
    let current = '';
    for (const s of sentences) {
      if (current && stripTags(current + s).trim().length > PARA_TARGET_CHARS) { chunks.push(current); current = s; } else current += s;
    }
    if (current) chunks.push(current);
    if (chunks.length < 2) return whole;
    if (stripTags(chunks[chunks.length - 1]).trim().length < PARA_MIN_TAIL_CHARS) chunks[chunks.length - 2] += chunks.pop();
    return chunks.map((c) => `<p>${c.trim()}</p>`).join('\n');
  });
}

function layoutContent(meta, body) {
  const layout = meta.layout || 'prose';
  body = splitLongParagraphs(body);
  if (layout === 'raw') return body;
  const head = `<div class="page-head">
  <div class="${layout === 'wide' ? 'wrap' : 'wrap-narrow'}">
    ${breadcrumbs(meta.trail)}
    <h1>${esc(meta.h1 || meta.title)}</h1>
    ${meta.lede ? `<p class="lede">${meta.lede}</p>` : ''}
  </div>
</div>`;
  return `${head}
<div class="section">
  <div class="${layout === 'wide' ? 'wrap' : 'wrap-narrow prose'}">
${body}
  </div>
</div>`;
}

const NAV_KEYS = ['home', 'blog', 'states', 'find', 'about', 'search'];

function render(meta, body, opts = {}) {
  const graph = [
    ...(opts.jsonld || [{ '@type': 'WebPage', name: meta.title, description: meta.description, url: SITE_URL + meta.path }]),
    ...(meta.trail && meta.trail.length ? [breadcrumbJsonLd(meta.trail, meta.path)] : []),
  ].filter(Boolean);
  const jsonld = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c');

  const replacements = {
    '{{TITLE}}': esc(meta.title),
    '{{DESCRIPTION}}': attr(meta.description),
    '{{CANONICAL}}': SITE_URL + meta.path,
    '{{ROBOTS}}': meta.noindex ? 'noindex, follow' : 'index, follow, max-image-preview:large, max-snippet:-1',
    '{{SITE_URL}}': SITE_URL,
    '{{OG_TYPE}}': meta.ogType || 'website',
    '{{BODY_CLASS}}': meta.bodyClass || 'page',
    '{{AD_CLIENT}}': AD_CLIENT,
    '{{HEAD_EXTRA}}': opts.headExtra || '',
    '{{SCRIPTS}}': opts.scripts || '',
    '{{JSONLD}}': jsonld,
    '{{YEAR}}': String(YEAR),
    '{{ASSET_VERSION}}': ASSET_VERSION,
    '{{SOCIAL_INSTAGRAM}}': SOCIAL.instagram,
    '{{SOCIAL_TWITTER}}': SOCIAL.twitter,
    '{{SOCIAL_FACEBOOK}}': SOCIAL.facebook,
  };
  for (const key of NAV_KEYS) replacements[`{{NAV_${key.toUpperCase()}}}`] = meta.nav === key ? ' aria-current="page"' : '';

  let html = template;
  for (const [token, value] of Object.entries(replacements)) html = html.split(token).join(value);
  // Content goes in last so a token-like string inside page text is never expanded.
  return html.replace('{{CONTENT}}', () => layoutContent(meta, body));
}

/* ------------------------------------------------------------- page files */

function readPageFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.html'))
    .map((e) => {
      const raw = readFileSync(join(dir, e.name), 'utf8');
      const match = raw.match(/^<!--meta\s*([\s\S]*?)-->\s*/);
      if (!match) throw new Error(`Missing <!--meta --> block in ${join(dir, e.name)}`);
      return { file: basename(e.name, '.html'), meta: JSON.parse(match[1]), body: raw.slice(match[0].length) };
    });
}

/* =================================================================== BUILD */

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

const sitemap = [];
const addToSitemap = (path, priority, lastmod = BUILD_DATE) => sitemap.push({ path, priority, lastmod });
const pageIndex = []; // { path, title, group } for the HTML sitemap

/* --- blog ---------------------------------------------------------------- */

const posts = readPageFiles(join(SRC, 'pages/blog'))
  .map((p) => ({ ...p, path: postPath(p.meta.slug) }))
  .sort((a, b) => (b.meta.date || '').localeCompare(a.meta.date || '') || a.meta.title.localeCompare(b.meta.title));
const postBySlug = new Map(posts.map((p) => [p.meta.slug, p]));
// Hand-written informational guides. Generated list posts are added to
// `posts` further down; places that should only show guides use this.
const guidePosts = posts.slice();

/* Guides surfaced on hub pages. Informational only, so they support the
   hubs without competing with them for "ice skating near me". */
const HUB_GUIDES = ['how-to-ice-skate-for-beginners', 'what-to-wear-ice-skating', 'public-skating-sessions-explained', 'ice-skating-with-kids']
  .map((s) => postBySlug.get(s))
  .filter(Boolean);

function guideLinks(list = HUB_GUIDES) {
  if (!list.length) return '';
  return `<ul class="guide-list">
${list.map((p) => `  <li><a href="${p.path}">${esc(p.meta.h1 || p.meta.title)}</a><span>${esc(p.meta.excerpt || '')}</span></li>`).join('\n')}
</ul>`;
}

const dateLabelFor = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

/* Blog covers: a post can set "image" in its front matter; otherwise it
   gets one of the photo crops from the homepage video, picked by slug. */
const postImage = (p) => p.meta.image || `/assets/img/photos/cover-${(seededHash(p.meta.slug) % 6) + 1}.jpg`;

function autoToc(bodyHtml) {
  const heads = [];
  const withIds = bodyHtml.replace(/<h2>([\s\S]*?)<\/h2>/g, (m, inner) => {
    const id = slugify(stripTags(inner));
    heads.push({ id, text: stripTags(inner) });
    return `<h2 id="${id}">${inner}</h2>`;
  });
  const toc = heads.length >= 3
    ? `<nav class="toc" aria-label="On this page"><p class="toc-title">On this page</p><ol>${heads.map((h) => `<li><a href="#${h.id}">${esc(h.text)}</a></li>`).join('')}</ol></nav>`
    : '';
  return { toc, html: withIds };
}

for (const post of guidePosts) {
  const { meta } = post;
  const path = post.path;
  const faqItems = meta.faq || [];
  const { toc, html } = autoToc(post.body);
  const related = guidePosts.filter((p) => p !== post).sort((a, b) => seededHash(meta.slug + a.meta.slug) - seededHash(meta.slug + b.meta.slug)).slice(0, 3);
  const pageMeta = {
    ...meta,
    path,
    layout: 'prose',
    nav: 'blog',
    ogType: 'article',
    trail: [{ label: 'Blog', href: '/blog/' }, { label: meta.h1 || meta.title }],
  };
  const dateLabel = new Date(`${meta.date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  const body = `<figure class="post-hero"><img src="${postImage(post)}" alt="" width="800" height="500" fetchpriority="high"></figure>
<p class="byline">By the <a href="/about/">${SITE_NAME} Editorial Team</a> <span aria-hidden="true">&middot;</span> <time datetime="${meta.date}">${dateLabel}</time> <span aria-hidden="true">&middot;</span> ${esc(meta.readingTime || '')}</p>
${toc}
${injectArticleAds(html)}
${faqBlock(faqItems)}
${related.length ? `<aside class="related"><h2>Keep reading</h2>${guideLinks(related)}</aside>` : ''}`;
  const jsonld = [
    {
      '@type': 'BlogPosting',
      headline: meta.h1 || meta.title,
      description: meta.description,
      datePublished: meta.date,
      dateModified: meta.updated || meta.date,
      mainEntityOfPage: SITE_URL + path,
      image: SITE_URL + postImage(post),
      author: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
      publisher: { '@type': 'Organization', name: SITE_NAME, logo: { '@type': 'ImageObject', url: `${SITE_URL}/assets/img/icon-512.png` } },
    },
    faqJsonLd(faqItems),
  ];
  writePage(path, render(pageMeta, body, { jsonld }));
  addToSitemap(path, '0.6', meta.updated || meta.date);
  pageIndex.push({ path, title: meta.h1 || meta.title, group: 'Guides' });
}

/* --- generated "[x] Best [type] in [State] [Year] List" posts -------------
   One post per state for all rinks, plus one per rink type that has at
   least LIST_POST_MIN tagged rinks in that state. Title tag and H1 are the
   same string. URLs leave out the count and year so they stay stable as
   the data and the calendar change. Wheelchair access is skipped: nearly
   every rink carries it, so its list would duplicate the all-rinks one. */
const LIST_POST_MIN = 3;
const LIST_POST_MAX = 10;
const LIST_TYPES = [
  { noun: 'Ice Skating Rinks', filter: () => true, cat: null },
  ...categories.filter((c) => c.postNoun).map((c) => ({ noun: c.postNoun, filter: (l) => hasFeature(l, c), cat: c })),
];
const listPostsByState = new Map(); // stateName -> [post]
const LIST_DATE = DATA_DATE || BUILD_DATE;

const listPlans = [];
for (const stateName of stateNames) {
  for (const type of LIST_TYPES) {
    const all = rank(byState.get(stateName).filter(type.filter));
    if (all.length < LIST_POST_MIN) continue;
    const top = all.slice(0, LIST_POST_MAX);
    const title = `${top.length} Best ${type.noun} in ${stateName} ${YEAR} List`;
    const slug = `best-${slugify(type.noun)}-in-${stateSlug(stateName)}`;
    const lower = type.noun.toLowerCase();
    const post = {
      file: slug,
      generated: true,
      path: postPath(slug),
      meta: {
        slug,
        title,
        h1: title,
        date: LIST_DATE,
        excerpt: `The ${top.length} best ${lower} in ${stateName}, ranked by Google rating and review volume: ${joinNatural(top.slice(0, 3).map((l) => l.name))}${top.length > 3 ? ' and more' : ''}.`,
        description: fitDescription(
          [
            `The ${top.length} best ${lower} in ${stateName} for ${YEAR}, ranked by Google reviews: ${top[0].name}, ${top[1].name} and more, with hours and directions.`,
            `The ${top.length} best ${lower} in ${stateName} for ${YEAR}, ranked by Google reviews: ${top[0].name} and more, with hours and directions.`,
            `The ${top.length} best ${lower} in ${stateName} for ${YEAR}, ranked by Google rating and reviews, with hours, phone numbers, addresses and directions.`,
          ],
          ['Updated for the season.', 'Check hours before you go.']
        ),
      },
      stateName,
      type,
      all,
      top,
    };
    listPlans.push(post);
    if (!listPostsByState.has(stateName)) listPostsByState.set(stateName, []);
    listPostsByState.get(stateName).push(post);
  }
}

for (const post of listPlans) {
  const { meta, stateName, type, all, top } = post;
  const lower = type.noun.toLowerCase();
  const x = top.length;
  const n = all.length;
  const stateItems = byState.get(stateName);
  const typePage = type.cat ? findPageFor(type.cat, stateName) : null;
  const sunday = top.filter((l) => l.hours && l.hours.sunday && !isClosed(l.hours.sunday));
  const cities = new Set(all.map((l) => l.city)).size;
  const siblings = (listPostsByState.get(stateName) || []).filter((p) => p !== post);

  const faqItems = [
    top[0].rating
      ? { q: `What is the best place for ${lower} in ${stateName}?`, a: `${top[0].name} in ${top[0].city} ranks first, with a ${top[0].rating.toFixed(1)} Google rating from ${num(top[0].reviews || 0)} ${plural(top[0].reviews || 0, 'review', 'reviews')}.` }
      : null,
    { q: `How many ${lower} are there in ${stateName}?`, a: `We list ${n} in ${cities} ${plural(cities, 'city', 'cities')} across ${stateName}. This post covers the top ${x}; the full list is on our ${stateName} page.` },
    {
      q: `Which of these are open on Sundays?`,
      a: sunday.length
        ? `${sunday.length} of the ${x} list Sunday hours on Google: ${joinNatural(sunday.slice(0, 4).map((l) => l.name))}${sunday.length > 4 ? ' and others' : ''}. Public session times inside those hours vary, so check each rink's schedule.`
        : `None of the ${x} rinks on this list show Sunday hours on Google right now. Hours change with the season, so check with the rink directly.`,
    },
    { q: 'How did you rank these?', a: `By Google rating weighted by review volume, as of ${DATA_DATE_LABEL}. A rink with hundreds of consistent reviews outranks one with a few perfect scores. No rink pays to be listed or ranked.` },
  ].filter(Boolean);

  const bodyHtml = `<p>${n > x
    ? `We list ${n} ${lower} in ${esc(stateName)}. These are the ${x} with the strongest Google ratings once review volume is taken into account`
    : `We list ${n} ${lower} in ${esc(stateName)}, and all ${n} are here, ranked by Google rating with review volume taken into account`}, so a rink with hundreds of consistent reviews outranks one with a handful of perfect scores. Every entry shows the hours, address, phone number and website from the rink's own Google listing as of ${DATA_DATE_LABEL}.</p>
<p>${n > x ? `Want every option, not just the top ${x}?` : 'Want to compare them with the rest?'} See <a href="${statePath(stateName)}">all ${stateItems.length} ice rinks in ${esc(stateName)}</a>${typePage && n > x ? `, or <a href="${typePage}">all ${n} ${esc(lower)} in ${esc(stateName)}</a>` : ''}, ranked the same way with filters and a map.</p>
<h2>The list at a glance</h2>
<ol class="glance-list">
${top.map((l) => `  <li><a href="#${attr(l.anchor)}">${esc(l.name)}</a> <span>${esc(l.city)}${l.rating ? ` &middot; ${l.rating.toFixed(1)}` : ''}</span></li>`).join('\n')}
</ol>
<h2>The ${x} best ${esc(lower)} in ${esc(stateName)}</h2>
${entryList(top, { stateName, peers: stateItems, detail: true })}
<h2>How we ranked them</h2>
<p>Each rink's position comes from its Google rating, weighted by how many reviews sit behind it. A 4.7 from several hundred skaters is a steadier signal than a 5.0 from three, so it ranks higher. Rinks with no rating at all come last.</p>
<p>${type.cat ? `A rink appears here when its own Google listing says it offers this, so the list is a starting point rather than the full picture. A rink that offers it without saying so will not show up.` : `The list covers public ice venues of every kind: indoor arenas, outdoor and seasonal rinks, and community rinks. Clubs, coaches and rink service companies are left out.`} Nobody pays to be listed or ranked.</p>
<h2>Before you go</h2>
<p>Rinks share their ice between public skating, hockey, figure skating and lessons, so a rink can be open all day with only a few hours of public skate. Check the session calendar on the rink's website or call ahead, especially on holidays and school breaks.</p>
<p>New to the ice? Read <a href="/blog/how-to-ice-skate-for-beginners/">how to ice skate for the first time</a>, <a href="/blog/what-to-wear-ice-skating/">what to wear</a> and <a href="/blog/how-should-ice-skates-fit/">how skates should fit</a>.</p>
${faqBlock(faqItems)}
<h2>More ${esc(stateName)} ice skating lists</h2>
<ul class="plain-links">
${siblings.map((p) => `  <li><a href="${p.path}">${esc(p.meta.h1)}</a></li>`).join('\n')}
  <li><a href="${statePath(stateName)}">All ${stateItems.length} ice rinks in ${esc(stateName)}</a></li>
  <li><a href="${mapStatePath(stateName)}">Map of ${esc(stateName)} ice rinks</a></li>
</ul>`;

  const words = stripTags(bodyHtml).split(/\s+/).filter(Boolean).length;
  meta.readingTime = `${Math.max(2, Math.round(words / 230))} min read`;
  const { toc, html } = autoToc(bodyHtml);
  const pageMeta = {
    ...meta,
    path: post.path,
    layout: 'prose',
    nav: 'blog',
    ogType: 'article',
    trail: [{ label: 'Blog', href: '/blog/' }, { label: stateName, href: statePath(stateName) }, { label: meta.h1 }],
  };
  const body = `<figure class="post-hero"><img src="${postImage(post)}" alt="" width="800" height="500" fetchpriority="high"></figure>
<p class="byline">By the <a href="/about/">${SITE_NAME} Editorial Team</a> <span aria-hidden="true">&middot;</span> <time datetime="${meta.date}">${dateLabelFor(meta.date)}</time> <span aria-hidden="true">&middot;</span> ${meta.readingTime}</p>
${toc}
${injectArticleAds(html)}`;
  const jsonld = [
    {
      '@type': 'BlogPosting',
      headline: meta.h1,
      description: meta.description,
      datePublished: meta.date,
      dateModified: meta.date,
      mainEntityOfPage: SITE_URL + post.path,
      image: SITE_URL + postImage(post),
      author: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
      publisher: { '@type': 'Organization', name: SITE_NAME, logo: { '@type': 'ImageObject', url: `${SITE_URL}/assets/img/icon-512.png` } },
    },
    itemListJsonLd(top),
    faqJsonLd(faqItems),
  ];
  writePage(post.path, render(pageMeta, body, { jsonld, scripts: listToolScripts() }));
  addToSitemap(post.path, '0.6', meta.date);
  pageIndex.push({ path: post.path, title: meta.h1, group: 'Lists' });
  posts.push(post);
}
posts.sort((a, b) => (b.meta.date || '').localeCompare(a.meta.date || '') || a.meta.title.localeCompare(b.meta.title));


function blogCards(list) {
  if (!list.length) return '<p>Guides are on the way.</p>';
  return `<div class="post-grid">
${list.map((p) => `  <article class="card post-card">
    <a class="card-media" href="${p.path}" tabindex="-1" aria-hidden="true"><img src="${postImage(p)}" alt="" width="800" height="500" loading="lazy" decoding="async"></a>
    <div class="card-body">
      <p class="eyebrow">Guide <span aria-hidden="true">&middot;</span> ${esc(p.meta.readingTime || '')}</p>
      <h3><a href="${p.path}">${esc(p.meta.h1 || p.meta.title)}</a></h3>
      <p>${esc(p.meta.excerpt || '')}</p>
    </div>
  </article>`).join('\n')}
</div>`;
}

/* Blog hub: one row per guide, newest first, paginated. */
const BLOG_PAGE_SIZE = 24;
const blogPagePath = (n) => (n === 1 ? '/blog/' : `/blog/page/${n}/`);

function blogRows(list) {
  if (!list.length) return '<p>Guides are on the way.</p>';
  return `<ol class="post-rows">
${list.map((p) => `  <li class="post-row">
    <h2><a href="${p.path}">${esc(p.meta.h1 || p.meta.title)}</a></h2>
    <p class="post-row-meta">By the <a href="/about/">${SITE_NAME} Editorial Team</a> <span aria-hidden="true">&middot;</span> <time datetime="${p.meta.date}">${dateLabelFor(p.meta.date)}</time> <span aria-hidden="true">&middot;</span> ${esc(p.meta.readingTime || '')}</p>
    <p class="post-row-excerpt">${esc(p.meta.excerpt || '')}</p>
    <a class="pill-link" href="${p.path}" aria-label="Read the guide: ${attr(p.meta.h1 || p.meta.title)}">Read the guide</a>
  </li>`).join('\n')}
</ol>`;
}

function blogPager(n, pages) {
  if (pages < 2) return '';
  return `<nav class="pager" aria-label="Blog pages">
  ${n > 1 ? `<a class="btn btn-outline btn-sm" href="${blogPagePath(n - 1)}" rel="prev">Newer</a>` : '<span></span>'}
  <span class="pager-label">Page ${n} of ${pages}</span>
  ${n < pages ? `<a class="btn btn-outline btn-sm" href="${blogPagePath(n + 1)}" rel="next">Older</a>` : '<span></span>'}
</nav>`;
}

/** Outline tiles for all 50 states and DC; states without listings yet are
 *  shown but not linked. */
function stateTiles() {
  return `<ul class="state-tiles">
${Object.values(STATES).sort().map((s) => {
    const n = byState.has(s) ? byState.get(s).length : 0;
    const inner = `<img src="/assets/img/states/${stateSlug(s)}.svg" alt="" width="64" height="64" loading="lazy"><b>${esc(s)}</b><span>${n ? `${n} ${plural(n, 'rink', 'rinks')}` : 'Coming soon'}</span>`;
    return `  <li>${n ? `<a class="state-tile" href="${statePath(s)}">${inner}</a>` : `<div class="state-tile is-empty">${inner}</div>`}</li>`;
  }).join('\n')}
</ul>`;
}

/* --- state hubs: the money pages ---------------------------------------- */

function stateFaq(stateName, items) {
  const out = [];
  const cities = citiesInState(stateName);
  out.push({
    q: `How many ice rinks are in ${stateName}?`,
    a: `We list ${items.length} ice ${plural(items.length, 'rink', 'rinks')} in ${stateName} across ${cities.length} ${plural(cities.length, 'city', 'cities')}.${cities.length > 1 ? ` ${cities[0].city} has the most, with ${cities[0].items.length}.` : ''} Rinks that have closed permanently are left out.`,
  });
  const top = items[0];
  if (top && top.rating) {
    out.push({
      q: `What is the best ice skating rink in ${stateName}?`,
      a: `${top.name} in ${top.city} ranks first on our list, with a ${top.rating.toFixed(1)} Google rating from ${num(top.reviews || 0)} ${plural(top.reviews || 0, 'review', 'reviews')}. Rankings weigh rating by review volume, so the order reflects how consistently a rink is rated, not one perfect score.`,
    });
  }
  const withHours = items.filter((l) => l.hours);
  if (withHours.length) {
    const sunday = withHours.filter((l) => l.hours.sunday && !isClosed(l.hours.sunday));
    out.push({
      q: `Which ${stateName} ice rinks are open on Sundays?`,
      a: sunday.length
        ? `${sunday.length} of the ${items.length} rinks list Sunday hours, including ${joinNatural(sunday.slice(0, 3).map((l) => l.name))}. Public skate sessions inside those hours vary, so check each rink's session schedule.`
        : `None of the rinks we list in ${stateName} show Sunday hours on their Google listing right now. Hours change with the season, so check with the rink directly.`,
    });
  }
  for (const [slug, q] of [['outdoor-ice-rinks', `Are there outdoor ice rinks in ${stateName}?`], ['ice-skating-lessons', `Where can I take ice skating lessons in ${stateName}?`]]) {
    const cat = categories.find((c) => c.slug === slug);
    const matches = items.filter((l) => hasFeature(l, cat));
    out.push({
      q,
      a: matches.length
        ? `${matches.length} ${plural(matches.length, cat.singular, cat.plural)} in ${stateName} ${plural(matches.length, 'says', 'say')} so in ${plural(matches.length, 'its', 'their')} own listing, including ${joinNatural(matches.slice(0, 3).map((l) => `${l.name} in ${l.city}`))}.`
        : `None of the ${items.length} rinks we list in ${stateName} mention this in their own listing text. That does not rule it out, so ask the rinks nearest you directly.`,
    });
  }
  out.push({
    q: 'Are the hours on this page up to date?',
    a: `They come from each rink's public Google listing as of ${DATA_DATE_LABEL}. Rinks share ice between public skating, hockey, lessons and events, so session times change week to week. Confirm with the rink before you go.`,
  });
  return out;
}

const STATE_FILLERS = [`Updated ${YEAR}.`, 'Free to use.', 'Check hours before you go.', 'Plan your next skate.', 'Find public skate times.', 'Indoor and outdoor rinks.', 'Updated for the season.'];

for (const stateName of stateNames) {
  const items = byState.get(stateName);
  const n = items.length;
  const code = codeOf(stateName);
  const path = statePath(stateName);
  const cities = citiesInState(stateName);
  const ratedItems = items.filter((l) => l.rating);
  const avg = ratedItems.length ? ratedItems.reduce((s, l) => s + l.rating, 0) / ratedItems.length : null;
  const withHours = items.filter((l) => l.hours).length;
  const rinkWord = plural(n, 'Rink', 'Rinks');

  const meta = {
    path,
    title: fitTitle(
      n >= 3 ? `Ice Skating Near Me: ${n} Best Rinks in ${stateName} (${YEAR})` : `Ice Skating Near Me: ${n} ${rinkWord} in ${stateName} (${YEAR})`,
      `Ice Skating Near Me: ${n} ${rinkWord} in ${stateName}`,
      `Ice Skating Near Me in ${stateName}`,
      `Ice Skating Near Me: ${code} Rinks`
    ),
    description: fitDescription(
      `Find ice skating near you: ${n} ${plural(n, 'rink', 'rinks')} in ${stateName} ranked by real Google reviews, with hours, phone numbers and addresses.`,
      STATE_FILLERS
    ),
    h1: `${n} Ice ${rinkWord} Near Me in ${stateName}`,
    lede: `Every ice rink we list in ${esc(stateName)}, ranked by rating and review volume across ${cities.length} ${plural(cities.length, 'city', 'cities')}. Search by name or city, or filter by type. Always confirm session times before you drive out, since public skating shares the ice with hockey, lessons and events.`,
    layout: 'wide',
    nav: 'states',
    trail: [{ label: 'States', href: '/states/' }, { label: stateName }],
  };

  const neighbors = (STATE_NEIGHBORS[code] || []).map((c) => STATES[c]).filter((s) => byState.has(s));
  const faqItems = stateFaq(stateName, items);
  const sundayCount = items.filter((l) => l.hours && l.hours.sunday && !isClosed(l.hours.sunday)).length;
  const countOf = (slug) => featureCount(items, categories.find((c) => c.slug === slug));
  const outdoorish = items.filter((l) => (l.features || []).some((f) => f === 'Outdoor rink' || f === 'Seasonal rink')).length;

  const photos = items.filter((l) => l.photo).slice(0, 8);
  const stateGuides = [...(listPostsByState.get(stateName) || []), ...guidePosts.slice(0, 6)];

  const body = `${listTools(items, stateName)}
<div class="list-view" data-view="list">
  ${entryList(items, { stateName })}
  <p class="empty-state" data-empty hidden><strong>No rinks match.</strong> Try a different search or <button type="button" class="btn-link" data-reset>reset the filters</button>.</p>
</div>
<div class="map-view" data-view="map" hidden>${mapEmbed(items, { lazy: true })}</div>
${renderAdSlot('display')}

<section class="hub-block" aria-labelledby="by-city">
  <h2 id="by-city">Ice rinks by city in ${esc(stateName)}</h2>
  <p>Pick a city to see just the rinks there.</p>
  <ul class="state-list city-list">
${cities.map(({ city, items: ci }) => `    <li><a href="${cityPath(stateName, city)}"><span>${esc(city)}</span><span class="state-list-n">${ci.length}</span></a></li>`).join('\n')}
  </ul>
</section>
${stateGuides.length ? `<section class="hub-block" aria-labelledby="guides">
  <h2 id="guides">${esc(stateName)} ice skating guides</h2>
  <ul class="plain-links">
${stateGuides.map((p) => `    <li><a href="${p.path}">${esc(p.meta.h1 || p.meta.title)}</a></li>`).join('\n')}
  </ul>
</section>` : ''}
<section class="hub-block prose" aria-labelledby="planning">
  <h2 id="planning">Planning an ice skating trip in ${esc(stateName)}</h2>
  <p>Most rinks split their ice between public skating, hockey, figure skating and lessons, so a rink can be open all day with only a few hours of public skate. Of the ${n} ${plural(n, 'rink', 'rinks')} we list in ${esc(stateName)}, ${withHours} publish opening hours on Google and ${sundayCount} list Sunday hours. Use those as a starting point, then check the rink's own session calendar.</p>
  <p>${outdoorish ? `${outdoorish} ${esc(stateName)} ${plural(outdoorish, 'listing describes itself', 'listings describe themselves')} as outdoor or seasonal. Outdoor ice depends on the weather, so check for closures on mild or rainy days.` : `None of the rinks we list in ${esc(stateName)} describe themselves as outdoor or seasonal, so plan on indoor ice. Indoor rinks stay cold, so bring layers even in summer.`} ${countOf('skate-rentals') ? `${countOf('skate-rentals')} ${plural(countOf('skate-rentals'), 'rink mentions', 'rinks mention')} skate rental in ${plural(countOf('skate-rentals'), 'its', 'their')} listing.` : 'Most public rinks rent skates, but call ahead if you need a particular size.'}</p>
  <p>Bring gloves, wear warm layers you can move in, and arrive a little early on weekends, when public sessions fill fastest. New to the ice? Read <a href="/blog/how-to-ice-skate-for-beginners/">how to ice skate for the first time</a> before you go.</p>
  <p><a class="btn btn-outline" href="${mapStatePath(stateName)}">Search the ${esc(stateName)} map</a></p>
</section>
${photos.length ? `<section class="hub-block" aria-labelledby="photos">
  <h2 id="photos">Photos from ice rinks in ${esc(stateName)}</h2>
  <div class="photo-grid">${photos.map((l) => `<a href="${l.url}" title="${attr(l.name)}">${listingImage(l, { size: 'card' })}</a>`).join('')}</div>
  <p class="data-note">Photos from each rink's Google Maps listing.</p>
</section>` : ''}
${neighbors.length ? `<section class="hub-block" aria-labelledby="nearby-states">
  <h2 id="nearby-states">Ice skating in nearby states</h2>
  <ul class="state-list">
${neighbors.map((st) => `    <li><a href="${statePath(st)}"><span>${esc(st)}</span><span class="state-list-n">${byState.get(st).length}</span></a></li>`).join('\n')}
  </ul>
</section>` : ''}
<div class="prose">
  ${faqBlock(faqItems, `${stateName} ice skating FAQs`)}
  <p class="data-note">Listing data from public Google business profiles, last updated ${DATA_DATE_LABEL}. Spotted something wrong? <a href="/contact/">Tell us</a> and we will fix it.</p>
</div>`;

  const jsonld = [
    { '@type': 'CollectionPage', name: meta.title, description: meta.description, url: SITE_URL + path, dateModified: DATA_DATE },
    itemListJsonLd(items),
    faqJsonLd(faqItems),
  ];
  writePage(path, render(meta, body, { jsonld, scripts: listToolScripts() }));
  addToSitemap(path, '0.9', DATA_DATE);
  pageIndex.push({ path, title: `Ice skating in ${stateName}`, group: 'States' });

  // /<state>/ is the natural parent of /<state>/<city>/; send anyone who
  // trims the URL to the state hub instead of a 404.
  const stub = `/${stateSlug(stateName)}/`;
  writePage(stub, `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Ice skating in ${esc(stateName)}</title><link rel="canonical" href="${SITE_URL}${path}"><meta name="robots" content="noindex, follow"><meta http-equiv="refresh" content="0; url=${path}"></head><body><p><a href="${path}">Ice skating in ${esc(stateName)}</a></p></body></html>`);
}

/* --- city pages ----------------------------------------------------------- */

for (const [key, items] of byCity) {
  const [stateName, cityName] = key.split('|');
  const code = codeOf(stateName);
  const n = items.length;
  const path = cityPath(stateName, cityName);
  const rinkWord = plural(n, 'Rink', 'Rinks');
  const near = nearbyCities(stateName, cityName, 10);
  const here = centroid(items);
  const nearbyOther = nearestListings(here.lat, here.lng, 6, new Set(items.map((l) => l.slug)), 40);

  const meta = {
    path,
    title: fitTitle(
      `Ice Skating in ${cityName}, ${code}: ${n} ${rinkWord} (${YEAR})`,
      `Ice Skating in ${cityName}, ${code}: ${n} ${rinkWord}`,
      `Ice Skating in ${cityName}, ${code}`,
      `${cityName} Ice Rinks`
    ),
    description: fitDescription(
      `Ice skating in ${cityName}, ${code}: ${n} ${plural(n, 'rink', 'rinks')} ranked by Google reviews, with hours, phone numbers, addresses and directions.`,
      ['Plus nearby towns.', `Updated ${YEAR}.`, 'Free to use.', 'Check hours before you go.', 'Find public skate times.', 'Updated for the season.']
    ),
    h1: n > 1 ? `Ice Skating in ${cityName}, ${code}: ${n} Rinks Ranked` : `Ice Skating in ${cityName}, ${code}`,
    lede: n > 1
      ? `The ${n} ice rinks we list in ${esc(cityName)}, ranked by Google rating weighted by review volume, with hours, contact details and directions.`
      : `The ice rink we list in ${esc(cityName)}, with hours, contact details and directions, plus the closest rinks in nearby towns.`,
    layout: 'wide',
    nav: 'states',
    trail: [{ label: 'States', href: '/states/' }, { label: stateName, href: statePath(stateName) }, { label: cityName }],
  };

  const cityFaq = [];
  if (items[0].rating && n > 1) {
    cityFaq.push({ q: `What is the best ice rink in ${cityName}?`, a: `${items[0].name} ranks first here, with a ${items[0].rating.toFixed(1)} Google rating from ${num(items[0].reviews || 0)} ${plural(items[0].reviews || 0, 'review', 'reviews')}.` });
  }
  cityFaq.push({
    q: `How many ice rinks are in ${cityName}, ${code}?`,
    a: `We list ${n} ${plural(n, 'rink', 'rinks')} with a ${cityName} address.${nearbyOther.length ? ` The nearest one outside the city is ${nearbyOther[0].l.name} in ${nearbyOther[0].l.city}, about ${Math.max(1, Math.round(nearbyOther[0].miles))} miles away.` : ''}`,
  });
  cityFaq.push({ q: 'Are these hours current?', a: `They come from each rink's Google listing as of ${DATA_DATE_LABEL}. Public session times change often, so check with the rink before you go.` });

  const body = `${stateFilterChips(byState.get(stateName), stateName)}
${listSection(items, { peers: byState.get(stateName), stateName, headingTag: 'h2', showCity: false })}
<p class="crumb-links"><a href="${statePath(stateName)}">All ${byState.get(stateName).length} rinks in ${esc(stateName)}</a> <span aria-hidden="true">&middot;</span> <a href="${mapStatePath(stateName)}">Map of ${esc(stateName)} rinks</a></p>
${renderAdSlot('display')}
${nearbyOther.length ? `<h2>More rinks within driving distance</h2>
<div class="card-grid">
${nearbyOther.map((x) => renderCard(x.l, { miles: x.miles })).join('\n')}
</div>` : ''}
${near.length ? `<h2>Ice skating in nearby cities</h2>
<ul class="link-grid">
${near.map((c) => `  <li><a href="${cityPath(stateName, c.city)}">${esc(c.city)}</a> <span>${c.items.length}</span></li>`).join('\n')}
</ul>` : ''}
<div class="prose">
  ${faqBlock(cityFaq)}
  <p class="data-note">Listing data from public Google business profiles, last updated ${DATA_DATE_LABEL}. <a href="/contact/">Report a correction</a>.</p>
</div>`;

  const jsonld = [
    { '@type': 'CollectionPage', name: meta.title, description: meta.description, url: SITE_URL + path, dateModified: DATA_DATE },
    itemListJsonLd(items),
    faqJsonLd(cityFaq),
  ];
  writePage(path, render(meta, body, { jsonld, scripts: listToolScripts() }));
  addToSitemap(path, '0.7', DATA_DATE);
}

/* --- listing pages -------------------------------------------------------- */

const nameCityCounts = new Map();
for (const l of listings) {
  const k = `${l.name.toLowerCase()}|${l.city}|${l.state}`;
  nameCityCounts.set(k, (nameCityCounts.get(k) || 0) + 1);
}

function ratingBars(l) {
  const r = l.reviewsPerScore;
  if (!r) return '';
  const total = [1, 2, 3, 4, 5].reduce((s, k) => s + (r[k] || 0), 0);
  if (!total) return '';
  return `<div class="rating-bars" aria-label="Google rating breakdown">
${[5, 4, 3, 2, 1].map((k) => `  <div class="bar-row"><span>${k} star</span><span class="bar"><span style="width:${((r[k] || 0) / total * 100).toFixed(1)}%"></span></span><span>${num(r[k] || 0)}</span></div>`).join('\n')}
</div>`;
}

for (const l of listings) {
  const path = l.url;
  const place = `${l.city}, ${l.stateCode}`;
  const dupe = nameCityCounts.get(`${l.name.toLowerCase()}|${l.city}|${l.state}`) > 1;
  const where = dupe && l.street ? `${l.street}, ${place}` : place;
  const peers = byState.get(l.state);
  const cityItems = byCity.get(`${l.state}|${l.city}`);
  const nearby = nearestListings(l.lat, l.lng, 6, new Set([l.slug]), 60);

  const meta = {
    path,
    title: fitTitle(`${l.name}, ${where}: Hours & Reviews`, `${l.name}, ${where}: Hours`, `${l.name}, ${where}`, `${l.name}, ${l.stateCode}`, l.name),
    description: fitDescription(
      [
        `${l.name} in ${where}: ${l.hours ? 'opening hours, ' : ''}${l.rating ? `${l.rating.toFixed(1)}-star rating from ${num(l.reviews || 0)} Google ${plural(l.reviews || 0, 'review', 'reviews')}` : 'Google listing'}, address, phone and directions.`,
        `${l.name}, ${where}: ${l.hours ? 'hours, ' : ''}${l.rating ? `${l.rating.toFixed(1)}-star Google rating` : 'Google listing'}, address, phone and directions.`,
        `${l.name}, ${l.stateCode}: ${l.hours ? 'hours, ' : ''}rating, address and directions.`,
        `${l.name}: hours, rating and directions.`,
      ],
      ['Plus nearby ice rinks.', 'Check before you skate.', `Updated ${YEAR}.`]
    ),
    h1: l.name,
    lede: `${cap(venueNoun(l))} in ${esc(place)}`,
    layout: 'wide',
    nav: 'states',
    ogType: 'place',
    trail: [
      { label: 'States', href: '/states/' },
      { label: l.state, href: statePath(l.state) },
      { label: l.city, href: cityPath(l.state, l.city) },
      { label: l.name },
    ],
  };

  const address = l.fullAddress || [l.street, place, l.postalCode].filter(Boolean).join(', ');
  const hoursTable = l.hours
    ? `<table class="hours-table"><tbody>${DAYS.map((d) => `<tr><th scope="row">${cap(d)}</th><td>${l.hours[d] ? esc(l.hours[d]) : '<span class="missing">Not listed</span>'}</td></tr>`).join('')}</tbody></table>`
    : '<p class="missing">Opening hours are not listed for this rink. Call or check its website before you go.</p>';
  const attrs = l.about ? Object.entries(l.about).filter(([g]) => !/^payments?$/i.test(g)) : [];
  const payments = l.about ? Object.entries(l.about).filter(([g]) => /^payments?$/i.test(g)).flatMap(([, v]) => v) : [];

  const faqItems = [
    { q: `Where is ${l.name}?`, a: l.street || l.fullAddress ? `${l.name} is at ${address}.` : `${l.name} is in ${place}. Its street address is not listed in our data, so use the directions link or the map to find it.` },
    {
      q: `What are ${l.name}'s hours?`,
      a: l.hours
        ? `Its Google listing shows: ${groupedHours(l.hours).map((g) => `${g.label} ${g.value}`).join('; ')}. Public skate sessions run within those hours and change often, so check the rink's schedule.`
        : `Hours are not listed for ${l.name}. Call the rink or check its website before you go.`,
    },
    { q: `What is ${l.name}'s phone number?`, a: l.phone ? `The listed phone number is ${l.phone}.` : `No phone number is listed for ${l.name}.` },
    {
      q: `How is ${l.name} rated?`,
      a: l.rating ? `${l.rating.toFixed(1)} out of 5 on Google, from ${num(l.reviews || 0)} ${plural(l.reviews || 0, 'review', 'reviews')} as of ${DATA_DATE_LABEL}.` : `${l.name} has no Google rating on file yet.`,
    },
  ];

  const body = `<div class="detail-grid">
  <div class="detail-main">
    <figure class="detail-hero">
      ${listingImage(l, { size: 'hero', className: 'detail-hero-img', eager: true })}
      <figcaption>${l.photo ? `Photo from ${esc(l.name)}'s Google Maps listing` : 'Illustration. No current photo is available for this rink.'}</figcaption>
    </figure>
    ${l.status === 'CLOSED_TEMPORARILY' ? `<div class="notice"><p><strong>Temporarily closed.</strong> Google currently marks ${esc(l.name)} as temporarily closed. Seasonal rinks often show this between seasons. Check with the rink before you go.</p></div>` : ''}
    <p class="entry-rating">${ratingHtml(l)}${l.reviews ? ` <span class="entry-reviews">${num(l.reviews)} Google ${plural(l.reviews, 'review', 'reviews')}</span>` : ''}</p>
    ${chipsHtml(l, l.state)}
    <h2>About ${esc(l.name)}</h2>
    <div class="prose">${summaryHtml(l, peers)}</div>
    ${renderAdSlot('display')}
    <h2>Hours of operation</h2>
    ${hoursTable}
    <p class="data-note">Hours from the rink's Google listing as of ${DATA_DATE_LABEL}. Public skate sessions, hockey and lessons share the ice, so confirm session times with the rink.</p>
    ${l.rating && l.reviewsPerScore ? `<h2>Rating breakdown</h2>\n    ${ratingBars(l)}` : ''}
    ${(l.reviewTags || []).length ? `<h2>What reviewers mention</h2>
    <p>Google groups reviews of ${esc(l.name)} by topic. These are the topics, not quotes:</p>
    <div class="chip-row">${l.reviewTags.map((t) => `<span class="chip chip-static">${esc(t)}</span>`).join('')}</div>` : ''}
    ${attrs.length || payments.length ? `<h2>From the Google listing</h2>
    <ul class="attr-list">
${attrs.map(([g, v]) => `      <li><b>${esc(g)}:</b> ${esc(v.join(', '))}</li>`).join('\n')}
${payments.length ? `      <li><b>Payments:</b> ${esc(payments.join(', '))}</li>` : ''}
    </ul>` : ''}
    <div class="prose">${faqBlock(faqItems)}</div>
    ${nearby.length ? `<h2>Other ice rinks near ${esc(l.name)}</h2>
    <div class="card-grid">
${nearby.map((x) => renderCard(x.l, { miles: x.miles })).join('\n')}
    </div>` : ''}
    <p class="crumb-links">${cityItems.length > 1 ? `<a href="${cityPath(l.state, l.city)}">All ${cityItems.length} rinks in ${esc(l.city)}</a> <span aria-hidden="true">&middot;</span> ` : `<a href="${cityPath(l.state, l.city)}">Ice skating in ${esc(l.city)}</a> <span aria-hidden="true">&middot;</span> `}<a href="${statePath(l.state)}">All ${peers.length} rinks in ${esc(l.state)}</a>${(listPostsByState.get(l.state) || [])[0] ? ` <span aria-hidden="true">&middot;</span> <a href="${listPostsByState.get(l.state)[0].path}">${esc(listPostsByState.get(l.state)[0].meta.h1)}</a>` : ''} <span aria-hidden="true">&middot;</span> <a href="${mapStatePath(l.state)}?focus=${attr(l.slug)}">See it on the map</a></p>
  </div>
  <aside class="detail-side">
    <div class="card side-card">
      <h2 class="side-title">Visit ${esc(l.name)}</h2>
      <dl class="fact-list">
        ${contactFacts(l)}
        <div><dt>City</dt><dd><a href="${cityPath(l.state, l.city)}">${esc(l.city)}</a>, <a href="${statePath(l.state)}">${esc(l.state)}</a></dd></div>
        ${l.reviewsUrl ? `<div><dt>Reviews</dt><dd><a href="${attr(l.reviewsUrl)}" target="_blank" rel="nofollow noopener noreferrer">Read on Google</a></dd></div>` : ''}
      </dl>
      <a class="btn btn-primary btn-block" href="${attr(directionsUrl(l))}" target="_blank" rel="nofollow noopener noreferrer">Get directions</a>
      ${l.phone ? `<a class="btn btn-outline btn-block" href="tel:${attr(l.phone.replace(/[^\d+]/g, ''))}">Call the rink</a>` : ''}
    </div>
    <p class="side-note">Listing details come from public business data and can go out of date. <a href="/contact/">Report a correction</a>.</p>
  </aside>
</div>`;

  const hoursSpec = openingHoursSpec(l.hours);
  const jsonld = [
    {
      '@type': 'IceSkatingRink',
      '@id': `${SITE_URL}${path}#rink`,
      name: l.name,
      url: SITE_URL + path,
      ...(l.photo ? {} : { image: `${SITE_URL}/assets/img/og-image.jpg` }),
      address: {
        '@type': 'PostalAddress',
        ...(l.street ? { streetAddress: l.street } : {}),
        addressLocality: l.city,
        addressRegion: l.stateCode,
        ...(l.postalCode ? { postalCode: l.postalCode } : {}),
        addressCountry: 'US',
      },
      geo: { '@type': 'GeoCoordinates', latitude: l.lat, longitude: l.lng },
      ...(l.phone ? { telephone: l.phone } : {}),
      ...(l.website ? { sameAs: [l.website] } : {}),
      ...(l.mapsUrl ? { hasMap: l.mapsUrl } : {}),
      ...(hoursSpec && hoursSpec.length ? { openingHoursSpecification: hoursSpec } : {}),
      ...(l.rating && l.reviews ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: l.rating, reviewCount: l.reviews, bestRating: 5, worstRating: 1 } } : {}),
    },
    faqJsonLd(faqItems),
  ];
  writePage(path, render(meta, body, { jsonld }));
  addToSitemap(path, '0.6', DATA_DATE);
}

/* --- /find/ feature pages ------------------------------------------------- */

const findCounts = categories.map((c) => ({ c, n: featureCount(listings, c) }));

for (const { c: cat, n } of findCounts) {
  if (!n) continue;
  const items = rank(listings.filter((l) => hasFeature(l, cat)));
  const states = stateNames.map((s) => ({ s, n: featureCount(byState.get(s), cat) })).filter((x) => x.n);
  const path = findPath(cat);
  const top = items.slice(0, 25);
  const meta = {
    path,
    title: fitTitle(`${cat.name} Near Me: ${n} Ranked (${YEAR})`, `${cat.name} Near Me: ${n} Ranked`, `${cat.name} Near Me`),
    description: fitDescription(
      `Find ${cat.plural} near you: ${num(n)} across ${states.length} ${plural(states.length, 'state', 'states')}, ranked by Google reviews, with hours, phone numbers and directions.`,
      [`Updated ${YEAR}.`, 'Free to use.', 'Check hours before you go.', 'Browse by state.', 'Plan your next skate.']
    ),
    h1: `${cat.name} Near Me`,
    lede: esc(cat.intro),
    layout: 'wide',
    nav: 'find',
    trail: [{ label: 'Find', href: '/find/' }, { label: cat.name }],
  };
  const body = `<h2>${esc(cat.name)} by state</h2>
<ul class="link-grid">
${states.map(({ s, n: k }) => `  <li><a href="${findStatePath(cat, s)}">${esc(s)}</a> <span>${k}</span></li>`).join('\n')}
</ul>
${renderAdSlot('display')}
<h2>Top ${top.length} nationwide</h2>
${entryList(top, { peers: items })}
<p class="data-note">${esc(cap(cat.plural))} are tagged from each rink's own Google listing, so the list is incomplete by design: a rink that offers this without saying so in its listing will not appear. Data last updated ${DATA_DATE_LABEL}.</p>`;
  writePage(path, render(meta, body, { jsonld: [{ '@type': 'CollectionPage', name: meta.title, description: meta.description, url: SITE_URL + path }, itemListJsonLd(top)] }));
  addToSitemap(path, '0.6', DATA_DATE);
  pageIndex.push({ path, title: cat.name, group: 'Find by type' });

  for (const { s: stateName, n: k } of states) {
    const sItems = rank(byState.get(stateName).filter((l) => hasFeature(l, cat)));
    const code = codeOf(stateName);
    const sPath = findStatePath(cat, stateName);
    const sMeta = {
      path: sPath,
      title: fitTitle(`${cat.name} Near Me in ${stateName} (${YEAR})`, `${cat.name} Near Me in ${stateName}`, `${cat.name} in ${stateName}`, `${cat.name} in ${code}`),
      description: fitDescription(
        `${k} ${plural(k, cat.singular, cat.plural)} in ${stateName}, ranked by Google reviews, with hours, phone numbers, addresses and directions.`,
        [`Updated ${YEAR}.`, 'Free to use.', 'Check hours before you go.', 'Plan your next skate.', 'See every rink in the state too.', 'Find one near you.']
      ),
      h1: `${cat.name} in ${stateName}: ${k} Ranked`,
      lede: esc(cat.intro),
      layout: 'wide',
      nav: 'find',
      trail: [{ label: 'Find', href: '/find/' }, { label: cat.name, href: findPath(cat) }, { label: stateName }],
    };
    const sBody = `${stateFilterChips(byState.get(stateName), stateName, cat.slug)}
${listSection(sItems, { peers: byState.get(stateName), stateName, headingTag: 'h2' })}
${renderAdSlot('display')}
<p class="crumb-links"><a href="${findPath(cat)}">${esc(cat.name)} in other states</a></p>
<p class="data-note">Tagged from each rink's own Google listing, so this list may be incomplete. See <a href="${statePath(stateName)}">all ${byState.get(stateName).length} rinks in ${esc(stateName)}</a> for the full picture. Data last updated ${DATA_DATE_LABEL}.</p>`;
    writePage(sPath, render(sMeta, sBody, {
      jsonld: [{ '@type': 'CollectionPage', name: sMeta.title, description: sMeta.description, url: SITE_URL + sPath }, itemListJsonLd(sItems)],
      scripts: listToolScripts(),
    }));
    addToSitemap(sPath, '0.5', DATA_DATE);
  }
}

/* --- /map/<state>/ -------------------------------------------------------- */

for (const stateName of stateNames) {
  const items = byState.get(stateName);
  const path = mapStatePath(stateName);
  const meta = {
    path,
    title: fitTitle(`Map of Ice Rinks in ${stateName} (${YEAR})`, `Map of Ice Rinks in ${stateName}`, `${stateName} Ice Rink Map`),
    description: fitDescription(
      `Interactive map of all ${items.length} ice ${plural(items.length, 'rink', 'rinks')} we list in ${stateName}. Tap a pin for the rating, then open the rink page for hours and directions.`,
      ['Free to use.', `Updated ${YEAR}.`, 'Zoom in to explore.', 'Updated regularly.']
    ),
    h1: `Map of Ice Rinks in ${stateName}`,
    lede: `${items.length} ${plural(items.length, 'rink', 'rinks')}. Tap a pin to see the rink, or go back to the <a href="${statePath(stateName)}">ranked list for ${esc(stateName)}</a>.`,
    layout: 'wide',
    nav: 'states',
    trail: [{ label: 'Map', href: '/map/' }, { label: stateName }],
  };
  const body = `${mapEmbed(items)}
<h2>Rinks on this map</h2>
<ol class="map-list">
${items.map((l) => `  <li><a href="${l.url}">${esc(l.name)}</a> <span>${esc(l.city)}${l.rating ? ` &middot; ${l.rating.toFixed(1)}` : ''}</span></li>`).join('\n')}
</ol>`;
  writePage(path, render(meta, body, { scripts: mapScripts() }));
  addToSitemap(path, '0.4', DATA_DATE);
}

/* --- static pages (src/pages/*.html) with tokens -------------------------- */

const topRated = rank(listings.filter((l) => (l.reviews || 0) >= 20)).slice(0, 12);

const tokens = {
  '{{CONTACT_EMAIL}}': CONTACT_EMAIL,
  '{{BUILD_DATE}}': BUILD_DATE,
  '{{YEAR}}': String(YEAR),
  '{{STAT_LISTINGS}}': num(listings.length),
  '{{STAT_STATES}}': num(stateNames.length),
  '{{STAT_CITIES}}': num(byCity.size),
  '{{BLOG_CARDS}}': blogCards(posts),
  '{{BLOG_CARDS_3}}': blogCards(guidePosts.slice(0, 3)),
  '{{BLOG_CARDS_6}}': blogCards(guidePosts.slice(3, 9).length >= 3 ? guidePosts.slice(3, 9) : guidePosts.slice(0, 6)),
  '{{STATE_TILES}}': stateTiles(),
  '{{STATE_LIST}}': stateNames.length
    ? `<ul class="state-list">\n${stateNames.map((st) => `  <li><a href="${statePath(st)}"><span>${esc(st)}</span><span class="state-list-n">${byState.get(st).length}</span></a></li>`).join('\n')}\n</ul>`
    : '<div class="notice"><p><strong>The rink directory is being compiled.</strong> State pages appear here as soon as listings are published.</p></div>',
  '{{STATS_TRACKING}}': hasData
    ? `Currently tracking <strong>${num(listings.length)}</strong> ice rinks across <strong>${num(stateNames.filter((st) => st !== 'District of Columbia').length)}</strong> states${byState.has('District of Columbia') ? ' plus DC' : ''} and <strong>${num(byCity.size)}</strong> cities.`
    : '',
  '{{STAT_GUIDES}}': num(guidePosts.length),
  '{{STATS_LINE}}': hasData
    ? `${num(listings.length)} ice rinks in ${num(stateNames.length)} ${plural(stateNames.length, 'state', 'states')}, across ${num(byCity.size)} ${plural(byCity.size, 'city', 'cities')}.`
    : 'State pages go live as soon as the first listings are published.',
  '{{EXPLORE_HEADING}}': hasData ? `Visit ${num(listings.length)} ice rinks in ${num(stateNames.length)} ${plural(stateNames.length, 'state', 'states')}` : 'Every public ice rink, state by state',
  '{{POPULAR_LINKS}}': hasData
    ? [...stateNames].sort((a, b) => byState.get(b).length - byState.get(a).length).slice(0, 5).map((s) => `<a href="${statePath(s)}">${esc(s)}</a>`).join(' <span aria-hidden="true">&middot;</span> ')
    : posts.slice(0, 3).map((p) => `<a href="${p.path}">${esc(p.meta.h1 || p.meta.title)}</a>`).join(' <span aria-hidden="true">&middot;</span> '),
  '{{HAS_DATA_ATTR}}': hasData ? 'true' : 'false',
  '{{FAQ}}': faqBlock(faqs, null),
  '{{AD_DISPLAY}}': renderAdSlot('display'),
  '{{TOP_RATED}}': topRated.length
    ? `<div class="card-row" data-near-list>\n${topRated.map((l) => renderCard(l)).join('\n')}\n</div>`
    : '<div class="card-row" data-near-list></div>',
  '{{FIND_CHIPS}}': findCounts.some((x) => x.n)
    ? `<div class="chip-row chip-row-lg">${findCounts.filter((x) => x.n).map(({ c, n }) => `<a class="chip" href="${findPath(c)}">${esc(c.name)} <span>${n}</span></a>`).join('')}</div>`
    : '<p>Type filters appear once listings are published.</p>',
  '{{FIND_LIST}}': findCounts.some((x) => x.n)
    ? `<ul class="find-list">\n${findCounts.filter((x) => x.n).map(({ c, n }) => `  <li><a href="${findPath(c)}"><b>${esc(c.name)}</b> <span>${n} ${plural(n, 'rink', 'rinks')}</span></a><p>${esc(c.intro)}</p></li>`).join('\n')}\n</ul>`
    : '<div class="notice"><p>Type filters appear here once listings are published.</p></div>',
  '{{MAP_STATE_LINKS}}': stateNames.length
    ? `<ul class="link-grid">\n${stateNames.map((s) => `  <li><a href="${mapStatePath(s)}">${esc(s)}</a> <span>${byState.get(s).length}</span></li>`).join('\n')}\n</ul>`
    : '<p>State maps appear here once listings are published.</p>',
  '{{DATA_STATUS}}': hasData
    ? `<p class="data-note">Data last updated ${DATA_DATE_LABEL}.</p>`
    : '<div class="notice"><p><strong>The rink directory is being compiled.</strong> Listings are published as soon as they have been checked. Until then, our <a href="/blog/">skating guides</a> are ready to read.</p></div>',
};
const expandTokens = (html) => Object.entries(tokens).reduce((h, [k, v]) => h.split(k).join(v), html);

const staticPages = readPageFiles(join(SRC, 'pages'));
for (const page of staticPages) {
  const meta = { ...page.meta };
  // Hubs that are empty until the first import stay out of the index.
  if (meta.requiresData && !hasData) meta.noindex = true;
  let scripts = '';
  if (meta.path === '/404.html') meta.noindex = true;
  if (meta.scripts) scripts = meta.scripts.map((s) => (s === 'map' ? mapScripts() : `<script src="/assets/js/${s}.js?v=${ASSET_VERSION}" defer></script>`)).join('\n');
  let extra = [];
  if (meta.path === '/') extra = [{ '@type': 'WebSite', name: SITE_NAME, url: SITE_URL, potentialAction: { '@type': 'SearchAction', target: `${SITE_URL}/search/?q={search_term_string}`, 'query-input': 'required name=search_term_string' } }, { '@type': 'Organization', name: SITE_NAME, url: SITE_URL, logo: `${SITE_URL}/assets/img/icon-512.png`, sameAs: Object.values(SOCIAL) }, faqJsonLd(faqs)];
  if (page.file === 'states' && hasData) extra = [{ '@type': 'ItemList', numberOfItems: stateNames.length, itemListElement: stateNames.map((st, i) => ({ '@type': 'ListItem', position: i + 1, url: SITE_URL + statePath(st), name: `Ice rinks in ${st}` })) }];
  const jsonld = [{ '@type': 'WebPage', name: meta.title, description: meta.description, url: SITE_URL + meta.path }, ...extra];
  if (page.file === 'blog') {
    // The blog hub paginates: page 1 at /blog/, then /blog/page/<n>/.
    const pages = Math.max(1, Math.ceil(posts.length / BLOG_PAGE_SIZE));
    for (let n = 1; n <= pages; n++) {
      const pMeta = n === 1 ? meta : {
        ...meta,
        path: blogPagePath(n),
        title: `${meta.title.replace(/:.*$/, '')}, Page ${n}`,
        description: fitDescription(`More practical ice skating guides, page ${n} of ${pages}: technique, gear, skate fit, sharpening, rink sessions and ice safety for beginners and families.`, ['Updated regularly.', 'Free to read.']),
        trail: [{ label: 'Blog', href: '/blog/' }, { label: `Page ${n}` }],
      };
      const pBody = expandTokens(page.body)
        .replace('{{BLOG_LIST}}', blogRows(posts.slice((n - 1) * BLOG_PAGE_SIZE, n * BLOG_PAGE_SIZE)))
        .replace('{{BLOG_PAGER}}', blogPager(n, pages));
      const pLd = [{ '@type': 'CollectionPage', name: pMeta.title, description: pMeta.description, url: SITE_URL + pMeta.path }];
      const headExtra = [n > 1 ? `<link rel="prev" href="${SITE_URL}${blogPagePath(n - 1)}">` : '', n < pages ? `<link rel="next" href="${SITE_URL}${blogPagePath(n + 1)}">` : ''].filter(Boolean).join('\n');
      writePage(pMeta.path, render(pMeta, pBody, { jsonld: pLd, headExtra }));
      addToSitemap(pMeta.path, n === 1 ? '0.7' : '0.4');
    }
    pageIndex.push({ path: meta.path, title: meta.h1, group: 'Site' });
    continue;
  }
  let body = expandTokens(page.body).replace('{{BREADCRUMBS}}', breadcrumbs(meta.trail));
  // The national map fetches the compact data file instead of inlining
  // thousands of points into the HTML.
  if (page.file === 'map') body = body.replace('{{MAP_EMBED}}', `<div class="map-shell map-xl"><div id="rink-map" class="rink-map" data-src="/data/rinks.json" role="region" aria-label="Map of ice rinks"></div></div>`);
  writePage(meta.path, render(meta, body, { jsonld, scripts }));
  if (!meta.noindex && page.file !== '404') {
    addToSitemap(meta.path, meta.path === '/' ? '1.0' : meta.priority || '0.5');
    pageIndex.push({ path: meta.path, title: meta.h1 || meta.title, group: 'Site' });
  }
}

/* --- HTML sitemap (written after everything it lists) --------------------- */

{
  const meta = {
    path: '/sitemap/',
    title: 'Sitemap: Every Page on Ice Skating Near You',
    description: fitDescription('Every page on Ice Skating Near You in one place: state ice rink directories, rink types, maps, skating guides, and the about, contact and legal pages.', ['Updated with every build.', 'Start anywhere.']),
    h1: 'Sitemap',
    layout: 'wide',
    nav: '',
    trail: [{ label: 'Sitemap' }],
  };
  const groups = ['Site', 'States', 'Find by type', 'Guides', 'Lists'];
  const cityGroups = stateNames.map((s) => `<h3><a href="${statePath(s)}">${esc(s)}</a></h3>\n${cityLinkGrid(s)}`).join('\n');
  const body = groups
    .map((g) => {
      const items = pageIndex.filter((p) => p.group === g).sort((a, b) => a.title.localeCompare(b.title));
      return items.length ? `<h2>${esc(g)}</h2>\n<ul class="link-grid">\n${items.map((p) => `  <li><a href="${p.path}">${esc(p.title)}</a></li>`).join('\n')}\n</ul>` : '';
    })
    .join('\n') + (cityGroups ? `\n<h2>Cities</h2>\n${cityGroups}` : '') + '\n<p>For search engines: <a href="/sitemap.xml">sitemap.xml</a>.</p>';
  writePage(meta.path, render(meta, body));
  addToSitemap(meta.path, '0.3');
}

/* --- assets and root files ------------------------------------------------ */

cpSync(join(SRC, 'assets'), join(DIST, 'assets'), { recursive: true });
cpSync(join(SRC, 'assets/img/favicon.ico'), join(DIST, 'favicon.ico'));
mkdirSync(join(DIST, 'data'), { recursive: true });

// Compact listing data for the homepage "near me" finder and the national map.
writeFileSync(
  join(DIST, 'data/rinks.json'),
  JSON.stringify(listings.map((l) => ({
    n: l.name, u: l.url, c: `${l.city}, ${l.stateCode}`, a: l.lat, o: l.lng, r: l.rating, v: l.reviews, k: l.slug,
    i: l.photo ? resizedPhotoUrl(l.photo, ...IMAGE_SIZES.card) : fallbackFor(l), f: fallbackFor(l),
  })))
);
writeFileSync(
  join(DIST, 'data/search-index.json'),
  JSON.stringify([
    ...listings.map((l) => ({ t: 'Rink', n: l.name, p: `${l.city}, ${l.stateCode}`, u: l.url })),
    ...[...byCity.entries()].map(([k, items]) => {
      const [s, c] = k.split('|');
      return { t: 'City', n: `${c}, ${codeOf(s)}`, p: `${items.length} ${plural(items.length, 'rink', 'rinks')}`, u: cityPath(s, c) };
    }),
    ...stateNames.map((s) => ({ t: 'State', n: s, p: `${byState.get(s).length} rinks`, u: statePath(s) })),
    ...findCounts.filter((x) => x.n).map(({ c, n }) => ({ t: 'Type', n: c.name, p: `${n} rinks`, u: findPath(c) })),
    ...posts.map((p) => ({ t: 'Guide', n: p.meta.h1 || p.meta.title, p: p.meta.excerpt || '', u: p.path })),
  ])
);

writeFileSync(
  join(DIST, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemap.map((e) => `  <url><loc>${SITE_URL}${e.path}</loc><lastmod>${e.lastmod || BUILD_DATE}</lastmod><priority>${e.priority}</priority></url>`).join('\n')}
</urlset>
`
);
writeFileSync(join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);
writeFileSync(join(DIST, 'ads.txt'), 'google.com, pub-9332749804326149, DIRECT, f08c47fec0942fa0\n');
writeFileSync(
  join(DIST, 'site.webmanifest'),
  JSON.stringify({
    name: SITE_NAME,
    short_name: 'Ice Skating',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#0b3a75',
    icons: [
      { src: '/assets/img/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/assets/img/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  }, null, 2)
);

/* --- report ---------------------------------------------------------------- */

let pageCount = 0;
(function count(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) count(join(dir, e.name));
    else if (e.name.endsWith('.html')) pageCount++;
  }
})(DIST);

console.log(`Built ${pageCount} pages into dist/`);
console.log(`  ${listings.length} listings, ${stateNames.length} states, ${byCity.size} cities, ${posts.length} blog posts, ${sitemap.length} sitemap URLs`);
if (!hasData) console.log('  note: data/listings.json is empty. Run `npm run import -- <outscraper export>` to publish rinks.');
if (hasData && !photosFresh) console.log(`  note: listing photos are ${Math.floor(photoAgeDays)} days old (limit ${PHOTO_MAX_AGE_DAYS}); Google photo URLs expire, so local fallbacks are used. Re-import to refresh.`);
if (!AD_SLOTS.display && !AD_SLOTS.inFeed && !AD_SLOTS.inArticle) console.log('  note: no AdSense slot IDs set; manual ad units are off (the AdSense loader is still on every page).');
