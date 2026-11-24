import { useEffect, useMemo, useRef, useState } from 'react';
import type { ContentType, Item, Place } from '../data';
import { CONTENT_LABEL, ERAS, INHERIT_SECTIONS, PLACES, PLACE_BY_KEY, covers, niceCountry } from '../data';
import type { EraModel } from '../model';
import ItemCard from './ItemCard';

interface Props {
  sel: string;
  era: number;
  model: EraModel;
  filtered: Item[];
  inherit: boolean;
  allEras: boolean;
  highlightId?: string;
  onToggleAll: (v: boolean) => void;
  onSelect: (sel: string) => void;
  onClose: () => void;
}

interface Row {
  item: Item;
  via?: string;
  showPlace?: boolean;
}

const ORDER: ContentType[] = ['video', 'still', 'interactive'];

export default function SidePanel({ sel, era, model, filtered, inherit, allEras, highlightId, onToggleAll, onSelect, onClose }: Props) {
  const ref = useRef<HTMLElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [moreChips, setMoreChips] = useState(false);
  const CHIP_LIMIT = 24;

  const view = useMemo(() => {
    let title = '';
    let subtitle = '';
    let wiki: string | undefined;
    let rows: Row[] = [];
    let chipsIn: { label: string; sel: string; n: number }[] = [];
    let chipsOut: { label: string; sel: string; n: number }[] = [];
    const nowCount = (key: string) => model.byPlace.get(key)?.length ?? 0;

    if (sel === 'w') {
      title = 'Whole-world maps';
      subtitle = 'Maps covering the entire world';
      const keys = new Set(PLACES.filter((p) => p.kind === 'world').map((p) => p.key));
      rows = filtered.filter((i) => keys.has(i.placeKey)).map((item) => ({ item, showPlace: true }));
    } else if (sel.startsWith('c:')) {
      const c = sel.slice(2);
      title = niceCountry(c);
      const ownPlaces = PLACES.filter((p) => p.kind === 'country' && p.countries?.[0] === c);
      const ownKeys = new Set(ownPlaces.map((p) => p.key));
      const main = ownPlaces.find((p) => p.section === 'Countries') ?? ownPlaces[0];
      subtitle = main ? [main.section, main.subsection].filter(Boolean).join(' › ') : 'Country';
      wiki = main?.wikiUrl;
      rows = filtered
        .filter((i) => ownKeys.has(i.placeKey))
        .map((item) => ({ item, showPlace: ownPlaces.length > 1 || item.place !== c }));
      const groupPlaces = PLACES.filter((p) => p.kind === 'group' && p.countries?.includes(c));
      if (inherit) {
        const inhKeys = new Map<string, Place>();
        for (const p of groupPlaces) if (INHERIT_SECTIONS.has(p.section)) inhKeys.set(p.key, p);
        for (const p of PLACES) if (p.kind === 'world') inhKeys.set(p.key, p);
        for (const item of filtered) {
          const p = inhKeys.get(item.placeKey);
          if (p) rows.push({ item, via: p.kind === 'world' ? 'World' : p.name });
        }
      }
      chipsIn = PLACES.filter((p) => p.kind === 'pin' && p.parent === c)
        .map((p) => ({ label: p.name, sel: 'p:' + p.key, n: nowCount(p.key) }))
        .filter((x) => allEras || x.n > 0);
      chipsOut = groupPlaces
        .filter((p) => !(inherit && INHERIT_SECTIONS.has(p.section)))
        .map((p) => ({ label: p.name, sel: 'p:' + p.key, n: nowCount(p.key) }))
        .filter((x) => allEras || x.n > 0)
        .sort((a, b) => b.n - a.n);
    } else if (sel.startsWith('p:')) {
      const p = PLACE_BY_KEY.get(sel.slice(2));
      if (p) {
        title = p.name;
        subtitle = [p.section, p.subsection].filter(Boolean).join(' › ');
        wiki = p.wikiUrl;
        rows = filtered.filter((i) => i.placeKey === p.key).map((item) => ({ item }));
        if (p.parent) chipsOut = [{ label: niceCountry(p.parent), sel: 'c:' + p.parent, n: model.own.get(p.parent)?.length ?? 0 }];
        if (p.kind === 'group' && p.countries) chipsIn = p.countries.map((c) => ({ label: niceCountry(c), sel: 'c:' + c, n: model.own.get(c)?.length ?? 0 }));
      }
    }
    const nowRows = rows.filter((r) => covers(r.item, era));
    const shown = allEras ? rows : nowRows;
    // newest-first within a group; current-era ones first in "all eras"
    shown.sort((a, b) => Number(covers(b.item, era)) - Number(covers(a.item, era)) || Number(!!a.via) - Number(!!b.via) || (a.via === 'World' ? 1 : 0) - (b.via === 'World' ? 1 : 0) || b.item.eraEnd - a.item.eraEnd || a.item.eraStart - b.item.eraStart);
    const groups = ORDER.map((ct) => ({ ct, rows: shown.filter((r) => r.item.contentType === ct) })).filter((g) => g.rows.length);
    return { title, subtitle, wiki, groups, nowCount: nowRows.length, total: rows.length, chipsIn, chipsOut };
  }, [sel, era, model, filtered, inherit, allEras]);

  useEffect(() => {
    ref.current?.scrollTo({ top: 0 });
    setMoreChips(false);
  }, [sel]);
  useEffect(() => {
    if (!highlightId) return;
    const t = window.setTimeout(() => document.getElementById(`item-${highlightId}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 350);
    return () => window.clearTimeout(t);
  }, [highlightId, sel]);

  const isCountry = sel.startsWith('c:');
  const p = sel.startsWith('p:') ? PLACE_BY_KEY.get(sel.slice(2)) : undefined;

  return (
    <aside className={'panel' + (expanded ? ' expanded' : '')} ref={ref} aria-label={`Maps for ${view.title}`}>
      <button className="sheet-handle" onClick={() => setExpanded((x) => !x)} aria-label={expanded ? 'Collapse panel' : 'Expand panel'}>
        <span />
      </button>
      <header className="panel-head">
        <div>
          <div className="eyebrow">{view.subtitle}</div>
          <h2>{view.title}</h2>
          <div className="panel-sub">
            <span>
              <b>{view.nowCount}</b> in {ERAS[era].label}
            </span>
            {view.total !== view.nowCount && <span className="muted"> · {view.total} across all eras</span>}
            {view.wiki && (
              <a href={view.wiki} target="_blank" rel="noopener noreferrer" className="wiki">
                Wikipedia ↗
              </a>
            )}
          </div>
        </div>
        <button className="icon-btn close" onClick={onClose} aria-label="Close panel">
          ×
        </button>
      </header>

      <label className="toggle">
        <input type="checkbox" checked={allEras} onChange={(e) => onToggleAll(e.target.checked)} />
        <span className="switch" aria-hidden="true" />
        Show all eras for this place
      </label>

      {view.groups.length === 0 && (
        <div className="empty">
          {view.total === 0 ? (
            <p>No maps match the current filters{isCountry && !inherit ? '. Region and continent maps that include this country are listed below — or turn on “Include region/continent/world maps”.' : '.'}</p>
          ) : (
            <>
              <p>No maps for {ERAS[era].label} with current filters.</p>
              <button className="btn" onClick={() => onToggleAll(true)}>
                Show all {view.total} eras' maps
              </button>
            </>
          )}
        </div>
      )}

      {view.groups.map((g) => (
        <section key={g.ct} className="group">
          <h3>
            {CONTENT_LABEL[g.ct]} <span className="count">{g.rows.length}</span>
          </h3>
          <ul className="items">
            {g.rows.map((r) => (
              <ItemCard key={r.item.id + (r.via ?? '')} item={r.item} current={covers(r.item, era)} via={r.via} showPlace={r.showPlace} highlight={r.item.id === highlightId} />
            ))}
          </ul>
        </section>
      ))}

      {view.chipsIn.length > 0 && (
        <section className="chips">
          <h3>{isCountry ? 'Local places pinned here' : 'Countries in this group'}</h3>
          <div className="chip-row">
            {[...view.chipsIn]
              .sort((a, b) => b.n - a.n)
              .slice(0, moreChips ? undefined : CHIP_LIMIT)
              .map((c) => (
                <button key={c.sel} className={'chip' + (c.n ? ' has' : '')} onClick={() => onSelect(c.sel)}>
                  {c.label} {c.n > 0 && <span className="count">{c.n}</span>}
                </button>
              ))}
            {view.chipsIn.length > CHIP_LIMIT && (
              <button className="chip more" onClick={() => setMoreChips((m) => !m)}>
                {moreChips ? 'Show fewer' : `+${view.chipsIn.length - CHIP_LIMIT} more`}
              </button>
            )}
          </div>
        </section>
      )}
      {view.chipsOut.length > 0 && (
        <section className="chips">
          <h3>{isCountry ? 'Regions & topics that include it' : p?.kind === 'pin' ? 'Located in' : 'Related'}</h3>
          <div className="chip-row">
            {view.chipsOut.map((c) => (
              <button key={c.sel} className={'chip' + (c.n ? ' has' : '')} onClick={() => onSelect(c.sel)}>
                {c.label} {c.n > 0 && <span className="count">{c.n}</span>}
              </button>
            ))}
          </div>
        </section>
      )}
      {p && (
        <p className="geo-note">
          Location: {p.kind === 'pin' ? 'approximate pin' : p.kind === 'group' ? `${p.countries?.length} modern countries` : p.kind === 'world' ? 'whole world' : 'modern country'}
          {p.confidence === 'guess' ? ' (best guess)' : ''}.
        </p>
      )}
    </aside>
  );
}
