#!/usr/bin/env node
// Re-runnable importer: Google Sheet → data/videomaps.json, data/eras.json, data/places.json, data/geo-review.csv
//
//   npm run import              fetch the live sheet (HTML view + CSV), then build data/
//   npm run import -- --offline reuse raw/sheet.html + raw/sheet.csv from the last fetch
//   npm run import -- --wiki    also look up Wikipedia coordinates for places without a curated
//                               location (cached in data/wiki-coords-cache.json; never at runtime)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseGrid } from './lib/sheet.mjs';
import { extractItems } from './lib/items.mjs';
import { ERAS } from './lib/eras.mjs';
import { loadAtlas, makeResolver, assignGeo, readJson } from './lib/geo.mjs';

const SHEET_ID = '19Qqy1UtPE-OPFL6pB44G4Nq7oKPcTcp_vp3VwCFwugQ';
const GID = '982568981';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = path.join(ROOT, 'raw');
const DATA = path.join(ROOT, 'data');
const CONFIG = path.join(ROOT, 'config');
const args = new Set(process.argv.slice(2));
const UA = { 'User-Agent': 'videomaps-atlas-importer/1.0 (local script)' };

const c = { b: (s) => `\x1b[1m${s}\x1b[0m`, dim: (s) => `\x1b[2m${s}\x1b[0m`, red: (s) => `\x1b[31m${s}\x1b[0m`, yel: (s) => `\x1b[33m${s}\x1b[0m`, grn: (s) => `\x1b[32m${s}\x1b[0m` };

async function getText(url, cacheFile) {
  if (args.has('--offline')) {
    if (!fs.existsSync(cacheFile)) throw new Error(`--offline: ${cacheFile} not found; run once without --offline`);
    return fs.readFileSync(cacheFile, 'utf8');
  }
  const res = await fetch(url, { headers: UA, redirect: 'follow' });
  if (!res.ok) throw new Error(`${res.status} fetching ${url}`);
  const text = await res.text();
  fs.mkdirSync(RAW, { recursive: true });
  fs.writeFileSync(cacheFile, text);
  return text;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') (field += '"'), i++;
      else if (ch === '"') q = false;
      else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') row.push(field), (field = '');
    else if (ch === '\n') row.push(field), rows.push(row), (row = []), (field = '');
    else if (ch !== '\r') field += ch;
  }
  if (field || row.length) row.push(field), rows.push(row);
  return rows;
}

const csvEsc = (v) => {
  const s = v === undefined || v === null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

async function fetchWikiCoords(urls, cache) {
  const todo = [...new Set(urls)].filter((u) => !(u in cache));
  const titleOf = (u) => decodeURIComponent(u.split('/wiki/')[1] ?? '').replace(/_/g, ' ').split('#')[0];
  for (let i = 0; i < todo.length; i += 50) {
    const batch = todo.slice(i, i + 50);
    const titles = batch.map(titleOf).join('|');
    const api = `https://en.wikipedia.org/w/api.php?action=query&prop=coordinates&redirects=1&format=json&titles=${encodeURIComponent(titles)}`;
    try {
      const res = await fetch(api, { headers: UA });
      const json = await res.json();
      const norm = new Map();
      for (const n of json.query?.normalized ?? []) norm.set(n.from, n.to);
      for (const n of json.query?.redirects ?? []) norm.set(norm.get(n.from) ?? n.from, n.to);
      const coordsByTitle = new Map();
      for (const p of Object.values(json.query?.pages ?? {})) if (p.coordinates?.[0]) coordsByTitle.set(p.title, [p.coordinates[0].lon, p.coordinates[0].lat]);
      for (const u of batch) {
        let t = titleOf(u);
        t = norm.get(t) ?? t;
        t = norm.get(t) ?? t;
        cache[u] = coordsByTitle.get(t) ?? null;
      }
    } catch (e) {
      console.warn(c.yel(`  wikipedia lookup failed for a batch: ${e.message}`));
    }
  }
  return cache;
}

async function main() {
  console.log(c.b('▸ Fetching sheet') + c.dim(args.has('--offline') ? ' (offline cache)' : ''));
  const html = await getText(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/htmlview/sheet?headers=true&gid=${GID}`, path.join(RAW, 'sheet.html'));
  let csvText;
  try {
    csvText = await getText(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${GID}`, path.join(RAW, 'sheet.csv'));
  } catch (e) {
    console.warn(c.yel(`  CSV cross-check skipped: ${e.message}`));
  }

  console.log(c.b('▸ Parsing grid'));
  const grid = parseGrid(html, GID);
  const { items, places, log } = extractItems(grid);
  console.log(`  ${grid.maxRow + 1} rows, ${grid.cells.size} cells, ${items.length} items, ${log.excluded} excluded (Animal Mapping) cells`);

  // CSV cross-check: every HTML item text must exist in the same CSV row
  if (csvText) {
    const csv = parseCsv(csvText);
    let mismatches = 0;
    for (const it of items) {
      const row = csv[it.row - 1] ?? [];
      const joined = row.slice(1).join(' ');
      const probe = it.title.slice(0, 24);
      if (!joined.includes(probe) && !(it.mapper && joined.includes(it.mapper)) && !(it.url && joined.includes(it.url.slice(0, 30)))) {
        mismatches++;
        if (mismatches <= 5) console.warn(c.yel(`  CSV mismatch row ${it.row}: ${it.title}`));
      }
    }
    console.log(`  CSV cross-check: ${csv.length} CSV rows, ${mismatches} item(s) not found in CSV text`);
  }

  // Drop places with no items (e.g. parent label rows)
  const used = new Set(items.map((i) => i.placeKey));
  const realPlaces = places.filter((p) => used.has(p.key));

  console.log(c.b('▸ Geography'));
  const atlas = loadAtlas();
  const aliases = readJson(path.join(CONFIG, 'country-aliases.json'));
  const regions = readJson(path.join(CONFIG, 'regions.json'));
  const curated = readJson(path.join(CONFIG, 'place-geo.json'));
  const overridesPath = path.join(DATA, 'geo-overrides.json');
  const overrides = readJson(overridesPath, {});
  const wikiCachePath = path.join(DATA, 'wiki-coords-cache.json');
  const wikiCoords = readJson(wikiCachePath, {});
  if (args.has('--wiki')) {
    const pre = makeResolver({ atlas, aliases, regions });
    const want = realPlaces
      .filter((p) => p.wikiUrl && !overrides[p.name] && !curated[p.name] && !curated[`${p.section}::${p.name}`] && !regions[p.name] && !pre.country(p.name.replace(/\s*\(Total\)\s*$/i, '')))
      .map((p) => p.wikiUrl);
    console.log(`  looking up ${want.length} Wikipedia coordinate(s)…`);
    await fetchWikiCoords(want, wikiCoords);
    fs.writeFileSync(wikiCachePath, JSON.stringify(wikiCoords, null, 2) + '\n');
  }
  const resolver = makeResolver({ atlas, aliases, regions });
  const geoPlaces = assignGeo(realPlaces, { resolver, curated, overrides, wikiCoords, regions });

  const countByPlace = new Map();
  for (const it of items) countByPlace.set(it.placeKey, (countByPlace.get(it.placeKey) ?? 0) + 1);

  const placesOut = geoPlaces.map((p) => ({
    key: p.key,
    name: p.name,
    section: p.section,
    ...(p.subsection ? { subsection: p.subsection } : {}),
    ...(p.wikiUrl ? { wikiUrl: p.wikiUrl } : {}),
    kind: p.kind,
    ...(p.countries?.length ? { countries: p.countries } : {}),
    ...(p.pin ? { pin: p.pin } : {}),
    ...(p.parent ? { parent: p.parent } : {}),
    method: p.method,
    confidence: p.confidence,
    items: countByPlace.get(p.key) ?? 0,
  }));

  // Strip internal fields from items
  const itemsOut = items.map(({ row, ...rest }) => ({ ...rest, sheetRow: row }));

  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(path.join(DATA, 'videomaps.json'), JSON.stringify(itemsOut, null, 1) + '\n');
  fs.writeFileSync(
    path.join(DATA, 'eras.json'),
    JSON.stringify(ERAS.map((e, i) => ({ index: i, ...e })), null, 2) + '\n',
  );
  fs.writeFileSync(path.join(DATA, 'places.json'), JSON.stringify(placesOut, null, 1) + '\n');
  if (!fs.existsSync(overridesPath)) {
    fs.writeFileSync(
      overridesPath,
      JSON.stringify(
        {
          _comment:
            'Human corrections. Same format as config/place-geo.json; keys are the column-A name, optionally "Section::Name". These win over everything else on re-import. Example: "Greece (Corinth)": { "pin": [22.93, 37.94], "in": "Greece" }',
        },
        null,
        2,
      ) + '\n',
    );
  }
  const header = ['place', 'section', 'subsection', 'kind', 'countries', 'pin_lon', 'pin_lat', 'parent', 'method', 'confidence', 'items', 'wiki_url'];
  const lines = [header.join(',')];
  for (const p of placesOut)
    lines.push(
      [p.name, p.section, p.subsection, p.kind, (p.countries ?? []).join('; '), p.pin?.[0], p.pin?.[1], p.parent, p.method, p.confidence, p.items, p.wikiUrl].map(csvEsc).join(','),
    );
  fs.writeFileSync(path.join(DATA, 'geo-review.csv'), lines.join('\n') + '\n');

  // ── Summary ───────────────────────────────────────────────────────────
  console.log(c.b('\n━━━ Summary ━━━'));
  const bySection = {};
  for (const it of items) bySection[it.section] = (bySection[it.section] ?? 0) + 1;
  console.log(c.b('Items per section:'));
  for (const [s, n] of Object.entries(bySection)) console.log(`  ${s.padEnd(26)} ${String(n).padStart(4)}`);
  console.log(`  ${'TOTAL'.padEnd(26)} ${String(items.length).padStart(4)}`);

  console.log(c.b('Items per era (covering):'));
  const perEra = ERAS.map((_, e) => items.filter((i) => i.eraStart <= e && e <= i.eraEnd).length);
  const max = Math.max(...perEra);
  ERAS.forEach((e, i) => console.log(`  ${e.label.padEnd(22)} ${String(perEra[i]).padStart(4)} ${'█'.repeat(Math.round((perEra[i] / max) * 40))}`));

  const byLink = {};
  for (const it of items) byLink[it.linkType] = (byLink[it.linkType] ?? 0) + 1;
  console.log(c.b('Link types: ') + Object.entries(byLink).map(([k, v]) => `${k} ${v}`).join(' · '));
  const byCT = {};
  for (const it of items) byCT[it.contentType] = (byCT[it.contentType] ?? 0) + 1;
  console.log(c.b('Content types: ') + Object.entries(byCT).map(([k, v]) => `${k} ${v}`).join(' · '));

  const noUrl = items.filter((i) => !i.url);
  console.log(c.b(`Items with no URL: ${noUrl.length}`));
  for (const i of noUrl) console.log(c.dim(`  row ${i.row}: ${i.place} — ${i.title}`));

  const unmapped = placesOut.filter((p) => p.kind === 'none');
  console.log(c.b(`Unmapped places: ${unmapped.length}`));
  for (const p of unmapped) console.log(c.yel(`  ${p.section} › ${p.name}`));
  const byMethod = {};
  for (const p of placesOut) byMethod[`${p.method}/${p.confidence}`] = (byMethod[`${p.method}/${p.confidence}`] ?? 0) + 1;
  console.log(c.b(`Places: ${placesOut.length} — `) + Object.entries(byMethod).map(([k, v]) => `${k} ${v}`).join(' · '));
  if (resolver.unknown.size) {
    console.log(c.yel(`Unknown country names in config (${resolver.unknown.size}):`));
    for (const u of resolver.unknown) console.log(c.yel(`  ${u}`));
  }

  console.log(c.b(`Disputed (red border) items: ${log.disputed.length}`) + c.dim('  ← please verify'));
  for (const d of log.disputed) console.log(c.red(`  row ${d.row}: [${d.place}] ${d.text}  (${Object.entries(d.sides).filter(([, v]) => v).map(([k]) => k).join('+')})`));
  if (log.partialRed.length) {
    console.log(c.yel(`Cells with only 2 red sides (NOT flagged, check): ${log.partialRed.length}`));
    for (const d of log.partialRed) console.log(c.yel(`  row ${d.row}: [${d.place}] ${d.text}  (${Object.entries(d.sides).filter(([, v]) => v).map(([k]) => k).join('+')})`));
  }
  if (log.merged.length) {
    console.log(c.b(`Split cells re-joined (same item on both sides of an empty filler cell): ${log.merged.length}`));
    for (const m of log.merged) console.log(c.dim(`  row ${m.row}: ${m.text}`));
  }
  if (log.labelEra.length) {
    console.log(c.b('Still-map label year vs. column:'));
    for (const l of log.labelEra) console.log(c.dim(`  row ${l.row}: "${l.label}" year ${l.year} → label says ${l.labelEra}, column says ${l.columnEra}; used ${l.used}`));
  }
  if (log.skippedRows.length) console.log(c.yel(`Skipped rows: ${JSON.stringify(log.skippedRows)}`));
  console.log(c.grn(`\n✓ Wrote data/videomaps.json (${itemsOut.length}), data/places.json (${placesOut.length}), data/eras.json, data/geo-review.csv`));
}

main().catch((e) => {
  console.error(c.red(e.stack ?? e));
  process.exit(1);
});
