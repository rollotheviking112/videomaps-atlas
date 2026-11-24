import { useEffect, useMemo, useRef, useState } from 'react';
import type { Item, Place } from '../data';
import { ITEMS, PLACES, spanLabel } from '../data';

const norm = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

const INDEX = ITEMS.map((it) => ({ it, hay: norm(`${it.title} ${it.mapper ?? ''} ${it.place} ${it.section} ${it.subsection ?? ''}`) }));
const PLACE_INDEX = PLACES.map((p) => ({ p, hay: norm(p.name) }));

interface Props {
  q: string;
  onQ: (q: string) => void;
  onPickItem: (it: Item) => void;
  onPickPlace: (p: Place) => void;
}

export default function Search({ q, onQ, onPickItem, onPickPlace }: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const toks = norm(q).split(/\s+/).filter(Boolean);
    if (!toks.length) return { places: [] as Place[], items: [] as Item[], total: 0 };
    const places = PLACE_INDEX.filter((x) => toks.every((t) => x.hay.includes(t)))
      .map((x) => x.p)
      .slice(0, 5);
    const all = INDEX.filter((x) => toks.every((t) => x.hay.includes(t))).map((x) => x.it);
    return { places, items: all.slice(0, 40), total: all.length };
  }, [q]);

  const flat: ({ kind: 'place'; p: Place } | { kind: 'item'; it: Item })[] = [
    ...results.places.map((p) => ({ kind: 'place' as const, p })),
    ...results.items.map((it) => ({ kind: 'item' as const, it })),
  ];

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    const onDoc = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDoc);
    return () => document.removeEventListener('pointerdown', onDoc);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        boxRef.current?.querySelector('input')?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const pick = (i: number) => {
    const r = flat[i];
    if (!r) return;
    if (r.kind === 'place') onPickPlace(r.p);
    else onPickItem(r.it);
    setOpen(false);
  };

  const showList = open && q.trim().length > 0;
  return (
    <div className="search" ref={boxRef}>
      <svg className="search-ico" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="m15.5 15.5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <input
        type="search"
        value={q}
        placeholder="Search places, titles, mappers…"
        aria-label="Search maps"
        role="combobox"
        aria-expanded={showList}
        aria-controls="search-results"
        aria-activedescendant={showList && flat[active] ? `sr-${active}` : undefined}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          onQ(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(flat.length - 1, a + 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            pick(active);
          } else if (e.key === 'Escape') {
            setOpen(false);
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      {showList && (
        <ul className="search-results" id="search-results" role="listbox" aria-label="Search results">
          {flat.length === 0 && <li className="none">No matches for “{q}”.</li>}
          {flat.map((r, i) => (
            <li
              key={r.kind === 'place' ? 'p' + r.p.key : r.it.id}
              id={`sr-${i}`}
              role="option"
              aria-selected={i === active}
              className={(i === active ? 'active ' : '') + r.kind}
              onPointerEnter={() => setActive(i)}
              onClick={() => pick(i)}
            >
              {r.kind === 'place' ? (
                <>
                  <span className="r-kind">Place</span>
                  <span className="r-title">{r.p.name}</span>
                  <span className="r-meta">
                    {r.p.section} · {r.p.items} map{r.p.items === 1 ? '' : 's'}
                  </span>
                </>
              ) : (
                <>
                  <span className="r-title">{r.it.title}</span>
                  <span className="r-meta">
                    {r.it.mapper ? `${r.it.mapper} · ` : ''}
                    {r.it.place} · {spanLabel(r.it)}
                  </span>
                </>
              )}
            </li>
          ))}
          {results.total > results.items.length && <li className="none">Showing 40 of {results.total} — keep typing to narrow.</li>}
        </ul>
      )}
    </div>
  );
}
