import { useRef } from 'react';
import { ERAS, LAST_ERA, eraYears } from '../data';

interface Props {
  era: number;
  counts: number[];
  onChange: (era: number) => void;
}

export default function EraSlider({ era, counts, onChange }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const max = Math.max(1, ...counts);
  const pct = (i: number) => (i / LAST_ERA) * 100;

  const eraAt = (clientX: number) => {
    const r = trackRef.current!.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    return Math.round(x * LAST_ERA);
  };

  const onKey = (e: React.KeyboardEvent) => {
    let next = era;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = era + 1;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = era - 1;
    else if (e.key === 'PageUp') next = era + 5;
    else if (e.key === 'PageDown') next = era - 5;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = LAST_ERA;
    else return;
    e.preventDefault();
    onChange(Math.min(LAST_ERA, Math.max(0, next)));
  };

  const cur = ERAS[era];
  return (
    <div className="era-slider">
      <div className="era-readout" aria-hidden="true">
        <span className="era-name">{cur.label}</span>
        <span className="era-years">{eraYears(cur)}</span>
        <span className="era-count">
          {counts[era]} map{counts[era] === 1 ? '' : 's'}
        </span>
      </div>
      <div className="era-row">
        <button className="step-btn" onClick={() => onChange(Math.max(0, era - 1))} disabled={era === 0} aria-label="Previous era">
          ‹
        </button>
        <div
          className="era-track-wrap"
          ref={trackRef}
          onPointerDown={(e) => {
            dragging.current = true;
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            onChange(eraAt(e.clientX));
            (e.currentTarget.querySelector('[role=slider]') as HTMLElement | null)?.focus({ preventScroll: true });
          }}
          onPointerMove={(e) => {
            if (dragging.current) {
              const n = eraAt(e.clientX);
              if (n !== era) onChange(n);
            }
          }}
          onPointerUp={() => (dragging.current = false)}
          onPointerCancel={() => (dragging.current = false)}
        >
          <div className="density" aria-hidden="true">
            {counts.map((n, i) => (
              <span
                key={i}
                className={i === era ? 'on' : ''}
                style={{ left: `${pct(i)}%`, height: `${n ? 8 + (n / max) * 92 : 0}%` }}
                title={`${ERAS[i].label}: ${n} maps`}
              />
            ))}
          </div>
          <div className="era-track">
            <div className="era-fill" style={{ width: `${pct(era)}%` }} />
            {ERAS.map((e) => (
              <span key={e.index} className={'tick' + (e.index <= era ? ' past' : '')} style={{ left: `${pct(e.index)}%` }} />
            ))}
            <div
              className="era-thumb"
              role="slider"
              tabIndex={0}
              aria-label="Historical era"
              aria-valuemin={0}
              aria-valuemax={LAST_ERA}
              aria-valuenow={era}
              aria-valuetext={`${cur.label} (${eraYears(cur)}), ${counts[era]} maps`}
              style={{ left: `${pct(era)}%` }}
              onKeyDown={onKey}
            >
              <span className="bubble">
                <b>{cur.label}</b>
                <small>{eraYears(cur)}</small>
              </span>
            </div>
          </div>
          <div className="era-labels" aria-hidden="true">
            {ERAS.map((e) => (
              <span
                key={e.index}
                className={'lbl' + (e.index === era ? ' on' : '') + (e.index % 2 ? ' odd' : '')}
                style={{ left: `${pct(e.index)}%` }}
              >
                {e.short}
              </span>
            ))}
          </div>
        </div>
        <button className="step-btn" onClick={() => onChange(Math.min(LAST_ERA, era + 1))} disabled={era === LAST_ERA} aria-label="Next era">
          ›
        </button>
      </div>
    </div>
  );
}
