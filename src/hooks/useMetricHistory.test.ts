import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMetricHistory } from './useMetricHistory';
import type { MetricHistoryQuery, MetricHistoryResponse } from '../api/monitoringHistory';

const fetchMock = vi.fn<(query: MetricHistoryQuery) => Promise<{ data: MetricHistoryResponse | null; mocked: boolean; unsupported: boolean }>>();
vi.mock('../api/monitoringHistory', () => ({
  fetchMonitoringHistory: (query: MetricHistoryQuery) => fetchMock(query),
}));

// Mirrors useStreamDecks.test.ts's capture idiom: the hook subscribes to
// exactly one topic ('monitoring/history-tail'), so a single captured
// callback stands in for the real ref-counted subscription. mockConnected
// backs useMultiplex()?.connected for the reconnect-gap-fill tests.
let capturedTailPush: ((data: unknown) => void) | null = null;
let mockConnected = true;
vi.mock('./useMultiplexSocket', () => ({
  useTopicCallback: (_topic: string, enabled: boolean, cb: (data: unknown) => void) => {
    capturedTailPush = enabled ? cb : null;
  },
  useMultiplex: () => ({ connected: mockConnected }),
}));

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = new Date('2026-07-16T12:00:00Z').getTime();

function resp(seriesId: string, points: { t: number; avg: number; max: number }[]): MetricHistoryResponse {
  return { supported: true, retentionDays: 7, stepSeconds: 1, series: [{ id: seriesId, kind: 'cpu', name: 'CPU', points }] };
}

function emptyResp(): MetricHistoryResponse {
  return { supported: true, retentionDays: 7, stepSeconds: 1, series: [] };
}

// Drain the microtask queue inside act so resolved fetch chains land.
const flush = () => act(async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
});

async function advance(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
  await flush();
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>(res => { resolve = res; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ data: emptyResp(), mocked: false, unsupported: false });
  capturedTailPush = null;
  mockConnected = true;
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('useMetricHistory', () => {
  it('fetches the 30m strip silhouette and the 5m box (a sixth) on mount (default preset)', async () => {
    renderHook(() => useMetricHistory(true, 'cpu'));
    await advance(0);

    // Silhouette (maxPoints=400) covers the full 30m strip.
    expect(fetchMock).toHaveBeenCalledWith(expect.objectContaining({ from: NOW - 30 * MINUTE, to: NOW, series: 'cpu', maxPoints: 400 }));
    // Viewport (maxPoints=800) covers only the box: the last 5m (a sixth).
    expect(fetchMock).toHaveBeenCalledWith(expect.objectContaining({ from: NOW - 5 * MINUTE, to: NOW, series: 'cpu', maxPoints: 800 }));
  });

  describe('wheel zoom (a synthetic brush resize about the cursor time)', () => {
    it('narrows the window about the anchor as a drag, then settles into one fine fetch of the zoomed window', async () => {
      const { result } = renderHook(() => useMetricHistory(true, 'cpu'));
      await advance(0);
      fetchMock.mockClear();
      const [from0, to0] = result.current.domain;
      const anchor = (from0 + to0) / 2;

      let changed = false;
      act(() => { changed = result.current.onChartWheelZoom(anchor, 0.5); });

      expect(changed).toBe(true);
      const [from1, to1] = result.current.domain;
      expect(to1 - from1).toBeCloseTo((to0 - from0) / 2, -2);
      expect((anchor - from1) / (to1 - from1)).toBeCloseTo(0.5, 3);
      expect(result.current.dragging).toBe(true);
      expect(result.current.following).toBe(false);
      // Mid-gesture: no settled viewport fetch yet (only the 180ms paused-drag
      // refetch could fire, and not this soon).
      await advance(100);
      expect(fetchMock.mock.calls.some(([q]) => q.maxPoints === 800)).toBe(false);

      await advance(300);
      expect(result.current.dragging).toBe(false);
      expect(fetchMock.mock.calls.some(([q]) => q.maxPoints === 800 && q.from === from1 && q.to === to1)).toBe(true);
    });

    it('compounds notches that land inside the settle window and settles once', async () => {
      const { result } = renderHook(() => useMetricHistory(true, 'cpu'));
      await advance(0);
      fetchMock.mockClear();
      const [from0, to0] = result.current.domain;
      const anchor = (from0 + to0) / 2;

      // 0.75 three times over the 5-minute default box stays above the
      // 1-minute MIN_BOX_WINDOW_MS floor, so the product is observable.
      act(() => { result.current.onChartWheelZoom(anchor, 0.75); });
      await advance(50);
      act(() => { result.current.onChartWheelZoom(anchor, 0.75); });
      await advance(50);
      act(() => { result.current.onChartWheelZoom(anchor, 0.75); });

      const [from1, to1] = result.current.domain;
      expect(to1 - from1).toBeCloseTo((to0 - from0) * 0.75 ** 3, -2);
      expect(result.current.dragging).toBe(true);

      await advance(400);
      expect(result.current.dragging).toBe(false);
      const settled = fetchMock.mock.calls.filter(([q]) => q.maxPoints === 800 && q.from === from1 && q.to === to1);
      expect(settled.length).toBeGreaterThanOrEqual(1);
      expect(settled.length).toBeLessThanOrEqual(2);
    });

    it('widens no further than the strip and never re-anchors a detached strip to now', async () => {
      const { result } = renderHook(() => useMetricHistory(true, 'cpu'));
      await advance(0);
      // A chart drag-select in the past re-derives a strip whose own right
      // edge sits behind now, so filling it is not the live edge.
      act(() => { result.current.onChartDragSelect(NOW - 20 * MINUTE, NOW - 15 * MINUTE); });
      await advance(0);
      const [stripFrom, stripTo] = result.current.stripDomain;
      expect(stripTo).toBeLessThan(NOW);
      expect(result.current.following).toBe(false);

      act(() => { result.current.onChartWheelZoom(NOW - 17 * MINUTE, 1000); });
      await advance(400);

      expect(result.current.domain).toEqual([stripFrom, stripTo]);
      expect(result.current.stripDomain).toEqual([stripFrom, stripTo]);
      expect(result.current.following).toBe(false);

      // Already filling the strip: a further zoom-out changes nothing and
      // says so, so the chart lets the wheel through to the page.
      let changed = true;
      act(() => { changed = result.current.onChartWheelZoom(NOW - 17 * MINUTE, 2); });
      expect(changed).toBe(false);
    });

    it('ignores notches while a real brush drag is held, without disturbing that drag', async () => {
      const { result } = renderHook(() => useMetricHistory(true, 'cpu'));
      await advance(0);
      act(() => { result.current.onBrushChange(NOW - 10 * MINUTE, NOW - 5 * MINUTE, 'drag'); });
      const held = result.current.domain;

      let changed = true;
      act(() => { changed = result.current.onChartWheelZoom(NOW - 7 * MINUTE, 0.5); });
      await advance(400);

      expect(changed).toBe(false);
      expect(result.current.domain).toEqual(held);
      expect(result.current.dragging).toBe(true);
    });
  });

  describe('during-drag debounced fine refetch (upgrades the pan to real data without waiting for release)', () => {
    it('does not fire while a continuous stream of drag events keeps arriving faster than the debounce', async () => {
      const { result } = renderHook(() => useMetricHistory(true, 'cpu'));
      await advance(0);
      fetchMock.mockClear();

      // A 'drag' event every 100ms - under DRAG_FINE_REFRESH_MS (180ms) -
      // resets the debounce every time, so it never actually fires despite
      // a full second of continuous scrubbing.
      for (let i = 0; i < 10; i++) {
        act(() => { result.current.onBrushChange(NOW - 5 * HOUR, NOW - 4 * HOUR, 'drag'); });
        await advance(100);
      }

      expect(fetchMock.mock.calls.some(([q]) => q.maxPoints === 800)).toBe(false);
    });

    it('fires exactly one fetch for the current window after a drag pause, upgrading the pan to real data in place', async () => {
      fetchMock.mockImplementation(async q => (
        q.maxPoints === 400
          ? { data: resp('cpu', [{ t: NOW - 25 * MINUTE, avg: 999, max: 999 }]), mocked: false, unsupported: false }
          : { data: emptyResp(), mocked: false, unsupported: false }
      ));
      const { result } = renderHook(() => useMetricHistory(true, 'cpu'));
      await advance(0);

      const from = NOW - 26 * MINUTE;
      const to = NOW - 24 * MINUTE;
      // The fine snapshot has no coverage this far back (mount's own fine
      // fetch only covered the default 5m box), so the drag starts on the
      // coarse silhouette fallback.
      act(() => { result.current.onBrushChange(from, to, 'drag'); });
      expect(result.current.series.find(s => s.id === 'cpu')?.points).toEqual([{ t: NOW - 25 * MINUTE, avg: 999, max: 999 }]);

      fetchMock.mockClear();
      fetchMock.mockResolvedValue({
        data: resp('cpu', [
          { t: from, avg: 1, max: 1 },
          { t: to, avg: 2, max: 2 },
        ]),
        mocked: false, unsupported: false,
      });

      await advance(180);

      const fineCalls = fetchMock.mock.calls.filter(([q]) => q.maxPoints === 800);
      expect(fineCalls.length).toBe(1);
      expect(fineCalls[0][0]).toEqual({ from, to, maxPoints: 800, series: 'cpu' });
      // Upgraded from the coarse silhouette fallback to the freshly fetched
      // fine data, in place - no further drag event needed.
      expect(result.current.series.find(s => s.id === 'cpu')?.points).toEqual([
        { t: from, avg: 1, max: 1 },
        { t: to, avg: 2, max: 2 },
      ]);
    });

    it('drops a stale during-drag response whose window has since been superseded by a newer during-drag fetch', async () => {
      const { result } = renderHook(() => useMetricHistory(true, 'cpu'));
      await advance(0);

      const staleFrom = NOW - 10 * HOUR;
      const staleTo = NOW - 9 * HOUR;
      const first = deferred<{ data: MetricHistoryResponse | null; mocked: boolean; unsupported: boolean }>();
      fetchMock.mockClear();
      fetchMock.mockImplementationOnce(() => first.promise);

      act(() => { result.current.onBrushChange(staleFrom, staleTo, 'drag'); });
      await advance(180); // fires the (still-pending) first debounced fetch

      const freshFrom = NOW - 8 * HOUR;
      const freshTo = NOW - 7 * HOUR;
      fetchMock.mockResolvedValue({
        data: resp('cpu', [
          { t: freshFrom, avg: 42, max: 42 },
          { t: freshTo, avg: 43, max: 43 },
        ]),
        mocked: false, unsupported: false,
      });
      act(() => { result.current.onBrushChange(freshFrom, freshTo, 'drag'); });
      await advance(180); // fires and resolves the second debounced fetch

      expect(result.current.series.find(s => s.id === 'cpu')?.points).toEqual([
        { t: freshFrom, avg: 42, max: 42 },
        { t: freshTo, avg: 43, max: 43 },
      ]);

      // The stale first request finally resolves for a window the user has
      // long since moved away from - must not clobber the already-current
      // (fresher) render.
      await act(async () => {
        first.resolve({ data: resp('cpu', [{ t: staleFrom, avg: 1, max: 1 }]), mocked: false, unsupported: false });
        await Promise.resolve();
      });

      expect(result.current.series.find(s => s.id === 'cpu')?.points).toEqual([
        { t: freshFrom, avg: 42, max: 42 },
        { t: freshTo, avg: 43, max: 43 },
      ]);
    });

    it('serves the released window instantly from cache when the during-drag debounce already fetched it, with no need for the release fetch to resolve', async () => {
      const { result } = renderHook(() => useMetricHistory(true, 'cpu'));
      await advance(0);

      const from = NOW - 5 * HOUR;
      const to = NOW - 4 * HOUR;
      fetchMock.mockResolvedValue({
        data: resp('cpu', [
          { t: from, avg: 7, max: 7 },
          { t: to, avg: 8, max: 8 },
        ]),
        mocked: false, unsupported: false,
      });

      act(() => { result.current.onBrushChange(from, to, 'drag'); });
      await advance(180); // the debounced fetch resolves and caches this window

      // A never-resolving mock proves the released render did not need to
      // wait on a new network round trip.
      fetchMock.mockImplementation(() => new Promise(() => {}));
      act(() => { result.current.onBrushChange(from, to, 'end'); });
      await advance(0);

      expect(result.current.series.find(s => s.id === 'cpu')?.points).toEqual([
        { t: from, avg: 7, max: 7 },
        { t: to, avg: 8, max: 8 },
      ]);
    });

    it('stays silent on a failed during-drag fetch - it does not set the hook error state or disturb the pan', async () => {
      const { result } = renderHook(() => useMetricHistory(true, 'cpu'));
      await advance(0);

      fetchMock.mockClear();
      fetchMock.mockImplementation(async q => (
        q.maxPoints === 800 ? { data: null, mocked: false, unsupported: false } : { data: emptyResp(), mocked: false, unsupported: false }
      ));

      act(() => { result.current.onBrushChange(NOW - 5 * HOUR, NOW - 4 * HOUR, 'drag'); });
      await advance(180);

      expect(result.current.error).toBe(false);
      expect(result.current.dragging).toBe(true);
    });
  });

  it('exposes dragging=true only between a drag event and its matching end', async () => {
    const { result } = renderHook(() => useMetricHistory(true, 'cpu'));
    await advance(0);
    expect(result.current.dragging).toBe(false);

    act(() => { result.current.onBrushChange(NOW - 5 * HOUR, NOW - 4 * HOUR, 'drag'); });
    expect(result.current.dragging).toBe(true);

    act(() => { result.current.onBrushChange(NOW - 5 * HOUR, NOW - 4 * HOUR, 'end'); });
    await advance(0);
    expect(result.current.dragging).toBe(false);
  });

  it('clears the drag gate when a background fetch flips supported mid-drag, since TimelineBrush unmounts (a bare null render, with no retry affordance) without ever emitting its own matching \'end\' event', async () => {
    const { result } = renderHook(() => useMetricHistory(true, 'cpu'));
    await advance(0);

    // Drag to the live edge so `following` stays true - the strip
    // silhouette keeps refreshing on its own 60s timer regardless of the
    // drag phase (unlike the fine viewport fetch, which is drag-gated).
    act(() => { result.current.onBrushChange(NOW - 5 * MINUTE, NOW, 'drag'); });
    expect(result.current.dragging).toBe(true);

    // That refresh comes back unsupported - MetricHistorySection renders
    // nothing at all for this case, tearing TimelineBrush down mid-drag
    // with no 'end' event ever fired.
    fetchMock.mockImplementation(async (q: MetricHistoryQuery) => (
      q.maxPoints === 400
        ? { data: null, mocked: false, unsupported: true }
        : { data: emptyResp(), mocked: false, unsupported: false }
    ));
    await advance(60_000);
    expect(result.current.supported).toBe(false);

    // The drag gate must not be left stranded - dragging clears even though
    // no matching 'end' event, and no retry(), has happened yet.
    expect(result.current.dragging).toBe(false);

    // Recovery (retry(), the only path back once supported is false) then
    // proves the gate isn't ALSO still independently stuck on 'drag'
    // underneath - the redecimate timer's own fetch for the still-current
    // window fires, matched exactly (not just by maxPoints) since the
    // unrelated idle-prefetch timer also produces its own 800pt call for a
    // neighboring window in this same span.
    fetchMock.mockResolvedValue({ data: emptyResp(), mocked: false, unsupported: false });
    act(() => { result.current.retry(); });
    await advance(0);
    fetchMock.mockClear();

    // The redecimate interval bumps fetchEpoch, whose effect schedules its
    // own zero-delay timer for the actual fetch - give it one more tick.
    await advance(60_000);
    await advance(0);
    expect(fetchMock).toHaveBeenCalledWith({ from: NOW - 5 * MINUTE, to: NOW, maxPoints: 800, series: 'cpu' });
  });

  it('clears the drag gate when a background fetch flips error mid-drag, since TimelineBrush unmounts (its EmptyState branch) without ever emitting its own matching \'end\' event', async () => {
    const { result } = renderHook(() => useMetricHistory(true, 'cpu'));
    await advance(0);

    act(() => { result.current.onBrushChange(NOW - 5 * MINUTE, NOW, 'drag'); });
    expect(result.current.dragging).toBe(true);

    // That refresh fails outright (not merely unsupported) - MetricHistorySection
    // swaps to its <EmptyState> branch, tearing TimelineBrush down mid-drag
    // with no 'end' event ever fired.
    fetchMock.mockImplementation(async (q: MetricHistoryQuery) => (
      q.maxPoints === 400
        ? { data: null, mocked: false, unsupported: false }
        : { data: emptyResp(), mocked: false, unsupported: false }
    ));
    await advance(60_000);
    expect(result.current.error).toBe(true);

    // The drag gate must not be left stranded - dragging clears even though
    // no matching 'end' event, and no retry(), has happened yet.
    expect(result.current.dragging).toBe(false);
  });

  it('cancels a pending during-drag debounce when a background fetch flips supported mid-drag, so it never fires afterward', async () => {
    const silhouetteDeferred = deferred<{ data: MetricHistoryResponse | null; mocked: boolean; unsupported: boolean }>();
    fetchMock.mockImplementation(async q => (
      q.maxPoints === 400 ? silhouetteDeferred.promise : { data: emptyResp(), mocked: false, unsupported: false }
    ));
    const { result } = renderHook(() => useMetricHistory(true, 'cpu'));
    await advance(0);
    // The mount silhouette fetch is still pending - supported hasn't
    // flipped yet.
    expect(result.current.supported).toBe(true);

    const dragWindow = { from: NOW - 5 * HOUR, to: NOW - 4 * HOUR, maxPoints: 800, series: 'cpu' };
    act(() => { result.current.onBrushChange(dragWindow.from, dragWindow.to, 'drag'); });
    expect(result.current.dragging).toBe(true);
    fetchMock.mockClear();

    // Resolves unsupported well before the debounce (180ms) would fire - the
    // pending timer must be cancelled outright, not left to fire into an
    // already-torn-down drag.
    await act(async () => {
      silhouetteDeferred.resolve({ data: null, mocked: false, unsupported: true });
      await Promise.resolve();
    });
    expect(result.current.supported).toBe(false);
    expect(result.current.dragging).toBe(false);

    await advance(1_000); // comfortably past DRAG_FINE_REFRESH_MS
    expect(fetchMock.mock.calls.some(([q]) => q.from === dragWindow.from && q.to === dragWindow.to && q.maxPoints === 800)).toBe(false);
  });

  describe('drag-time live rendering (item 29): pan/clip the frozen fine snapshot', () => {
    it('never renders an empty series across a simulated drag sequence within the frozen snapshot\'s own coverage, with zero fetches', async () => {
      fetchMock.mockResolvedValue({
        data: resp('cpu', [
          { t: NOW - 5 * MINUTE, avg: 10, max: 10 },
          { t: NOW - 4 * MINUTE, avg: 12, max: 12 },
          { t: NOW - 3 * MINUTE, avg: 14, max: 14 },
          { t: NOW - 2 * MINUTE, avg: 16, max: 16 },
          { t: NOW - MINUTE, avg: 18, max: 18 },
          { t: NOW, avg: 20, max: 20 },
        ]),
        mocked: false, unsupported: false,
      });
      const { result } = renderHook(() => useMetricHistory(true, 'cpu'));
      await advance(0);
      fetchMock.mockClear();
      fetchMock.mockImplementation(() => new Promise(() => {})); // never resolves - proves the render is not fetch-driven

      const dragSteps: Array<[number, number]> = [
        [NOW - 5 * MINUTE, NOW - 4 * MINUTE],
        [NOW - 4 * MINUTE, NOW - 3 * MINUTE],
        [NOW - 3 * MINUTE, NOW - 2 * MINUTE],
      ];
      for (const [from, to] of dragSteps) {
        act(() => { result.current.onBrushChange(from, to, 'drag'); });
        expect(result.current.series.find(s => s.id === 'cpu')?.points.length ?? 0).toBeGreaterThan(0);
      }
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('pans/clips the frozen FINE viewport fetch, not the coarser silhouette, with no fetch required', async () => {
      // Distinguishes the two sources: the silhouette (maxPoints=400) carries
      // a sentinel value the fine box fetch (maxPoints=800) never does.
      fetchMock.mockImplementation(async q => {
        if (q.maxPoints === 400) {
          return { data: resp('cpu', [{ t: NOW - 25 * MINUTE, avg: 999, max: 999 }]), mocked: false, unsupported: false };
        }
        return {
          data: resp('cpu', [
            { t: NOW - 4 * MINUTE, avg: 50, max: 50 },
            { t: NOW - 2 * MINUTE, avg: 60, max: 60 },
          ]),
          mocked: false, unsupported: false,
        };
      });
      const { result } = renderHook(() => useMetricHistory(true, 'cpu'));
      await advance(0);

      fetchMock.mockImplementation(() => new Promise(() => {})); // never resolves - proves the render is not fetch-driven
      act(() => { result.current.onBrushChange(NOW - 4 * MINUTE, NOW - 2 * MINUTE, 'drag'); });

      const points = result.current.series.find(s => s.id === 'cpu')?.points;
      expect(points).toEqual([
        { t: NOW - 4 * MINUTE, avg: 50, max: 50 },
        { t: NOW - 2 * MINUTE, avg: 60, max: 60 },
      ]);
      expect(points?.some(p => p.avg === 999)).toBe(false);
    });

    it('falls back to the silhouette slice when the frozen fine snapshot has no coverage for the dragged-to window', async () => {
      fetchMock.mockImplementation(async q => {
        if (q.maxPoints === 400) {
          return {
            data: resp('cpu', [
              { t: NOW - 25 * MINUTE, avg: 20, max: 20 },
              { t: NOW - 15 * MINUTE, avg: 30, max: 30 },
            ]),
            mocked: false, unsupported: false,
          };
        }
        return { data: resp('cpu', [{ t: NOW - 4 * MINUTE, avg: 50, max: 50 }]), mocked: false, unsupported: false };
      });
      const { result } = renderHook(() => useMetricHistory(true, 'cpu'));
      await advance(0);

      fetchMock.mockImplementation(() => new Promise(() => {}));
      // Dragged far outside the fine snapshot's own [NOW-5m, NOW] extent,
      // into a region only the silhouette (spanning the whole 30m strip)
      // has any data for.
      act(() => { result.current.onBrushChange(NOW - 26 * MINUTE, NOW - 24 * MINUTE, 'drag'); });

      expect(result.current.series.find(s => s.id === 'cpu')?.points).toEqual([
        { t: NOW - 25 * MINUTE, avg: 20, max: 20 },
      ]);
    });

    it('falls back to the silhouette slice when the pan covers only a thin sliver of the frozen snapshot\'s own edge (the near-empty-spike regression)', async () => {
      fetchMock.mockImplementation(async q => {
        if (q.maxPoints === 400) {
          return { data: resp('cpu', [{ t: NOW + 2 * MINUTE, avg: 999, max: 999 }]), mocked: false, unsupported: false };
        }
        // Fine snapshot: 1-minute-spaced points across [NOW-5m, NOW].
        return {
          data: resp('cpu', [
            { t: NOW - 5 * MINUTE, avg: 10, max: 10 },
            { t: NOW - 4 * MINUTE, avg: 20, max: 20 },
            { t: NOW - 3 * MINUTE, avg: 30, max: 30 },
            { t: NOW - 2 * MINUTE, avg: 40, max: 40 },
            { t: NOW - MINUTE, avg: 50, max: 50 },
            { t: NOW, avg: 60, max: 60 },
          ]),
          mocked: false, unsupported: false,
        };
      });
      const { result } = renderHook(() => useMetricHistory(true, 'cpu'));
      await advance(0);

      fetchMock.mockImplementation(() => new Promise(() => {}));
      // A 5-minute-wide pan that only overlaps the snapshot's own last 30s
      // (a single point, t=NOW) - a real render here would be a lone spike,
      // not a readable pan.
      act(() => { result.current.onBrushChange(NOW - 0.5 * MINUTE, NOW + 4.5 * MINUTE, 'drag'); });

      expect(result.current.series.find(s => s.id === 'cpu')?.points).toEqual([
        { t: NOW + 2 * MINUTE, avg: 999, max: 999 },
      ]);
    });

    it('still uses the real fine data for a pan covering a healthy majority of the window, even short of full coverage', async () => {
      fetchMock.mockImplementation(async q => {
        if (q.maxPoints === 400) {
          return { data: resp('cpu', [{ t: NOW - 3 * MINUTE, avg: 999, max: 999 }]), mocked: false, unsupported: false };
        }
        return {
          data: resp('cpu', [
            { t: NOW - 5 * MINUTE, avg: 10, max: 10 },
            { t: NOW - 4 * MINUTE, avg: 20, max: 20 },
            { t: NOW - 3 * MINUTE, avg: 30, max: 30 },
            { t: NOW - 2 * MINUTE, avg: 40, max: 40 },
            { t: NOW - MINUTE, avg: 50, max: 50 },
            { t: NOW, avg: 60, max: 60 },
          ]),
          mocked: false, unsupported: false,
        };
      });
      const { result } = renderHook(() => useMetricHistory(true, 'cpu'));
      await advance(0);

      fetchMock.mockImplementation(() => new Promise(() => {}));
      // A 5-minute-wide pan overlapping the snapshot's last 4.5 minutes -
      // short of full coverage, but well past the fallback threshold.
      act(() => { result.current.onBrushChange(NOW - 4.5 * MINUTE, NOW + 0.5 * MINUTE, 'drag'); });

      const points = result.current.series.find(s => s.id === 'cpu')?.points;
      expect(points?.some(p => p.avg === 999)).toBe(false);
      expect(points).toEqual([
        { t: NOW - 4 * MINUTE, avg: 20, max: 20 },
        { t: NOW - 3 * MINUTE, avg: 30, max: 30 },
        { t: NOW - 2 * MINUTE, avg: 40, max: 40 },
        { t: NOW - MINUTE, avg: 50, max: 50 },
        { t: NOW, avg: 60, max: 60 },
      ]);
    });

    it('issues no network request at all during a rapid multi-tick drag (no per-tick coarse fetch)', async () => {
      const { result } = renderHook(() => useMetricHistory(true, 'cpu'));
      await advance(0);
      fetchMock.mockClear();

      act(() => { result.current.onBrushChange(NOW - 20 * MINUTE, NOW - 15 * MINUTE, 'drag'); });
      act(() => { result.current.onBrushChange(NOW - 18 * MINUTE, NOW - 13 * MINUTE, 'drag'); });
      act(() => { result.current.onBrushChange(NOW - 16 * MINUTE, NOW - 11 * MINUTE, 'drag'); });
      await advance(0);

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('a live-tail push while following updates the frozen snapshot but does not disturb the visible drag-pan mid-gesture', async () => {
      fetchMock.mockResolvedValue({
        data: resp('cpu', [
          { t: NOW - 5 * MINUTE, avg: 10, max: 10 },
          { t: NOW, avg: 20, max: 20 },
        ]),
        mocked: false, unsupported: false,
      });
      const { result } = renderHook(() => useMetricHistory(true, 'cpu'));
      await advance(0);

      act(() => { result.current.onBrushChange(NOW - 5 * MINUTE, NOW, 'drag'); });
      const beforeTail = result.current.series.find(s => s.id === 'cpu')?.points;

      act(() => { capturedTailPush?.(resp('cpu', [{ t: NOW + 1000, avg: 99, max: 99 }])); });

      expect(result.current.series.find(s => s.id === 'cpu')?.points).toEqual(beforeTail);
    });
  });

  it('fetches immediately (no debounce) when the brush change phase is end', async () => {
    const { result } = renderHook(() => useMetricHistory(true, 'cpu'));
    await advance(0);
    fetchMock.mockClear();

    act(() => { result.current.onBrushChange(NOW - 5 * HOUR, NOW - 4 * HOUR, 'end'); });
    await advance(0);

    expect(fetchMock).toHaveBeenCalledWith({ from: NOW - 5 * HOUR, to: NOW - 4 * HOUR, maxPoints: 800, series: 'cpu' });
  });

  it('brushChange moves only the box - the strip (and its silhouette fetch) is untouched', async () => {
    const { result } = renderHook(() => useMetricHistory(true, 'cpu'));
    await advance(0);
    fetchMock.mockClear();

    act(() => { result.current.onBrushChange(NOW - 4 * MINUTE, NOW - MINUTE, 'end'); });
    await advance(0);

    expect(result.current.stripDomain).toEqual([NOW - 30 * MINUTE, NOW]);
    expect(result.current.domain).toEqual([NOW - 4 * MINUTE, NOW - MINUTE]);
    // Only the box's own maxPoints=800 fetch fired - no maxPoints=400 (silhouette) call.
    expect(fetchMock.mock.calls.every(([q]) => q.maxPoints !== 400)).toBe(true);
  });

  it('drops a stale viewport response that resolves after a newer request already landed', async () => {
    const first = deferred<{ data: MetricHistoryResponse | null; mocked: boolean; unsupported: boolean }>();
    fetchMock.mockReturnValueOnce(first.promise);
    fetchMock.mockResolvedValue({ data: emptyResp(), mocked: false, unsupported: false });

    const { result } = renderHook(() => useMetricHistory(true, 'cpu'));

    // A second setRange fires before the first (mount) viewport fetch resolves.
    act(() => { result.current.setRange('3h'); });
    await advance(0);
    await act(async () => {
      first.resolve({ data: resp('cpu', [{ t: NOW, avg: 99, max: 99 }]), mocked: false, unsupported: false });
      await Promise.resolve();
    });

    expect(result.current.series).toEqual([]);
  });

  it('setRange sizes the strip to the preset and the box to a sixth of it, right-edge anchored', async () => {
    const { result } = renderHook(() => useMetricHistory(true, 'cpu'));
    await advance(0);

    expect(result.current.following).toBe(true);

    act(() => { result.current.onBrushChange(NOW - 5 * HOUR, NOW - 2 * HOUR, 'end'); });
    await advance(0);
    expect(result.current.following).toBe(false);

    act(() => { result.current.setRange('3h'); });
    await advance(0);
    expect(result.current.following).toBe(true);
    expect(result.current.stripDomain).toEqual([NOW - 3 * HOUR, NOW]);
    expect(result.current.domain).toEqual([NOW - 30 * MINUTE, NOW]);
    expect(result.current.rangeKey).toBe('3h');
    expect(result.current.lastPresetKey).toBe('3h');
  });

  it('onChartDragSelect sets the box to the exact selection, goes custom, and re-derives the strip', async () => {
    const { result } = renderHook(() => useMetricHistory(true, 'cpu'));
    await advance(0);
    act(() => { result.current.setRange('3h'); });
    await advance(0);

    const selFrom = NOW - 90 * MINUTE;
    const selTo = NOW - 60 * MINUTE;
    act(() => { result.current.onChartDragSelect(selFrom, selTo); });
    await advance(0);

    expect(result.current.domain).toEqual([selFrom, selTo]);
    expect(result.current.rangeKey).toBe('custom');
    expect(result.current.lastPresetKey).toBe('3h');
    expect(result.current.following).toBe(false);
    const [stripFrom, stripTo] = result.current.stripDomain;
    expect(stripTo - stripFrom).toBe(3 * HOUR);
  });

  it('detach sets following to false without touching the box or strip, unlike onChartDragSelect', async () => {
    const { result } = renderHook(() => useMetricHistory(true, 'cpu'));
    await advance(0);
    act(() => { result.current.setRange('3h'); });
    await advance(0);

    const domainBefore = result.current.domain;
    const stripBefore = result.current.stripDomain;
    expect(result.current.following).toBe(true);

    act(() => { result.current.detach(); });
    await advance(0);

    expect(result.current.following).toBe(false);
    expect(result.current.domain).toEqual(domainBefore);
    expect(result.current.stripDomain).toEqual(stripBefore);
    expect(result.current.rangeKey).toBe('3h');
  });

  it('detach clears the pending during-drag fine-fetch debounce, matching every other force-end path', async () => {
    const { result } = renderHook(() => useMetricHistory(true, 'cpu'));
    await advance(0);
    fetchMock.mockClear();

    act(() => { result.current.onBrushChange(NOW - 5 * HOUR, NOW - 4 * HOUR, 'drag'); });
    act(() => { result.current.detach(); });

    await advance(180);
    expect(fetchMock.mock.calls.some(([q]) => q.maxPoints === 800)).toBe(false);
  });

  it('backToLive re-anchors box and strip to now, keeping their widths and rangeKey', async () => {
    const { result } = renderHook(() => useMetricHistory(true, 'cpu'));
    await advance(0);
    act(() => { result.current.setRange('3h'); });
    await advance(0);

    act(() => { result.current.onBrushChange(NOW - 4 * HOUR, NOW - 3 * HOUR, 'end'); });
    await advance(0);
    expect(result.current.following).toBe(false);

    act(() => { result.current.backToLive(); });
    await advance(0);

    expect(result.current.following).toBe(true);
    expect(result.current.domain).toEqual([NOW - HOUR, NOW]);
    expect(result.current.stripDomain).toEqual([NOW - 3 * HOUR, NOW]);
    expect(result.current.rangeKey).toBe('3h');
  });

  it('tail push merges and bumps the domain with zero history fetches after bootstrap', async () => {
    fetchMock.mockResolvedValue({ data: emptyResp(), mocked: false, unsupported: false });
    const { result } = renderHook(() => useMetricHistory(true, 'cpu'));
    await advance(0);
    fetchMock.mockClear();

    act(() => { capturedTailPush?.(resp('cpu', [{ t: NOW + 1000, avg: 10, max: 12 }])); });

    const cpu = result.current.series.find(s => s.id === 'cpu');
    expect(cpu?.points).toEqual([{ t: NOW + 1000, avg: 10, max: 12 }]);
    expect(result.current.domain[1]).toBe(NOW + 1000);
    // The strip slides in lockstep with the box while following.
    expect(result.current.stripDomain[1]).toBe(NOW + 1000);
    // lastLoadedT was still null after the (empty) bootstrap fetch, so this
    // push's own t isn't flagged as a gap - no follow-up fetch.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reconnect triggers exactly one gap fetch', async () => {
    const { rerender } = renderHook(() => useMetricHistory(true, 'cpu'));
    await advance(0);
    fetchMock.mockClear();

    mockConnected = false;
    rerender();
    mockConnected = true;
    rerender();
    await advance(0);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(expect.objectContaining({ maxPoints: 50, series: 'cpu' }));
  });

  it('a gap-triggering push anchors the backfill fetch at the actual hole, not past it', async () => {
    fetchMock.mockResolvedValue({ data: emptyResp(), mocked: false, unsupported: false });
    renderHook(() => useMetricHistory(true, 'cpu'));
    await advance(0);

    // Establishes a known lastLoadedT via a clean, non-gapped push.
    act(() => { capturedTailPush?.(resp('cpu', [{ t: NOW + 1000, avg: 1, max: 1 }])); });
    fetchMock.mockClear();

    // Skips two ticks (NOW+2000, NOW+3000 never arrived) - only the newest
    // point is in this frame.
    act(() => { capturedTailPush?.(resp('cpu', [{ t: NOW + 4000, avg: 4, max: 4 }])); });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [[query]] = fetchMock.mock.calls;
    // The hole is [NOW+1001, NOW+3999] - anchoring `from` off the pushed
    // frame's own t (instead of the pre-push lastLoadedT) would request
    // NOW+4001 onward and never actually cover it.
    expect(query.from).toBe(NOW + 1001);
    expect(query.to).toBeGreaterThanOrEqual(NOW + 4000);
  });

  it('does not gap-fetch a push landing within jitter tolerance of the expected next tick', async () => {
    fetchMock.mockResolvedValue({ data: emptyResp(), mocked: false, unsupported: false });
    renderHook(() => useMetricHistory(true, 'cpu'));
    await advance(0);

    act(() => { capturedTailPush?.(resp('cpu', [{ t: NOW + 1000, avg: 1, max: 1 }])); });
    fetchMock.mockClear();

    act(() => { capturedTailPush?.(resp('cpu', [{ t: NOW + 2300, avg: 2, max: 2 }])); });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not gap-fetch on a steady connection, only on an actual drop-then-reconnect', async () => {
    const { rerender } = renderHook(() => useMetricHistory(true, 'cpu'));
    await advance(0);
    fetchMock.mockClear();

    rerender(); // connected stays true throughout - no edge to react to
    await advance(0);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('drops a stale tail gap-fill response that resolves after a newer one already landed', async () => {
    fetchMock.mockResolvedValue({ data: emptyResp(), mocked: false, unsupported: false });
    const { result } = renderHook(() => useMetricHistory(true, 'cpu'));
    await advance(0); // mount settles - lastLoadedTRef stays null (emptyResp everywhere)

    // Establishes a known lastLoadedT via a clean, non-gapped push.
    act(() => { capturedTailPush?.(resp('cpu', [{ t: NOW, avg: 0, max: 0 }])); });

    const first = deferred<{ data: MetricHistoryResponse | null; mocked: boolean; unsupported: boolean }>();
    fetchMock.mockImplementationOnce(() => first.promise);
    // A gap - triggers gap-fill #1, held pending. (Two overlapping
    // reconnects can no longer produce this race - the second one is
    // skipped while the first is in flight - so two gap-detecting pushes
    // are used instead to exercise the same seq-guard.)
    act(() => { capturedTailPush?.(resp('cpu', [{ t: NOW + 5_000, avg: 5, max: 5 }])); });

    const second = deferred<{ data: MetricHistoryResponse | null; mocked: boolean; unsupported: boolean }>();
    fetchMock.mockImplementationOnce(() => second.promise);
    // Another gap on top of that - triggers gap-fill #2, held pending.
    act(() => { capturedTailPush?.(resp('cpu', [{ t: NOW + 10_000, avg: 10, max: 10 }])); });

    // Newer gap-fill (#2) resolves before the older one (#1).
    await act(async () => {
      second.resolve({ data: resp('cpu', [{ t: NOW + 9_000, avg: 20, max: 22 }]), mocked: false, unsupported: false });
      await Promise.resolve();
    });
    await act(async () => {
      first.resolve({ data: resp('cpu', [{ t: NOW + 4_000, avg: 10, max: 12 }]), mocked: false, unsupported: false });
      await Promise.resolve();
    });

    const cpu = result.current.series.find(s => s.id === 'cpu');
    expect(cpu?.points).not.toContainEqual({ t: NOW + 4_000, avg: 10, max: 12 });
    expect(cpu?.points).toContainEqual({ t: NOW + 9_000, avg: 20, max: 22 });
  });

  it('clamps the strip to a narrower server retention window', async () => {
    fetchMock.mockResolvedValue({ data: { ...emptyResp(), retentionDays: 2 }, mocked: false, unsupported: false });
    const { result } = renderHook(() => useMetricHistory(true, 'cpu'));
    await advance(0);
    act(() => { result.current.setRange('7d'); });
    await advance(0);

    expect(result.current.stripDomain[0]).toBe(NOW - 2 * DAY);
  });

  it('keeps advancing the server time base from live-tail pushes while detached, without mutating the displayed series', async () => {
    const { result } = renderHook(() => useMetricHistory(true, 'cpu'));
    await advance(0);

    act(() => { result.current.onBrushChange(NOW - 4 * MINUTE, NOW - MINUTE, 'end'); });
    await advance(0);
    expect(result.current.following).toBe(false);
    const domainBefore = result.current.domain;

    fetchMock.mockClear();
    act(() => { capturedTailPush?.(resp('cpu', [{ t: NOW + 1000, avg: 10, max: 12 }])); });

    // bumpNow still runs (it must, to keep the server-time base fresh), but
    // the detached viewport's own domain/series are untouched, and staying
    // right on the expected next tick needs no gap-fill fetch.
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.domain).toEqual(domainBefore);
    expect(result.current.series.find(s => s.id === 'cpu')?.points ?? []).not.toContainEqual({ t: NOW + 1000, avg: 10, max: 12 });
  });

  it('backToLive re-anchors to the actual current time even after a long detached browse, not the moment following was dropped', async () => {
    const { result } = renderHook(() => useMetricHistory(true, 'cpu'));
    await advance(0);

    act(() => { result.current.onBrushChange(NOW - 4 * MINUTE, NOW - MINUTE, 'end'); });
    await advance(0);
    expect(result.current.following).toBe(false);

    // Real time keeps advancing via live-tail pushes for 10s while detached.
    act(() => { capturedTailPush?.(resp('cpu', [{ t: NOW + 10_000, avg: 5, max: 5 }])); });

    act(() => { result.current.backToLive(); });
    await advance(0);

    // Reattaching lands at the advanced time, not frozen at the original
    // detach moment (NOW).
    expect(result.current.domain[1]).toBeGreaterThan(NOW + 5_000);
  });

  it('refreshes the box every 60s regardless of following/dragging', async () => {
    renderHook(() => useMetricHistory(true, 'cpu'));
    await advance(0);
    fetchMock.mockClear();

    await advance(60_000);
    // The redecimate interval bumps fetchEpoch, whose effect schedules its
    // own zero-delay timer for the actual fetch - give it one more tick.
    await advance(0);

    expect(fetchMock).toHaveBeenCalledWith(expect.objectContaining({ maxPoints: 800 }));
  });

  it('does not let the 60s redecimate timer force a second fine fetch for a still-held drag beyond the single during-drag debounce refresh, only firing again once the drag actually ends', async () => {
    const { result } = renderHook(() => useMetricHistory(true, 'cpu'));
    await advance(0);

    const dragWindow = { from: NOW - 5 * HOUR, to: NOW - 4 * HOUR, maxPoints: 800, series: 'cpu' };
    act(() => { result.current.onBrushChange(dragWindow.from, dragWindow.to, 'drag'); });
    fetchMock.mockClear();

    // The during-drag debounce fires once (early in this span); the
    // redecimate timer's own fetchEpoch bump at the 60s mark is still gated
    // off by the held 'drag' phase, so it must not force a SECOND fetch for
    // the exact same window - the unrelated idle-prefetch timer also fires
    // its own 800pt fetch for a neighboring window in this same span, so
    // assert on the exact dragged-to window rather than maxPoints alone.
    await advance(60_000);
    const fineCalls = fetchMock.mock.calls.filter(([q]) => q.from === dragWindow.from && q.to === dragWindow.to && q.maxPoints === 800);
    expect(fineCalls.length).toBe(1);
    expect(result.current.dragging).toBe(true);

    act(() => { result.current.onBrushChange(dragWindow.from, dragWindow.to, 'end'); });
    await advance(0);
    const fineCallsAfterEnd = fetchMock.mock.calls.filter(([q]) => q.from === dragWindow.from && q.to === dragWindow.to && q.maxPoints === 800);
    expect(fineCallsAfterEnd.length).toBe(2);
  });

  it('refreshes the strip silhouette every 60s while following', async () => {
    renderHook(() => useMetricHistory(true, 'cpu'));
    await advance(0);
    fetchMock.mockClear();

    await advance(60_000);

    expect(fetchMock).toHaveBeenCalledWith(expect.objectContaining({ maxPoints: 400 }));
  });

  it('stops all timers on unmount', async () => {
    const { unmount } = renderHook(() => useMetricHistory(true, 'cpu'));
    await advance(0);
    unmount();
    fetchMock.mockClear();

    await advance(120_000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refetches for a new metric without resetting the viewport (persists across a metric switch)', async () => {
    const { result, rerender } = renderHook(
      ({ series }: { series: string }) => useMetricHistory(true, series),
      { initialProps: { series: 'cpu' } },
    );
    await advance(0);

    act(() => { result.current.onBrushChange(NOW - 4 * MINUTE, NOW - MINUTE, 'end'); });
    await advance(0);
    const domainBefore = result.current.domain;
    const followingBefore = result.current.following;

    fetchMock.mockClear();
    rerender({ series: 'gpu,gpu-temp' });
    await advance(0);

    expect(fetchMock).toHaveBeenCalledWith(expect.objectContaining({ series: 'gpu,gpu-temp' }));
    expect(result.current.domain).toEqual(domainBefore);
    expect(result.current.following).toBe(followingBefore);
  });

  it('does not fetch while disabled', async () => {
    renderHook(() => useMetricHistory(false, 'cpu'));
    await advance(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('anchors the bootstrap tail gap-fill request to the server time base, not the client clock', async () => {
    fetchMock.mockResolvedValue({ data: emptyResp(), mocked: false, unsupported: false });
    renderHook(() => useMetricHistory(true, 'cpu'));
    await advance(0);

    // `to` is the server time base (nowRef, only ever moved by a response's
    // own timestamp - still the bootstrap NOW here) plus a fixed
    // 2-poll-interval margin, not Date.now() read at request time.
    expect(fetchMock).toHaveBeenCalledWith(expect.objectContaining({ to: NOW + 2_000, from: NOW - 5_000 + 1, maxPoints: 50 }));
  });

  it('stops all polling once the route reports unsupported, and retry() re-arms it without a duplicate silhouette fetch', async () => {
    fetchMock.mockResolvedValue({ data: null, mocked: false, unsupported: true });
    const { result } = renderHook(() => useMetricHistory(true, 'cpu'));
    await advance(0);

    expect(result.current.supported).toBe(false);
    fetchMock.mockClear();

    await advance(120_000);
    expect(fetchMock).not.toHaveBeenCalled();

    act(() => { result.current.retry(); });
    await advance(0);

    // Silhouette + box + the tail bootstrap gap-fill - retry() resets the
    // gate and lets each of those effects fire its own fetch, rather than
    // also calling loadSilhouette directly (which would double it).
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('stops all polling once a real fetch failure sets error, and retry() re-arms it', async () => {
    fetchMock.mockResolvedValue({ data: null, mocked: false, unsupported: false });
    const { result } = renderHook(() => useMetricHistory(true, 'cpu'));
    await advance(0);

    expect(result.current.error).toBe(true);
    fetchMock.mockClear();

    await advance(120_000);
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValue({ data: emptyResp(), mocked: false, unsupported: false });
    act(() => { result.current.retry(); });
    await advance(0);

    expect(result.current.error).toBe(false);
    // Silhouette + box + the tail bootstrap gap-fill.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not refetch the viewport on a metric switch once the route is known unsupported', async () => {
    fetchMock.mockResolvedValue({ data: null, mocked: false, unsupported: true });
    const { result, rerender } = renderHook(
      ({ series }: { series: string }) => useMetricHistory(true, series),
      { initialProps: { series: 'cpu' } },
    );
    await advance(0);
    expect(result.current.supported).toBe(false);

    fetchMock.mockClear();
    rerender({ series: 'gpu,gpu-temp' });
    await advance(0);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a late tail gap-fill response that resolves after a fresher viewport refresh does not regress the series', async () => {
    // Bootstrap tail gap-fill fires on mount; hold its response pending.
    const tailDeferred = deferred<{ data: MetricHistoryResponse | null; mocked: boolean; unsupported: boolean }>();
    fetchMock.mockImplementation(async q => (q.maxPoints === 50 ? tailDeferred.promise : { data: emptyResp(), mocked: false, unsupported: false }));
    const { result } = renderHook(() => useMetricHistory(true, 'cpu'));
    await advance(0);

    // A viewport refresh (setRange) lands first, with a newer point than the
    // still-pending tail gap-fill will eventually resolve with.
    fetchMock.mockResolvedValue({ data: resp('cpu', [{ t: NOW + 5_000, avg: 90, max: 92 }]), mocked: false, unsupported: false });
    act(() => { result.current.setRange('3h'); });
    await advance(0);

    expect(result.current.series.find(s => s.id === 'cpu')?.points).toEqual([{ t: NOW + 5_000, avg: 90, max: 92 }]);

    // The stale gap-fill request (an older point) finally resolves.
    await act(async () => {
      tailDeferred.resolve({ data: resp('cpu', [{ t: NOW + 500, avg: 10, max: 12 }]), mocked: false, unsupported: false });
      await Promise.resolve();
    });

    // Dropped - the fresher viewport refresh invalidated it, so it never
    // appends the older point after the newer one.
    expect(result.current.series.find(s => s.id === 'cpu')?.points).toEqual([{ t: NOW + 5_000, avg: 90, max: 92 }]);
  });

  it('exposes the viewport response\'s stepSeconds', async () => {
    fetchMock.mockResolvedValue({ data: { ...emptyResp(), stepSeconds: 30 }, mocked: false, unsupported: false });
    const { result } = renderHook(() => useMetricHistory(true, 'cpu'));
    await advance(0);
    expect(result.current.stepSeconds).toBe(30);
  });

  it('viewportGeneration bumps on a real navigation action but not on a live-follow push tick', async () => {
    const { result } = renderHook(() => useMetricHistory(true, 'cpu'));
    await advance(0);
    const gen0 = result.current.viewportGeneration;

    act(() => { capturedTailPush?.(resp('cpu', [{ t: NOW + 1000, avg: 1, max: 1 }])); });
    expect(result.current.viewportGeneration).toBe(gen0);

    act(() => { result.current.setRange('3h'); });
    await advance(0);
    expect(result.current.viewportGeneration).toBeGreaterThan(gen0);
  });

  it('viewportGeneration is not bumped by the 60s redecimate timer while idly watching live', async () => {
    const { result } = renderHook(() => useMetricHistory(true, 'cpu'));
    await advance(0);
    const gen0 = result.current.viewportGeneration;

    // The redecimate timer bumps the internal fetch-retry counter every 60s
    // regardless of navigation - viewportGeneration must stay untouched by
    // it, or a caller keyed on it (e.g. the process list's rank-stability
    // reset trigger) would force a full re-rank every 60s while the user is
    // just watching, not navigating.
    await advance(60_000);
    await advance(0);
    expect(result.current.viewportGeneration).toBe(gen0);

    act(() => { result.current.retry(); });
    await advance(0);
    expect(result.current.viewportGeneration).toBeGreaterThan(gen0);
  });

  it('renders instantly from cache on an exact-key revisit while the revalidating fetch is in flight', async () => {
    fetchMock.mockResolvedValue({ data: resp('cpu', [{ t: NOW - 4 * HOUR, avg: 42, max: 42 }]), mocked: false, unsupported: false });
    const { result } = renderHook(() => useMetricHistory(true, 'cpu'));
    await advance(0);
    act(() => { result.current.onBrushChange(NOW - 5 * HOUR, NOW - 4 * HOUR, 'end'); });
    await advance(0);
    expect(result.current.series.find(s => s.id === 'cpu')?.points).toEqual([{ t: NOW - 4 * HOUR, avg: 42, max: 42 }]);

    // Scrub away, then back to the exact same window - a slow/never-resolving
    // fetch for the revisit must not blank the chart: the cached response
    // from the first visit renders immediately.
    const pending = deferred<{ data: MetricHistoryResponse | null; mocked: boolean; unsupported: boolean }>();
    act(() => { result.current.onBrushChange(NOW - 8 * HOUR, NOW - 7 * HOUR, 'end'); });
    await advance(0);
    fetchMock.mockImplementationOnce(() => pending.promise);
    act(() => { result.current.onBrushChange(NOW - 5 * HOUR, NOW - 4 * HOUR, 'end'); });
    // The debounced viewport effect's own (0-delay) timer runs the interim
    // cache-render synchronously before it awaits the now-pending fetch.
    await advance(0);

    expect(result.current.series.find(s => s.id === 'cpu')?.points).toEqual([{ t: NOW - 4 * HOUR, avg: 42, max: 42 }]);
  });

  it('idle-prefetches the same-width left-neighbor window after the viewport settles', async () => {
    const { result } = renderHook(() => useMetricHistory(true, 'cpu'));
    await advance(0);
    act(() => { result.current.onBrushChange(NOW - 5 * HOUR, NOW - 4 * HOUR, 'end'); });
    await advance(0);
    fetchMock.mockClear();

    await advance(3_500);

    expect(fetchMock).toHaveBeenCalledWith(expect.objectContaining({ from: NOW - 6 * HOUR, to: NOW - 5 * HOUR }));
  });

  it('a push whose newest t goes backwards triggers no fetch and does not regress lastLoadedTRef/nowRef', async () => {
    fetchMock.mockResolvedValue({ data: emptyResp(), mocked: false, unsupported: false });
    const { result } = renderHook(() => useMetricHistory(true, 'cpu'));
    await advance(0);

    act(() => { capturedTailPush?.(resp('cpu', [{ t: NOW + 5000, avg: 5, max: 5 }])); });
    const domainAfterFirst = result.current.domain[1];
    fetchMock.mockClear();

    // A straggler - its newest point is BEFORE the last one already known
    // (e.g. a stale frame delivered late around a reconnect).
    act(() => { capturedTailPush?.(resp('cpu', [{ t: NOW + 1000, avg: 1, max: 1 }])); });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.domain[1]).toBe(domainAfterFirst);
  });

  it('skips the reconnect-triggered gap-fill while the bootstrap fetch is still in flight', async () => {
    const pending = deferred<{ data: MetricHistoryResponse | null; mocked: boolean; unsupported: boolean }>();
    fetchMock.mockImplementation(async q => (q.maxPoints === 50 ? pending.promise : { data: emptyResp(), mocked: false, unsupported: false }));

    const { rerender } = renderHook(() => useMetricHistory(true, 'cpu'));
    // The mount's own bootstrap gap-fill (maxPoints=50) is in flight.
    fetchMock.mockClear();

    mockConnected = false;
    rerender();
    mockConnected = true;
    rerender();
    await advance(0);

    // No second concurrent maxPoints=50 fetch fired while tailInFlightRef
    // was true.
    expect(fetchMock.mock.calls.some(([q]) => q.maxPoints === 50)).toBe(false);

    await act(async () => {
      pending.resolve({ data: emptyResp(), mocked: false, unsupported: false });
      await Promise.resolve();
    });
  });
});
