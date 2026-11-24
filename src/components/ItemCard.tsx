import { useState } from 'react';
import type { Item } from '../data';
import { CONTENT_BADGE, LINK_LABEL, QUALITY_LABEL, spanLabel } from '../data';
import { qualityColor } from '../model';

const TIPS = {
  disputed: 'Authenticity/accuracy disputed; some claim content is made up.',
  mega: 'Controversial mapper; hosted on MEGA instead of YouTube.',
  discord: 'Works only when pasted into Discord.',
};

export function Badge({ kind, children, tip }: { kind: string; children: React.ReactNode; tip?: string }) {
  return (
    <span className={`badge b-${kind}`} data-tip={tip} tabIndex={tip ? 0 : undefined} aria-label={tip ? `${children}: ${tip}` : undefined}>
      {children}
    </span>
  );
}

function YouTubeEmbed({ item }: { item: Item }) {
  const [play, setPlay] = useState(false);
  const src = item.youtubeId
    ? `https://www.youtube-nocookie.com/embed/${item.youtubeId}?autoplay=1&rel=0`
    : `https://www.youtube-nocookie.com/embed/videoseries?list=${item.youtubeList}&autoplay=1&rel=0`;
  if (play)
    return (
      <div className="yt">
        <iframe
          src={src}
          title={item.title}
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    );
  return (
    <button className="yt yt-poster" onClick={() => setPlay(true)} aria-label={`Play video: ${item.title}`}>
      {item.youtubeId ? <img src={`https://i.ytimg.com/vi/${item.youtubeId}/mqdefault.jpg`} alt="" loading="lazy" /> : <span className="yt-list">Playlist</span>}
      <span className="play" aria-hidden="true">
        <svg viewBox="0 0 68 48" width="56" height="40">
          <path d="M66.5 7.7a8.5 8.5 0 0 0-6-6C55.2.3 34 .3 34 .3s-21.2 0-26.5 1.4a8.5 8.5 0 0 0-6 6C.1 13 .1 24 .1 24s0 11 1.4 16.3a8.5 8.5 0 0 0 6 6C12.8 47.7 34 47.7 34 47.7s21.2 0 26.5-1.4a8.5 8.5 0 0 0 6-6C67.9 35 67.9 24 67.9 24s0-11-1.4-16.3z" fill="#f00" />
          <path d="M45 24 27 14v20z" fill="#fff" />
        </svg>
      </span>
    </button>
  );
}

function legacyCopy(text: string) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  ta.remove();
  return ok;
}

function CopyLink({ url }: { url: string }) {
  const [state, setState] = useState<'idle' | 'ok' | 'manual'>('idle');
  const copy = async () => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(url);
      ok = true;
    } catch {
      ok = legacyCopy(url);
    }
    setState(ok ? 'ok' : 'manual');
    if (ok) window.setTimeout(() => setState('idle'), 1800);
  };
  return (
    <>
      <button className="btn small" onClick={copy}>
        {state === 'ok' ? '✓ Copied' : 'Copy link'}
      </button>
      {state === 'manual' && (
        <input
          className="mini-input copy-field"
          readOnly
          value={url}
          aria-label="Discord link — select and copy"
          ref={(el) => el?.select()}
          onFocus={(e) => e.currentTarget.select()}
        />
      )}
    </>
  );
}

interface Props {
  item: Item;
  current: boolean;
  showPlace?: boolean;
  via?: string;
  highlight?: boolean;
}

export default function ItemCard({ item, current, showPlace, via, highlight }: Props) {
  const embeddable = item.linkType === 'youtube' && (item.youtubeId || item.youtubeList);
  return (
    <li className={'item' + (current ? '' : ' dim') + (highlight ? ' flash' : '')} id={`item-${item.id}`}>
      <div className="item-head">
        <h4>{item.title}</h4>
        {item.mapper && <div className="mapper">by {item.mapper}</div>}
      </div>
      <div className="item-meta">
        <span className="span">{spanLabel(item)}</span>
        {showPlace && <span className="via">· {item.place}</span>}
        {via && <span className="via">· via {via}</span>}
      </div>
      <div className="badges">
        <Badge kind={item.contentType}>{CONTENT_BADGE[item.contentType]}</Badge>
        <span
          className="badge b-quality"
          data-tip="Quality rating from the sheet's cell colour (red = poor/partial, yellow = decent, green = best)."
          tabIndex={0}
          style={item.quality !== undefined ? { borderColor: qualityColor(item.quality), color: qualityColor(item.quality) } : undefined}
        >
          <i style={{ background: item.quality !== undefined ? qualityColor(item.quality) : 'transparent' }} />
          {QUALITY_LABEL(item.quality)}
        </span>
        {item.linkType !== 'youtube' && item.linkType !== 'mega' && item.linkType !== 'discord' && <Badge kind="link">{LINK_LABEL[item.linkType]}</Badge>}
        {item.disputed && (
          <Badge kind="disputed" tip={TIPS.disputed}>
            Disputed
          </Badge>
        )}
        {item.linkType === 'mega' && (
          <Badge kind="mega" tip={TIPS.mega}>
            MEGA
          </Badge>
        )}
        {item.linkType === 'discord' && (
          <Badge kind="discord" tip={TIPS.discord}>
            Discord-only
          </Badge>
        )}
        {!current && <Badge kind="other-era">Other era</Badge>}
      </div>
      {item.note && <p className="warn">⚠ {item.note}</p>}
      {embeddable && <YouTubeEmbed item={item} />}
      <div className="item-actions">
        {item.url && item.linkType === 'discord' ? (
          <>
            <CopyLink url={item.url} />
            <span className="hint">Paste into a Discord message to view.</span>
          </>
        ) : item.url ? (
          <a className="btn small" href={item.url} target="_blank" rel="noopener noreferrer">
            {item.linkType === 'image' ? 'Open image' : `Open on ${item.linkType === 'other' ? new URL(item.url).hostname.replace(/^www\./, '') : LINK_LABEL[item.linkType]}`} ↗
          </a>
        ) : (
          <span className="hint">No link in the sheet.</span>
        )}
      </div>
    </li>
  );
}
