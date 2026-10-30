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

let panelFpsCapValue: number | null = null;
const panelFpsCapListeners = new Set<() => void>();

/** The device record's frame cap for the page this module runs in; null = the device's own rate. */
export function getPanelFpsCap(): number | null {
  return panelFpsCapValue;
}

/** Called by the panel page with its record's cap; listeners (draw loops, memoised options) pick it up live. */
export function setPanelFpsCap(cap: number | null | undefined): void {
  const next = typeof cap === 'number' && Number.isFinite(cap) && cap >= 1 ? cap : null;
  if (next === panelFpsCapValue) return;
  panelFpsCapValue = next;
  panelFpsCapListeners.forEach(listener => listener());
}

export function subscribePanelFpsCap(listener: () => void): () => void {
  panelFpsCapListeners.add(listener);
  return () => { panelFpsCapListeners.delete(listener); };
}

/** Draw cap for this page: the lower of the stream's rate (`?streamFps=`) and the device record's cap, or null for neither. */
export function pageFrameCap(search: string): number | null {
  const stream = streamFrameCap(search);
  const record = panelFpsCapValue;
  if (stream !== null && record !== null) return Math.min(stream, record);
  return stream ?? record;
}

/**
 * Draw gate that follows a cap which can change while the loop runs: a cap gets the even-grid
 * pacer, none falls back to the panel's refresh divider. Each is rebuilt only when the cap changes.
 */
export function createAdaptivePacer(getCap: () => number | null | undefined, displayHz: number | null | undefined): (ts: number) => boolean {
  const divider = createDisplayDivider(displayHz);
  let capped: ((ts: number) => boolean) | null = null;
  let cappedAt: number | null = null;
  return (ts) => {
    const cap = getCap();
    if (!cap || cap <= 0) {
      capped = null;
      cappedAt = null;
      return divider(ts);
    }
    if (capped === null || cap !== cappedAt) {
      capped = createFramePacer(cap);
      cappedAt = cap;
    }
    return capped(ts);
  };
}

/**
 * Draw gate for a page on a panel slower than the clock rAF follows (a kiosk
 * on its own panel while the host's main display refreshes faster): passes every
 * n-th tick, n being the largest divisor that keeps draws at or above the
 * panel's refresh.
 */
export function createDisplayDivider(displayHz: number | null | undefined): (ts: number) => boolean {
  if (!displayHz || displayHz <= 0) return () => true;
  let lastTs = Number.NaN;
  let avgTickMs = 0;
  let sinceDraw = 0;
  return (ts) => {
    const dt = ts - lastTs;
    lastTs = ts;
    // A stall (hidden page, long task) says nothing about the tick rate.
    if (dt > 0 && dt < 50) avgTickMs = avgTickMs === 0 ? dt : avgTickMs * 0.95 + dt * 0.05;
    const divisor = avgTickMs > 0 ? Math.max(1, Math.floor(1000 / avgTickMs / displayHz + 0.02)) : 1;
    if (++sinceDraw < divisor) return false;
    sinceDraw = 0;
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
