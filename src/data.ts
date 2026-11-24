import itemsJson from '../data/videomaps.json';
import placesJson from '../data/places.json';
import erasJson from '../data/eras.json';

export type LinkType = 'youtube' | 'mega' | 'discord' | 'deviantart' | 'reddit' | 'image' | 'wikipedia' | 'other';
export type ContentType = 'video' | 'still' | 'interactive';

export interface Item {
  id: string;
  place: string;
  placeKey: string;
  placeWikiUrl?: string;
  section: string;
  subsection?: string;
  title: string;
  mapper?: string;
  url?: string;
  linkType: LinkType;
  contentType: ContentType;
  eraStart: number;
  eraEnd: number;
  disputed: boolean;
  youtubeId?: string;
  youtubeList?: string;
  note?: string;
  sheetColor?: string;
  /** 0 (worst) … 4 (best) from the sheet's cell colour on Turnt's red→green scale; undefined = no colour in the sheet */
  quality?: number;
  sheetRow: number;
}

export interface Place {
  key: string;
  name: string;
  section: string;
  subsection?: string;
  wikiUrl?: string;
  kind: 'country' | 'group' | 'pin' | 'world' | 'none';
  countries?: string[];
  pin?: [number, number];
  parent?: string;
  method: string;
  confidence: 'exact' | 'guess';
  items: number;
}

export interface Era {
  index: number;
  label: string;
  short: string;
  from: number;
  to: number;
}

export const ITEMS = itemsJson as Item[];

/**
 * Quality scale, after the sheet's "Turnt's trial video organization" legend:
 *   red = video exists but is poorly made / covers the topic partially, yellow = decent quality, green = best quality.
 * The main list fills its cells with that scale plus in-between shades, which map to half steps here.
 */
export const SHEET_QUALITY: Record<string, number> = {
  '#660000': 0,
  '#980000': 0,
  '#ff0000': 1,
  '#ff5500': 1.5,
  '#ff9900': 2,
  '#ffc100': 2.5,
  '#ffff00': 3,
  '#c0ff00': 3.5,
  '#00ff00': 4,
};
/** Items without a colour in the sheet are treated as "decent" for map colouring. */
export const UNRATED_QUALITY = 3;
for (const it of ITEMS) if (it.sheetColor && it.sheetColor in SHEET_QUALITY) it.quality = SHEET_QUALITY[it.sheetColor];
export const qualityOf = (it: Item) => it.quality ?? UNRATED_QUALITY;
export const QUALITY_LABEL = (q: number | undefined) =>
  q === undefined
    ? 'Unrated'
    : q <= 0
      ? 'Very poor'
      : q <= 1
        ? 'Poor / partial'
        : q <= 1.5
          ? 'Poor–fair'
          : q <= 2
            ? 'Fair'
            : q <= 2.5
              ? 'Fair–decent'
              : q <= 3
                ? 'Decent'
                : q <= 3.5
                  ? 'Good'
                  : 'Best quality';
export const PLACES = placesJson as Place[];
export const ERAS = erasJson as Era[];
export const LAST_ERA = ERAS.length - 1;

export const PLACE_BY_KEY = new Map(PLACES.map((p) => [p.key, p]));

/** Sections whose group places are inherited by member countries when the inheritance toggle is on. */
export const INHERIT_SECTIONS = new Set(['World', 'Continents', 'Regions']);

// Spread pins that share identical coordinates so they can be told apart when zoomed in.
{
  const seen = new Map<string, number>();
  for (const p of PLACES) {
    if (!p.pin) continue;
    const k = p.pin.join(',');
    const n = seen.get(k) ?? 0;
    seen.set(k, n + 1);
    if (n > 0) {
      const a = n * 2.4;
      p.pin = [p.pin[0] + Math.cos(a) * 0.12 * n, p.pin[1] + Math.sin(a) * 0.12 * n];
    }
  }
}

export const yearLabel = (y: number) => (y < 0 ? `${-y} BCE` : `${y} CE`);
export const eraYears = (e: Era) => {
  if (e.index === 0) return `before ${yearLabel(e.to + 1)}`;
  if (e.index === LAST_ERA) return `${e.from}–today`;
  if (e.from < 0 && e.to < 0) return `${-e.from}–${-e.to - 1 + 1} BCE`;
  if (e.from < 0) return `${-e.from} BCE–${e.to} CE`;
  return `${e.from}–${e.to}`;
};

export const eraSlug = (e: Era) =>
  e.label
    .normalize('NFKD')
    .replace(/[ᵗʰʳᵈⁿˢ]/g, (c) => ({ ᵗ: 't', ʰ: 'h', ʳ: 'r', ᵈ: 'd', ⁿ: 'n', ˢ: 's' })[c] ?? c)
    .toLowerCase()
    .replace(/>/g, 'before-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export const eraFromParam = (v: string | null): number | undefined => {
  if (v == null || v === '') return undefined;
  if (/^\d+$/.test(v)) {
    const n = Number(v);
    return n >= 0 && n <= LAST_ERA ? n : undefined;
  }
  const i = ERAS.findIndex((e) => eraSlug(e) === v);
  return i >= 0 ? i : undefined;
};

export const spanLabel = (it: Item) =>
  it.eraStart === it.eraEnd ? ERAS[it.eraStart].label : `${ERAS[it.eraStart].label} → ${ERAS[it.eraEnd].label}`;

export const covers = (it: Item, era: number) => it.eraStart <= era && era <= it.eraEnd;

export const SECTIONS = [...new Set(ITEMS.map((i) => i.section))];
export const MAPPERS = [...new Set(ITEMS.map((i) => i.mapper).filter(Boolean) as string[])].sort((a, b) =>
  a.localeCompare(b, undefined, { sensitivity: 'base' }),
);
export const MAPPER_COUNTS = ITEMS.reduce<Record<string, number>>((acc, i) => {
  if (i.mapper) acc[i.mapper] = (acc[i.mapper] ?? 0) + 1;
  return acc;
}, {});

export const LINK_LABEL: Record<LinkType, string> = {
  youtube: 'YouTube',
  mega: 'MEGA',
  discord: 'Discord',
  deviantart: 'DeviantArt',
  reddit: 'Reddit',
  image: 'Image',
  wikipedia: 'Wikipedia',
  other: 'Other',
};
export const CONTENT_LABEL: Record<ContentType, string> = { video: 'Videomaps', still: 'Still maps', interactive: 'Interactive maps' };
export const CONTENT_BADGE: Record<ContentType, string> = { video: 'Video', still: 'Still map', interactive: 'Interactive' };

/** Friendlier names for Natural Earth's abbreviated country names. */
const NICE: Record<string, string> = {
  'United States of America': 'United States',
  'Dem. Rep. Congo': 'DR Congo',
  'Central African Rep.': 'Central African Republic',
  'Dominican Rep.': 'Dominican Republic',
  'Bosnia and Herz.': 'Bosnia and Herzegovina',
  'Eq. Guinea': 'Equatorial Guinea',
  'S. Sudan': 'South Sudan',
  'W. Sahara': 'Western Sahara',
  'N. Cyprus': 'Northern Cyprus',
  'Solomon Is.': 'Solomon Islands',
  'Marshall Is.': 'Marshall Islands',
  'Cook Is.': 'Cook Islands',
  'Faeroe Is.': 'Faroe Islands',
  'Falkland Is.': 'Falkland Islands',
  'Fr. Polynesia': 'French Polynesia',
  'Antigua and Barb.': 'Antigua and Barbuda',
  'St. Vin. and Gren.': 'Saint Vincent and the Grenadines',
  'St. Kitts and Nevis': 'Saint Kitts and Nevis',
  'Macedonia': 'North Macedonia',
  'eSwatini': 'Eswatini',
  'Wallis and Futuna Is.': 'Wallis and Futuna',
  'Fr. S. Antarctic Lands': 'French Southern Lands',
};
export const niceCountry = (n: string) => NICE[n] ?? n;
