import { useEffect, useRef, useState } from 'react';
import { IconLabelButton } from '../../../components/common/IconLabelButton/IconLabelButton';
import {
  Play, Pause, SkipBack, SkipForward, Music,
  Shuffle, Repeat, Repeat1,
  Volume, Volume1, Volume2, VolumeX,
} from 'lucide-react';
import { useMedia, controlMedia, type MediaSession } from '../../../hooks/useMedia';
import { useSystemVolume } from '../../../hooks/useSystemVolume';
import { fetchServiceBlob } from '../../../api/service';
import { useTranslation } from '../../../lib/i18n';
import { EmptyState } from '../../../components/common/EmptyState/EmptyState';
import type { WidgetProps } from '../types';
import { surfaceSupportsTouch, widgetLayoutSize } from '../../types';
import { PanelMixerSlider } from '../common/PanelMixerSlider';
import { usePanelPreview } from '../common/PanelPreviewContext';
import { mediaArtSignature } from './mediaArt';
import { useLivePositionMs } from './mediaTime';
import { MEDIA_PREVIEW } from './mediaPreviewData';
import styles from './MediaWidget.module.scss';

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

export function MediaWidget({ widget, surface, deviceTouch }: WidgetProps) {
  const { t } = useTranslation();
  const preview = usePanelPreview();
  const { sessions } = useMedia(!preview);
  const [artAsset, setArtAsset] = useState<MediaArtAsset>({ key: '', signature: '', url: '' });
  const showControls = surface ? surfaceSupportsTouch(surface, deviceTouch) : true;
  const size = widgetLayoutSize(widget.size);
  const compact = size === '2x2';
  const tall = size === '2x4';
  // Tall (2x4) is a portrait card (art over centered metadata +
  // controls) with no room for the persistent volume mixer rail.
  const volumeBridge = useSystemVolume(showControls && !compact && !tall && !preview);
  const { state: liveVolume, previewVolume, commitVolume, setMuted } = volumeBridge;
  const volume = preview ? MEDIA_PREVIEW.volume : liveVolume;

  const active = preview ? MEDIA_PREVIEW.active : pickActive(sessions);
  const activeKey = active?.key ?? '';
  // The media topic sends no frame while playback runs at 1x, so the bar
  // ticks locally between frames.
  const livePositionMs = useLivePositionMs(
    active?.session.playback.positionMs ?? 0,
    active?.session.playback.durationMs ?? 0,
    !preview && !!active?.session.playback.playing && !active.session.playback.stopped,
  );
  const artSignature = mediaArtSignature(active?.session);
  const showVolume = showControls && !compact && !tall && volume.supported;
  const artUrl = artAsset.key === activeKey && artAsset.signature === artSignature ? artAsset.url : '';

  useEffect(() => {
    if (preview) return;
    if (!activeKey) return;
    let cancelled = false;
    let blobUrl: string | null = null;

    fetchServiceBlob(`/api/media/${encodeURIComponent(activeKey)}/album-art`).then(blob => {
      if (cancelled || !blob) {
        if (!cancelled) setArtAsset({ key: activeKey, signature: artSignature, url: '' });
        return;
      }
      const url = URL.createObjectURL(blob);
      blobUrl = url;
      setArtAsset({ key: activeKey, signature: artSignature, url });
    }).catch(() => {
      if (!cancelled) setArtAsset({ key: activeKey, signature: artSignature, url: '' });
    });

    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [preview, activeKey, artSignature]);

  const control = (action: string) => {
    if (!active) return;
    controlMedia(active.key, action).catch(() => {});
  };

  if (!active) {
    return (
      <div className={`${styles.media} ${compact ? styles.compact : styles.full} ${tall ? styles.tall : ''} ${showControls ? '' : styles.statusOnly}`}>
        {showVolume ? (
          <div className={styles.fullContent}>
            <EmptyState
              compact
              icon={<Music strokeWidth={1.5} />}
              title={t('panel.media.empty')}
              className={styles.emptySlot}
            />
            <MediaVolumeSlider
              volume={volume.volume}
              muted={volume.muted}
              sourceLabel={t('panel.widget.media')}
              onPreview={previewVolume}
              onCommit={commitVolume}
              onToggleMute={() => setMuted(!volume.muted)}
              t={t}
            />
          </div>
        ) : (
          <EmptyState
            compact
            icon={<Music strokeWidth={1.5} />}
            title={t('panel.media.empty')}
            className={styles.emptySlot}
          />
        )}
      </div>
    );
  }

  const s = active.session;
  const playing = s.playback.playing;
  const progress = s.playback.durationMs > 0
    ? Math.min(100, (livePositionMs / s.playback.durationMs) * 100)
    : 0;
  const repeatMode = (s.playback.repeatMode || 'None');
  const repeatActive = repeatMode === 'List' || repeatMode === 'Track';

  return (
    <div className={`${styles.media} ${compact ? styles.compact : styles.full} ${tall ? styles.tall : ''} ${showControls ? '' : styles.statusOnly}`}>
      {compact ? (
        <>
          <div className={styles.compactNowPlaying}>
            <div className={styles.compactArtWrap} aria-hidden="true">
              {artUrl ? (
                <img src={artUrl} alt="" className={styles.art} />
              ) : (
                <div className={styles.artFallback}>
                  <Music strokeWidth={1.4} />
                </div>
              )}
            </div>
            <div className={styles.compactTitle}>{s.song.title || '-'}</div>
          </div>
          {showControls && (
            <div className={styles.controls}>
              <IconLabelButton
                variant="bare"
                className={styles.btn}
                icon={<SkipBack strokeWidth={1.8} fill="currentColor" />}
                ariaLabel={t('panel.media.previous')}
                disabled={!s.controls.isPrevEnabled}
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
                disabled={!s.controls.isNextEnabled}
                onPress={() => control('next')}
              />
            </div>
          )}
        </>
      ) : (
        <div className={styles.fullContent}>
          <div className={styles.playbackColumn}>
            <div className={styles.topRow}>
              <div className={styles.artWrap} aria-hidden="true">
                {artUrl ? (
                  <img src={artUrl} alt="" className={styles.art} />
                ) : (
                  <div className={styles.artFallback}>
                    <Music strokeWidth={1.4} />
                  </div>
                )}
              </div>
              <div className={styles.metadata}>
                <div className={styles.title}>{s.song.title || '-'}</div>
                <div className={styles.artist}>{s.song.artist}</div>
                {s.song.album && <div className={styles.album}>{s.song.album}</div>}
                {s.playback.durationMs > 0 && (
                  <div className={styles.progressTrack}>
                    <div className={styles.progressFill} style={{ width: `${progress}%` }} />
                  </div>
                )}
              </div>
            </div>
            {showControls && (
              <div className={styles.controls}>
                <IconLabelButton
                  variant="bare"
                  className={styles.btn}
                  icon={<Shuffle strokeWidth={1.8} />}
                  active={!!s.playback.shuffled}
                  ariaLabel={t('panel.media.shuffle')}
                  disabled={!s.controls.isShuffleEnabled}
                  onPress={() => control('shuffle')}
                />
                <IconLabelButton
                  variant="bare"
                  className={styles.btn}
                  icon={<SkipBack strokeWidth={1.8} fill="currentColor" />}
                  ariaLabel={t('panel.media.previous')}
                  disabled={!s.controls.isPrevEnabled}
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
                  disabled={!s.controls.isNextEnabled}
                  onPress={() => control('next')}
                />
                <IconLabelButton
                  variant="bare"
                  className={styles.btn}
                  icon={repeatMode === 'Track' ? <Repeat1 strokeWidth={1.8} /> : <Repeat strokeWidth={1.8} />}
                  active={repeatActive}
                  ariaLabel={t('panel.media.repeat')}
                  disabled={!s.controls.isRepeatModeEnabled}
                  onPress={() => control('repeatmode')}
                />
              </div>
            )}
          </div>
          {showVolume && (
            <MediaVolumeSlider
              volume={volume.volume}
              muted={volume.muted}
              sourceLabel={s.sourceAppName || t('panel.widget.media')}
              onPreview={previewVolume}
              onCommit={commitVolume}
              onToggleMute={() => setMuted(!volume.muted)}
              t={t}
            />
          )}
        </div>
      )}
    </div>
  );
}

function MediaVolumeSlider({
  volume,
  muted,
  sourceLabel,
  onPreview,
  onCommit,
  onToggleMute,
  t,
}: {
  volume: number;
  muted: boolean;
  sourceLabel: string;
  onPreview: (v: number) => void;
  onCommit: (v: number, options?: { flush?: boolean }) => void;
  onToggleMute: () => void;
  t: (k: string) => string;
}) {
  const unmuteRequested = useRef(false);

  const applyVolume = (v: number, flush = false) => {
    const nextVolume = Math.max(0, Math.min(1, v / 100));
    if (muted && nextVolume > 0 && !unmuteRequested.current) {
      unmuteRequested.current = true;
      onToggleMute();
    }
    onPreview(nextVolume);
    onCommit(nextVolume, { flush });
  };

  const displayVolume = muted ? 0 : volume;
  const fillPct = Math.round(displayVolume * 100);

  return (
    <PanelMixerSlider
      min={0}
      max={100}
      value={fillPct}
      topLabel={sourceLabel}
      ariaLabel={t('panel.media.volume')}
      valueLabel={`${fillPct}`}
      icon={<VolumeIcon volume={volume} muted={muted} />}
      iconButton={{
        ariaLabel: muted ? t('panel.media.unmute') : t('panel.media.mute'),
        ariaPressed: muted,
        active: muted,
        onClick: onToggleMute,
      }}
      onInteractionStart={() => { unmuteRequested.current = false; }}
      onChange={v => applyVolume(v)}
      onCommit={v => {
        applyVolume(v, true);
        unmuteRequested.current = false;
      }}
      className={styles.volumeMixer}
    />
  );
}

export default MediaWidget;
