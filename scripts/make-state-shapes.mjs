/**
 * Writes one outline SVG per state (plus DC) to src/assets/img/states/, used
 * by the state tiles on the homepage and /states/. Run once; the output is
 * committed, so builds do not need these packages.
 *
 *   npm run state-shapes
 *
 * Source geometry: us-atlas (US Census Bureau cartographic boundaries,
 * public domain), via topojson-client and d3-geo.
 */
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { feature } from 'topojson-client';
import { geoPath, geoTransverseMercator, geoCentroid, geoArea } from 'd3-geo';
import { STATES, slugify } from './lib/listings.mjs';

const require = createRequire(import.meta.url);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'src/assets/img/states');
const topo = JSON.parse(readFileSync(require.resolve('us-atlas/states-10m.json'), 'utf8'));
const states = feature(topo, topo.objects.states).features;
const SIZE = 100;
const PAD = 6;

mkdirSync(OUT, { recursive: true });
const wanted = new Set(Object.values(STATES));
let written = 0;

for (const f of states) {
  const name = f.properties.name;
  if (!wanted.has(name)) continue;

  // Drop small islands so the outline reads at tile size (Alaska's
  // Aleutians, the Florida Keys, etc.), keeping the main landmass whole.
  if (f.geometry.type === 'MultiPolygon') {
    const polys = f.geometry.coordinates.map((c) => ({ c, a: geoArea({ type: 'Polygon', coordinates: c }) }));
    const max = Math.max(...polys.map((p) => p.a));
    const keepRatio = name === 'Hawaii' ? 0.02 : 0.04;
    f.geometry.coordinates = polys.filter((p) => p.a >= max * keepRatio).map((p) => p.c);
  }

  const [lon] = geoCentroid(f);
  const projection = geoTransverseMercator()
    .rotate([-lon, 0])
    .fitExtent([[PAD, PAD], [SIZE - PAD, SIZE - PAD]], f);
  const d = geoPath(projection.precision(0.4))(f)
    .replace(/(\d+\.\d)\d+/g, '$1');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}"><path d="${d}" fill="#e8f2fc" stroke="#0b3a75" stroke-width="1.6" stroke-linejoin="round"/></svg>\n`;
  writeFileSync(resolve(OUT, `${slugify(name)}.svg`), svg);
  written++;
}
console.log(`Wrote ${written} state outlines to src/assets/img/states/`);
