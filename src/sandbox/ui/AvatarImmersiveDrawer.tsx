// Bottom controls drawer of the `ui-avatar` immersive view. Open on every
// entry, it folds down to a lip after an idle spell and on its own button;
// the lip brings it back. It holds the Live button (pops the docked stream
// when one is on, otherwise a short "not live" animation over the app's art
// and asks the app to re-check), the sticker controls, a camera zoom slider,
// and the immersive exit. Everything here sits ABOVE the sticker layer - the
// one part of the stage stickers never cover - and the sheet is
// pointer-transparent outside its own box so orbit drags still work around it.

import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { ExternalLink, Sticker, Check, Radio, ZoomIn, X, ChevronDown, ChevronUp } from 'lucide-react';
import { Button as NativeButton } from '../../components/common/Button/Button';
import { Slider as NativeSlider } from '../../components/common/Slider/Slider';
import { useTranslation } from '../../lib/i18n';
import { getTokenSync } from '../../api/auth';
import { openExternalUrl } from './openExternal';
import { resolveStickerSrc, type AvatarSticker, type AvatarStream } from './avatarStickers';

export type LivePopup = 'none' | 'player' | 'idle';

interface AvatarImmersiveDrawerProps {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  /** The overlay's animated exit; absent outside an immersive overlay. */
  onExit?: () => void;
  status: string;
  statusLive: boolean;
  stream: AvatarStream | null;
  offlineArt: string | null;
  livePopup: LivePopup;
  onLivePress: () => void;
  stickers: AvatarSticker[];
  editing: boolean;
  onToggleEditing: () => void;
  onAddSticker: (id: string) => void;
  /** 0..100, absent until the session is ready. */
  zoom: number | null;
  onZoom: (value: number) => void;
}

/** The player never takes more than this share of the stage height, so a
 *  wide landscape panel keeps the character visible above it. */
const PLAYER_MAX_HEIGHT_FRACTION = 0.42;
const PLAYER_ASPECT = 16 / 9;
const PAD = 12;
/** Height of the strip that stays visible when the drawer is folded. */
export const LIP_HEIGHT = 26;

const rootStyle: CSSProperties = {
  position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 3, pointerEvents: 'none',
};
const sheetBase: CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center',
  padding: `0 ${PAD}px ${PAD}px`, borderRadius: '18px 18px 0 0',
  background: 'rgba(12,12,18,0.72)', color: '#fff',
  transition: 'transform 240ms cubic-bezier(0.32, 0.72, 0, 1)', pointerEvents: 'auto',
};
const lipStyle: CSSProperties = {
  width: '100%', height: LIP_HEIGHT, display: 'flex', alignItems: 'center', justifyContent: 'center',
  border: 0, background: 'transparent', color: 'rgba(255,255,255,0.7)', padding: 0, cursor: 'pointer',
  touchAction: 'manipulation', flex: '0 0 auto',
};
const stripStyle: CSSProperties = {
  display: 'flex', alignItems: 'center', maxWidth: '100%',
  padding: '6px 12px', marginBottom: 8, borderRadius: 999,
  background: 'rgba(0,0,0,0.45)', color: '#fff', fontSize: 13, lineHeight: 1.25,
};
const liveDotStyle: CSSProperties = {
  width: 8, height: 8, borderRadius: 4, background: '#ff3b30', marginRight: 8, flex: '0 0 auto',
};
const rowStyle: CSSProperties = {
  display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', maxWidth: '100%',
};
const zoomRowStyle: CSSProperties = {
  display: 'flex', alignItems: 'center', width: '100%', maxWidth: 420, marginTop: 6,
};
const paletteStyle: CSSProperties = {
  display: 'flex', alignItems: 'center', maxWidth: '100%', overflowX: 'auto',
  WebkitOverflowScrolling: 'touch', padding: '4px 0', marginBottom: 8,
};
const thumbStyle: CSSProperties = {
  width: 56, height: 56, marginRight: 8, padding: 4, flex: '0 0 auto',
  border: '1px solid rgba(255,255,255,0.18)', borderRadius: 12,
  background: 'rgba(0,0,0,0.45)', cursor: 'pointer', touchAction: 'manipulation',
};
const idleCardStyle: CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  width: 200, marginBottom: 8, padding: '12px 16px', borderRadius: 16,
  background: 'rgba(0,0,0,0.45)', color: '#fff', fontSize: 13,
};

// The "not live" card: the app's art bobs while a trail of z's drifts up
// and fades. Keyframes need a stylesheet; scoped names keep them from
// colliding.
const IDLE_KEYFRAMES = `
@keyframes nxAvatarIdleBob { 0%,100% { transform: translateY(0) rotate(-3deg); } 50% { transform: translateY(-8px) rotate(3deg); } }
@keyframes nxAvatarIdleZ { 0% { opacity: 0; transform: translate(0, 0) scale(0.6); } 30% { opacity: 1; } 100% { opacity: 0; transform: translate(14px, -34px) scale(1.2); } }
`;

export function AvatarImmersiveDrawer(p: AvatarImmersiveDrawerProps) {
  const { t } = useTranslation();
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const [playerWidth, setPlayerWidth] = useState(0);
  const token = getTokenSync();
  const showPlayer = p.livePopup === 'player' && p.stream !== null && !p.editing;
  const showIdle = p.livePopup === 'idle' && p.stream === null && !p.editing;

  // The player is as wide as the sheet allows, capped so its player-aspect
  // height stays under the stage-height share above; measured because the
  // immersive body is sized per panel and CSS has no 'min of two axes' for
  // this. Keyed on the embed URL, not the stream object, which the worker
  // hands over fresh on every re-render.
  const embed = p.stream?.embed;
  useEffect(() => {
    const el = sheetRef.current;
    if (!el || !embed) return;
    const measure = () => {
      const innerW = el.clientWidth - PAD * 2;
      const stageH = el.parentElement?.parentElement?.clientHeight ?? 0;
      const capW = stageH > 0 ? stageH * PLAYER_MAX_HEIGHT_FRACTION * PLAYER_ASPECT : innerW;
      setPlayerWidth(Math.max(0, Math.floor(Math.min(innerW, capW))));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.parentElement?.parentElement) ro.observe(el.parentElement.parentElement);
    return () => ro.disconnect();
  }, [embed]);

  const showStickers = p.stickers.length > 0;
  // Folded: only the lip shows; the sheet slides down by its own height minus
  // the lip. A percentage translate needs no measurement.
  const sheetStyle: CSSProperties = {
    ...sheetBase,
    transform: p.open ? 'translateY(0)' : `translateY(calc(100% - ${LIP_HEIGHT}px))`,
  };

  return (
    <div style={rootStyle} data-avatar-dock data-avatar-drawer={p.open ? 'open' : 'closed'} data-panel-no-sheet-swipe="true">
      <div ref={sheetRef} style={sheetStyle}>
        <button
          type="button"
          style={lipStyle}
          data-avatar-lip
          aria-label={p.open ? t('sdk.avatar.controlsHide') : t('sdk.avatar.controlsShow')}
          aria-expanded={p.open}
          onClick={p.open ? p.onClose : p.onOpen}
        >
          {p.open ? <ChevronDown size={18} aria-hidden /> : <ChevronUp size={18} aria-hidden />}
        </button>
        {/* Folded, the controls are clipped below the stage; keep them out of
            the accessibility tree and tab order so focus cannot scroll them in. */}
        <div style={{ display: 'contents' }} aria-hidden={!p.open} inert={!p.open}>
        {p.status && !p.editing && p.open && (
          <div style={stripStyle} data-avatar-status>
            {p.statusLive && <span style={liveDotStyle} aria-hidden />}
            <span>{p.status}</span>
          </div>
        )}
        {showPlayer && playerWidth > 0 && (
          <div
            data-avatar-stream
            style={{
              position: 'relative', width: playerWidth, height: Math.round(playerWidth / PLAYER_ASPECT),
              marginBottom: 8, borderRadius: 12, overflow: 'hidden', background: '#000',
              boxShadow: '0 8px 28px rgba(0,0,0,0.45)',
            }}
          >
            <iframe
              src={p.stream!.embed}
              title={t('sdk.avatar.streamTitle')}
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 }}
            />
          </div>
        )}
        {showIdle && (
          <div style={idleCardStyle} data-avatar-idle>
            <style>{IDLE_KEYFRAMES}</style>
            <div style={{ position: 'relative', width: 96, height: 96, marginBottom: 6 }}>
              {p.offlineArt && (
                <img
                  src={resolveStickerSrc(p.offlineArt, token)}
                  alt=""
                  draggable={false}
                  style={{ width: '100%', height: '100%', objectFit: 'contain', animation: 'nxAvatarIdleBob 1.6s ease-in-out infinite' }}
                />
              )}
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  aria-hidden
                  style={{
                    position: 'absolute', right: 6 + i * 4, top: 18 - i * 6, fontWeight: 800, fontSize: 14 + i * 3,
                    animation: `nxAvatarIdleZ 2.1s ease-out ${i * 0.5}s infinite`, opacity: 0,
                  }}
                >
                  z
                </span>
              ))}
            </div>
            <span>{t('sdk.avatar.notLive')}</span>
          </div>
        )}
        {p.editing && showStickers && (
          <div style={paletteStyle} data-avatar-palette>
            {p.stickers.map((s) => (
              <button key={s.id} type="button" style={thumbStyle} aria-label={t('sdk.avatar.stickerAdd')} onClick={() => p.onAddSticker(s.id)}>
                <img src={resolveStickerSrc(s.src, token)} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
              </button>
            ))}
          </div>
        )}
        <div style={rowStyle}>
          {p.editing ? (
            <span style={{ margin: 4 }}>
              <NativeButton tone="accent" size="md" pill icon={<Check size={16} aria-hidden />} onClick={p.onToggleEditing}>
                {t('sdk.avatar.stickersDone')}
              </NativeButton>
            </span>
          ) : (
            <>
              <span style={{ margin: 4 }}>
                <NativeButton
                  tone={showPlayer ? 'accent' : 'neutral'}
                  size="md"
                  pill
                  icon={<Radio size={16} aria-hidden />}
                  status={p.stream ? 'online' : undefined}
                  onClick={p.onLivePress}
                  aria-pressed={showPlayer}
                >
                  {t('sdk.avatar.live')}
                </NativeButton>
              </span>
              {showPlayer && p.stream?.open && (
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
                  <NativeButton tone="neutral" size="md" pill icon={<Sticker size={16} aria-hidden />} onClick={p.onToggleEditing}>
                    {t('sdk.avatar.stickers')}
                  </NativeButton>
                </span>
              )}
              {p.onExit && (
                <span style={{ margin: 4 }}>
                  <NativeButton
                    tone="neutral"
                    size="md"
                    pill
                    icon={<X size={16} aria-hidden />}
                    aria-label={t('panel.immersive.close')}
                    onClick={p.onExit}
                  />
                </span>
              )}
            </>
          )}
        </div>
        {!p.editing && p.zoom !== null && (
          <div style={zoomRowStyle} data-avatar-zoom>
            <ZoomIn size={16} aria-hidden style={{ flex: '0 0 auto', marginRight: 10, opacity: 0.8 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <NativeSlider
                orientation="bare"
                value={p.zoom}
                min={0}
                max={100}
                step={1}
                trackFill
                ariaLabel={t('sdk.avatar.zoom')}
                onChange={(v) => p.onZoom(v)}
              />
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
