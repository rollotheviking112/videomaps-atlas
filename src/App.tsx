import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Item, Place } from './data';
import { ERAS, ITEMS, PLACE_BY_KEY, covers } from './data';
import { useAppState, passes } from './state';
import { buildEraByEra, buildEraModel, NO_COVERAGE, QUALITY_LEGEND, qualityColor } from './model';
import MapView from './components/MapView';
import type { FocusRequest } from './components/MapView';
import EraSlider from './components/EraSlider';
import SidePanel from './components/SidePanel';
import Search from './components/Search';
import FiltersPanel from './components/FiltersPanel';
import AboutModal from './components/AboutModal';

const selForPlace = (p: Place) => (p.kind === 'world' ? 'w' : p.kind === 'country' && p.countries ? 'c:' + p.countries[0] : 'p:' + p.key);

export default function App() {
  const [s, update] = useAppState();
  const [focus, setFocus] = useState<FocusRequest>();
  const [highlightId, setHighlightId] = useState<string>();
  const [about, setAbout] = useState(false);
  const focusId = useRef(0);

  const filtered = useMemo(() => ITEMS.filter(passes(s.filters)), [s.filters]);
  const byEra = useMemo(() => buildEraByEra(filtered), [filtered]);
  const counts = useMemo(() => byEra.map((l) => l.length), [byEra]);
  const model = useMemo(() => buildEraModel(s.era, byEra[s.era], s.inherit), [s.era, byEra, s.inherit]);

  const focusOn = useCallback((sel: string | undefined) => {
    if (!sel) return;
    const id = ++focusId.current;
    if (sel === 'w') return setFocus({ id, world: true });
    if (sel.startsWith('c:')) return setFocus({ id, countries: [sel.slice(2)] });
    const p = PLACE_BY_KEY.get(sel.slice(2));
    if (!p) return;
    if (p.pin) setFocus({ id, point: p.pin });
    else if (p.kind === 'world') setFocus({ id, world: true });
    else setFocus({ id, countries: p.countries });
  }, []);

  // Shared links: zoom to the place in the URL on first load
  useEffect(() => {
    if (s.sel) focusOn(s.sel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const select = (sel: string | undefined, opts: { focus?: boolean } = {}) => {
    update({ sel });
    setHighlightId(undefined);
    if (opts.focus) focusOn(sel);
  };

  const pickItem = (it: Item) => {
    const p = PLACE_BY_KEY.get(it.placeKey);
    const era = covers(it, s.era) ? s.era : Math.min(it.eraEnd, Math.max(it.eraStart, s.era));
    const sel = p ? selForPlace(p) : undefined;
    update({ era, sel, allEras: false });
    setHighlightId(it.id);
    focusOn(sel);
  };
  const pickPlace = (p: Place) => {
    const sel = selForPlace(p);
    // jump to the nearest era with a map for this place
    const own = filtered.filter((i) => i.placeKey === p.key);
    let era = s.era;
    if (own.length && !own.some((i) => covers(i, s.era))) {
      let best = Infinity;
      for (const i of own) {
        const e = Math.min(i.eraEnd, Math.max(i.eraStart, s.era));
        if (Math.abs(e - s.era) < Math.abs(best - s.era)) best = e;
      }
      era = best;
    }
    update({ era, sel, allEras: false });
    setHighlightId(undefined);
    focusOn(sel);
  };

  const empty = model.active.length === 0;
  const worldN = model.world.length;

  return (
    <div className={'app' + (s.sel ? ' has-panel' : '')}>
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden="true" />
          <div>
            <h1>Videomaps Atlas</h1>
            <p className="tagline">Every era, every border, one slider</p>
          </div>
        </div>
        <Search q={s.q} onQ={(q) => update({ q })} onPickItem={pickItem} onPickPlace={pickPlace} />
        <div className="tools">
          <FiltersPanel filters={s.filters} onChange={(filters) => update({ filters })} />
          <label className="toggle inherit" title="When on, countries also light up and list the region, continent and world maps that contain them.">
            <input type="checkbox" checked={s.inherit} onChange={(e) => update({ inherit: e.target.checked })} />
            <span className="switch" aria-hidden="true" />
            <span className="t-long">Include region/continent/world maps</span>
            <span className="t-short">Inherit regions</span>
            <span className="t-xs">Regions</span>
          </label>
          <button className={'btn world-btn' + (s.sel === 'w' ? ' active' : '')} onClick={() => select('w', { focus: true })} aria-label={`Whole-world maps: ${worldN} this era`}>
            🌐 <span className="t-long">World maps</span> <span className="pill">{worldN}</span>
          </button>
          <button className="btn icon-only" onClick={() => setAbout(true)} aria-label="About this atlas">
            ?
          </button>
        </div>
      </header>

      <main className="stage">
        <MapView model={model} sel={s.sel} inherit={s.inherit} focus={focus} onSelect={(sel) => select(sel)} />
        <div className="legend" aria-hidden="true">
          <div>
            <span className="swatches">
              {QUALITY_LEGEND.map((l) => (
                <i key={l.q} style={{ background: qualityColor(l.q) }} />
              ))}
            </span>
            Best coverage: poor → best
          </div>
          <div>
            <span className="swatches">
              <i className="sw-none" style={{ background: NO_COVERAGE }} />
            </span>
            No video coverage
            <span className="swatches dimmed">
              {QUALITY_LEGEND.map((l) => (
                <i key={l.q} style={{ background: qualityColor(l.q) }} />
              ))}
            </span>
            Only via region / topic map
          </div>
        </div>
        {empty && (
          <div className="empty-era" role="status">
            No maps for {ERAS[s.era].label} with current filters.
          </div>
        )}
        {s.sel && (
          <SidePanel
            sel={s.sel}
            era={s.era}
            model={model}
            filtered={filtered}
            inherit={s.inherit}
            allEras={s.allEras}
            highlightId={highlightId}
            onToggleAll={(allEras) => update({ allEras })}
            onSelect={(sel) => select(sel, { focus: true })}
            onClose={() => select(undefined)}
          />
        )}
      </main>

      <footer className="bottombar">
        <EraSlider era={s.era} counts={counts} onChange={(era) => update({ era })} />
      </footer>
      {about && <AboutModal onClose={() => setAbout(false)} />}
    </div>
  );
}
