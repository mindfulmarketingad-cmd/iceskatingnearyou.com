/**
 * Imports an Outscraper "Google Maps / Places" export into data/listings.json.
 *
 *   node scripts/import-outscraper.mjs path/to/outscraper-export.xlsx
 *   node scripts/import-outscraper.mjs path/to/export.csv another.json
 *   node scripts/import-outscraper.mjs export.xlsx --keep-all
 *
 * Accepts XLSX (Outscraper's default download), CSV or JSON; several files
 * can be passed at once and are merged. The import REPLACES data/listings.json.
 *
 * What it does to the rows:
 * - Drops CLOSED_PERMANENTLY rows. CLOSED_TEMPORARILY rows are kept and the
 *   listing page says so (seasonal outdoor rinks often show that status).
 * - Drops rows that are not ice venues (roller rinks, skate shops, ice-cream
 *   parlours, which "ice skating rink" searches routinely return). Pass
 *   --keep-all to skip that filter.
 * - Drops rows with no name, no coordinates or no recognisable US state.
 * - De-duplicates on place_id (falling back to name + coordinates), keeping
 *   the row with more reviews.
 * - Maps Outscraper's literal "None" / "N/A" placeholders to null.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normaliseListing, isIceVenue } from './lib/listings.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// LISTINGS_FILE lets a test import write somewhere other than the live dataset.
const DATA_FILE = process.env.LISTINGS_FILE ? resolve(process.env.LISTINGS_FILE) : resolve(ROOT, 'data/listings.json');

/** RFC 4180 CSV parser (quoted fields, embedded commas and newlines). */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const src = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') { inQuotes = true; continue; }
    if (ch === ',') { row.push(field); field = ''; continue; }
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];

  const headers = rows[0].map(normKey);
  return rows
    .slice(1)
    .filter((r) => r.some((cell) => cell.trim() !== ''))
    .map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? '').trim()])));
}

const normKey = (k) => String(k).trim().toLowerCase().replace(/\s+/g, '_');

async function readRows(source) {
  const ext = extname(source).toLowerCase();
  if (ext === '.xlsx' || ext === '.xls') {
    let XLSX;
    try {
      XLSX = (await import('xlsx')).default;
    } catch {
      console.error('Reading XLSX needs the xlsx package: run `npm install` first, or export CSV from Outscraper.');
      process.exit(1);
    }
    const workbook = XLSX.readFile(source);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet, { defval: '' }).map((row) =>
      Object.fromEntries(Object.entries(row).map(([k, v]) => [normKey(k), typeof v === 'string' ? v.trim() : v]))
    );
  }
  if (ext === '.json') {
    const parsed = JSON.parse(readFileSync(source, 'utf8'));
    const rows = Array.isArray(parsed) ? parsed : parsed.listings || parsed.data || [];
    // Outscraper's API returns one array per query; flatten those.
    return rows.flat().map((row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [normKey(k), v])));
  }
  return parseCsv(readFileSync(source, 'utf8'));
}

async function main() {
  const args = process.argv.slice(2);
  const files = args.filter((a) => !a.startsWith('--'));
  const keepAll = args.includes('--keep-all');

  if (!files.length) {
    console.error('Usage: node scripts/import-outscraper.mjs <export.xlsx|.csv|.json> [more files...] [--keep-all]');
    process.exit(1);
  }

  let rows = [];
  for (const file of files) {
    const source = resolve(process.cwd(), file);
    if (!existsSync(source)) {
      console.error(`Import file not found: ${source}`);
      process.exit(1);
    }
    const fileRows = await readRows(source);
    console.log(`Read ${fileRows.length} rows from ${file}`);
    rows = rows.concat(fileRows);
  }

  const skipped = { closed: [], notIce: [], invalid: [], duplicate: [] };
  const byKey = new Map();

  for (const row of rows) {
    if (String(row.business_status || '').toUpperCase() === 'CLOSED_PERMANENTLY') {
      skipped.closed.push(row.name);
      continue;
    }
    if (!keepAll && !isIceVenue(row)) {
      skipped.notIce.push(`${row.name} (${row.category || row.type || 'no category'})`);
      continue;
    }
    const key = String(row.place_id || row.google_id || `${row.name}|${row.latitude}|${row.longitude}`).trim();
    const prev = byKey.get(key);
    if (prev) {
      skipped.duplicate.push(row.name);
      if (Number(row.reviews || 0) <= Number(prev.reviews || 0)) continue;
    }
    byKey.set(key, row);
  }

  const taken = new Set();
  const listings = [];
  for (const row of byKey.values()) {
    const listing = normaliseListing(row, taken);
    if (!listing) {
      skipped.invalid.push(row.name || '(unnamed)');
      continue;
    }
    listings.push(listing);
  }
  listings.sort((a, b) => a.state.localeCompare(b.state) || (a.city || '').localeCompare(b.city || '') || a.name.localeCompare(b.name));

  writeFileSync(
    DATA_FILE,
    `${JSON.stringify({ source: 'outscraper', importedAt: new Date().toISOString(), count: listings.length, listings }, null, 2)}\n`
  );

  console.log(`\nImported ${listings.length} listings across ${new Set(listings.map((l) => l.state)).size} states.`);
  const report = (label, list) => {
    if (!list.length) return;
    console.log(`Skipped ${list.length} ${label}:`);
    for (const s of list.slice(0, 12)) console.log(`  - ${s}`);
    if (list.length > 12) console.log(`  ...and ${list.length - 12} more`);
  };
  report('permanently closed', skipped.closed);
  report('not ice venues (use --keep-all to keep)', skipped.notIce);
  report('missing name, coordinates, US state or city', skipped.invalid);
  report('duplicates', skipped.duplicate);
  console.log('\nNow run: npm run build');
}

if (import.meta.url === `file://${process.argv[1]}`) main();
