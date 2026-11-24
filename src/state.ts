import { useCallback, useEffect, useState } from 'react';
import type { ContentType, Item, LinkType } from './data';
import { ERAS, LAST_ERA, eraFromParam, eraSlug } from './data';

export interface Filters {
  sections: string[];
  mappers: string[];
  content: ContentType[];
  links: LinkType[];
  hideDisputed: boolean;
}

export interface AppState {
  era: number;
  /** 'c:<atlas country name>' | 'p:<place key>' | 'w' (world maps) */
  sel?: string;
  q: string;
  filters: Filters;
  inherit: boolean;
  allEras: boolean;
}

export const EMPTY_FILTERS: Filters = { sections: [], mappers: [], content: [], links: [], hideDisputed: false };

export const activeFilterCount = (f: Filters) =>
  f.sections.length + f.mappers.length + f.content.length + f.links.length + (f.hideDisputed ? 1 : 0);

export const passes = (f: Filters) => (it: Item) =>
  (!f.sections.length || f.sections.includes(it.section)) &&
  (!f.mappers.length || (it.mapper !== undefined && f.mappers.includes(it.mapper))) &&
  (!f.content.length || f.content.includes(it.contentType)) &&
  (!f.links.length || f.links.includes(it.linkType)) &&
  (!f.hideDisputed || !it.disputed);

// filters=sec:Countries|Wars;map:Ollie Bye;ct:video;lt:youtube;nd
function encodeFilters(f: Filters): string {
  const parts: string[] = [];
  if (f.sections.length) parts.push('sec:' + f.sections.join('|'));
  if (f.mappers.length) parts.push('map:' + f.mappers.join('|'));
  if (f.content.length) parts.push('ct:' + f.content.join('|'));
  if (f.links.length) parts.push('lt:' + f.links.join('|'));
  if (f.hideDisputed) parts.push('nd');
  return parts.join(';');
}

function decodeFilters(s: string | null): Filters {
  const f: Filters = { ...EMPTY_FILTERS, sections: [], mappers: [], content: [], links: [] };
  if (!s) return f;
  for (const part of s.split(';')) {
    const [k, v = ''] = part.split(/:(.*)/s);
    const list = v.split('|').filter(Boolean);
    if (k === 'sec') f.sections = list;
    else if (k === 'map') f.mappers = list;
    else if (k === 'ct') f.content = list as ContentType[];
    else if (k === 'lt') f.links = list as LinkType[];
    else if (k === 'nd') f.hideDisputed = true;
  }
  return f;
}

function readUrl(): AppState {
  const p = new URLSearchParams(window.location.search);
  return {
    era: eraFromParam(p.get('era')) ?? LAST_ERA,
    sel: p.get('place') ?? undefined,
    q: p.get('q') ?? '',
    filters: decodeFilters(p.get('filters')),
    inherit: p.get('inherit') === '1',
    allEras: p.get('all') === '1',
  };
}

function writeUrl(s: AppState) {
  const p = new URLSearchParams();
  p.set('era', eraSlug(ERAS[s.era]));
  if (s.sel) p.set('place', s.sel);
  if (s.q) p.set('q', s.q);
  const f = encodeFilters(s.filters);
  if (f) p.set('filters', f);
  if (s.inherit) p.set('inherit', '1');
  if (s.allEras) p.set('all', '1');
  const next = `${window.location.pathname}?${p.toString()}`;
  if (next !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(null, '', next);
}

export function useAppState() {
  const [state, setState] = useState<AppState>(readUrl);
  useEffect(() => {
    const t = window.setTimeout(() => writeUrl(state), 120);
    return () => window.clearTimeout(t);
  }, [state]);
  useEffect(() => {
    const onPop = () => setState(readUrl());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const update = useCallback((patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)) => {
    setState((s) => ({ ...s, ...(typeof patch === 'function' ? patch(s) : patch) }));
  }, []);
  return [state, update] as const;
}
