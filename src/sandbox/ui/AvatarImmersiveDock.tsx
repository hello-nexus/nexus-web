// Bottom dock of the `ui-avatar` immersive view: the optional status strip,
// the live-stream player with its open-in-browser button, and the sticker
// controls (mode toggle, palette, done). Everything here sits ABOVE the
// sticker layer - the one part of the stage stickers never cover - and the
// dock itself is pointer-transparent between its boxes so orbit drags on the
// stage still work around it.

import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { ExternalLink, Sticker, Check } from 'lucide-react';
import { Button as NativeButton } from '../../components/common/Button/Button';
import { useTranslation } from '../../lib/i18n';
import { getTokenSync } from '../../api/auth';
import { openExternalUrl } from './openExternal';
import { resolveStickerSrc, type AvatarSticker, type AvatarStream } from './avatarStickers';

interface AvatarImmersiveDockProps {
  status: string;
  statusLive: boolean;
  stream: AvatarStream | null;
  stickers: AvatarSticker[];
  editing: boolean;
  onToggleEditing: () => void;
  onAddSticker: (id: string) => void;
}

/** The player never takes more than this share of the stage height, so a
 *  wide landscape panel keeps the character visible above it. */
const PLAYER_MAX_HEIGHT_FRACTION = 0.42;
const PLAYER_ASPECT = 16 / 9;
const PAD = 12;

const dockStyle: CSSProperties = {
  position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 3,
  display: 'flex', flexDirection: 'column', alignItems: 'center',
  padding: PAD, pointerEvents: 'none',
};
const stripStyle: CSSProperties = {
  display: 'flex', alignItems: 'center', maxWidth: '100%',
  padding: '6px 12px', marginBottom: 8, borderRadius: 999,
  background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 13, lineHeight: 1.25,
  pointerEvents: 'auto',
};
const liveDotStyle: CSSProperties = {
  width: 8, height: 8, borderRadius: 4, background: '#ff3b30', marginRight: 8, flex: '0 0 auto',
};
const rowStyle: CSSProperties = {
  display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center',
  maxWidth: '100%', pointerEvents: 'auto',
};
const paletteStyle: CSSProperties = {
  display: 'flex', alignItems: 'center', maxWidth: '100%', overflowX: 'auto',
  WebkitOverflowScrolling: 'touch', padding: '4px 0', marginBottom: 8, pointerEvents: 'auto',
};
const thumbStyle: CSSProperties = {
  width: 56, height: 56, marginRight: 8, padding: 4, flex: '0 0 auto',
  border: '1px solid rgba(255,255,255,0.18)', borderRadius: 12,
  background: 'rgba(0,0,0,0.45)', cursor: 'pointer', touchAction: 'manipulation',
};

export function AvatarImmersiveDock(p: AvatarImmersiveDockProps) {
  const { t } = useTranslation();
  const dockRef = useRef<HTMLDivElement | null>(null);
  const [playerWidth, setPlayerWidth] = useState(0);
  const token = getTokenSync();

  // The player is as wide as the dock allows, capped so its player-aspect
  // height stays under the stage-height share above; measured because the
  // immersive body is sized per panel and CSS has no 'min of two axes' for
  // this. Keyed on the embed URL, not the stream object, which the worker
  // hands over fresh on every re-render.
  const embed = p.stream?.embed;
  useEffect(() => {
    const el = dockRef.current;
    if (!el || !embed) return;
    const measure = () => {
      const innerW = el.clientWidth - PAD * 2;
      const stageH = el.parentElement?.clientHeight ?? 0;
      const capW = stageH > 0 ? stageH * PLAYER_MAX_HEIGHT_FRACTION * PLAYER_ASPECT : innerW;
      setPlayerWidth(Math.max(0, Math.floor(Math.min(innerW, capW))));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.parentElement) ro.observe(el.parentElement);
    return () => ro.disconnect();
  }, [embed]);

  const showStickers = p.stickers.length > 0;

  return (
    <div ref={dockRef} style={dockStyle} data-avatar-dock data-panel-no-sheet-swipe="true">
      {p.status && (
        <div style={stripStyle} data-avatar-status>
          {p.statusLive && <span style={liveDotStyle} aria-hidden />}
          <span>{p.status}</span>
        </div>
      )}
      {p.stream && playerWidth > 0 && (
        // Sticker mode folds the player away (display, not unmount, so the
        // stream keeps playing and comes back instantly): it sits above the
        // sticker layer by design, so a sticker dragged under it could not be
        // grabbed or removed while it showed.
        <div
          data-avatar-stream
          hidden={p.editing}
          style={{
            position: 'relative', width: playerWidth, height: Math.round(playerWidth / PLAYER_ASPECT),
            marginBottom: 8, borderRadius: 12, overflow: 'hidden', background: '#000',
            boxShadow: '0 8px 28px rgba(0,0,0,0.45)', pointerEvents: 'auto',
            display: p.editing ? 'none' : undefined,
          }}
        >
          <iframe
            src={p.stream.embed}
            title={t('sdk.avatar.streamTitle')}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 }}
          />
        </div>
      )}
      {p.editing && showStickers && (
        <div style={paletteStyle} data-avatar-palette>
          {p.stickers.map((s) => (
            <button
              key={s.id}
              type="button"
              style={thumbStyle}
              aria-label={t('sdk.avatar.stickerAdd')}
              onClick={() => p.onAddSticker(s.id)}
            >
              <img
                src={resolveStickerSrc(s.src, token)}
                alt=""
                draggable={false}
                style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
              />
            </button>
          ))}
        </div>
      )}
      <div style={rowStyle}>
        {p.stream?.open && !p.editing && (
          <span style={{ margin: 4 }}>
            <NativeButton
              tone="accent"
              size="md"
              pill
              icon={<ExternalLink size={16} aria-hidden />}
              onClick={() => { if (p.stream?.open) void openExternalUrl(p.stream.open); }}
            >
              {p.stream.label ?? t('sdk.avatar.streamOpen')}
            </NativeButton>
          </span>
        )}
        {showStickers && (
          <span style={{ margin: 4 }}>
            <NativeButton
              tone={p.editing ? 'accent' : 'neutral'}
              size="md"
              pill
              icon={p.editing ? <Check size={16} aria-hidden /> : <Sticker size={16} aria-hidden />}
              onClick={p.onToggleEditing}
              aria-pressed={p.editing}
            >
              {p.editing ? t('sdk.avatar.stickersDone') : t('sdk.avatar.stickers')}
            </NativeButton>
          </span>
        )}
      </div>
    </div>
  );
}
