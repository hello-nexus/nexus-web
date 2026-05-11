import { useEffect, useRef, useState } from 'react';
import {
  Music, Pause, Play, SkipBack, SkipForward, Shuffle, Repeat, Repeat1,
  Volume, Volume1, Volume2, VolumeX,
} from 'lucide-react';
import { ImmersiveLayout } from '../common/ImmersiveLayout';
import { useMedia, controlMedia, type MediaSession } from '../../../hooks/useMedia';
import { useSystemVolume } from '../../../hooks/useSystemVolume';
import { fetchServiceBlob } from '../../../api/service';
import { useTranslation } from '../../../lib/i18n';
import { EmptyState } from '../../../components/EmptyState/EmptyState';
import type { WidgetProps } from '../types';
import { mediaArtSignature } from './mediaArt';
import styles from './MediaImmersive.module.scss';

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

export function MediaImmersive({ immersiveGrid }: WidgetProps) {
  const { t } = useTranslation();
  const { sessions } = useMedia(true);
  const [artAsset, setArtAsset] = useState<MediaArtAsset>({ key: '', signature: '', url: '' });
  const active = pickActive(sessions);
  const activeKey = active?.key ?? '';
  const artSig = mediaArtSignature(active?.session);
  const artUrl = artAsset.key === activeKey && artAsset.signature === artSig ? artAsset.url : '';

  useEffect(() => {
    if (!activeKey) return;
    let cancelled = false;
    let blobUrl: string | null = null;
    fetchServiceBlob(`/api/media/${encodeURIComponent(activeKey)}/album-art`).then(blob => {
      if (cancelled || !blob) {
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

  const cell = !active ? (
    <div className={styles.empty}>
      <EmptyState icon={<Music strokeWidth={1.5} />} title={t('panel.media.empty')} />
    </div>
  ) : (
    <MediaPlayer session={active.session} sourceKey={active.key} artUrl={artUrl} t={t} />
  );

  return (
    <ImmersiveLayout
      cells={[cell]}
      gridColumns={immersiveGrid?.columns ?? 4}
      gridRows={immersiveGrid?.rows ?? 8}
    />
  );
}

function MediaPlayer({
  session,
  sourceKey,
  artUrl,
  t,
}: {
  session: MediaSession;
  sourceKey: string;
  artUrl: string;
  t: (k: string) => string;
}) {
  const control = (action: string) => { void controlMedia(sourceKey, action); };
  const playing = session.playback.playing && !session.playback.stopped;
  const repeatMode = session.playback.repeatMode || 'None';
  const repeatActive = repeatMode === 'List' || repeatMode === 'Track';
  const RepeatIcon = repeatMode === 'Track' ? Repeat1 : Repeat;

  const progress = session.playback.durationMs > 0
    ? Math.min(100, (session.playback.positionMs / session.playback.durationMs) * 100)
    : 0;

  const volumeBridge = useSystemVolume(true);
  const { state: volume, previewVolume, commitVolume, setMuted } = volumeBridge;

  return (
    <div className={styles.player}>
      <div className={styles.artworkWrap}>
        {artUrl ? (
          <img className={styles.artwork} src={artUrl} alt="" />
        ) : (
          <div className={styles.artworkPlaceholder}><Music size={64} strokeWidth={1.4} /></div>
        )}
      </div>
      <div className={styles.meta}>
        <div className={styles.title}>{session.song.title || 'Unknown title'}</div>
        <div className={styles.artist}>{session.song.artist || ''}</div>
        {session.song.album && <div className={styles.album}>{session.song.album}</div>}
      </div>
      {session.playback.durationMs > 0 && (
        <div className={styles.seekBar} role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}>
          <div className={styles.seekFill} style={{ width: `${progress}%` }} />
        </div>
      )}
      <div className={styles.controls}>
        <button
          type="button"
          onClick={() => control('shuffle')}
          disabled={!session.controls.isShuffleEnabled}
          className={`${styles.btn} ${styles.toggle} ${session.playback.shuffled ? styles.toggleOn : ''}`}
          aria-label="Shuffle"
          aria-pressed={!!session.playback.shuffled}
        ><Shuffle strokeWidth={1.8} /></button>
        <button type="button" onClick={() => control('previous')} disabled={!session.controls.isPrevEnabled} className={styles.btn} aria-label="Previous">
          <SkipBack strokeWidth={1.8} />
        </button>
        <button type="button" onClick={() => control(playing ? 'pause' : 'play')} className={`${styles.btn} ${styles.primary}`} aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? <Pause strokeWidth={2} /> : <Play strokeWidth={2} />}
        </button>
        <button type="button" onClick={() => control('next')} disabled={!session.controls.isNextEnabled} className={styles.btn} aria-label="Next">
          <SkipForward strokeWidth={1.8} />
        </button>
        <button
          type="button"
          onClick={() => control('repeatmode')}
          disabled={!session.controls.isRepeatModeEnabled}
          className={`${styles.btn} ${styles.toggle} ${repeatActive ? styles.toggleOn : ''}`}
          aria-label="Repeat"
          aria-pressed={repeatActive}
        ><RepeatIcon strokeWidth={1.8} /></button>
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
      <button
        type="button"
        className={styles.volumeMuteBtn}
        onClick={onToggleMute}
        aria-label={muted ? t('panel.media.unmute') : t('panel.media.mute')}
        aria-pressed={muted}
      >
        <VolumeIcon volume={volume} muted={muted} />
      </button>
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
