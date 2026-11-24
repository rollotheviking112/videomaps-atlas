import { cellAt, cellParts, redSides } from './sheet.mjs';
import { ERAS, colToEra, eraForYear, yearFromLabel } from './eras.mjs';

const ERA_COLS = 30;

export function classifyLink(url) {
  if (!url) return undefined;
  let host = '';
  let path = '';
  try {
    const u = new URL(url);
    host = u.hostname.toLowerCase();
    path = u.pathname.toLowerCase();
  } catch {
    return 'other';
  }
  if (/(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)$/.test(host)) return 'youtube';
  if (/(^|\.)mega\.(nz|io|co\.nz)$/.test(host)) return 'mega';
  if (/(^|\.)(discord\.com|discordapp\.com|discordapp\.net|discord\.gg)$/.test(host)) return 'discord';
  if (/(^|\.)deviantart\.com$/.test(host) || host === 'fav.me') return 'deviantart';
  if (host === 'i.redd.it' || host === 'preview.redd.it') return 'image';
  if (/(^|\.)(reddit\.com|redd\.it)$/.test(host)) return 'reddit';
  if (/(^|\.)(imgur\.com|ibb\.co|imgbb\.com|postimg\.cc|i\.postimg\.cc)$/.test(host)) return 'image';
  if (/\.(png|jpe?g|gif|webp|svg)$/.test(path)) return 'image';
  if (/(^|\.)(wikipedia\.org|wikimedia\.org)$/.test(host)) return 'wikipedia';
  return 'other';
}

export function youtubeInfo(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\.|^m\./, '');
    let id;
    if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
    else if (u.pathname === '/watch') id = u.searchParams.get('v');
    else {
      const m = /^\/(?:shorts|embed|live|v)\/([\w-]{6,})/.exec(u.pathname);
      if (m) id = m[1];
    }
    const list = u.searchParams.get('list') ?? undefined;
    return { youtubeId: id || undefined, youtubeList: !id && list ? list : undefined };
  } catch {
    return {};
  }
}

/** Parse a cell's text into { title, mapper, note }. */
export function parseTitle(text, placeLabel) {
  let t = text.trim();
  let note;
  const warn = /\s*\((WARNING[^)]*)\)\s*/i.exec(t);
  if (warn) {
    note = warn[1].trim();
    t = t.replace(warn[0], ' ').trim();
  }
  // Raw URL as the cell text
  if (/^https?:\/\//i.test(t)) {
    const rest = t.replace(/^\S+\s*/, '').trim();
    return { title: rest || placeLabel, mapper: undefined, note, rawUrlText: true };
  }
  // Reddit page titles: "Some title : r/MapPorn" → no reliable mapper
  const reddit = /^(.+?)\s+:\s+r\/\w+\s*$/.exec(t);
  if (reddit) return { title: reddit[1].trim(), mapper: undefined, note };
  // Smart chip "Title - YouTube (Mapper)"
  let m = /^(.+?)\s+-\s+YouTube\s*\(([^)]+)\)\s*$/i.exec(t);
  if (m) return { title: m[1].trim(), mapper: m[2].trim(), note };
  // "X's (good) works on DeviantArt"
  m = /^(.+?)['’]s*\s+(?:good\s+|best\s+)?works?(?:\s+on\s+(.+))?$/i.exec(t);
  if (m) return { title: t, mapper: m[1].replace(/^All of\s+/i, '').trim(), note };
  m = /^All of (.+?)['’]s works/i.exec(t);
  if (m) return { title: t, mapper: m[1].trim(), note };
  // "Title by Mapper on DeviantArt"
  m = /^(.+)\s+by\s+(.+?)\s+on\s+(DeviantArt|Reddit|Imgur|Wikimedia Commons|Wikipedia)\s*$/i.exec(t);
  if (m) return { title: m[1].trim(), mapper: m[2].trim(), note };
  // "Mapper: Title"
  const idx = t.indexOf(': ');
  if (idx > 0 && idx <= 60) return { title: t.slice(idx + 2).trim(), mapper: t.slice(0, idx).trim(), note };
  // "Title by mapper" (single token mapper)
  m = /^(.+)\s+by\s+([\w.-]+)\s*$/i.exec(t);
  if (m) return { title: m[1].trim(), mapper: m[2].trim(), note };
  return { title: t, mapper: undefined, note };
}

function contentTypeFor(section, linkType, url) {
  if (section === 'Best still maps') return 'still';
  if (section === 'Best interactive maps') return 'interactive';
  if (linkType === 'image') return 'still';
  if (linkType === 'discord' && url && /\.(png|jpe?g|gif|webp)(\?|$)/i.test(url)) return 'still';
  return 'video';
}

const slug = (s) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);

/**
 * Walk the grid and produce items plus diagnostics.
 */
export function extractItems(grid) {
  const items = [];
  const places = new Map(); // name -> {name, wikiUrl, section, subsection}
  const log = { disputed: [], partialRed: [], headers: [], skippedRows: [], merged: [], fillers: [], labelEra: [], excluded: 0 };

  let mode = 'pre'; // pre | include | exclude
  let section;
  let subsection;
  let currentPlace;
  let lastPlaceCell;

  for (let r = 0; r <= grid.maxRow; r++) {
    const a = grid.cells.get(`${r},0`);
    // Section / title headers are merged across all 31 columns
    if (a && a.cs >= ERA_COLS + 1) {
      const name = a.text;
      const st = a.style;
      log.headers.push({ row: r + 1, name });
      if (st.bg === '#999999') {
        mode = /animal/i.test(name) ? 'exclude' : 'include';
        section = subsection = currentPlace = undefined;
        continue;
      }
      if (mode === 'exclude') continue;
      if (/^best videomaps$/i.test(name)) {
        section = 'World';
        subsection = undefined;
        continue;
      }
      if (st.fontSize >= 15 || st.bg === '#b7b7b7') {
        section = name;
        subsection = undefined;
      } else {
        subsection = name;
      }
      currentPlace = undefined;
      continue;
    }
    if (mode !== 'include') {
      if (mode === 'exclude') {
        for (let c = 1; c <= ERA_COLS; c++) {
          const cell = grid.cells.get(`${r},${c}`);
          if (cell?.text) log.excluded++;
        }
      }
      continue;
    }

    // Resolve column A: own cell, rowspan from above, or empty continuation
    const aCell = cellAt(grid, r, 0);
    if (aCell && aCell.cs <= 1 && aCell.text && aCell !== lastPlaceCell) {
      lastPlaceCell = aCell;
      const wikiUrl = aCell.links.find((l) => /wikipedia\.org/.test(l)) ?? undefined;
      const link = aCell.links[0];
      currentPlace = { name: aCell.text, wikiUrl, link, section, subsection, row: r + 1 };
      const key = `${section}::${aCell.text}`;
      if (!places.has(key)) places.set(key, { ...currentPlace, key });
    }

    // Item cells in era columns
    const rowCells = [];
    for (let c = 1; c <= ERA_COLS; c++) {
      const cell = grid.cells.get(`${r},${c}`);
      if (cell) rowCells.push(cell);
    }
    const textCells = rowCells.filter((x) => x.text);
    if (!textCells.length) continue;
    if (!currentPlace) {
      log.skippedRows.push({ row: r + 1, reason: 'items without a place', texts: textCells.map((x) => x.text) });
      continue;
    }

    // Build raw parts with column spans
    let raw = [];
    for (const cell of textCells) {
      const sides = redSides(grid, cell);
      const nRed = Object.values(sides).filter(Boolean).length;
      for (const part of cellParts(cell)) {
        raw.push({ cell, part, colStart: cell.c, colEnd: Math.min(ERA_COLS, cell.c + cell.cs - 1), nRed, sides });
      }
    }
    // Merge identical items split around empty filler cells in the same row
    raw.sort((x, y) => x.colStart - y.colStart);
    const merged = [];
    for (const it of raw) {
      const prev = merged[merged.length - 1];
      if (prev && prev.part.text === it.part.text && prev.part.url === it.part.url && it.colStart > prev.colEnd) {
        const gapHasText = rowCells.some((x) => x.text && x.c > prev.colEnd && x.c < it.colStart);
        if (!gapHasText) {
          log.merged.push({ row: r + 1, text: it.part.text, cols: [prev.colStart, prev.colEnd, it.colStart, it.colEnd] });
          prev.colEnd = it.colEnd;
          prev.nRed = Math.max(prev.nRed, it.nRed);
          continue;
        }
      }
      merged.push({ ...it });
    }
    // Note empty colored filler cells (not interpreted, just logged)
    for (const cell of rowCells) {
      if (!cell.text && cell.style.bg && cell.style.bg !== '#ffffff') log.fillers.push({ row: r + 1, col: cell.c, bg: cell.style.bg });
    }

    for (const it of merged) {
      const { part, cell } = it;
      const url = part.url;
      const linkType = url ? classifyLink(url) : 'other';
      const parsed = parseTitle(part.text, currentPlace.name);
      const contentType = contentTypeFor(section, linkType, url);
      // eraStart = oldest = higher column
      let eraStart = colToEra(it.colEnd);
      let eraEnd = colToEra(it.colStart);
      if ((contentType === 'still' || contentType === 'interactive') && it.colStart === it.colEnd) {
        const y = yearFromLabel(currentPlace.name) ?? yearFromLabel(parsed.title);
        if (y !== undefined) {
          const e = eraForYear(y);
          // The label year wins, except across an adjacent-era boundary (e.g. "Europe Aug 31 1939"
          // sits in the sheet's 1914-1939 column while 1939 is also WW2) where the column is more precise.
          if (e !== eraStart) {
            const use = Math.abs(e - eraStart) > 1;
            log.labelEra.push({ row: r + 1, label: currentPlace.name, year: y, columnEra: ERAS[eraStart].label, labelEra: ERAS[e].label, used: use ? 'label' : 'column' });
            if (use) eraStart = eraEnd = e;
          }
        }
      }
      const disputed = it.nRed >= 3;
      if (disputed) log.disputed.push({ row: r + 1, place: currentPlace.name, text: part.text, sides: it.sides });
      else if (it.nRed === 2) log.partialRed.push({ row: r + 1, place: currentPlace.name, text: part.text, sides: it.sides });
      const yt = linkType === 'youtube' ? youtubeInfo(url) : {};
      const item = {
        id: '',
        place: currentPlace.name,
        placeKey: `${section}::${currentPlace.name}`,
        ...(currentPlace.wikiUrl ? { placeWikiUrl: currentPlace.wikiUrl } : {}),
        section,
        ...(subsection ? { subsection } : {}),
        title: parsed.title,
        ...(parsed.mapper ? { mapper: parsed.mapper } : {}),
        ...(url ? { url } : {}),
        linkType,
        contentType,
        eraStart,
        eraEnd,
        disputed,
        ...(yt.youtubeId ? { youtubeId: yt.youtubeId } : {}),
        ...(yt.youtubeList ? { youtubeList: yt.youtubeList } : {}),
        ...(parsed.note ? { note: parsed.note } : {}),
        ...(cell.style.bg && cell.style.bg !== '#ffffff' ? { sheetColor: cell.style.bg } : {}),
        row: r + 1,
      };
      item.id = `${slug(currentPlace.name)}-${r + 1}-${it.colStart}${merged.length > 1 || raw.length > 1 ? '-' + merged.indexOf(it) : ''}`;
      items.push(item);
    }
  }
  return { items, places: [...places.values()], log };
}
