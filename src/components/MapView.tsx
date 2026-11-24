import { useEffect, useMemo, useRef, useState } from 'react';
import { geoGraticule10, geoNaturalEarth1, geoPath } from 'd3-geo';
import type { GeoPermissibleObjects } from 'd3-geo';
import { select } from 'd3-selection';
import { zoom as d3zoom, zoomIdentity, zoomTransform } from 'd3-zoom';
import type { ZoomBehavior, ZoomTransform } from 'd3-zoom';
import { feature } from 'topojson-client';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import atlasUrl from 'world-atlas/countries-50m.json?url';
import type { Place } from '../data';
import { PLACE_BY_KEY, QUALITY_LABEL, niceCountry } from '../data';
import type { EraModel } from '../model';
import { bestQuality, fillFor, qualityColor } from '../model';
import type { Tone } from '../model';

/** Darken a colour towards black: used for countries covered only by a region / topic / world map. */
const dim = (hex: string, f = 0.42) => {
  const n = parseInt(hex.slice(1), 16);
  const ch = (s: number) => Math.round(((n >> s) & 255) * f);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
};
const countryFill = (v?: Tone) => (v ? (v.tone === 'own' ? fillFor(v) : dim(fillFor(v))) : undefined);

type CountryFeature = Feature<Geometry, { name: string }>;

export interface FocusRequest {
  id: number;
  countries?: string[];
  point?: [number, number];
  world?: boolean;
}

interface Props {
  model: EraModel;
  sel?: string;
  inherit: boolean;
  focus?: FocusRequest;
  onSelect: (sel: string | undefined) => void;
}

interface Hover {
  x: number;
  y: number;
  title: string;
  lines: string[];
}

const MAX_K = 60;
const SPHERE = { type: 'Sphere' } as const;

export default function MapView({ model, sel, inherit, focus, onSelect }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [features, setFeatures] = useState<CountryFeature[]>([]);
  const [t, setT] = useState<ZoomTransform>(zoomIdentity);
  const [hover, setHover] = useState<Hover | null>(null);
  const [loadError, setLoadError] = useState(false);
  const animToken = useRef(0);

  // Load boundaries (Natural Earth 1:50m via world-atlas), bundled locally as a static asset
  useEffect(() => {
    let alive = true;
    fetch(atlasUrl)
      .then((r) => r.json())
      .then((topo) => {
        if (!alive) return;
        const fc = feature(topo, topo.objects.countries) as unknown as FeatureCollection<Geometry, { name: string }>;
        setFeatures(fc.features as CountryFeature[]);
      })
      .catch(() => alive && setLoadError(true));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { projection, path } = useMemo(() => {
    const projection = geoNaturalEarth1();
    if (size.w > 0) {
      projection.fitWidth(size.w - 16, SPHERE);
      const [[, y0], [, y1]] = geoPath(projection).bounds(SPHERE);
      const [tx, ty] = projection.translate();
      projection.translate([tx + 8, ty + (size.h - (y1 - y0)) / 2 - y0]);
    }
    return { projection, path: geoPath(projection) };
  }, [size.w, size.h]);

  const shapes = useMemo(
    () =>
      features.map((f) => {
        const name = f.properties.name;
        return { name, d: path(f) ?? '', c: path.centroid(f), area: path.area(f), b: path.bounds(f) };
      }),
    [features, path],
  );
  const shapeByName = useMemo(() => new Map(shapes.map((s) => [s.name, s])), [shapes]);
  const sphereD = useMemo(() => path(SPHERE as unknown as GeoPermissibleObjects) ?? '', [path]);
  const gratD = useMemo(() => path(geoGraticule10()) ?? '', [path]);

  // Initial zoom: on tall/narrow screens zoom in so the land fills the height
  const initial = useMemo(() => {
    if (!size.w) return zoomIdentity;
    const [[, y0], [, y1]] = path.bounds(SPHERE as unknown as GeoPermissibleObjects);
    const k = Math.max(1, Math.min(3, (size.h * 0.85) / (y1 - y0)));
    if (k === 1) return zoomIdentity;
    const [cx, cy] = projection([15, 25]) ?? [size.w / 2, size.h / 2];
    return zoomIdentity.translate(size.w / 2 - cx * k, size.h / 2 - cy * k).scale(k);
  }, [size.w, size.h, path, projection]);

  // d3-zoom: wheel, trackpad, drag, pinch
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !size.w) return;
    const z = d3zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, MAX_K])
      .translateExtent([
        [-size.w * 0.25, -size.h * 0.25],
        [size.w * 1.25, size.h * 1.25],
      ])
      .clickDistance(4)
      .on('start', (ev) => {
        if (ev.sourceEvent) animToken.current++; // user grabbed the map: cancel any fly-to
      })
      .on('zoom', (ev) => setT(ev.transform));
    zoomRef.current = z;
    const s = select(svg);
    s.call(z).on('dblclick.zoom', null);
    z.transform(s, initial);
    return () => {
      s.on('.zoom', null);
    };
  }, [size.w, size.h, initial]);

  const animateTo = (target: ZoomTransform) => {
    const svg = svgRef.current;
    const z = zoomRef.current;
    if (!svg || !z) return;
    const s = select(svg);
    const from = zoomTransform(svg); // live value, not the (possibly stale) React state
    const token = ++animToken.current;
    let done = false;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dur = reduce || document.hidden ? 0 : 650;
    const start = performance.now();
    const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
    const lk0 = Math.log(from.k);
    const lk1 = Math.log(target.k);
    const step = (now: number) => {
      if (token !== animToken.current || done) return; // superseded, cancelled by the user, or finished
      const p = dur ? Math.min(1, (now - start) / dur) : 1;
      const e = ease(p);
      const k = Math.exp(lk0 + (lk1 - lk0) * e);
      // keep the screen-space centre moving linearly in map space
      const cx0 = (size.w / 2 - from.x) / from.k;
      const cy0 = (size.h / 2 - from.y) / from.k;
      const cx1 = (size.w / 2 - target.x) / target.k;
      const cy1 = (size.h / 2 - target.y) / target.k;
      const cx = cx0 + (cx1 - cx0) * e;
      const cy = cy0 + (cy1 - cy0) * e;
      z.transform(s, zoomIdentity.translate(size.w / 2 - cx * k, size.h / 2 - cy * k).scale(k));
      if (p < 1) requestAnimationFrame(step);
      else done = true;
    };
    // rAF does not run in hidden tabs; apply the final transform straight away there
    if (!dur) step(start);
    else {
      requestAnimationFrame(step);
      // rAF can be throttled (background tab, hidden pane): make sure we still land on the target
      window.setTimeout(() => step(start + dur), dur + 120);
    }
  };

  const fitBounds = ([[x0, y0], [x1, y1]]: [[number, number], [number, number]], maxK = 12) => {
    const padX = size.w < 700 ? 24 : 80;
    const padY = size.w < 700 ? 24 : 80;
    // leave room for the side panel on desktop / bottom sheet on mobile
    const availW = size.w < 700 ? size.w : size.w - 420;
    const availH = size.w < 700 ? size.h * 0.45 : size.h - 140;
    const k = Math.max(1, Math.min(maxK, Math.min((availW - padX * 2) / Math.max(1, x1 - x0), (availH - padY * 2) / Math.max(1, y1 - y0))));
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const sx = availW / 2;
    const sy = size.w < 700 ? availH / 2 + 60 : 70 + availH / 2;
    animateTo(zoomIdentity.translate(sx - cx * k, sy - cy * k).scale(k));
  };

  // External focus requests (search result, chip click)
  useEffect(() => {
    if (!focus || !size.w || !shapes.length) return;
    if (focus.world) return animateTo(initial);
    if (focus.point) {
      const p = projection(focus.point);
      if (p) fitBounds([[p[0] - 20, p[1] - 14], [p[0] + 20, p[1] + 14]], 8);
      return;
    }
    if (focus.countries?.length) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const c of focus.countries) {
        const s = shapeByName.get(c);
        if (!s) continue;
        // ignore far-flung overseas parts by using a bounds clamp for huge countries
        x0 = Math.min(x0, s.b[0][0]);
        y0 = Math.min(y0, s.b[0][1]);
        x1 = Math.max(x1, s.b[1][0]);
        y1 = Math.max(y1, s.b[1][1]);
      }
      if (Number.isFinite(x0)) {
        if (x1 - x0 > size.w * 0.8) animateTo(initial);
        else fitBounds([[x0, y0], [x1, y1]]);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.id, shapes.length, size.w > 0]);

  // Selection outline
  const selCountries = useMemo(() => {
    if (!sel) return [] as string[];
    if (sel.startsWith('c:')) return [sel.slice(2)];
    if (sel.startsWith('p:')) return PLACE_BY_KEY.get(sel.slice(2))?.countries ?? [];
    return [];
  }, [sel]);
  const selPin = sel?.startsWith('p:') ? PLACE_BY_KEY.get(sel.slice(2)) : undefined;

  // Screen-space pin clusters
  const clusters = useMemo(() => {
    const pts = model.pins
      .map((p) => {
        const xy = p.pin ? projection(p.pin) : null;
        if (!xy) return null;
        const items = model.byPlace.get(p.key) ?? [];
        return { p, x: xy[0] * t.k + t.x, y: xy[1] * t.k + t.y, n: items.length, q: bestQuality(items) };
      })
      .filter(Boolean) as { p: Place; x: number; y: number; n: number; q: number }[];
    pts.sort((a, b) => b.n - a.n);
    const out: { x: number; y: number; members: typeof pts; n: number; q: number }[] = [];
    const R = 26;
    for (const pt of pts) {
      const c = out.find((c) => Math.hypot(c.x - pt.x, c.y - pt.y) < R);
      if (c) {
        c.members.push(pt);
        c.n += pt.n;
        c.q = Math.max(c.q, pt.q);
      } else out.push({ x: pt.x, y: pt.y, members: [pt], n: pt.n, q: pt.q });
    }
    return out;
  }, [model, projection, t]);

  // Tiny countries get a dot so they are visible and clickable
  const dots = useMemo(
    () =>
      shapes
        .filter((s) => s.area * t.k * t.k < 40 && model.value.has(s.name))
        .map((s) => ({ name: s.name, tone: model.value.get(s.name)!.tone, x: s.c[0] * t.k + t.x, y: s.c[1] * t.k + t.y })),
    [shapes, model, t],
  );

  const countryLines = (name: string): string[] => {
    const own = model.own.get(name)?.length ?? 0;
    const inh = (model.inherited.get(name)?.length ?? 0) + (inherit ? model.world.length : 0);
    const groups = model.groups.get(name) ?? [];
    const pinsIn = model.pinsIn.get(name) ?? [];
    const lines: string[] = [];
    const v = model.value.get(name);
    if (v) lines.push(`Best coverage: ${QUALITY_LABEL(v.q)}${v.tone === 'own' ? '' : v.tone === 'group' ? ' (via a region/topic map)' : ' (world maps only)'}`);
    else lines.push('No video coverage this era');
    if (own) lines.push(`${own} map${own === 1 ? '' : 's'} this era`);
    if (inherit && inh) lines.push(`+${inh} from region/continent/world maps`);
    if (pinsIn.length) lines.push(`${pinsIn.length} local place${pinsIn.length === 1 ? '' : 's'} pinned`);
    if (groups.length) lines.push(`In: ${groups.slice(0, 3).map((g) => g.name).join(', ')}${groups.length > 3 ? ` +${groups.length - 3}` : ''}`);
    return lines;
  };

  const showHover = (e: React.PointerEvent, title: string, lines: string[]) => {
    const r = wrapRef.current!.getBoundingClientRect();
    setHover({ x: e.clientX - r.left, y: e.clientY - r.top, title, lines });
  };

  const onPinClick = (c: (typeof clusters)[number]) => {
    if (c.members.length === 1) {
      onSelect('p:' + c.members[0].p.key);
      return;
    }
    const xs = c.members.map((m) => (m.x - t.x) / t.k);
    const ys = c.members.map((m) => (m.y - t.y) / t.k);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    if (t.k >= MAX_K * 0.9) onSelect('p:' + c.members[0].p.key);
    else fitBounds([[x0 - 2, y0 - 2], [x1 + 2, y1 + 2]], Math.min(MAX_K, t.k * 4));
  };

  return (
    <div className="map-wrap" ref={wrapRef} onPointerLeave={() => setHover(null)}>
      <svg
        ref={svgRef}
        className="map"
        width={size.w}
        height={size.h}
        role="application"
        aria-label="World map. Drag to pan, scroll or pinch to zoom. Use the search box or the Tab key to reach places."
        onClick={(e) => {
          if (e.target === svgRef.current || (e.target as Element).classList.contains('ocean')) onSelect(undefined);
        }}
      >
        <defs>
          <radialGradient id="ocean" cx="50%" cy="45%" r="70%">
            <stop offset="0%" stopColor="#0d1a33" />
            <stop offset="100%" stopColor="#060a14" />
          </radialGradient>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <g transform={`translate(${t.x},${t.y}) scale(${t.k})`}>
          <path className="ocean" d={sphereD} fill="url(#ocean)" />
          <path className="graticule" d={gratD} />
          <g className="countries">
            {shapes.map((s) => {
              const v = model.value.get(s.name);
              const fill = countryFill(v);
              return (
                <path
                  key={s.name}
                  d={s.d}
                  className={'country' + (fill ? ' lit' : '') + (v && v.tone !== 'own' ? ' grp' : '')}
                  style={fill ? { fill } : undefined}
                  onPointerMove={(e) => e.pointerType === 'mouse' && showHover(e, niceCountry(s.name), countryLines(s.name))}
                  onClick={(e) => {
                    onSelect('c:' + s.name);
                    showHover(e as unknown as React.PointerEvent, niceCountry(s.name), countryLines(s.name));
                  }}
                />
              );
            })}
          </g>
          <g className="sel-outline" filter="url(#glow)">
            {selCountries.map((c) => {
              const s = shapeByName.get(c);
              return s ? <path key={c} d={s.d} /> : null;
            })}
          </g>
        </g>
        <g className="dots">
          {dots.map((d) => (
            <circle
              key={d.name}
              cx={d.x}
              cy={d.y}
              r={d.tone === 'own' ? 4.5 : 2.8}
              className={'tiny ' + d.tone + (selCountries.includes(d.name) ? ' sel' : '')}
              style={{ fill: countryFill(model.value.get(d.name)) }}
              onPointerMove={(e) => e.pointerType === 'mouse' && showHover(e, niceCountry(d.name), countryLines(d.name))}
              onClick={() => onSelect('c:' + d.name)}
            />
          ))}
        </g>
        <g className="pins">
          {clusters.map((c) => {
            const single = c.members.length === 1;
            const p0 = c.members[0].p;
            const isSel = c.members.some((m) => m.p.key === selPin?.key);
            const r = single ? 6.5 : 9 + Math.min(8, Math.sqrt(c.n) * 1.6);
            const label = single ? p0.name : `${c.members.length} places`;
            return (
              <g
                key={c.members.map((m) => m.p.key).join('|')}
                className={'pin' + (single ? '' : ' cluster') + (isSel ? ' sel' : '')}
                transform={`translate(${c.x},${c.y})`}
                tabIndex={0}
                role="button"
                aria-label={`${label}: ${c.n} map${c.n === 1 ? '' : 's'} this era${single ? '' : '. Activate to zoom in.'}`}
                onPointerMove={(e) =>
                  e.pointerType === 'mouse' &&
                  showHover(e, label, single ? [`${c.n} map${c.n === 1 ? '' : 's'} this era`, `Best: ${QUALITY_LABEL(c.q)}`] : c.members.slice(0, 5).map((m) => `${m.p.name} (${m.n})`).concat(c.members.length > 5 ? [`+${c.members.length - 5} more — click to zoom`] : ['Click to zoom in']))
                }
                onClick={(e) => {
                  e.stopPropagation();
                  onPinClick(c);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onPinClick(c);
                  }
                }}
              >
                <circle r={r + 5} className="halo" />
                <circle r={r} style={{ fill: qualityColor(c.q) }} />
                {!single && (
                  <text dy="0.35em" textAnchor="middle">
                    {c.members.length}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>
      {hover && (
        <div className="tooltip" style={{ left: hover.x, top: hover.y }} role="status">
          <strong>{hover.title}</strong>
          {hover.lines.map((l, i) => (
            <span key={i}>{l}</span>
          ))}
        </div>
      )}
      {loadError && <div className="map-error">Could not load map boundaries.</div>}
      {!loadError && !features.length && <div className="map-error">Loading map…</div>}
      <div className="map-controls">
        <button className="icon-btn" onClick={() => zoomRef.current && select(svgRef.current!).call(zoomRef.current.scaleBy, 1.6)} aria-label="Zoom in" title="Zoom in">
          +
        </button>
        <button className="icon-btn" onClick={() => zoomRef.current && select(svgRef.current!).call(zoomRef.current.scaleBy, 1 / 1.6)} aria-label="Zoom out" title="Zoom out">
          −
        </button>
        <button className="icon-btn" onClick={() => animateTo(initial)} aria-label="Fit to world" title="Fit to world">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <path d="M3.5 12h17M12 3.5c2.6 2.4 3.6 5.2 3.6 8.5s-1 6.1-3.6 8.5c-2.6-2.4-3.6-5.2-3.6-8.5s1-6.1 3.6-8.5z" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
      </div>
    </div>
  );
}
