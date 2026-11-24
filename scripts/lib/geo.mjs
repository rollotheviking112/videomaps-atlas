import fs from 'node:fs';
import { createRequire } from 'node:module';
import { feature } from 'topojson-client';
import { geoCentroid, geoContains, geoArea } from 'd3-geo';

const require = createRequire(import.meta.url);

// Sections whose rows are actual places (vs. topics). Assignments in other sections are always "guess".
const PLACE_SECTIONS = new Set(['World', 'Continents', 'Regions', 'Countries', 'Micronations', 'Sub-Regions']);

const norm = (s) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export function loadAtlas() {
  const topo = require('world-atlas/countries-50m.json');
  const fc = feature(topo, topo.objects.countries);
  const byName = new Map();
  for (const f of fc.features) byName.set(f.properties.name, f);
  return { fc, byName };
}

export function makeResolver({ atlas, aliases, regions }) {
  const normToAtlas = new Map();
  for (const name of atlas.byName.keys()) normToAtlas.set(norm(name), name);
  for (const [k, v] of Object.entries(aliases)) if (!k.startsWith('_')) normToAtlas.set(norm(k), v);
  const unknown = new Set();

  function country(name) {
    const hit = normToAtlas.get(norm(name));
    if (hit && atlas.byName.has(hit)) return hit;
    return undefined;
  }

  function regionCountries(name, seen = new Set()) {
    if (seen.has(name)) return [];
    seen.add(name);
    const list = regions[name];
    if (!list) return undefined;
    const out = [];
    for (const entry of list) {
      if (entry.startsWith('@')) out.push(...(regionCountries(entry.slice(1), seen) ?? []));
      else {
        const c = country(entry);
        if (c) out.push(c);
        else unknown.add(`${entry} (in region "${name}")`);
      }
    }
    return [...new Set(out)];
  }

  function countriesFrom(list, ctx) {
    const out = [];
    for (const n of list) {
      const c = country(n);
      if (c) out.push(c);
      else unknown.add(`${n} (in ${ctx})`);
    }
    return out;
  }

  function parentOf(lonlat) {
    // Prefer the smallest containing feature (e.g. an enclave) to the largest
    let best;
    for (const f of atlas.fc.features) {
      if (geoContains(f, lonlat)) {
        const a = geoArea(f);
        if (!best || a < best.a) best = { name: f.properties.name, a };
      }
    }
    return best?.name;
  }

  function centroid(name) {
    const f = atlas.byName.get(name);
    return f ? geoCentroid(f).map((x) => Math.round(x * 100) / 100) : undefined;
  }

  const allCountryNames = [...atlas.byName.keys(), ...Object.keys(aliases).filter((k) => !k.startsWith('_') && k.length > 3)];
  return { country, regionCountries, countriesFrom, parentOf, centroid, unknown, norm, allCountryNames };
}

/**
 * Assign a geography to every place.
 * Order: overrides → curated (config/place-geo.json) → region config (Continents/Regions) →
 * country name / "(Total)" → "Country (Sub)" via Wikipedia coords or country centroid →
 * Wikipedia coords for anything else → keyword scan → unmapped.
 */
export function assignGeo(places, { resolver, curated, overrides, wikiCoords, regions }) {
  const lookup = (table, p) => table[`${p.section}::${p.name}`] ?? table[p.name];
  const out = [];
  const regionNames = Object.keys(regions).filter((k) => !k.startsWith('_'));

  for (const p of places) {
    const isPlaceSection = PLACE_SECTIONS.has(p.section);
    let geo;
    let method;

    const fromSpec = (spec, m) => {
      if (spec.world) return { kind: 'world', countries: [], method: m };
      if (spec.pin) {
        const pin = spec.pin;
        const parent = spec.in ? resolver.country(spec.in) : resolver.parentOf(pin);
        return { kind: 'pin', pin, parent, method: m };
      }
      let countries = [];
      if (spec.region) {
        for (const r of [].concat(spec.region)) {
          const rc = resolver.regionCountries(r);
          if (!rc) resolver.unknown.add(`region "${r}" (for ${p.name})`);
          else countries.push(...rc);
        }
      }
      if (spec.countries) countries.push(...resolver.countriesFrom(spec.countries, p.name));
      countries = [...new Set(countries)];
      if (!countries.length) return undefined;
      return { kind: countries.length === 1 ? 'country' : 'group', countries, method: m };
    };

    const ov = lookup(overrides, p);
    if (ov) {
      geo = fromSpec(ov, 'override');
      if (geo) geo.confidence = ov.confidence ?? 'exact';
    }
    if (!geo) {
      const cur = lookup(curated, p);
      if (cur) {
        geo = fromSpec(cur, 'curated');
        if (geo) geo.confidence = cur.confidence ?? (isPlaceSection ? 'exact' : 'guess');
      }
    }
    if (!geo && regions[p.name] && (p.section === 'Continents' || p.section === 'Regions')) {
      geo = fromSpec({ region: p.name }, 'region-config');
      if (geo) geo.confidence = 'exact';
    }
    if (!geo) {
      const base = p.name.replace(/\s*\(Total\)\s*$/i, '');
      const c = resolver.country(base);
      if (c) {
        geo = { kind: 'country', countries: [c], method: base === p.name ? 'country-name' : 'country-total', confidence: isPlaceSection ? 'exact' : 'guess' };
      }
    }
    if (!geo) {
      const sub = /^(.+?)\s*\((.+)\)\s*$/.exec(p.name);
      const parent = sub ? resolver.country(sub[1]) : undefined;
      const wc = p.wikiUrl ? wikiCoords[p.wikiUrl] : undefined;
      if (parent) {
        if (wc) geo = { kind: 'pin', pin: wc, parent, method: 'wiki-coords', confidence: 'exact' };
        else geo = { kind: 'pin', pin: resolver.centroid(parent), parent, method: 'country-centroid', confidence: 'guess' };
      } else if (wc) {
        geo = { kind: 'pin', pin: wc, parent: resolver.parentOf(wc), method: 'wiki-coords', confidence: isPlaceSection ? 'exact' : 'guess' };
      }
    }
    if (!geo) {
      // Keyword scan: region names, then country names, found inside the label or its Wikipedia title
      const hay = ` ${resolver.norm(p.name)} ${p.wikiUrl ? resolver.norm(decodeURIComponent(p.wikiUrl.split('/wiki/')[1] ?? '')) : ''} `;
      const regionHits = regionNames.filter((r) => hay.includes(` ${resolver.norm(r)} `));
      const countryHits = [];
      for (const name of resolver.allCountryNames ?? []) if (hay.includes(` ${resolver.norm(name)} `)) countryHits.push(name);
      if (regionHits.length) geo = fromSpec({ region: regionHits }, 'keyword');
      else if (countryHits.length) geo = fromSpec({ countries: countryHits }, 'keyword');
      if (geo) geo.confidence = 'guess';
    }
    if (!geo) geo = { kind: 'none', countries: [], method: 'unmapped', confidence: 'guess' };
    out.push({ ...p, ...geo });
  }
  return out;
}

export function readJson(path, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path, 'utf8'));
  } catch (e) {
    if (fallback !== undefined) return fallback;
    throw e;
  }
}
