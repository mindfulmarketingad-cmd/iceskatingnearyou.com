/** Shared helpers for listing data: slugs, states, Outscraper normalisation. */

export const STATES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia',
  FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
  ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
  NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon',
  PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota',
  TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia',
  WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};

export const STATE_CODE_BY_NAME = Object.fromEntries(
  Object.entries(STATES).map(([code, name]) => [name.toLowerCase(), code])
);

/** Land borders between states (plus DC), used for "nearby states" links on
 *  state hubs. Alaska and Hawaii have none. */
export const STATE_NEIGHBORS = {
  AL: ['FL', 'GA', 'MS', 'TN'], AK: [], AZ: ['CA', 'CO', 'NM', 'NV', 'UT'],
  AR: ['LA', 'MO', 'MS', 'OK', 'TN', 'TX'], CA: ['AZ', 'NV', 'OR'],
  CO: ['AZ', 'KS', 'NE', 'NM', 'OK', 'UT', 'WY'], CT: ['MA', 'NY', 'RI'],
  DE: ['MD', 'NJ', 'PA'], DC: ['MD', 'VA'], FL: ['AL', 'GA'],
  GA: ['AL', 'FL', 'NC', 'SC', 'TN'], HI: [], ID: ['MT', 'NV', 'OR', 'UT', 'WA', 'WY'],
  IL: ['IA', 'IN', 'KY', 'MO', 'WI'], IN: ['IL', 'KY', 'MI', 'OH'],
  IA: ['IL', 'MN', 'MO', 'NE', 'SD', 'WI'], KS: ['CO', 'MO', 'NE', 'OK'],
  KY: ['IL', 'IN', 'MO', 'OH', 'TN', 'VA', 'WV'], LA: ['AR', 'MS', 'TX'],
  ME: ['NH'], MD: ['DC', 'DE', 'PA', 'VA', 'WV'], MA: ['CT', 'NH', 'NY', 'RI', 'VT'],
  MI: ['IN', 'OH', 'WI'], MN: ['IA', 'ND', 'SD', 'WI'], MS: ['AL', 'AR', 'LA', 'TN'],
  MO: ['AR', 'IA', 'IL', 'KS', 'KY', 'NE', 'OK', 'TN'], MT: ['ID', 'ND', 'SD', 'WY'],
  NE: ['CO', 'IA', 'KS', 'MO', 'SD', 'WY'], NV: ['AZ', 'CA', 'ID', 'OR', 'UT'],
  NH: ['MA', 'ME', 'VT'], NJ: ['DE', 'NY', 'PA'], NM: ['AZ', 'CO', 'OK', 'TX', 'UT'],
  NY: ['CT', 'MA', 'NJ', 'PA', 'VT'], NC: ['GA', 'SC', 'TN', 'VA'],
  ND: ['MN', 'MT', 'SD'], OH: ['IN', 'KY', 'MI', 'PA', 'WV'],
  OK: ['AR', 'CO', 'KS', 'MO', 'NM', 'TX'], OR: ['CA', 'ID', 'NV', 'WA'],
  PA: ['DE', 'MD', 'NJ', 'NY', 'OH', 'WV'], RI: ['CT', 'MA'], SC: ['GA', 'NC'],
  SD: ['IA', 'MN', 'MT', 'ND', 'NE', 'WY'], TN: ['AL', 'AR', 'GA', 'KY', 'MO', 'MS', 'NC', 'VA'],
  TX: ['AR', 'LA', 'NM', 'OK'], UT: ['AZ', 'CO', 'ID', 'NM', 'NV', 'WY'],
  VT: ['MA', 'NH', 'NY'], VA: ['DC', 'KY', 'MD', 'NC', 'TN', 'WV'],
  WA: ['ID', 'OR'], WV: ['KY', 'MD', 'OH', 'PA', 'VA'], WI: ['IA', 'IL', 'MI', 'MN'],
  WY: ['CO', 'ID', 'MT', 'NE', 'SD', 'UT'],
};

export const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

export function slugify(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90)
    .replace(/-+$/g, '');
}

/** Ensures slugs stay unique across the dataset. */
export function uniqueSlug(base, taken) {
  const root = base || 'ice-rink';
  let slug = root;
  let n = 2;
  while (taken.has(slug)) slug = `${root}-${n++}`;
  taken.add(slug);
  return slug;
}

export function resolveStateCode(stateRaw, usStateRaw) {
  for (const raw of [usStateRaw, stateRaw]) {
    const value = String(raw || '').trim();
    if (!value) continue;
    const upper = value.toUpperCase();
    if (STATES[upper]) return upper;
    const byName = STATE_CODE_BY_NAME[value.toLowerCase()];
    if (byName) return byName;
  }
  return '';
}

const PLACEHOLDER_VALUES = new Set(['none', 'n/a', 'na', 'null', 'undefined', 'nan', '-', '--']);

/**
 * Outscraper fills empty cells with literal placeholder text ("None" is the
 * most common) instead of leaving them blank. Map those to null so they are
 * never published as if they were real data.
 */
export function cleanField(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (!trimmed || PLACEHOLDER_VALUES.has(trimmed.toLowerCase())) return null;
  return trimmed;
}

/** Great-circle distance in miles. */
export function distanceMiles(lat1, lng1, lat2, lng2) {
  const R = 3958.8;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function parseJsonish(value) {
  if (value == null) return null;
  if (typeof value === 'object') return value;
  const text = String(value).trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    try {
      // Some exports write Python-style dicts with single quotes and True/False.
      return JSON.parse(
        text.replace(/'/g, '"').replace(/\bTrue\b/g, 'true').replace(/\bFalse\b/g, 'false').replace(/\bNone\b/g, 'null')
      );
    } catch {
      return null;
    }
  }
}

/**
 * Outscraper exports working hours as an object keyed by day name, each value
 * either a string ("6AM-10PM") or an array of windows (["6-9AM", "12-4PM"]).
 * Normalised to lowercase day keys with windows joined by " / ".
 */
export function parseWorkingHours(value) {
  const obj = parseJsonish(value);
  if (!obj || typeof obj !== 'object') return null;
  const out = {};
  for (const [key, val] of Object.entries(obj)) {
    const day = String(key).trim().toLowerCase();
    if (!DAYS.includes(day)) continue;
    const text = Array.isArray(val) ? val.map((v) => String(v).trim()).filter(Boolean).join(' / ') : cleanField(val);
    if (text) out[day] = text.replace(/–|—/g, '-').replace(/ | /g, ' ');
  }
  return Object.keys(out).length ? out : null;
}

/**
 * Outscraper's `about` column holds Google's structured attributes as nested
 * JSON, e.g. {"Accessibility": {"Wheelchair accessible entrance": true}}.
 * Returns every attribute marked true, grouped, exactly as Google labels them.
 */
export function parseAbout(value) {
  const obj = parseJsonish(value);
  if (!obj || typeof obj !== 'object') return null;
  const groups = {};
  for (const [group, attrs] of Object.entries(obj)) {
    if (!attrs || typeof attrs !== 'object') continue;
    const on = Object.entries(attrs).filter(([, v]) => v === true).map(([k]) => k.trim());
    if (on.length) groups[group.trim()] = on;
  }
  return Object.keys(groups).length ? groups : null;
}

/** Star-count -> number of reviews, from either the JSON column or the five
 *  separate reviews_per_score_1..5 columns some exports use. */
export function parseReviewsPerScore(value, discrete) {
  const obj = parseJsonish(value);
  const out = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let found = false;
  if (obj && typeof obj === 'object') {
    for (const star of [1, 2, 3, 4, 5]) {
      const n = Number(obj[star] ?? obj[String(star)]);
      if (Number.isFinite(n) && n >= 0) { out[star] = Math.round(n); found = true; }
    }
  }
  if (!found && discrete) {
    for (const star of [1, 2, 3, 4, 5]) {
      const raw = discrete[star];
      if (raw === '' || raw == null) continue;
      const n = Number(raw);
      if (Number.isFinite(n) && n >= 0) { out[star] = Math.round(n); found = true; }
    }
  }
  return found ? out : null;
}

/** Google's own review keywords ("public skate, hockey, clean"). These are
 *  topics extracted from reviews, never a quote, and are shown as such. */
export function parseReviewTags(value) {
  const parsed = parseJsonish(value);
  const list = Array.isArray(parsed) ? parsed : String(value || '').split(',');
  const tags = list.map((t) => String(t).trim()).filter((t) => t && !PLACEHOLDER_VALUES.has(t.toLowerCase())).slice(0, 12);
  return tags.length ? tags : null;
}

/* ------------------------------------------------- ice relevance filter -- */

const NOT_A_RINK = /ice\s*cream|ice\s*supplier|ice\s*(vending|delivery|machine|manufactur)|dry\s*ice|shaved\s*ice|italian\s*ice|ice\s*bar\b/i;
const ROLLER_ONLY = /roller|inline|in-line|skateboard|skate\s*park|skatepark|roller\s*derby/i;
const ICE_SIGNAL = /ice[\s-]*(skating|skate|rink|arena|center|centre|house|plex|palace|den|gardens?|forum|complex|sports|hockey|time|park|ribbon|trail)|iceplex|icehouse|hockey|curling|figure\s*skat|\bon\s*ice\b/i;

/**
 * Outscraper searches for "ice skating rink" routinely return roller rinks,
 * skate shops and ice-cream parlours too. Keeps a row only when its own
 * category, type, subtypes or name say it is an ice venue.
 */
export function isIceVenue(row) {
  const cat = [row.category, row.type, row.subtypes].filter(Boolean).join(' | ');
  const all = [cat, row.name, row.description].filter(Boolean).join(' | ');
  if (NOT_A_RINK.test(cat) && !ICE_SIGNAL.test(cat)) return false;
  // Roller rinks often mention "hockey" (roller hockey) in their text, so a
  // roller category with no ice signal in the category itself is dropped.
  if (ROLLER_ONLY.test(cat) && !ICE_SIGNAL.test(cat)) return false;
  if (ICE_SIGNAL.test(all)) return true;
  // A plain "Skating rink" category with nothing saying roller is an ice rink
  // often enough to keep; anything that says roller/inline is dropped.
  if (/skating\s*rink/i.test(cat) && !ROLLER_ONLY.test(all)) return true;
  return false;
}

/* ---------------------------------------------------------- feature tags -- */

/**
 * Visitor-facing feature tags. Each tag is only applied when the business's
 * own listing text says so (name, category, subtypes, description) or when
 * Google's structured attributes do. Nothing is inferred beyond that, which
 * means tags are incomplete by design, never invented.
 */
const FEATURE_RULES = [
  [/indoor|arena|iceplex|icehouse|ice\s*(center|centre|house|plex|palace|den|forum|complex|gardens?)|sports\s*(center|centre|complex)|coliseum|fieldhouse/i, 'Indoor rink'],
  [/outdoor|\bpond\b|lagoon|rooftop|ice\s*(ribbon|trail)|skating\s*(ribbon|trail)/i, 'Outdoor rink'],
  [/seasonal|holiday|christmas|winter\s*(village|wonderland|garden|festival)/i, 'Seasonal rink'],
  [/hockey/i, 'Hockey'],
  [/figure\s*skat|skating\s*club/i, 'Figure skating'],
  [/lessons?\b|learn[\s-]*to[\s-]*skate|skating\s*school|skate\s*school|skating\s*academy|instruction|coaching/i, 'Skating lessons'],
  [/curling/i, 'Curling'],
  [/rental|rent\s*skates/i, 'Skate rentals'],
  [/birthday|parties|party\s*room/i, 'Birthday parties'],
];

export function deriveFeatures(texts, about) {
  const haystack = texts.filter(Boolean).join(' | ');
  const found = new Set();
  for (const [pattern, label] of FEATURE_RULES) if (pattern.test(haystack)) found.add(label);
  const flat = about ? Object.values(about).flat().join(' | ') : '';
  if (/wheelchair\s*accessible/i.test(flat)) found.add('Wheelchair accessible');
  if (/good\s*for\s*kids|kid[\s-]*friendly/i.test(flat)) found.add('Good for kids');
  return [...found];
}

/* ---------------------------------------------------------- normalise ----- */

/** Final listing shape consumed by the build and the front-end map/search. */
export function normaliseListing(input, taken) {
  const name = cleanField(input.name);
  if (!name) return null;

  const lat = Number(input.lat ?? input.latitude);
  const lng = Number(input.lng ?? input.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null;

  const stateCode = resolveStateCode(input.state, input.us_state || input.state_code);
  if (!stateCode) return null;
  // Every listing URL nests under its city (/<state>/<city>/<rink>/), so a
  // row without a city cannot be placed and is reported as skipped.
  const city = cleanField(input.city);
  if (!city) return null;

  const slug = uniqueSlug(slugify([name, city, stateCode].filter(Boolean).join(' ')), taken);
  const rating = Number(input.rating);
  const reviews = Number(input.reviews);
  const about = parseAbout(input.about);
  const description = cleanField(input.description);
  const subtypes = cleanField(input.subtypes);
  const category = cleanField(input.category) || cleanField(input.type);
  const photosCount = Number(input.photos_count);

  return {
    id: String(cleanField(input.place_id) || cleanField(input.google_id) || slug),
    slug,
    name,
    category,
    subtypes,
    description,
    status: cleanField(input.business_status) || null,
    street: cleanField(input.street),
    city,
    county: cleanField(input.county || input.borough),
    state: STATES[stateCode],
    stateCode,
    postalCode: cleanField(input.postal_code || input.postalCode),
    fullAddress: cleanField(input.full_address),
    lat,
    lng,
    phone: cleanField(input.phone),
    website: cleanField(input.site || input.website),
    rating: Number.isFinite(rating) && rating > 0 ? Math.round(rating * 10) / 10 : null,
    reviews: Number.isFinite(reviews) && reviews > 0 ? Math.round(reviews) : null,
    reviewsPerScore: parseReviewsPerScore(input.reviews_per_score, {
      1: input.reviews_per_score_1,
      2: input.reviews_per_score_2,
      3: input.reviews_per_score_3,
      4: input.reviews_per_score_4,
      5: input.reviews_per_score_5,
    }),
    reviewTags: parseReviewTags(input.reviews_tags),
    hours: parseWorkingHours(input.working_hours || input.hours),
    about,
    // Google photo URLs are signed and stop working after roughly four
    // weeks. The build checks `importedAt` in data/listings.json and stops
    // using them once they are stale; templates always fall back locally.
    photo: cleanField(input.photo),
    photosCount: Number.isFinite(photosCount) && photosCount > 0 ? Math.round(photosCount) : null,
    mapsUrl: cleanField(input.location_link),
    reviewsUrl: cleanField(input.reviews_link),
    placeId: cleanField(input.place_id),
    features: deriveFeatures([name, category, subtypes, description], about),
  };
}
