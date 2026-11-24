import { useEffect, useMemo, useRef, useState } from 'react';
import type { ContentType, LinkType } from '../data';
import { CONTENT_BADGE, ITEMS, LINK_LABEL, MAPPERS, MAPPER_COUNTS, SECTIONS } from '../data';
import type { Filters } from '../state';
import { EMPTY_FILTERS, activeFilterCount } from '../state';

interface Props {
  filters: Filters;
  onChange: (f: Filters) => void;
}

const CTS: ContentType[] = ['video', 'still', 'interactive'];
const LTS: LinkType[] = ['youtube', 'mega', 'discord', 'deviantart', 'reddit', 'image'];
const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
const SECTION_COUNTS = ITEMS.reduce<Record<string, number>>((a, i) => ((a[i.section] = (a[i.section] ?? 0) + 1), a), {});

export default function FiltersPanel({ filters, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [mq, setMq] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const n = activeFilterCount(filters);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const mappers = useMemo(() => {
    const t = mq.trim().toLowerCase();
    const list = t ? MAPPERS.filter((m) => m.toLowerCase().includes(t)) : MAPPERS;
    return [...filters.mappers.filter((m) => !list.includes(m)), ...list];
  }, [mq, filters.mappers]);

  return (
    <div className="filters" ref={ref}>
      <button className={'btn' + (n ? ' active' : '')} aria-expanded={open} aria-controls="filters-pop" onClick={() => setOpen((o) => !o)}>
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path d="M3 5h18l-7 8v6l-4 2v-8z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        </svg>
        Filters{n > 0 && <span className="pill">{n}</span>}
      </button>
      {open && (
        <div className="filters-pop" id="filters-pop" role="dialog" aria-label="Filters">
          <div className="fp-head">
            <strong>Filters</strong>
            <span className="muted">{n ? `${n} active` : 'none active'}</span>
            <button className="link-btn" onClick={() => onChange({ ...EMPTY_FILTERS })} disabled={!n}>
              Clear all
            </button>
          </div>

          <fieldset>
            <legend>Content type</legend>
            <div className="chip-row">
              {CTS.map((c) => (
                <button key={c} className={'chip' + (filters.content.includes(c) ? ' on' : '')} aria-pressed={filters.content.includes(c)} onClick={() => onChange({ ...filters, content: toggle(filters.content, c) })}>
                  {CONTENT_BADGE[c]}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend>Link type</legend>
            <div className="chip-row">
              {LTS.map((l) => (
                <button key={l} className={'chip' + (filters.links.includes(l) ? ' on' : '')} aria-pressed={filters.links.includes(l)} onClick={() => onChange({ ...filters, links: toggle(filters.links, l) })}>
                  {LINK_LABEL[l]}
                </button>
              ))}
            </div>
          </fieldset>

          <label className="toggle">
            <input type="checkbox" checked={filters.hideDisputed} onChange={(e) => onChange({ ...filters, hideDisputed: e.target.checked })} />
            <span className="switch" aria-hidden="true" />
            Hide disputed
          </label>

          <fieldset>
            <legend>Section</legend>
            <div className="chip-row">
              {SECTIONS.map((s) => (
                <button key={s} className={'chip' + (filters.sections.includes(s) ? ' on' : '')} aria-pressed={filters.sections.includes(s)} onClick={() => onChange({ ...filters, sections: toggle(filters.sections, s) })}>
                  {s} <span className="count">{SECTION_COUNTS[s]}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend>
              Mapper {filters.mappers.length > 0 && <span className="muted">({filters.mappers.length} selected)</span>}
            </legend>
            <input className="mini-input" type="search" placeholder={`Search ${MAPPERS.length} mappers…`} value={mq} onChange={(e) => setMq(e.target.value)} aria-label="Search mappers" />
            <ul className="mapper-list">
              {mappers.map((m) => (
                <li key={m}>
                  <label>
                    <input type="checkbox" checked={filters.mappers.includes(m)} onChange={() => onChange({ ...filters, mappers: toggle(filters.mappers, m) })} />
                    <span>{m}</span>
                    <span className="count">{MAPPER_COUNTS[m]}</span>
                  </label>
                </li>
              ))}
              {mappers.length === 0 && <li className="muted">No mapper matches.</li>}
            </ul>
          </fieldset>
        </div>
      )}
    </div>
  );
}
