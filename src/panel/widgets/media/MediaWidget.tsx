import { useEffect, useRef, useState } from 'react';
import { IconLabelButton } from '../../../components/common/IconLabelButton/IconLabelButton';
import {
  Play, Pause, SkipBack, SkipForward, Music,
  Shuffle, Repeat, Repeat1,
  Volume, Volume1, Volume2, VolumeX,
} from 'lucide-react';
import { useMedia, controlMedia } from '../../../hooks/useMedia';
import { useSystemVolume } from '../../../hooks/useSystemVolume';
import { fetchServiceBlob } from '../../../api/service';
import { useTranslation } from '../../../lib/i18n';
import { EmptyState } from '../../../components/common/EmptyState/EmptyState';
import type { WidgetProps } from '../types';
import { surfaceSupportsTouch, widgetLayoutSize } from '../../types';
import { PanelMixerSlider } from '../common/PanelMixerSlider';
import { usePanelPreview } from '../common/PanelPreviewContext';
import { mediaArtSignature } from './mediaArt';
import { mediaPreferredApp, pickActiveSession } from './mediaActiveSession';
import { useLivePositionMs } from './mediaTime';
import { mediaShowsVolume, mediaVolumeTarget } from './mediaVolumeTarget';
import { MediaLiveBackground } from './MediaLiveBackground';
import { normalizeVisualizerEffect } from './mediaVisualizers';
import { MEDIA_PREVIEW } from './mediaPreviewData';
import styles from './MediaWidget.module.scss';

interface MediaArtAsset {
  key: string;
  signature: string;
  url: string;
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
  // 4x4 stacks art over centered metadata + controls like 2x4, with the volume rail beside it.
  const square = size === '4x4';
  const active = preview ? MEDIA_PREVIEW.active : pickActiveSession(sessions, mediaPreferredApp(widget));
  const activeKey = active?.key ?? '';
  // Tall (2x4) is a portrait card (art over centered metadata +
  // controls) with no room for the persistent volume mixer rail.
  const volumeAllowed = showControls && !compact && !tall && mediaShowsVolume(widget);
  const volumeBridge = useSystemVolume(
    volumeAllowed && !preview,
    mediaVolumeTarget(widget, activeKey),
  );
  const { state: liveVolume, previewVolume, commitVolume, setMuted } = volumeBridge;
  const volume = preview ? MEDIA_PREVIEW.volume : liveVolume;
  // The media topic sends no frame while playback runs at 1x, so the bar
  // ticks locally between frames.
  const livePositionMs = useLivePositionMs(
    active?.session.playback.positionMs ?? 0,
    active?.session.playback.durationMs ?? 0,
    !preview && !!active?.session.playback.playing && !active.session.playback.stopped,
  );
  const artSignature = mediaArtSignature(active?.session);
  const artVersion = active?.session.song.artVersion ?? 0;
  const showVolume = volumeAllowed && volume.supported;
  const showSource = widget.config?.showSource === true;
  const artResolved = preview || (artAsset.key === activeKey && artAsset.signature === artSignature);
  const artUrl = preview ? MEDIA_PREVIEW.artUrl : artResolved ? artAsset.url : '';
  const liveBackground = widget.config?.liveBackground === true;
  const [liveShowing, setLiveShowing] = useState(false);
  const liveEffect = normalizeVisualizerEffect(widget.config?.visualizerEffect);

  useEffect(() => {
    if (preview) return;
    if (!activeKey) return;
    let cancelled = false;

    fetchServiceBlob(`/api/media/${encodeURIComponent(activeKey)}/album-art`).then(blob => {
      if (cancelled || !blob) {
        if (!cancelled) setArtAsset({ key: activeKey, signature: artSignature, url: '' });
        return;
      }
      setArtAsset({ key: activeKey, signature: artSignature, url: URL.createObjectURL(blob) });
    }).catch(() => {
      if (!cancelled) setArtAsset({ key: activeKey, signature: artSignature, url: '' });
    });

    return () => { cancelled = true; };
  }, [preview, activeKey, artSignature, artVersion]);

  // Revoked when the next result replaces it, so an artVersion refetch keeps
  // the same track's art on screen instead of dropping to the placeholder.
  useEffect(() => {
    const url = artAsset.url;
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [artAsset.url]);

  const control = (action: string) => {
    if (!active) return;
    controlMedia(active.key, action).catch(() => {});
  };

  if (!active) {
    return (
      <div className={`${styles.media} ${compact ? styles.compact : styles.full} ${tall ? styles.tall : ''} ${square ? styles.square : ''} ${showControls ? '' : styles.statusOnly}`}>
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
              sourceLabel={showSource ? volume.name || t('panel.widget.media') : undefined}
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
  const progressBar = s.playback.durationMs > 0 && (
    <div className={styles.progressTrack}>
      <div className={styles.progressFill} style={{ width: `${progress}%` }} />
    </div>
  );
  // Stacked touch tiles seat the bar on the transport row, at the controls' width.
  const barOnTransport = showControls && (tall || square);

  return (
    <div className={`${styles.media} ${compact ? styles.compact : styles.full} ${tall ? styles.tall : ''} ${square ? styles.square : ''} ${showControls ? '' : styles.statusOnly} ${liveBackground ? styles.live : ''} ${liveBackground && liveShowing ? styles.liveOn : ''}`}>
      {liveBackground && (
        <MediaLiveBackground
          key={liveEffect}
          effect={liveEffect}
          artUrl={artResolved ? artUrl : null}
          playing={playing && !s.playback.stopped}
          preview={preview}
          onShowingChange={setLiveShowing}
        />
      )}
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
                {!barOnTransport && progressBar}
              </div>
            </div>
            {showControls && (
              <div className={styles.transport}>
                {barOnTransport && progressBar}
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
              </div>
            )}
          </div>
          {showVolume && (
            <MediaVolumeSlider
              volume={volume.volume}
              muted={volume.muted}
              // An app strip's name is process-derived; the media source reads better.
              sourceLabel={showSource ? (volume.kind === 'app' ? s.sourceAppName : volume.name) || s.sourceAppName || t('panel.widget.media') : undefined}
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
  sourceLabel?: string;
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
