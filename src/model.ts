import type { Item, Place } from './data';
import { ERAS, INHERIT_SECTIONS, PLACES, PLACE_BY_KEY, covers, qualityOf } from './data';

/** Per-era lookup tables. Built once per (filtered items, era, inherit) and memoized by the caller. */
export interface EraModel {
  era: number;
  active: Item[];
  byPlace: Map<string, Item[]>;
  /** Items from places that are exactly this one country */
  own: Map<string, Item[]>;
  /** Items inherited from World / Continents / Regions rows (only when inheritance is on) */
  inherited: Map<string, Item[]>;
  /** Multi-country places (regions, wars, empires …) touching this country that have active items */
  groups: Map<string, Place[]>;
  /** Active pin places with a parent country */
  pinsIn: Map<string, Place[]>;
  pins: Place[];
  world: Item[];
  /** Colour of each country: best quality of the maps covering it, and whether that coverage is direct */
  value: Map<string, Tone>;
}

export interface Tone {
  /** number of maps behind this colour */
  n: number;
  /** best quality, 0 … 4 */
  q: number;
  /** own = maps of this country; group = only via a multi-country map; world = only via whole-world maps */
  tone: 'own' | 'group' | 'world';
}

const push = <K, V>(m: Map<K, V[]>, k: K, v: V) => {
  const a = m.get(k);
  if (a) a.push(v);
  else m.set(k, [v]);
};
export const bestQuality = (items: Item[]) => items.reduce((q, it) => Math.max(q, qualityOf(it)), -1);

export function buildEraByEra(filtered: Item[]): Item[][] {
  return ERAS.map((_, e) => filtered.filter((it) => covers(it, e)));
}

export function buildEraModel(era: number, active: Item[], inherit: boolean): EraModel {
  const byPlace = new Map<string, Item[]>();
  for (const it of active) push(byPlace, it.placeKey, it);

  const own = new Map<string, Item[]>();
  const inherited = new Map<string, Item[]>();
  const groups = new Map<string, Place[]>();
  const pinsIn = new Map<string, Place[]>();
  const pins: Place[] = [];
  const world: Item[] = [];

  for (const [key, list] of byPlace) {
    const p = PLACE_BY_KEY.get(key);
    if (!p) continue;
    if (p.kind === 'world') world.push(...list);
    else if (p.kind === 'country' && p.countries) for (const it of list) push(own, p.countries[0], it);
    else if (p.kind === 'group' && p.countries) {
      for (const c of p.countries) {
        push(groups, c, p);
        if (inherit && INHERIT_SECTIONS.has(p.section)) for (const it of list) push(inherited, c, it);
      }
    } else if (p.kind === 'pin') {
      pins.push(p);
      if (p.parent) push(pinsIn, p.parent, p);
    }
  }

  const value = new Map<string, Tone>();
  const allCountries = new Set([...own.keys(), ...groups.keys()]);
  if (inherit && world.length) for (const p of PLACES) for (const c of p.countries ?? []) allCountries.add(c);
  for (const c of allCountries) {
    const direct = [...(own.get(c) ?? []), ...(inherit ? inherited.get(c) ?? [] : [])];
    if (direct.length) {
      value.set(c, { n: direct.length, q: bestQuality(direct), tone: 'own' });
      continue;
    }
    const g = groups.get(c);
    if (g?.length) {
      const items = g.flatMap((p) => byPlace.get(p.key) ?? []);
      value.set(c, { n: items.length, q: bestQuality(items), tone: 'group' });
    } else if (inherit && world.length) value.set(c, { n: world.length, q: bestQuality(world), tone: 'world' });
  }
  return { era, active, byPlace, own, inherited, groups, pinsIn, pins, world, value };
}

// Red → green quality scale, after Turnt's legend (dark red, red, yellow, green) with the sheet's in-between shades.
// Slightly softened from the sheet's pure #ff0000 / #ffff00 / #00ff00 so it sits well on a dark map.
export const QUALITY_STOPS: [number, string][] = [
  [0, '#9b1111'],
  [1, '#e8322a'],
  [1.5, '#f2612b'],
  [2, '#f59a23'],
  [2.5, '#f7c320'],
  [3, '#f1e33a'],
  [3.5, '#b9e43a'],
  [4, '#37d65a'],
];
export const qualityColor = (q: number) => {
  let c = QUALITY_STOPS[0][1];
  for (const [v, col] of QUALITY_STOPS) if (q >= v) c = col;
  return c;
};
/** Legend: the four levels of Turnt's scale */
export const QUALITY_LEGEND: { q: number; label: string }[] = [
  { q: 0, label: 'Very poor' },
  { q: 1, label: 'Poor / partial' },
  { q: 2, label: 'Fair' },
  { q: 3, label: 'Decent' },
  { q: 4, label: 'Best' },
];
/** No coverage in this era */
export const NO_COVERAGE = '#000000';

export function fillFor(v?: Tone): string {
  if (!v || v.q < 0) return NO_COVERAGE;
  return qualityColor(v.q);
}
