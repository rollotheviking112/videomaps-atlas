import { useEffect, useRef } from 'react';
import { ITEMS } from '../data';
import { Badge } from './ItemCard';
import { NO_COVERAGE, QUALITY_LEGEND, qualityColor } from '../model';
import { QUALITY_LABEL } from '../data';

const SHEET = 'https://docs.google.com/spreadsheets/d/19Qqy1UtPE-OPFL6pB44G4Nq7oKPcTcp_vp3VwCFwugQ/edit?gid=982568981';

export default function AboutModal({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog ref={ref} className="modal" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()} aria-labelledby="about-title">
      <div className="modal-body">
        <button className="icon-btn close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <h2 id="about-title">About this atlas</h2>
        <p>
          An interactive index of {ITEMS.length} history <em>videomaps</em>, still maps and interactive maps, drawn from the community-curated{' '}
          <a href={SHEET} target="_blank" rel="noopener noreferrer">
            “Best Videomaps list” Google Sheet
          </a>
          . All credit for finding and curating these maps goes to the sheet’s maintainers and, of course, to the mappers themselves.
        </p>
        <h3>How to use it</h3>
        <ul>
          <li>Drag the era slider (or use ← → keys on it) to move through 30 eras, from before 2000 BCE to today.</li>
          <li>Places with at least one map covering that era light up. Click one to list its maps; YouTube videos play right in the panel.</li>
          <li>Search (press <kbd>/</kbd>) finds places, titles and mappers and jumps the map to them.</li>
          <li>Every view is in the URL, so you can share exactly what you see.</li>
        </ul>
        <h3>Colours</h3>
        <p>
          Countries are coloured by the <b>quality of the best map</b> covering them in the selected era, on the red → green scale from the sheet’s “Turnt’s trial video organization” tab:
          red = the video exists but is poorly made or covers the topic only partially, yellow = decent quality, green = best quality. The main list colours its cells on that scale
          (with in-between shades such as orange and lime), and those colours are used here.
        </p>
        <ul className="quality-legend">
          {QUALITY_LEGEND.map((l) => (
            <li key={l.q}>
              <i style={{ background: qualityColor(l.q) }} />
              {QUALITY_LABEL(l.q)}
            </li>
          ))}
          <li>
            <i style={{ background: NO_COVERAGE }} className="sw-none" />
            No video coverage in this era
          </li>
        </ul>
        <p className="muted">
          A darker shade of the same colour means the country is only covered as part of a region, empire, war or alliance map (or only by whole-world maps). Maps with no colour in the
          sheet ({'“'}Unrated{'”'}) count as decent.
        </p>
        <h3>Include region/continent/world maps</h3>
        <p>
          Off by default: a country only counts maps made specifically for it, and regions such as “Balkans” or “Europe” light up as their own group. Turn it on and every country also
          counts — and lists — the region, continent and whole-world maps that contain it.
        </p>
        <h3>Badges</h3>
        <dl className="badge-help">
          <dt>
            <Badge kind="disputed">Disputed</Badge>
          </dt>
          <dd>Marked with a red border in the sheet: authenticity/accuracy disputed; some claim content is made up.</dd>
          <dt>
            <Badge kind="mega">MEGA</Badge>
          </dt>
          <dd>Controversial mapper; hosted on MEGA instead of YouTube so as not to give them views.</dd>
          <dt>
            <Badge kind="discord">Discord-only</Badge>
          </dt>
          <dd>Discord links only work when pasted into a Discord server or DM, so we offer a “Copy link” button instead of opening them.</dd>
          <dt>
            <Badge kind="video">Video</Badge> <Badge kind="still">Still map</Badge> <Badge kind="interactive">Interactive</Badge>
          </dt>
          <dd>The kind of map.</dd>
        </dl>
        <h3>Locations</h3>
        <p>
          Places are drawn on modern borders (Natural Earth). Sub-national places, peoples, canals and cities get an approximate pin; wars, empires and alliances are tagged with the
          modern countries they mostly involve — these are best guesses.
        </p>
      </div>
    </dialog>
  );
}
