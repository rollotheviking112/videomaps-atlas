// Parsing helpers for the Google Sheets public HTML view ("htmlview").
// Zero dependencies: the htmlview markup is very regular, so a small
// regex-based tokenizer is enough and keeps the importer fast and portable.

export const ENTITY_MAP = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

export function unescapeHtml(s) {
  return s.replace(/&(#x?[0-9a-fA-F]+|\w+);/g, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITY_MAP[e] ?? m;
  });
}

export function stripTags(s) {
  return unescapeHtml(s.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
}

/** Google wraps every hyperlink in https://www.google.com/url?q=<real>&sa=… — unwrap it. */
export function unwrapUrl(href) {
  if (!href) return undefined;
  let u = unescapeHtml(href);
  if (u.startsWith('#')) return undefined; // smart-chip icon refs like #youtube-icon
  try {
    const parsed = new URL(u);
    if (/(^|\.)google\.com$/.test(parsed.hostname) && parsed.pathname === '/url' && parsed.searchParams.get('q')) {
      u = parsed.searchParams.get('q');
    }
  } catch {
    /* not absolute — keep */
  }
  return u;
}

/** Parse `.ritz .waffle .sNN{…}` rules into { border: {top,right,bottom,left: boolean red}, bg, fontSize } */
export function parseCss(html) {
  const classes = {};
  const re = /\.ritz \.waffle \.(s\d+)\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(html))) {
    const body = m[2];
    const red = (side) => new RegExp(`border-${side}:[^;]*#ff0000`, 'i').test(body);
    const bg = /background-color:(#[0-9a-f]{3,8})/i.exec(body)?.[1]?.toLowerCase();
    const fontSize = parseFloat(/font-size:(\d+(?:\.\d+)?)pt/.exec(body)?.[1] ?? '10');
    classes[m[1]] = {
      red: { top: red('top'), right: red('right'), bottom: red('bottom'), left: red('left') },
      bg,
      fontSize,
      underline: /text-decoration:underline/.test(body),
    };
  }
  return classes;
}

/**
 * Build a full cell grid honoring rowspan/colspan.
 * Returns { cells: Map<"r,c", Cell>, cover: Map<"r,c", "r,c" origin>, maxRow }
 */
export function parseGrid(html, gid) {
  const css = parseCss(html);
  const cells = new Map();
  const cover = new Map();
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  const idRe = new RegExp(`id="${gid}R(\\d+)"`);
  let maxRow = -1;
  let rm;
  while ((rm = rowRe.exec(html))) {
    const row = rm[1];
    const idm = idRe.exec(row);
    if (!idm) continue; // column header row / freeze bar
    const r = Number(idm[1]);
    maxRow = Math.max(maxRow, r);
    let c = 0;
    const tdRe = /<td([^>]*)>([\s\S]*?)<\/td>/g;
    let tm;
    while ((tm = tdRe.exec(row))) {
      const [, attrs, inner] = tm;
      if (/freezebar/.test(attrs)) continue;
      while (cover.has(`${r},${c}`)) c++;
      const cs = Number(/colspan="(\d+)"/.exec(attrs)?.[1] ?? 1);
      const rs = Number(/rowspan="(\d+)"/.exec(attrs)?.[1] ?? 1);
      const cls = /class="([^"]*)"/.exec(attrs)?.[1] ?? '';
      const style = css[cls.split(/\s+/).find((x) => css[x])] ?? { red: {}, fontSize: 10 };
      const links = [...inner.matchAll(/href="([^"]*)"/g)].map((x) => unwrapUrl(x[1])).filter(Boolean);
      const cell = { r, c, rs, cs, cls, style, inner, text: stripTags(inner), links };
      cells.set(`${r},${c}`, cell);
      for (let dr = 0; dr < rs; dr++) for (let dc = 0; dc < cs; dc++) cover.set(`${r + dr},${c + dc}`, `${r},${c}`);
      c += cs;
    }
  }
  return { cells, cover, maxRow, css };
}

export function cellAt(grid, r, c) {
  const key = grid.cover.get(`${r},${c}`);
  return key ? grid.cells.get(key) : undefined;
}

/**
 * Resolve whether a cell is drawn with a red box. Google's HTML export draws a
 * shared border only once: a cell's top edge is the bottom border of the cell
 * above, and its left edge is the right border of the cell to its left. So we
 * check the cell's own borders and its neighbours' facing borders.
 */
export function redSides(grid, cell) {
  const sides = { top: !!cell.style.red.top, right: !!cell.style.red.right, bottom: !!cell.style.red.bottom, left: !!cell.style.red.left };
  for (let x = cell.c; x < cell.c + cell.cs; x++) {
    const above = cellAt(grid, cell.r - 1, x);
    if (above && above !== cell && above.style.red.bottom) sides.top = true;
    const below = cellAt(grid, cell.r + cell.rs, x);
    if (below && below !== cell && below.style.red.top) sides.bottom = true;
  }
  for (let y = cell.r; y < cell.r + cell.rs; y++) {
    const left = cellAt(grid, y, cell.c - 1);
    if (left && left !== cell && left.style.red.right) sides.left = true;
    const right = cellAt(grid, y, cell.c + cell.cs);
    if (right && right !== cell && right.style.red.left) sides.right = true;
  }
  return sides;
}

/** Split a cell into one or more {text, url} parts (rich-text cells may hold several smart chips separated by <br>). */
export function cellParts(cell) {
  const realLinks = cell.links;
  if (realLinks.length <= 1) return [{ text: cell.text, url: realLinks[0] }];
  const segs = cell.inner.split(/<br\s*\/?>/i);
  const parts = [];
  for (const seg of segs) {
    const text = stripTags(seg);
    if (!text) continue;
    const url = [...seg.matchAll(/href="([^"]*)"/g)].map((x) => unwrapUrl(x[1])).filter(Boolean)[0];
    parts.push({ text, url });
  }
  return parts.length ? parts : [{ text: cell.text, url: realLinks[0] }];
}
