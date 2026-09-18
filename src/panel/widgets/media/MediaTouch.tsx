import { useCallback, useEffect, useRef, useState } from 'react';
import { IconLabelButton } from '../../../components/common/IconLabelButton/IconLabelButton';
import {
  AudioLines, Music, Pause, Play, SkipBack, SkipForward, Shuffle, Repeat, Repeat1,
  Volume, Volume1, Volume2, VolumeX,
} from 'lucide-react';
import { ImmersiveLayout } from '../common/ImmersiveLayout';
import { StableDigits } from '../common/StableDigits';
import { useMedia, controlMedia, seekMedia, type MediaSession } from '../../../hooks/useMedia';
import { useSystemVolume } from '../../../hooks/useSystemVolume';
import { fetchServiceBlob } from '../../../api/service';
import { useTranslation } from '../../../lib/i18n';
import { EmptyState } from '../../../components/common/EmptyState/EmptyState';
import { surfaceSupportsTouch } from '../../types';
import type { WidgetProps } from '../types';
import { mediaArtSignature } from './mediaArt';
import { formatTrackTime, useLivePositionMs } from './mediaTime';
import { MediaVisualizer } from './MediaVisualizer';
import { nextVisualizerEffect, normalizeVisualizerEffect, visualizerLabelKey } from './mediaVisualizers';
import styles from './MediaTouch.module.scss';

interface MediaArtAsset {
  key: string;
  signature: string;
  url: string;
}

function pickActive(sessions: Record<string, MediaSession>): { key: string; session: MediaSession } | null {
  const entries = Object.entries(sessions);
  if (entries.length === 0) return null;
  const playing = entries.find(([, s]) => s.playback.playing && !s.playback.stopped);
  const [key, session] = playing ?? entries[0];
  return { key, session };
}

function VolumeIcon({ volume, muted }: { volume: number; muted: boolean }) {
  if (muted || volume <= 0) return <VolumeX strokeWidth={1.8} />;
  if (volume < 0.34) return <Volume strokeWidth={1.8} />;
  if (volume < 0.67) return <Volume1 strokeWidth={1.8} />;
  return <Volume2 strokeWidth={1.8} />;
}

// Unknown paths fall through to the SPA, so a 200 can carry index.html instead
// of image bytes - a service predating /album-art-hd answers that way, and
// createObjectURL on the HTML renders a broken <img>. Require image bytes.
function isImageBlob(blob: Blob | null): blob is Blob {
  return !!blob && blob.size > 0 && blob.type.startsWith('image/');
}

// Idle delay before the transport controls fade back out over the visualizer.
const CONTROLS_IDLE_MS = 3_000;
// How long the effect name stays up after a cycle tap.
const EFFECT_TOAST_MS = 1_600;

export function MediaTouch({ widget, surface, deviceTouch, immersiveGrid, onUpdate }: WidgetProps) {
  const { t } = useTranslation();
  const { sessions } = useMedia(true);
  const [artAsset, setArtAsset] = useState<MediaArtAsset>({ key: '', signature: '', url: '' });
  const [hdArtAsset, setHdArtAsset] = useState<MediaArtAsset>({ key: '', signature: '', url: '' });
  const active = pickActive(sessions);
  const activeKey = active?.key ?? '';
  const artSig = mediaArtSignature(active?.session);
  const artUrl = artAsset.key === activeKey && artAsset.signature === artSig ? artAsset.url : '';
  const hdArtUrl = hdArtAsset.key === activeKey && hdArtAsset.signature === artSig ? hdArtAsset.url : '';

  useEffect(() => {
    if (!activeKey) return;
    let cancelled = false;
    let blobUrl: string | null = null;
    fetchServiceBlob(`/api/media/${encodeURIComponent(activeKey)}/album-art`).then(blob => {
      if (cancelled || !isImageBlob(blob)) {
        if (!cancelled) setArtAsset({ key: activeKey, signature: artSig, url: '' });
        return;
      }
      const url = URL.createObjectURL(blob);
      blobUrl = url;
      setArtAsset({ key: activeKey, signature: artSig, url });
    }).catch(() => {
      if (!cancelled) setArtAsset({ key: activeKey, signature: artSig, url: '' });
    });
    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [activeKey, artSig]);

  // Optional high-res upgrade for the immersive view: swaps in only when the
  // service resolves catalog art; any miss leaves the standard art in place.
  useEffect(() => {
    if (!activeKey) return;
    let cancelled = false;
    let blobUrl: string | null = null;
    fetchServiceBlob(`/api/media/${encodeURIComponent(activeKey)}/album-art-hd`).then(blob => {
      if (cancelled || !isImageBlob(blob)) return;
      const url = URL.createObjectURL(blob);
      blobUrl = url;
      setHdArtAsset({ key: activeKey, signature: artSig, url });
    }).catch(() => {});
    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [activeKey, artSig]);

  const gridColumns = immersiveGrid?.columns ?? 4;
  const gridRows = immersiveGrid?.rows ?? 8;

  // Config is the persistence; local state is what renders, so a tap lands
  // immediately whether or not the host wired onUpdate (the simulator does not).
  const canTouch = surface ? surfaceSupportsTouch(surface, deviceTouch) : true;
  const [visualizerOn, setVisualizerOn] = useState(() => widget?.config?.visualizer === true);
  const [effect, setEffect] = useState(() => normalizeVisualizerEffect(widget?.config?.visualizerEffect));
  const [controlsRevealed, setControlsRevealed] = useState(true);
  // Bumped on every reveal so re-tapping while already revealed re-arms the
  // idle timer; a boolean alone would leave the first timeout running.
  const [revealNonce, setRevealNonce] = useState(0);
  const [effectToast, setEffectToast] = useState(0);
  // A service that predates these effects 404s the shader source, leaving a
  // transparent canvas; the album-art backdrop goes back behind the player so
  // the frame is never plain black.
  const [shaderUnavailable, setShaderUnavailable] = useState(false);

  const revealControls = useCallback(() => {
    setControlsRevealed(true);
    setRevealNonce(n => n + 1);
  }, []);

  useEffect(() => {
    if (!visualizerOn || !controlsRevealed) return;
    const id = window.setTimeout(() => setControlsRevealed(false), CONTROLS_IDLE_MS);
    return () => window.clearTimeout(id);
  }, [visualizerOn, controlsRevealed, revealNonce]);

  useEffect(() => {
    if (!effectToast) return;
    const id = window.setTimeout(() => setEffectToast(0), EFFECT_TOAST_MS);
    return () => window.clearTimeout(id);
  }, [effectToast]);

  const toggleVisualizer = useCallback(() => {
    setVisualizerOn(on => {
      const next = !on;
      onUpdate?.({ visualizer: next });
      return next;
    });
    revealControls();
  }, [onUpdate, revealControls]);

  // A tap with the controls faded only brings them back; a tap while they are
  // up cycles the effect. Cycling on the reveal tap too would change the
  // visualizer every time the user reached for the pause button.
  const handleVisualizerTap = useCallback(() => {
    if (!controlsRevealed) { revealControls(); return; }
    setEffect(current => {
      const next = nextVisualizerEffect(current);
      onUpdate?.({ visualizerEffect: next });
      return next;
    });
    setShaderUnavailable(false);
    setEffectToast(n => n + 1);
    revealControls();
  }, [controlsRevealed, onUpdate, revealControls]);

  if (!active) {
    return (
      <ImmersiveLayout
        cells={[
          <div className={styles.empty}>
            <EmptyState icon={<Music strokeWidth={1.5} />} title={t('panel.media.empty')} />
          </div>,
        ]}
        gridColumns={gridColumns}
        gridRows={gridRows}
      />
    );
  }

  // Art and player are two 4x4 cells, so the shared layout places them side by
  // side in landscape and stacked in portrait off one code path. fillLast=false
  // keeps both at a true 4x4 and centres the pair instead of letting the player
  // absorb the rest of a wide panel (the Xeneon Edge is 14 columns); an explicit
  // cellsPerPage keeps them on ONE page on short grids, where the derived fit
  // (floor(rows/4) = 1 on a 4x6 phone) would otherwise split them across a swipe.
  const art = hdArtUrl || artUrl;
  const player = (
    <MediaPlayerCell
      session={active.session}
      sourceKey={active.key}
      t={t}
      visualizer={visualizerOn}
      controlsRevealed={controlsRevealed}
      canToggleVisualizer={canTouch}
      onToggleVisualizer={toggleVisualizer}
    />
  );
  return (
    <div className={styles.immersiveRoot} data-visualizer={visualizerOn ? 'true' : undefined}>
      {/* Backdrop uses the standard art, not the HD upgrade: it is blurred past
          the point the extra resolution can show, so the bigger decode buys
          nothing. */}
      {artUrl && (!visualizerOn || shaderUnavailable) && (
        <div className={styles.backdrop} aria-hidden="true">
          <img className={styles.backdropArt} src={artUrl} alt="" />
          <div className={styles.backdropTint} />
        </div>
      )}
      {visualizerOn && (
        <>
          <MediaVisualizer effect={effect} surface={surface} onUnavailable={setShaderUnavailable} />
          {/* Scrim under the text only: the shader is high-contrast in places
              the title would otherwise sit on. */}
          <div className={styles.visualizerScrim} aria-hidden="true" />
          <button
            type="button"
            className={styles.visualizerSurface}
            onClick={handleVisualizerTap}
            // The sheet-swipe engine arms a drag on plain touches; without this
            // the tap races the overlay's snap-back and the cycle is dropped.
            data-panel-no-sheet-swipe="true"
            aria-label={t(controlsRevealed ? 'panel.media.visualizer.next' : 'panel.media.visualizer.showControls')}
          />
          {effectToast > 0 && (
            <div className={styles.visualizerToast} role="status">{t(visualizerLabelKey(effect))}</div>
          )}
        </>
      )}
      <div className={styles.immersiveContent}>
        {visualizerOn ? (
          <ImmersiveLayout
            cells={[player]}
            gridColumns={gridColumns}
            gridRows={gridRows}
            cellsPerPage={1}
          />
        ) : (
          <ImmersiveLayout
            cells={[<MediaArtCell artUrl={art} />, player]}
            gridColumns={gridColumns}
            gridRows={gridRows}
            fillLast={false}
            cellsPerPage={2}
          />
        )}
      </div>
    </div>
  );
}

function MediaArtCell({ artUrl }: { artUrl: string }) {
  // Bytes that pass the image content-type check can still fail to decode;
  // fall back to the placeholder rather than leaving a broken <img>.
  const [failedUrl, setFailedUrl] = useState('');
  const showArt = !!artUrl && failedUrl !== artUrl;
  return (
    <div className={styles.artCell}>
      {showArt ? (
        <img
          className={styles.artwork}
          src={artUrl}
          alt=""
          onError={() => setFailedUrl(artUrl)}
        />
      ) : (
        <div className={styles.artworkPlaceholder}><Music size={64} strokeWidth={1.4} /></div>
      )}
    </div>
  );
}

function MediaPlayerCell({
  session,
  sourceKey,
  t,
  visualizer,
  controlsRevealed,
  canToggleVisualizer,
  onToggleVisualizer,
}: {
  session: MediaSession;
  sourceKey: string;
  t: (k: string, params?: Record<string, string | number>) => string;
  visualizer: boolean;
  controlsRevealed: boolean;
  canToggleVisualizer: boolean;
  onToggleVisualizer: () => void;
}) {
  const control = (action: string) => { void controlMedia(sourceKey, action); };
  const playing = session.playback.playing && !session.playback.stopped;
  const repeatMode = session.playback.repeatMode || 'None';
  const repeatActive = repeatMode === 'List' || repeatMode === 'Track';
  const RepeatIcon = repeatMode === 'Track' ? Repeat1 : Repeat;

  const volumeBridge = useSystemVolume(true);
  const { state: volume, previewVolume, commitVolume, setMuted } = volumeBridge;

  return (
    <div className={styles.player}>
      {session.sourceAppName && (
        <div className={styles.source}>{t('panel.media.playingOn', { source: session.sourceAppName })}</div>
      )}
      <div className={styles.meta}>
        <div className={styles.title}>{session.song.title || t('panel.media.unknownTitle')}</div>
        <div className={styles.artist}>{session.song.artist || ''}</div>
        {session.song.album && <div className={styles.album}>{session.song.album}</div>}
      </div>
      <div
        className={styles.fadeGroup}
        // Only the visualizer fades these; off it, the group is a plain
        // wrapper and data-revealed stays true.
        data-revealed={!visualizer || controlsRevealed ? 'true' : 'false'}
      >
        {session.playback.durationMs > 0 && (
          <SeekBar
            durationMs={session.playback.durationMs}
            positionMs={session.playback.positionMs}
            playing={playing}
            seekable={!!session.controls.isSeekEnabled}
            onSeek={ms => seekMedia(sourceKey, ms)}
            t={t}
          />
        )}
        <div className={styles.controls}>
          <IconLabelButton
            variant="bare"
            className={styles.btn}
            icon={<Shuffle strokeWidth={1.8} />}
            active={!!session.playback.shuffled}
            ariaLabel={t('panel.media.shuffle')}
            disabled={!session.controls.isShuffleEnabled}
            onPress={() => control('shuffle')}
          />
          <IconLabelButton
            variant="bare"
            className={styles.btn}
            icon={<SkipBack strokeWidth={1.8} fill="currentColor" />}
            ariaLabel={t('panel.media.previous')}
            disabled={!session.controls.isPrevEnabled}
            onPress={() => control('previous')}
          />
          <IconLabelButton
            variant="bare"
            className={styles.primary}
            icon={playing ? <Pause fill="currentColor" stroke="none" /> : <Play fill="currentColor" stroke="none" />}
            ariaLabel={playing ? t('panel.media.pause') : t('panel.media.play')}
            onPress={() => control(playing ? 'pause' : 'play')}
          />
          <IconLabelButton
            variant="bare"
            className={styles.btn}
            icon={<SkipForward strokeWidth={1.8} fill="currentColor" />}
            ariaLabel={t('panel.media.next')}
            disabled={!session.controls.isNextEnabled}
            onPress={() => control('next')}
          />
          <IconLabelButton
            variant="bare"
            className={styles.btn}
            icon={<RepeatIcon strokeWidth={1.8} />}
            active={repeatActive}
            ariaLabel={t('panel.media.repeat')}
            disabled={!session.controls.isRepeatModeEnabled}
            onPress={() => control('repeatmode')}
          />
          {canToggleVisualizer && (
            <IconLabelButton
              variant="bare"
              className={styles.btn}
              icon={<AudioLines strokeWidth={1.8} />}
              active={visualizer}
              ariaLabel={t(visualizer ? 'panel.media.visualizer.hide' : 'panel.media.visualizer.show')}
              onPress={onToggleVisualizer}
            />
          )}
        </div>
        {volume.supported && (
          <HorizontalVolume
            volume={volume.volume}
            muted={volume.muted}
            onPreview={previewVolume}
            onCommit={commitVolume}
            onToggleMute={() => setMuted(!volume.muted)}
            t={t}
          />
        )}
      </div>
    </div>
  );
}

// The seek endpoint is fire-and-forget and the session state arrives as
// pushed frames (or polls while the socket is down), so there is no
// completion signal to await. After a release the bar therefore HOLDS the
// requested position until a frame reports a position near it - dropping
// straight back to the last known value is what made a seek snap back to
// where it started until the next frame.
const SEEK_CONFIRM_WINDOW_MS = 3_000;
// A player that silently refuses the seek would otherwise pin the bar to a
// position it never reaches; release to server truth after this.
const SEEK_CONFIRM_TIMEOUT_MS = 6_000;

/**
 * Track position with scrub-to-seek, flanked by elapsed and total times. The
 * fill follows the pointer while dragging and the requested position after
 * release, so it never rubber-bands between the release and the next poll;
 * the elapsed readout derives from the same shown position, so it agrees with
 * the fill in every state. Players that do not advertise isSeekEnabled render
 * the same bar with no interaction, since the service would silently no-op
 * the request.
 */
function SeekBar({
  durationMs,
  positionMs,
  playing,
  seekable,
  onSeek,
  t,
}: {
  durationMs: number;
  positionMs: number;
  playing: boolean;
  seekable: boolean;
  onSeek: (positionMs: number) => Promise<void>;
  t: (k: string) => string;
}) {
  const barRef = useRef<HTMLDivElement | null>(null);
  const [dragPct, setDragPct] = useState<number | null>(null);
  // Identity changes per seek, so the timeout effect below re-arms only on a
  // new request rather than on every poll.
  const [pending, setPending] = useState<{ pct: number; fromPositionMs: number; durationMs: number } | null>(null);

  // Ticks between polls. The hold below still resolves against the polled
  // position, so a tick can never stand in for the confirmation a seek needs.
  const livePositionMs = useLivePositionMs(positionMs, durationMs, playing);
  const serverPct = durationMs > 0 ? Math.min(100, (livePositionMs / durationMs) * 100) : 0;
  const shown = dragPct ?? pending?.pct ?? serverPct;

  // Release the optimistic hold once a LATER poll lands near the requested
  // position. Comparing against the position captured at request time matters:
  // the first render after the request still carries the pre-seek value, so a
  // scrub to somewhere near the current position would clear the hold at once
  // and rubber-band anyway.
  useEffect(() => {
    if (!pending) return;
    // A track change resets position and duration; the old target is moot.
    if (durationMs !== pending.durationMs) { setPending(null); return; }
    if (positionMs === pending.fromPositionMs) return;
    const targetMs = (pending.pct / 100) * durationMs;
    if (Math.abs(positionMs - targetMs) <= SEEK_CONFIRM_WINDOW_MS) setPending(null);
  }, [pending, positionMs, durationMs]);

  useEffect(() => {
    if (!pending) return;
    const id = setTimeout(() => setPending(null), SEEK_CONFIRM_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [pending]);

  const pctFromEvent = (clientX: number): number => {
    const el = barRef.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    if (r.width <= 0) return 0;
    return Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100));
  };

  const commit = (pct: number) => {
    setDragPct(null);
    setPending({ pct, fromPositionMs: positionMs, durationMs });
    // A rejected request must not leave the bar parked on a position the
    // player never took.
    // Promise.resolve so a caller returning void cannot throw here.
    Promise.resolve(onSeek((pct / 100) * durationMs)).catch(() => setPending(null));
  };

  // Off the percent only while the fill is detached from playback (drag or
  // hold), since that round-trip loses the exact second. Digits are cell-sized
  // against the inherited font so ticking cannot make the bar breathe; the
  // static total needs no such treatment.
  const detached = dragPct ?? pending?.pct;
  const elapsedMs = detached === undefined ? livePositionMs : (detached / 100) * durationMs;
  const elapsed = (
    <span className={styles.seekTime}><StableDigits text={formatTrackTime(elapsedMs)} /></span>
  );
  const total = <span className={styles.seekTime}>{formatTrackTime(durationMs)}</span>;

  if (!seekable) {
    return (
      <div className={styles.seekRow}>
        {elapsed}
        <div className={styles.seekBar} role="progressbar" aria-valuenow={Math.round(serverPct)} aria-valuemin={0} aria-valuemax={100}>
          <div className={styles.seekFill} style={{ width: `${serverPct}%` }} />
        </div>
        {total}
      </div>
    );
  }

  return (
    <div className={styles.seekRow}>
      {elapsed}
      <div
        ref={barRef}
        className={`${styles.seekBar} ${styles.seekable}`}
        role="slider"
        tabIndex={0}
        aria-label={t('panel.media.seek')}
        aria-valuenow={Math.round(shown)}
        aria-valuemin={0}
        aria-valuemax={100}
        onPointerDown={e => {
          // Capture is an enhancement (keeps a drag alive past the bar edge);
          // it is absent under jsdom and can throw on older WebViews, and the
          // drag must still start when it does.
          try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not supported */ }
          setDragPct(pctFromEvent(e.clientX));
        }}
        onPointerMove={e => {
          if (dragPct === null) return;
          setDragPct(pctFromEvent(e.clientX));
        }}
        onPointerUp={e => {
          // Only a drag that STARTED on the bar may seek; a stray release from a
          // gesture begun elsewhere would otherwise jump playback.
          if (dragPct === null) return;
          commit(dragPct);
          void e;
        }}
        onPointerCancel={() => setDragPct(null)}
        onKeyDown={e => {
          const step = e.key === 'ArrowLeft' ? -5 : e.key === 'ArrowRight' ? 5 : 0;
          if (!step) return;
          e.preventDefault();
          commit(Math.max(0, Math.min(100, shown + step)));
        }}
      >
        <div
          className={styles.seekFill}
          style={{ width: `${shown}%`, transition: dragPct === null ? undefined : 'none' }}
        />
      </div>
      {total}
    </div>
  );
}

/**
 * Horizontal volume bar. Tapping the bar's mute button toggles a
 * popover that OVERLAPS the bar (sits in the same horizontal track
 * area) so the user can drag a slider knob in place. Tap outside to
 * collapse.
 */
function HorizontalVolume({
  volume,
  muted,
  onPreview,
  onCommit,
  onToggleMute,
  t,
}: {
  volume: number;
  muted: boolean;
  onPreview: (v: number) => void;
  onCommit: (v: number, options?: { flush?: boolean }) => void;
  onToggleMute: () => void;
  t: (k: string) => string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const unmuteRequested = useRef(false);

  const valueFromX = (clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return muted ? 0 : volume;
    const ratio = (clientX - rect.left) / rect.width;
    return Math.max(0, Math.min(1, ratio));
  };

  const applyVolume = (v: number, flush = false) => {
    if (muted && v > 0 && !unmuteRequested.current) {
      unmuteRequested.current = true;
      onToggleMute();
    }
    onPreview(v);
    onCommit(v, { flush });
  };

  const onTrackPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    dragging.current = true;
    unmuteRequested.current = false;
    applyVolume(valueFromX(e.clientX), true);
  };
  const onTrackPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    e.stopPropagation();
    applyVolume(valueFromX(e.clientX));
  };
  const onTrackPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    e.stopPropagation();
    dragging.current = false;
    try {
      (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
    } catch {
      // Pointer capture may already be released after a cancelled touch.
    }
    applyVolume(valueFromX(e.clientX), true);
    unmuteRequested.current = false;
  };

  const displayVolume = muted ? 0 : volume;
  const fillPct = Math.round(displayVolume * 100);

  return (
    <div ref={containerRef} className={styles.volumeRow}>
      <IconLabelButton
        variant="bare"
        className={styles.volumeMuteBtn}
        icon={<VolumeIcon volume={volume} muted={muted} />}
        active={muted}
        ariaLabel={muted ? t('panel.media.unmute') : t('panel.media.mute')}
        onPress={onToggleMute}
      />
      <div
        ref={trackRef}
        className={styles.volumeTrack}
        role="slider"
        aria-orientation="horizontal"
        aria-label={t('panel.media.volume')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={fillPct}
        onPointerDown={onTrackPointerDown}
        onPointerMove={onTrackPointerMove}
        onPointerUp={onTrackPointerUp}
        onPointerCancel={onTrackPointerUp}
      >
        <div className={styles.volumeFill} style={{ width: `${fillPct}%` }} />
        <div className={styles.volumeKnob} style={{ left: `calc(${fillPct}% - 11px)` }} />
      </div>
    </div>
  );
}
