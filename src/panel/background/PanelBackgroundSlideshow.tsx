import { useCallback, useEffect, useRef, useState } from 'react';
import { useTopicCallback } from '../../hooks/useMultiplexSocket';
import { fetchBackgroundMediaLibrary, type BackgroundMediaItem } from '../../api/panelBackgroundMedia';
import { PanelBackgroundMedia } from './PanelBackgroundMedia';
import { slideshowLap } from './slideshowOrder';
import styles from '../PanelApp.module.scss';

// Ceiling on the incoming layer's transitionend, which never fires when the
// fade is a no-op (background opacity at 0) or the kiosk tab is hidden.
const FADE_CEILING_MS = 1000;
// An incoming slide that neither loads nor errors is skipped so the cycle cannot strand on it.
const LOAD_CEILING_MS = 30_000;
// Grace on top of a paced video's expected run before the slideshow moves on regardless.
const VIDEO_STALL_GRACE_MS = 15_000;

/**
 * Cycles this panel's background-media library. `startId` (the record's
 * selected asset) leads the cycle. Slides crossfade: the next asset mounts
 * above the current one at opacity 0, fades in once decoded, and only then is
 * the previous one dropped. A video slide plays whole (repeating to cover the
 * interval, as the gallery widget does) or is cut at the interval like a still.
 */
export function PanelBackgroundSlideshow({
  deviceId,
  startId,
  intervalSec,
  shuffle,
  finishVideos,
  opacity,
}: {
  deviceId: string;
  startId: string | null;
  intervalSec: number;
  shuffle: boolean;
  finishVideos: boolean;
  opacity: number;
}) {
  const intervalMs = intervalSec * 1000;
  const [items, setItems] = useState<BackgroundMediaItem[]>([]);
  const itemsRef = useRef(items);
  const itemIdsRef = useRef('');
  const shuffleRef = useRef(shuffle);
  // The refs mirror the slide states synchronously: advance() can run from a
  // timer before a pending commit's effects flush.
  const [current, setCurrentState] = useState<BackgroundMediaItem | null>(null);
  const currentRef = useRef(current);
  const setCurrent = useCallback((item: BackgroundMediaItem | null) => {
    currentRef.current = item;
    setCurrentState(item);
  }, []);
  const [incoming, setIncomingState] = useState<BackgroundMediaItem | null>(null);
  const incomingRef = useRef(incoming);
  const setIncoming = useCallback((item: BackgroundMediaItem | null) => {
    incomingRef.current = item;
    setIncomingState(item);
  }, []);
  const [incomingReady, setIncomingReady] = useState(false);
  // Assets the panel could not decode; cleared when the library changes.
  const failedRef = useRef<Set<string>>(new Set());
  const lapRef = useRef<BackgroundMediaItem[]>([]);
  const posRef = useRef(0);
  // The next advance rebuilds the lap from the slide on screen.
  const lapDirtyRef = useRef(true);
  // Clip lengths by asset id, from loadedmetadata on either layer.
  const durationsRef = useRef<Map<string, number>>(new Map());

  const refresh = useCallback(async () => {
    const lib = await fetchBackgroundMediaLibrary(deviceId);
    if (lib?.items) setItems(lib.items);
  }, [deviceId]);
  useEffect(() => { refresh(); }, [refresh]);
  // Every record write broadcasts; an import selects the new asset, so it is one.
  useTopicCallback('panel/device', true, (raw) => {
    const frame = raw as { deviceId?: string } | null;
    if (frame?.deviceId === deviceId) refresh();
  });

  const liveItems = useCallback(
    () => itemsRef.current.filter(item => !failedRef.current.has(item.id)),
    [],
  );

  const stage = useCallback((item: BackgroundMediaItem) => {
    if (!currentRef.current) {
      setCurrent(item);
      return;
    }
    if (item.id === currentRef.current.id || item.id === incomingRef.current?.id) return;
    setIncoming(item);
    setIncomingReady(false);
  }, [setCurrent, setIncoming]);

  const advance = useCallback(() => {
    // A slide already on its way in keeps the cadence; the timer re-arms when it lands.
    if (incomingRef.current) return;
    const live = liveItems();
    const cur = currentRef.current;
    if (live.length === 0) {
      setCurrent(null);
      return;
    }
    let lap = lapRef.current;
    let pos = posRef.current + 1;
    if (lapDirtyRef.current) {
      lap = slideshowLap(live, shuffleRef.current, cur?.id ?? null);
      pos = cur && lap[0]?.id === cur.id ? 1 : 0;
      lapDirtyRef.current = false;
    }
    if (pos >= lap.length) {
      lap = slideshowLap(live, shuffleRef.current, null, cur?.id ?? null);
      pos = 0;
    }
    // A lap of two or more never holds the slide on screen at its head.
    if (cur && lap[pos]?.id === cur.id && lap.length > 1) pos = (pos + 1) % lap.length;
    lapRef.current = lap;
    posRef.current = pos;
    const next = lap[pos];
    if (next) stage(next);
  }, [liveItems, stage, setCurrent]);

  // Library changes: prune stale failures, start the cycle on first arrival,
  // or move on when the slide on screen is gone.
  useEffect(() => {
    itemsRef.current = items;
    const ids = new Set(items.map(item => item.id));
    const idKey = [...ids].sort().join('\n');
    if (idKey === itemIdsRef.current) return;
    itemIdsRef.current = idKey;
    for (const id of failedRef.current) if (!ids.has(id)) failedRef.current.delete(id);
    lapDirtyRef.current = true;
    const cur = currentRef.current;
    if (!cur) {
      const lap = slideshowLap(liveItems(), shuffleRef.current, startId);
      lapRef.current = lap;
      posRef.current = 0;
      lapDirtyRef.current = false;
      if (lap[0]) setCurrent(lap[0]);
      return;
    }
    if (!ids.has(cur.id)) {
      setIncoming(null);
      advance();
    }
  // startId has its own effect below; only a library change (re)starts here.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, liveItems, advance, setCurrent, setIncoming]);

  useEffect(() => {
    shuffleRef.current = shuffle;
    lapDirtyRef.current = true;
  }, [shuffle]);

  // A pick in the editor jumps the cycle to that slide.
  useEffect(() => {
    if (!startId || startId === currentRef.current?.id) return;
    const live = liveItems();
    const picked = live.find(item => item.id === startId);
    if (!picked) return;
    lapRef.current = slideshowLap(live, shuffleRef.current, startId);
    posRef.current = 0;
    lapDirtyRef.current = false;
    if (incomingRef.current?.id !== startId) setIncoming(null);
    stage(picked);
  }, [startId, liveItems, stage, setIncoming]);

  const promote = useCallback(() => {
    const item = incomingRef.current;
    if (!item) return;
    setCurrent(item);
    setIncoming(null);
    setIncomingReady(false);
  }, [setCurrent, setIncoming]);
  useEffect(() => {
    if (!incoming || !incomingReady) return;
    const timer = setTimeout(promote, FADE_CEILING_MS);
    return () => clearTimeout(timer);
  }, [incoming, incomingReady, promote]);

  const failIncoming = useCallback(() => {
    const item = incomingRef.current;
    if (!item) return;
    failedRef.current.add(item.id);
    setIncoming(null);
    setIncomingReady(false);
    lapDirtyRef.current = true;
    advance();
  }, [advance, setIncoming]);
  useEffect(() => {
    if (!incoming || incomingReady) return;
    const timer = setTimeout(failIncoming, LOAD_CEILING_MS);
    return () => clearTimeout(timer);
  }, [incoming, incomingReady, failIncoming]);

  const failCurrent = useCallback(() => {
    const item = currentRef.current;
    if (!item) return;
    failedRef.current.add(item.id);
    lapDirtyRef.current = true;
    advance();
  }, [advance]);

  const liveCount = items.filter(item => !failedRef.current.has(item.id)).length;
  const isVideo = !!current && current.type === 'animated' && !current.alpha;
  // A paced video's own ended handler moves the slideshow on; the tick stays
  // off so a still that follows gets its full interval.
  const videoPaced = isVideo && finishVideos && liveCount > 1;

  useEffect(() => {
    if (!current || videoPaced || liveCount < 2) return;
    const timer = setTimeout(advance, intervalMs);
    return () => clearTimeout(timer);
  }, [current, videoPaced, liveCount, intervalMs, advance]);

  // Whole plays only, counted from the promotion (the clip loops unhandled while fading in).
  const playsRef = useRef(0);
  useEffect(() => {
    playsRef.current = 0;
  }, [current]);
  const ceilingRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const armCeiling = useCallback((durationMs: number) => {
    if (ceilingRef.current) clearTimeout(ceilingRef.current);
    ceilingRef.current = setTimeout(advance, Math.max(durationMs * 2, intervalMs) + VIDEO_STALL_GRACE_MS);
  }, [advance, intervalMs]);
  useEffect(() => {
    if (!videoPaced || !current) return;
    armCeiling(durationsRef.current.get(current.id) ?? 0);
    return () => {
      if (ceilingRef.current) clearTimeout(ceilingRef.current);
    };
  }, [videoPaced, current, armCeiling]);

  const onVideoMetadata = useCallback((id: string, video: HTMLVideoElement) => {
    const durationMs = Number.isFinite(video.duration) && video.duration > 0 ? video.duration * 1000 : 0;
    durationsRef.current.set(id, durationMs);
    if (videoPaced && currentRef.current?.id === id) armCeiling(durationMs);
  }, [videoPaced, armCeiling]);

  const onVideoEnded = useCallback((video: HTMLVideoElement) => {
    playsRef.current += 1;
    // An unknown or zero duration cannot be paced; treat it as done.
    const durationMs = Number.isFinite(video.duration) && video.duration > 0 ? video.duration * 1000 : Infinity;
    if (videoPaced && playsRef.current * durationMs >= intervalMs) advance();
    // Replays either way: the swap waits on the next slide's decode.
    video.currentTime = 0;
    video.play()?.catch(() => {});
    if (videoPaced) armCeiling(durationMs === Infinity ? 0 : durationMs);
  }, [videoPaced, intervalMs, advance, armCeiling]);

  if (!current) return null;
  // The stack carries the background opacity so two overlapping layers never
  // composite denser than one.
  return (
    <div className={styles.backgroundMediaStack} style={{ opacity }} aria-hidden="true">
      <PanelBackgroundMedia
        key={current.id}
        id={current.id}
        deviceId={deviceId}
        type={current.type}
        alpha={current.alpha}
        opacity={1}
        loop={!videoPaced}
        onFailed={failCurrent}
        onVideoMetadata={video => onVideoMetadata(current.id, video)}
        onVideoEnded={onVideoEnded}
      />
      {incoming && (
        <PanelBackgroundMedia
          key={incoming.id}
          id={incoming.id}
          deviceId={deviceId}
          type={incoming.type}
          alpha={incoming.alpha}
          opacity={1}
          ready={incomingReady}
          onLoaded={() => setIncomingReady(true)}
          onFadedIn={promote}
          onFailed={failIncoming}
          onVideoMetadata={video => onVideoMetadata(incoming.id, video)}
        />
      )}
    </div>
  );
}
