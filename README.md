# Videomaps Atlas

An interactive dark world map of history *videomaps* (plus still and interactive maps), built from the community “Best Videomaps list” Google Sheet. Drag the era slider through 30 eras, from before 2000 BCE to today; places with maps covering that era light up. Click a place to list its maps, and YouTube videos play inline.

**Live site:** https://rollotheviking112.github.io/videomaps-atlas/

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # static site in dist/ (npm run preview to serve it)
```

No API keys, no paid services. Boundaries are Natural Earth 1:50m from the `world-atlas` npm package, bundled locally. The app never calls a geo API at runtime. The only external requests at runtime are Google Fonts, YouTube thumbnails, and the `youtube-nocookie.com` player when someone presses play.

## Publishing

`.github/workflows/pages.yml` builds the site and publishes it to GitHub Pages on every push to `main`. You can also run it by hand from the Actions tab. Asset paths are relative (`base: './'` in `vite.config.ts`), so the built `dist/` works from any URL path.

## Re-import the sheet

```bash
npm run import                  # fetch the live sheet, rebuild data/
npm run import -- --offline     # rebuild from the cached raw/sheet.html + raw/sheet.csv
npm run import -- --wiki        # also look up Wikipedia coordinates for new, unplaced rows
```

The importer (`scripts/import-sheet.mjs`, zero dependencies apart from `d3-geo` and `topojson-client` for point-in-country tests) does the following:

1. Fetches the public **HTML view** of the sheet. That view keeps merges (`colspan` / `rowspan`), hyperlinks (and unwraps Google's `google.com/url?q=` redirects), and cell CSS classes. It also fetches the CSV export, but only to cross-check text.
2. Walks the grid:
   - **Era span** is the merged column range. Column B = Post-Cold War … AE = >2000 BCE, stored as `eraStart`/`eraEnd` with 0 = oldest.
   - **Place** is column A. A `rowspan` or an empty A cell continues the place above.
   - **Section / subsection** come from header rows merged across all 31 columns. 15pt headers start a section and smaller ones (e.g. "WW2 (1939-1945)") start a subsection. Title rows ("Human Mapping", "Best Videomaps") are skipped, and everything from "Animal Mapping" on is excluded.
   - Multiple items per row, and rich-text cells holding several smart-chip links, become separate items.
   - When one item is split around an empty coloured filler cell, the two halves are re-joined (Denmark, Ireland, Korea, Switzerland).
   - **Disputed (red border):** Google draws a shared edge once. A cell's top edge is the *bottom* border of the cell above, and its left edge is the *right* border of the cell to its left. The importer resolves all four sides from the cell and its neighbours, and flags an item when ≥3 sides are red. Every flagged item is printed, and so is any cell with exactly 2 red sides.
   - **Mapper / title**: `Mapper: Title` (split on the first `: `), `Title by X on DeviantArt`, `X's works on …`, `Title - YouTube (Mapper)` smart chips, `… : r/MapPorn` Reddit titles, and raw-URL cells (titled by the place label; warnings like "might not load…" are kept as a note).
   - Link type comes from the host, and content type from the section (still/interactive) or the link (images).
3. Writes the following files:
   - `data/videomaps.json`: items
   - `data/eras.json`: 30 eras, oldest first, with approximate years used only for labels
   - `data/places.json`: the geography for each place
   - `data/geo-review.csv`: every place, how it was located, `exact` or `guess`, and item count
4. Prints a summary: items per section and per era, link and content types, items without a URL, unmapped places, unknown country names in the config, and the list of disputed items for a human to check.

## Geography: where to edit

Places are resolved in this order. The first match wins.

| Order | Source | Used for |
|---|---|---|
| 1 | **`data/geo-overrides.json`** | Your manual corrections. They survive every re-import. |
| 2 | `config/place-geo.json` | Curated placements: sub-national pins, wars, empires, peoples, still-map labels … |
| 3 | `config/regions.json` | Continents and regions (only for rows in the *Continents* / *Regions* sections) |
| 4 | Country name / `X (Total)` | The modern country polygon (aliases in `config/country-aliases.json`) |
| 5 | `X (Sub-part)` | A pin from cached Wikipedia coordinates (`--wiki`), else the country's centroid (`guess`) |
| 6 | Keyword scan | Region or country names found in the label / Wikipedia title (`guess`) |

Rows in non-place sections (Wars, Historical, Royal Houses …) are always marked `guess` in `geo-review.csv` unless you set `"confidence": "exact"`.

**Override format.** Keys are the column-A text, optionally prefixed `Section::` to tell apart duplicates like `Archaeological Cultures::Europe`:

```jsonc
// data/geo-overrides.json
{
  "Greece (Corinth)":          { "pin": [22.93, 37.94], "in": "Greece" },
  "Hundred Years' War":        { "countries": ["France", "United Kingdom"] },
  "Wars::Middle East":         { "region": "Middle East" },
  "Ongoing Wars":              { "world": true },
  "Iraq and Khuzestan":        { "countries": ["Iraq", "Iran"], "confidence": "exact" }
}
```

`pin` is `[longitude, latitude]`. `in` (the parent country) is optional, because the importer finds it by point-in-polygon. Country names can be common names ("DR Congo", "Czech Republic", "Ivory Coast"). They are mapped to Natural Earth names through `config/country-aliases.json`, and unknown names are reported by the importer.

**Region groupings** live in `config/regions.json` as `name → [countries]`. A list can include another group with `"@Name"`, e.g. `"Southeast Asia": [..., "@Malay Archipelago"]`. Edit them, then re-run `npm run import -- --offline`.

## How the map reads

- **Colour = quality of the best map covering a country in that era.** The scale follows the sheet's *Turnt's trial video organization* tab (gid 2029688417): red = the video exists but is poorly made or only partly covers the topic, yellow = decent, green = best. The main list colours its cells on that scale, with in-between shades. The importer keeps those colours as `sheetColor`, and `src/data.ts` (`SHEET_QUALITY`) maps them to a 0–4 score:

  | Sheet colour | `#660000` | `#ff0000` | `#ff5500` | `#ff9900` | `#ffc100` | `#ffff00` | `#c0ff00` | `#00ff00` | none |
  |---|---|---|---|---|---|---|---|---|---|
  | Score | 0 very poor | 1 poor / partial | 1.5 | 2 fair | 2.5 | 3 decent | 3.5 good | 4 best | treated as 3 |

- **Black** = no video coverage of that country in the selected era.
- **A darker shade of the same colour** = covered only as part of a multi-country map (a region, empire, war or alliance) or only by whole-world maps.
- Pins and clusters use the same scale. A cluster takes the best quality among its members.
- **Include region/continent/world maps** is off by default. When it is on, each country also counts and lists the items of the *World*, *Continents* and *Regions* rows that contain it, tagged "via Europe" etc. World-only coverage gets a muted base tone so the map doesn't saturate.
- Pins cluster in screen space and split apart as you zoom. Microstates get a dot so they stay clickable.
- All state is in the URL: `?era=13th&place=c:Romania&q=…&filters=sec:Countries|Wars;map:Ollie Bye;ct:video;lt:youtube;nd&inherit=1&all=1`.

## Stack and why

- **Vite + React 18 + TypeScript.** React has no extra framework, and JSX is compiled by Vite's esbuild (no Babel plugin), so the toolchain is small.
- **d3-geo + d3-zoom rendering SVG**, rather than MapLibre or react-simple-maps. With ~240 country shapes and ~100 pins, SVG gives CSS-animated fill transitions between eras for free (no flashing), crisp borders via `vector-effect: non-scaling-stroke`, and full control over the dark "mapping channel" look. It needs no tile server, style JSON or WebGL. Paths are projected once per viewport size and zoom is a single `<g>` transform, so panning and pinching stay smooth. The Natural Earth projection keeps the whole world on screen.
- **Hand-written CSS** instead of Tailwind. It is one stylesheet with design tokens and responsive rules: a right-hand panel on desktop and a bottom sheet on mobile.
- **Fonts:** Oswald for display and Inter for text (Google Fonts), with system fallbacks.

## Files

```
scripts/import-sheet.mjs      importer entry (npm run import)
scripts/lib/                  sheet HTML parser, item extraction, eras, geo resolver
config/                       regions, country aliases, curated place geography
data/                         generated JSON + geo-review.csv; geo-overrides.json is yours
src/                          the app (App.tsx, model.ts, components/)
raw/                          cache of the last fetched sheet (git-ignored)
```
