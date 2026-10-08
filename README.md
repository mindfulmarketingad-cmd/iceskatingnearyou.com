# iceskatingnearyou.com

A directory of public ice skating rinks across the United States. The main keyword is **ice skating near me**.

The site is fully static: one generator script (`scripts/build.mjs`) reads `data/listings.json` and the page sources in `src/`, then writes every page to `dist/`. There is no server rendering, no ISR and nothing runs per request. The architecture copies the pumpkinpatchesnearme.com generator.

```bash
npm install          # only needed for the XLSX importer and the one-off asset scripts
npm run build        # generate dist/
npm run check        # verify links, anchors, titles, descriptions, canonicals, JSON-LD, sitemap
npm test             # build + check
npm run dev          # build, then preview at http://localhost:4173
```

Deploy `dist/` to any static host. `vercel.json` and `netlify.toml` already set the build command and output directory.

---

## Where the real listing data goes

`data/listings.json` holds the live dataset: 1,840 rinks from the October 7, 2026 Outscraper export. There has never been placeholder data. With zero listings the build still runs end to end. The homepage, guides and legal pages are published. Data-dependent hubs (`/states/`, `/map/`, `/find/`) render an honest "being compiled" notice and are marked `noindex` until rinks exist.

To publish rinks, drop in the Outscraper export:

```bash
npm install
npm run import -- ~/Downloads/outscraper-ice-rinks.xlsx    # XLSX, CSV or JSON; several files can be passed
npm run build && npm run check
git add data/listings.json && git commit -m "Import Outscraper listings"
```

The import **replaces** `data/listings.json`. It:

- drops `CLOSED_PERMANENTLY` rows and keeps `CLOSED_TEMPORARILY` rows, which the page labels as temporarily closed
- drops roller rinks, skate shops and ice-cream parlours that "ice skating rink" searches pull in (`isIceVenue()` in `scripts/lib/listings.mjs`)
- drops figure skating clubs, coaches, academies and rink service companies, which Outscraper's "ice skating" subtype filter returns alongside real rinks (`venueRejection()`). Real rinks whose first Google category happens to be "Ice skating instructor" are kept. Pass `--keep-all` to skip both filters.
- drops rows with no name, coordinates, US state or city, and reports every skipped row
- de-duplicates on `place_id`
- maps Outscraper's literal `None` / `N/A` placeholders to null, so they are never published

Recognised Outscraper columns: `name`, `category`, `type`, `subtypes`, `description`, `business_status`, `street`, `city`, `county`/`borough`, `state`, `us_state`, `postal_code`, `full_address`, `latitude`, `longitude`, `phone`, `site`, `rating`, `reviews`, `reviews_per_score` (or `reviews_per_score_1..5`), `reviews_tags`, `working_hours`, `about`, `photo`, `photos_count`, `location_link`, `reviews_link`, `place_id`, `google_id`.

**Nothing is invented.** A missing field is shown as "Not listed" or explained in a sentence ("No opening hours are listed, so check the rink's schedule"). Rink summaries only restate fields from the listing. Feature tags (indoor, outdoor, hockey, lessons, rentals and so on) are applied only when the rink's own name, category, subtypes or description says so, or when Google's `about` attributes do.

### Google photo URLs expire

Outscraper's `photo` URLs (`lh3.googleusercontent.com`) are signed and stop working after about four weeks. The site handles this two ways:

1. The import records when Outscraper fetched the photos (`photosFetchedAt`, read from the `Outscraper-YYYYMMDDHHMMSS` export filename, or the import time if the name has no timestamp). The build reads it. Once the import is more than 25 days old (`PHOTO_MAX_AGE_DAYS`), it stops using remote photos, and every image renders a local illustration from `src/assets/img/fallbacks/`.
2. Every remote `<img>` carries an `onerror` that swaps to the same local fallback. A photo that dies early therefore never shows as a broken image.

Re-run the import at least monthly to keep real photos on the pages.

---

## URL structure and internal linking

```
/                                  homepage                 src/pages/index.html
/states/                           state hub                src/pages/states.html
/states/<state>/                   state money page         generated, one per state with rinks
/<state>/<city>/                   city listicle            generated, one per city with rinks
/<state>/<city>/<rink>/            listing page             generated, one per rink
/<state>/                          redirect stub            noindex, refreshes to /states/<state>/
/find/                             rink types hub           src/pages/find.html
/find/<type>/                      type, national           generated (src/data/categories.json)
/find/<type>/<state>/              type, per state          generated; the target of the filter chips
/map/   /map/<state>/              Leaflet maps             src/pages/map.html + generated
/search/                           client-side search       src/pages/search.html
/blog/  /blog/<post>/              informational guides     src/pages/blog.html + src/pages/blog/*.html
/about/ /contact/ /disclaimer/ /privacy/ /terms/ /sitemap/
/sitemap.xml /robots.txt /ads.txt /site.webmanifest /404.html
```

Links run Home > Hub > Individual, and every page links back up through breadcrumbs (with BreadcrumbList JSON-LD). Hub pages and listing pages also cross-link sideways:

- state pages link to neighbouring states (`STATE_NEIGHBORS`)
- city pages link to the nearest other cities and to rinks within driving distance
- listing pages link to the six nearest rinks by distance, which can cross a state line
- filter chips link to `/find/<type>/<state>/`

### State pages are the money pages

`/states/<state>/` follows the reference layout:

- intro and jump links
- search, city, type and sort tools, with a List/Map toggle
- every rink as a numbered entry: rating, review count, data-grounded summary, address, phone, website, hours
- city links, type chips and guides
- a planning section built from the state's own data
- a photo strip
- highest rated, and the northernmost, southernmost, easternmost and westernmost rinks
- a city table, nearby states and FAQs (FAQPage JSON-LD)

Titles lead with the generic head term ("Ice Skating Near Me: 24 Best Rinks in Ohio (2026)"), because Google matches these hubs to "ice skating near me" by the searcher's location.

The blog holds two kinds of post:

- **Guides** (`src/pages/blog/*.html`, hand-written): informational questions only, such as technique, gear, safety and how rinks work.
- **Lists** (generated): "[x] Best [type] in [State] [Year] List", one per state for all rinks plus one per rink type with at least 3 tagged rinks in that state (`LIST_TYPES` / `LIST_POST_MIN` in `scripts/build.mjs`; type nouns are `postNoun` in `src/data/categories.json`). The title tag and H1 are the same string. URLs leave out the count and year (`/blog/best-hockey-rinks-in-minnesota/`) so they stay stable. Wheelchair access has no list because nearly every rink carries it. These target the same local searches as the state pages, so every list links prominently to its state page and type page.

### Featured rinks

Every page ends with a "Featured ice rinks" block of four rink cards with photos. Pages that belong to a state (state, city, rink, type-by-state, map and list pages) feature rinks from that state; states with only one or two rinks top up from nationwide picks. Other pages feature rinks nationwide. Picks come from the highest-ranked rinks, rotated by page so different pages feature different rinks.

To feature specific rinks (for example paying partners), add them to `data/featured.json` by `place_id` or slug, with an optional end date:

```json
{ "rinks": [ { "id": "ChIJ...", "until": "2027-03-31" } ] }
```

Those rinks lead the block on every page in their state (and nationwide pages) with a "Featured partner" badge until the end date. They do not change the ranked lists. If you start selling these spots, update the "no paid placement" lines on `/about/` and `/contact/`.

### Ranking

Rinks are ranked by Google rating weighted by review volume (a Bayesian average with a 25-review prior), so a 4.7 from 900 reviews beats a 5.0 from three. Unrated rinks go last. Nobody can pay for position.

---

## Pages, tokens and templates

Every source file in `src/pages/` opens with a JSON front-matter block:

```html
<!--meta
{
  "path": "/your-page/",
  "title": "Under 60 characters",
  "description": "150 to 160 characters.",
  "h1": "Visible heading",
  "lede": "Optional intro under the heading.",
  "nav": "about",
  "layout": "prose",
  "trail": [{ "label": "Your page" }]
}
-->
```

`layout` is `prose`, `wide` or `raw`. `requiresData: true` marks a page `noindex` while the dataset is empty. Blog posts use `slug`, `date`, `excerpt`, `readingTime`, an optional `image`, and an optional `faq` array (rendered with FAQPage JSON-LD).

Tokens available in page bodies: `{{STAT_LISTINGS}}`, `{{STAT_STATES}}`, `{{STAT_CITIES}}`, `{{STAT_GUIDES}}`, `{{STATE_TILES}}`, `{{STATE_RANK_TABLE}}`, `{{BLOG_CARDS}}`, `{{FAQ}}`, `{{FIND_CHIPS}}`, `{{FIND_LIST}}`, `{{TOP_RATED}}`, `{{AD_DISPLAY}}`, `{{DATA_STATUS}}`, `{{CONTACT_EMAIL}}`, `{{BUILD_DATE}}`, and the others defined in the `tokens` object in `scripts/build.mjs`.

Readability is enforced at build time. Body text is 18px with a 1.8 line height, and `splitLongParagraphs()` breaks any paragraph over about 300 characters at sentence boundaries, never mid-sentence.

`npm run check` fails the build output on:

- a title over 60 characters, or a meta description outside 150 to 160
- a broken internal link or anchor
- a `target="_blank"` link without `noopener`
- emoji
- invalid JSON-LD
- a sitemap entry that is missing or `noindex`

---

## AdSense

- The AdSense loader for `ca-pub-9332749804326149` is on every page.
- The build writes `ads.txt` with exactly: `google.com, pub-9332749804326149, DIRECT, f08c47fec0942fa0`

Manual ad units are already placed:

- on state, city and type pages: after the intro tools, inside ranked lists after #3, #8 and every 10th entry after that, and before the FAQ
- on listing pages: after the summary
- in guides: after the opening paragraph and before the middle H2
- on the homepage and the states hub

They stay off until you create ad units in AdSense and paste their IDs into `AD_SLOTS` at the top of `scripts/build.mjs` (or set `ADSENSE_SLOT_DISPLAY`, `ADSENSE_SLOT_INFEED`, `ADSENSE_SLOT_INARTICLE` and `ADSENSE_INFEED_LAYOUT_KEY` at build time). Each unit sits in a container with a reserved `min-height`, so a late-filling ad never pushes content down.

---

## Assets

- **Logo and favicon**: `src/assets/img/logo-mark.svg` is hand-authored. `npm run icons` renders the favicon, app icons and `og-image.jpg` from it with headless Chromium (`npm i --no-save playwright-core` first).
- **State outlines**: `npm run state-shapes` writes `src/assets/img/states/*.svg` from US Census geometry (us-atlas, public domain).
- **Homepage video**: `src/assets/video/hero.mp4` is the supplied clip, re-encoded without audio at 1.5 MB. It only plays on screens wider than 640px, without reduced motion and without data saver. Everyone else gets the poster frame. The photos in `src/assets/img/photos/` are frames cut from the same clip. The clip shows a Toronto rink, so it is used as decoration only and never captioned as a US location.
- **Leaflet**: self-hosted in `src/assets/vendor/leaflet/`. It loads only on map pages, or when someone clicks Map.

## Before going live

- [x] Run the Outscraper import and commit `data/listings.json` (1,840 rinks from the 2026-10-07 export)
- [ ] Create AdSense ad units and fill in `AD_SLOTS`
- [ ] Set up the `hello@iceskatingnearyou.com` mailbox (`CONTACT_EMAIL` in `scripts/build.mjs`)
- [ ] Claim the social handles, or change `SOCIAL` in `scripts/build.mjs`
- [ ] Fill in the governing-law `[STATE]` placeholder in `src/pages/terms.html`
- [ ] Submit `https://iceskatingnearyou.com/sitemap.xml` in Search Console
- [ ] Re-import at least every 25 days to keep listing photos fresh
