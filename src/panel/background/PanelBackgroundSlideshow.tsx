import { useCallback, useEffect, useRef, useState } from 'react';
import { useTopicCallback } from '../../hooks/useMultiplexSocket';
import { fetchBackgroundMediaLibrary, type BackgroundMediaItem } from '../../api/panelBackgroundMedia';
import { PanelBackgroundMedia } from './PanelBackgroundMedia';
import { slideshowLap } from './slideshowOrder';

// The .backgroundMedia fade is 260ms; the outgoing slide stays underneath
// until the incoming one is fully in, so the swap never shows the backdrop.
const CROSSFADE_MS = 320;
// An incoming slide that neither loads nor errors (a dropped connection on the
// kiosk) is skipped so the cycle cannot strand on it.
const LOAD_CEILING_MS = 30_000;
// A paced video that fires neither ended nor error gets this on top of its
// expected run before the slideshow moves on regardless.
const VIDEO_STALL_GRACE_MS = 15_000;

/**
 * Cycles this panel's background-media library. The record's selected asset
 * (`startId`) leads the cycle, so the card highlighted in the editor is the
 * slide it opens on. Slides crossfade: the next asset is mounted underneath at
 * opacity 0, fades in once decoded, and only then is the previous one dropped.
 * A video slide either plays whole (repeating to cover the interval, as the
 * gallery widget does) or is cut at the interval like a still.
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
  const shuffleRef = useRef(shuffle);
  // The refs mirror the two slide states synchronously (not via an effect):
  // advance() can run from a timer before a pending commit's effects flush.
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
  // Assets the panel could not decode (deleted meanwhile, unsupported codec);
  // cleared when the library changes so a re-import gets another try.
  const failedRef = useRef<Set<string>>(new Set());
  const lapRef = useRef<BackgroundMediaItem[]>([]);
  const posRef = useRef(0);
  // Set whenever the lap's inputs move (library, order); the next advance
  // rebuilds from the slide on screen instead of finishing a stale lap.
  const lapDirtyRef = useRef(true);

  const refresh = useCallback(async () => {
    const lib = await fetchBackgroundMediaLibrary(deviceId);
    if (lib?.items) setItems(lib.items);
  }, [deviceId]);
  useEffect(() => { refresh(); }, [refresh]);
  // The service broadcasts on every record write, which covers an import
  // (it selects the new asset) and a delete of the selected one.
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
    if (item.id === currentRef.current.id) return;
    setIncoming(item);
    setIncomingReady(false);
  }, [setCurrent, setIncoming]);

  const advance = useCallback(() => {
    // A slide already on its way in keeps the cadence; the timer re-arms when
    // it lands.
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
  // startId is handled by its own effect below; only a library change
  // (re)starts here.
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
    setIncoming(null);
    stage(picked);
  }, [startId, liveItems, stage, setIncoming]);

  // Promote the incoming slide once its fade-in has run.
  useEffect(() => {
    if (!incoming || !incomingReady) return;
    const timer = setTimeout(() => {
      setCurrent(incoming);
      setIncoming(null);
      setIncomingReady(false);
    }, CROSSFADE_MS);
    return () => clearTimeout(timer);
  }, [incoming, incomingReady, setCurrent, setIncoming]);

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

  // Whole plays only: a 3s clip on a 10s interval runs four times before the
  // switch, a 20s clip on a 5s interval runs once. Plays count from the
  // promotion: while fading in the clip loops on its own with no handler.
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
    if (!videoPaced) return;
    armCeiling(0);
    return () => {
      if (ceilingRef.current) clearTimeout(ceilingRef.current);
    };
  }, [videoPaced, current, armCeiling]);

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
  return (
    <>
      <PanelBackgroundMedia
        key={current.id}
        id={current.id}
        deviceId={deviceId}
        type={current.type}
        alpha={current.alpha}
        opacity={opacity}
        loop={!videoPaced}
        onFailed={failCurrent}
        onVideoEnded={onVideoEnded}
      />
      {incoming && (
        <PanelBackgroundMedia
          key={incoming.id}
          id={incoming.id}
          deviceId={deviceId}
          type={incoming.type}
          alpha={incoming.alpha}
          opacity={opacity}
          ready={incomingReady}
          onLoaded={() => setIncomingReady(true)}
          onFailed={failIncoming}
        />
      )}
    </>
  );
}
