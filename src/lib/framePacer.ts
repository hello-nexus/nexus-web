/**
 * Draw gate for a requestAnimationFrame loop: passes at most `maxFps` ticks a
 * second on an even grid, re-anchoring instead of bursting after a stall.
 * Without a cap every tick passes.
 */
export function createFramePacer(maxFps: number | null | undefined): (ts: number) => boolean {
  if (!maxFps || maxFps <= 0) return () => true;
  const minFrameMs = 1000 / maxFps;
  let nextMs = Number.NEGATIVE_INFINITY;
  return (ts) => {
    // rAF timestamps jitter around the vsync grid; the tolerance keeps an on-time tick from being skipped.
    if (ts < nextMs - 1) return false;
    nextMs = ts - nextMs > minFrameMs ? ts + minFrameMs : nextMs + minFrameMs;
    return true;
  };
}

/**
 * Draw cap for a page the overlay captures into a streamed panel (`?streamFps=`):
 * rAF follows the host's fastest display, far above what the panel takes, and the
 * capture pump keeps exactly the stream's rate, so drawing more is thrown away.
 */
export function streamFrameCap(search: string): number | null {
  const fps = Number(new URLSearchParams(search).get('streamFps'));
  return Number.isFinite(fps) && fps >= 1 && fps <= 240 ? fps : null;
}

/**
 * Draw gate for a page on a panel slower than the clock rAF follows (a kiosk
 * on its own panel while the host's main display refreshes faster): paces by
 * time at the panel's refresh, taking the tick nearest each slot so no rendered
 * frame is a surplus the panel never shows.
 */
export function createDisplayDivider(displayHz: number | null | undefined): (ts: number) => boolean {
  if (!displayHz || displayHz <= 0) return () => true;
  const periodMs = 1000 / displayHz;
  let lastTs = Number.NaN;
  let avgTickMs = 0;
  let nextMs = Number.NEGATIVE_INFINITY;
  return (ts) => {
    const dt = ts - lastTs;
    lastTs = ts;
    // A stall (hidden page, long task) says nothing about the tick rate.
    if (dt > 0 && dt < 50) avgTickMs = avgTickMs === 0 ? dt : avgTickMs * 0.95 + dt * 0.05;
    // Half a tick of lead takes the nearest tick to the slot instead of the first one after it.
    if (ts < nextMs - avgTickMs / 2) return false;
    nextMs = ts - nextMs > periodMs ? ts + periodMs : nextMs + periodMs;
    return true;
  };
}

/** Refresh rate of the panel a kiosk page is shown on (`?displayHz=`), or null. */
export function panelDisplayHz(search: string): number | null {
  const hz = Number(new URLSearchParams(search).get('displayHz'));
  return Number.isFinite(hz) && hz >= 20 && hz <= 500 ? hz : null;
}

/** The frame-pacing params of a URL query (`?displayHz=`, `?streamFps=`), for a redirect to carry over. */
export function framePacingQuery(search: string): string {
  const from = new URLSearchParams(search);
  const kept = new URLSearchParams();
  for (const key of ['displayHz', 'streamFps']) {
    const value = from.get(key);
    if (value) kept.set(key, value);
  }
  const query = kept.toString();
  return query ? `?${query}` : '';
}
