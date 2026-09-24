import { useEffect, useRef, useState } from 'react';

/** ms -> clock-style track time: "m:ss", or "h:mm:ss" past the hour. */
export function formatTrackTime(ms: number): string {
  const total = Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 1000)) : 0;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

// Below this, an incoming position is treated as the same moment the readout
// already shows, so poll jitter cannot step the seconds backward; a seek or
// track change moves further than this and re-anchors.
const RESYNC_MS = 1000;

/**
 * Live playback position between frames. The media topic sends no frame while
 * playback runs at 1x, so this holds the last anchor against the monotonic
 * clock and re-renders once a second while playing, ticking the readout
 * without extra requests. A paused session stops at the position it
 * reached rather than ticking on.
 */
export function useLivePositionMs(positionMs: number, durationMs: number, playing: boolean): number {
  const [liveMs, setLiveMs] = useState(positionMs);
  const shownRef = useRef(positionMs);
  const trackRef = useRef(durationMs);

  useEffect(() => {
    const sameTrack = trackRef.current === durationMs;
    trackRef.current = durationMs;
    // Also applied on the transition to paused: the tick can outrun the poll
    // that reports the pause, and the readout must not visibly rewind.
    const base = sameTrack && Math.abs(positionMs - shownRef.current) < RESYNC_MS
      ? Math.max(positionMs, shownRef.current)
      : positionMs;
    const at = performance.now();
    const apply = (ms: number) => {
      const capped = durationMs > 0 ? Math.min(ms, durationMs) : ms;
      shownRef.current = capped;
      setLiveMs(capped);
    };

    apply(base);
    if (!playing) return;
    const id = setInterval(() => apply(base + (performance.now() - at)), 1000);
    return () => clearInterval(id);
  }, [positionMs, durationMs, playing]);

  return Math.max(0, liveMs);
}
