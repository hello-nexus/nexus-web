import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mergeTimelineEvents, normalisePrivacySession, upsertPrivacySession, upsertStoredEvent, useMonitoringEvents } from './useMonitoringEvents';
import type { MonitoringEventDto } from '../api/monitoringEvents';
import type { PrivacyFetchResult, PrivacySession } from '../api/monitoringPrivacy';

// Exceeds the hook's own internal debounce window (250ms) so every timer
// advance in this file reliably crosses it.
const DEBOUNCE_MS = 300;

const fetchEventsMock = vi.fn<(from: number, to: number, limit?: number) => Promise<MonitoringEventDto[]>>();
const fetchPrivacyMock = vi.fn<(query: { from: number; to: number }) => Promise<PrivacyFetchResult>>();

vi.mock('../api/monitoringEvents', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/monitoringEvents')>();
  return {
    ...actual,
    fetchMonitoringEvents: (from: number, to: number, limit?: number) => fetchEventsMock(from, to, limit),
  };
});
vi.mock('../api/monitoringPrivacy', () => ({
  fetchMonitoringPrivacy: (query: { from: number; to: number }) => fetchPrivacyMock(query),
}));

// One captured callback per topic - the hook subscribes to both
// 'monitoring/events' and 'monitoring/privacy'. mockConnected backs
// useMultiplex()?.connected for the reconnect-refetch tests.
const capturedTopics: Record<string, ((data: unknown) => void) | null> = {};
let mockConnected = true;
vi.mock('./useMultiplexSocket', () => ({
  useTopicCallback: (topic: string, enabled: boolean, cb: (data: unknown) => void) => {
    capturedTopics[topic] = enabled ? cb : null;
  },
  useMultiplex: () => ({ connected: mockConnected }),
}));

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function storedEvent(overrides: Partial<MonitoringEventDto> = {}): MonitoringEventDto {
  return { id: 1, t: 1000, kind: 'app-open', label: 'Calculator', detail: null, custom: false, ...overrides };
}

function privacySession(overrides: Partial<PrivacySession> = {}): PrivacySession {
  return { app: 'C:\\chrome.exe', capability: 'webcam', start: 1000, end: null, ...overrides };
}

function okPrivacy(sessions: PrivacySession[] = []): PrivacyFetchResult {
  return { data: { supported: true, retentionDays: 7, sessions }, mocked: false, unsupported: false };
}

describe('mergeTimelineEvents', () => {
  it('maps webcam, microphone, and location to their own dedicated kind', () => {
    const merged = mergeTimelineEvents([], [
      privacySession({ capability: 'webcam' }),
      privacySession({ capability: 'microphone' }),
      privacySession({ capability: 'location' }),
    ]);
    expect(merged.map(e => e.kind)).toEqual(['privacy-webcam', 'privacy-microphone', 'privacy-location']);
  });

  it('collapses both graphicsCapture variants onto privacy-screen', () => {
    const merged = mergeTimelineEvents([], [
      privacySession({ capability: 'graphicsCaptureProgrammatic' }),
      privacySession({ capability: 'graphicsCaptureWithoutBorder' }),
    ]);
    expect(merged.map(e => e.kind)).toEqual(['privacy-screen', 'privacy-screen']);
  });

  // Labels come from the shared appDisplayName, so a lane marker, a process
  // list indicator, and the privacy history modal name the same app
  // identically.
  it('names a win32 path by its executable, keeping the full path as detail', () => {
    const [event] = mergeTimelineEvents([], [
      privacySession({ app: 'C:\\Users\\nicola\\AppData\\Local\\Discord\\Discord.exe' }),
    ]);
    expect(event.label).toBe('Discord');
    expect(event.detail).toBe('C:\\Users\\nicola\\AppData\\Local\\Discord\\Discord.exe');
  });

  it('drops the publisher-id suffix from a package family name, keeping it as detail', () => {
    const [event] = mergeTimelineEvents([], [
      privacySession({ app: 'Microsoft.WindowsCalculator_8wekyb3d8bbwe' }),
    ]);
    expect(event.label).toBe('Microsoft.WindowsCalculator');
    expect(event.detail).toBe('Microsoft.WindowsCalculator_8wekyb3d8bbwe');
  });

  it('carries a still-open session through as endT: null', () => {
    const [event] = mergeTimelineEvents([], [privacySession({ end: null })]);
    expect(event.endT).toBeNull();
  });

  it('carries a closed session through with its real endT', () => {
    const [event] = mergeTimelineEvents([], [privacySession({ start: 1000, end: 5000 })]);
    expect(event.endT).toBe(5000);
  });

  it('always sets endT to null for a stored event', () => {
    const [event] = mergeTimelineEvents([storedEvent()], []);
    expect(event.endT).toBeNull();
  });

  it('sorts the merged output ascending by t across both sources', () => {
    const stored = [storedEvent({ id: 1, t: 3000 }), storedEvent({ id: 2, t: 1000 })];
    const privacy = [privacySession({ start: 2000 })];
    const merged = mergeTimelineEvents(stored, privacy);
    expect(merged.map(e => e.t)).toEqual([1000, 2000, 3000]);
  });

  it('still yields the stored events when there are no privacy sessions (privacy unsupported/empty)', () => {
    const stored = [storedEvent({ id: 1, t: 100 }), storedEvent({ id: 2, t: 200, kind: 'custom', custom: true })];
    const merged = mergeTimelineEvents(stored, []);
    expect(merged).toHaveLength(2);
    expect(merged.map(e => e.key)).toEqual(['stored:1', 'stored:2']);
  });

  it('gives a stored event a stable service-id key and keeps its id', () => {
    const [event] = mergeTimelineEvents([storedEvent({ id: 42 })], []);
    expect(event.key).toBe('stored:42');
    expect(event.id).toBe(42);
    expect(event.custom).toBe(false);
  });

  it('gives a privacy event a synthetic key and a null id (never deletable)', () => {
    const [event] = mergeTimelineEvents([], [privacySession({ capability: 'location', app: 'a.exe', start: 777 })]);
    expect(event.key).toBe('privacy:location:a.exe:777');
    expect(event.id).toBeNull();
    expect(event.custom).toBe(false);
  });

  it('normalises a missing detail key on a stored event to null', () => {
    const noDetail = { id: 1, t: 100, kind: 'app-open', label: 'x', custom: false } as MonitoringEventDto;
    const [event] = mergeTimelineEvents([noDetail], []);
    expect(event.detail).toBeNull();
  });

  it('returns an empty array when both inputs are empty', () => {
    expect(mergeTimelineEvents([], [])).toEqual([]);
  });
});

describe('upsertStoredEvent', () => {
  it('inserts a new event in ascending-t order', () => {
    const list = [storedEvent({ id: 1, t: 1000 }), storedEvent({ id: 2, t: 3000 })];
    const next = upsertStoredEvent(list, storedEvent({ id: 3, t: 2000 }));
    expect(next.map(e => e.id)).toEqual([1, 3, 2]);
  });

  it('replaces an existing event by id in place, keeping its position', () => {
    const list = [storedEvent({ id: 1, t: 1000, label: 'a' }), storedEvent({ id: 2, t: 2000, label: 'b' })];
    const next = upsertStoredEvent(list, storedEvent({ id: 1, t: 1000, label: 'renamed' }));
    expect(next.map(e => e.label)).toEqual(['renamed', 'b']);
  });

  it('returns the same reference when the pushed event carries no actual change', () => {
    const list = [storedEvent({ id: 1, t: 1000, label: 'a' })];
    const next = upsertStoredEvent(list, storedEvent({ id: 1, t: 1000, label: 'a' }));
    expect(next).toBe(list);
  });
});

describe('normalisePrivacySession', () => {
  it('defaults an omitted end key to null - the wire omits it rather than sending null while a capability is open', () => {
    const raw = { app: 'a.exe', capability: 'webcam' as const, start: 1000 } as PrivacySession;
    expect(normalisePrivacySession(raw)).toEqual({ app: 'a.exe', capability: 'webcam', start: 1000, end: null });
  });

  it('leaves an explicit end untouched', () => {
    expect(normalisePrivacySession(privacySession({ end: 5000 })).end).toBe(5000);
  });
});

describe('upsertPrivacySession', () => {
  it('inserts a new session in ascending-start order', () => {
    const list = [privacySession({ app: 'a.exe', start: 1000 }), privacySession({ app: 'c.exe', start: 3000 })];
    const next = upsertPrivacySession(list, privacySession({ app: 'b.exe', start: 2000 }));
    expect(next.map(s => s.app)).toEqual(['a.exe', 'b.exe', 'c.exe']);
  });

  it('replaces the matching (app, capability, start) session in place - the end push closing a start push', () => {
    const list = [privacySession({ app: 'a.exe', capability: 'webcam', start: 1000, end: null })];
    const next = upsertPrivacySession(list, privacySession({ app: 'a.exe', capability: 'webcam', start: 1000, end: 5000 }));
    expect(next).toHaveLength(1);
    expect(next[0].end).toBe(5000);
  });

  it('treats a different app/capability/start as a distinct session even with the same end', () => {
    const list = [privacySession({ app: 'a.exe', capability: 'webcam', start: 1000, end: null })];
    const next = upsertPrivacySession(list, privacySession({ app: 'a.exe', capability: 'microphone', start: 1000, end: null }));
    expect(next).toHaveLength(2);
  });

  it('returns the same reference when the pushed session carries no actual change', () => {
    const list = [privacySession({ app: 'a.exe', capability: 'webcam', start: 1000, end: null })];
    const next = upsertPrivacySession(list, privacySession({ app: 'a.exe', capability: 'webcam', start: 1000, end: null }));
    expect(next).toBe(list);
  });
});

describe('useMonitoringEvents', () => {
  const flush = () => act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });

  async function advance(ms: number) {
    await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
    await flush();
  }

  beforeEach(() => {
    vi.useFakeTimers();
    fetchEventsMock.mockReset();
    fetchPrivacyMock.mockReset();
    fetchEventsMock.mockResolvedValue([]);
    fetchPrivacyMock.mockResolvedValue(okPrivacy());
    capturedTopics['monitoring/events'] = null;
    capturedTopics['monitoring/privacy'] = null;
    mockConnected = true;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('does not fetch at all while disabled, and returns an empty array', async () => {
    const { result } = renderHook(() => useMonitoringEvents([0, 1000], false, true));
    await advance(DEBOUNCE_MS);

    expect(fetchEventsMock).not.toHaveBeenCalled();
    expect(fetchPrivacyMock).not.toHaveBeenCalled();
    expect(result.current.events).toEqual([]);
  });

  it('does not repopulate events when disabled while a fetch is in flight', async () => {
    // Regression: the disabled branch cleared state but left the sequence
    // guard untouched, so the in-flight load still passed its own check and
    // re-rendered markers after the toggle went off. With a pinned (frozen)
    // domain the effect never re-runs to clear them again.
    let resolveStored: (v: MonitoringEventDto[]) => void = () => {};
    fetchEventsMock.mockReturnValue(new Promise(res => { resolveStored = res; }));

    const { result, rerender } = renderHook(
      ({ enabled }) => useMonitoringEvents([0, 5000], enabled, true),
      { initialProps: { enabled: true } },
    );
    await advance(DEBOUNCE_MS);

    rerender({ enabled: false });
    resolveStored([storedEvent({ id: 1, t: 3000, label: 'Calculator' })]);
    await flush();

    expect(result.current.events).toEqual([]);
  });

  it('fetches stored events and privacy sessions for the given domain, merged and sorted', async () => {
    fetchEventsMock.mockResolvedValue([storedEvent({ id: 1, t: 3000, label: 'Calculator' })]);
    fetchPrivacyMock.mockResolvedValue(okPrivacy([privacySession({ start: 1000 })]));

    const { result } = renderHook(() => useMonitoringEvents([0, 5000], true, true));
    await advance(DEBOUNCE_MS);

    expect(fetchEventsMock).toHaveBeenCalledWith(0, 5000, undefined);
    expect(result.current.events.map(e => e.t)).toEqual([1000, 3000]);
  });

  it('renders stored events even when the privacy fetch reports unsupported', async () => {
    fetchEventsMock.mockResolvedValue([storedEvent({ label: 'Calculator' })]);
    fetchPrivacyMock.mockResolvedValue({ data: null, mocked: false, unsupported: true });

    const { result } = renderHook(() => useMonitoringEvents([0, 1000], true, true));
    await advance(DEBOUNCE_MS);

    expect(result.current.events).toHaveLength(1);
    expect(result.current.events[0].label).toBe('Calculator');
  });

  it('renders stored events even when the privacy fetch errors', async () => {
    fetchEventsMock.mockResolvedValue([storedEvent({ label: 'Calculator' })]);
    fetchPrivacyMock.mockResolvedValue({ data: null, mocked: false, unsupported: false });

    const { result } = renderHook(() => useMonitoringEvents([0, 1000], true, true));
    await advance(DEBOUNCE_MS);

    expect(result.current.events).toHaveLength(1);
  });

  it('debounces a domain change instead of fetching on every render', async () => {
    const { rerender } = renderHook(
      ({ domain }: { domain: [number, number] }) => useMonitoringEvents(domain, true, true),
      { initialProps: { domain: [0, 1000] as [number, number] } },
    );
    await advance(DEBOUNCE_MS);
    fetchEventsMock.mockClear();

    // Each jump alone is well past coveredTo + the coverage slack, so every
    // one of these needs a real fetch - the debounce still collapses the
    // three rapid changes into a single fetch for the final domain.
    rerender({ domain: [0, 10_000] });
    rerender({ domain: [0, 11_000] });
    rerender({ domain: [0, 12_000] });
    await advance(50);
    expect(fetchEventsMock).not.toHaveBeenCalled();

    await advance(DEBOUNCE_MS);
    expect(fetchEventsMock).toHaveBeenCalledTimes(1);
    expect(fetchEventsMock).toHaveBeenCalledWith(0, 12_000, undefined);
  });

  it('tail-driven domain advance (within the coverage slack) causes zero events/privacy fetches', async () => {
    const { rerender } = renderHook(
      ({ domain }: { domain: [number, number] }) => useMonitoringEvents(domain, true, true),
      { initialProps: { domain: [0, 1000] as [number, number] } },
    );
    await advance(DEBOUNCE_MS);
    fetchEventsMock.mockClear();
    fetchPrivacyMock.mockClear();

    // Mirrors the live tail sliding the box forward ~1s per push tick - each
    // step alone, and their sum, stays under the coverage slack.
    for (let to = 1_100; to <= 2_000; to += 100) {
      rerender({ domain: [to - 1000, to] });
      await advance(DEBOUNCE_MS);
    }

    expect(fetchEventsMock).not.toHaveBeenCalled();
    expect(fetchPrivacyMock).not.toHaveBeenCalled();
  });

  it('a user-driven domain widening beyond the coverage slack fetches once', async () => {
    const { rerender } = renderHook(
      ({ domain }: { domain: [number, number] }) => useMonitoringEvents(domain, true, true),
      { initialProps: { domain: [0, 1000] as [number, number] } },
    );
    await advance(DEBOUNCE_MS);
    fetchEventsMock.mockClear();

    rerender({ domain: [0, 30_000] });
    await advance(DEBOUNCE_MS);

    expect(fetchEventsMock).toHaveBeenCalledTimes(1);
    expect(fetchEventsMock).toHaveBeenCalledWith(0, 30_000, undefined);
  });

  it('refetch() fires immediately, bypassing the domain-change debounce', async () => {
    const { result } = renderHook(() => useMonitoringEvents([0, 1000], true, true));
    await advance(DEBOUNCE_MS);
    fetchEventsMock.mockClear();

    act(() => { result.current.refetch(); });
    await advance(0);

    expect(fetchEventsMock).toHaveBeenCalledTimes(1);
  });

  it('a stale in-flight response never overwrites a newer one', async () => {
    const first = deferred<MonitoringEventDto[]>();
    const second = deferred<MonitoringEventDto[]>();
    fetchEventsMock.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    const { result, rerender } = renderHook(
      ({ domain }: { domain: [number, number] }) => useMonitoringEvents(domain, true, true),
      { initialProps: { domain: [0, 1000] as [number, number] } },
    );
    await advance(DEBOUNCE_MS);

    rerender({ domain: [0, 2000] });
    await advance(DEBOUNCE_MS);

    await act(async () => { second.resolve([storedEvent({ id: 2, t: 500, label: 'newer' })]); await Promise.resolve(); });
    await flush();
    expect(result.current.events.map(e => e.label)).toEqual(['newer']);

    await act(async () => { first.resolve([storedEvent({ id: 1, t: 100, label: 'stale' })]); await Promise.resolve(); });
    await flush();
    expect(result.current.events.map(e => e.label)).toEqual(['newer']);
  });

  it('does not throw and keeps the previously loaded events when the stored-events fetch fails', async () => {
    fetchEventsMock.mockResolvedValueOnce([storedEvent({ label: 'first' })]);

    const { result, rerender } = renderHook(
      ({ domain }: { domain: [number, number] }) => useMonitoringEvents(domain, true, true),
      { initialProps: { domain: [0, 1000] as [number, number] } },
    );
    await advance(DEBOUNCE_MS);
    expect(result.current.events.map(e => e.label)).toEqual(['first']);

    fetchEventsMock.mockRejectedValueOnce(new Error('network down'));
    // Past the coverage slack, so this domain change still triggers a fetch.
    rerender({ domain: [0, 10_000] });
    await expect(advance(DEBOUNCE_MS)).resolves.toBeUndefined();

    expect(result.current.events.map(e => e.label)).toEqual(['first']);
  });

  it('reports loading true while a fetch is in flight and false once it resolves', async () => {
    const pending = deferred<MonitoringEventDto[]>();
    fetchEventsMock.mockReturnValueOnce(pending.promise);

    const { result } = renderHook(() => useMonitoringEvents([0, 1000], true, true));
    await act(async () => { await vi.advanceTimersByTimeAsync(DEBOUNCE_MS); });
    expect(result.current.loading).toBe(true);

    await act(async () => { pending.resolve([]); await Promise.resolve(); });
    await flush();
    expect(result.current.loading).toBe(false);
  });

  it('merges a pushed event into the timeline with no fetch, in t order', async () => {
    fetchEventsMock.mockResolvedValue([storedEvent({ id: 1, t: 500, label: 'existing' })]);
    const { result } = renderHook(() => useMonitoringEvents([0, 1000], true, true));
    await advance(DEBOUNCE_MS);
    fetchEventsMock.mockClear();
    fetchPrivacyMock.mockClear();

    act(() => { capturedTopics['monitoring/events']?.(storedEvent({ id: 2, t: 800, label: 'pushed' })); });

    expect(result.current.events.map(e => e.label)).toEqual(['existing', 'pushed']);
    expect(fetchEventsMock).not.toHaveBeenCalled();
    expect(fetchPrivacyMock).not.toHaveBeenCalled();
  });

  it('merges a pushed privacy session into the timeline with no fetch', async () => {
    const { result } = renderHook(() => useMonitoringEvents([0, 1000], true, true));
    await advance(DEBOUNCE_MS);
    fetchEventsMock.mockClear();
    fetchPrivacyMock.mockClear();

    act(() => {
      capturedTopics['monitoring/privacy']?.(privacySession({ app: 'chrome.exe', capability: 'webcam', start: 500, end: null }));
    });

    expect(result.current.events).toHaveLength(1);
    expect(result.current.events[0].kind).toBe('privacy-webcam');
    expect(fetchEventsMock).not.toHaveBeenCalled();
    expect(fetchPrivacyMock).not.toHaveBeenCalled();
  });

  it('an open session pushed with the end key omitted does not spuriously re-render on a replayed start push', async () => {
    const { result } = renderHook(() => useMonitoringEvents([0, 1000], true, true));
    await advance(DEBOUNCE_MS);

    act(() => {
      capturedTopics['monitoring/privacy']?.({ app: 'chrome.exe', capability: 'webcam', start: 500 } as PrivacySession);
    });
    const before = result.current.events;

    act(() => {
      capturedTopics['monitoring/privacy']?.({ app: 'chrome.exe', capability: 'webcam', start: 500 } as PrivacySession);
    });

    expect(result.current.events).toBe(before);
  });

  it('de-dupes a replayed pushed event by id, keeping ascending-t order across pushes', async () => {
    fetchEventsMock.mockResolvedValue([storedEvent({ id: 1, t: 1000, label: 'a' })]);
    const { result } = renderHook(() => useMonitoringEvents([0, 5000], true, true));
    await advance(DEBOUNCE_MS);

    act(() => { capturedTopics['monitoring/events']?.(storedEvent({ id: 2, t: 3000, label: 'c' })); });
    act(() => { capturedTopics['monitoring/events']?.(storedEvent({ id: 3, t: 2000, label: 'b' })); });
    act(() => { capturedTopics['monitoring/events']?.(storedEvent({ id: 2, t: 3000, label: 'c-renamed' })); });

    expect(result.current.events.map(e => e.label)).toEqual(['a', 'b', 'c-renamed']);
  });

  it('an unchanged push does not create a new events array reference', async () => {
    fetchEventsMock.mockResolvedValue([storedEvent({ id: 1, t: 500, label: 'existing' })]);
    const { result } = renderHook(() => useMonitoringEvents([0, 1000], true, true));
    await advance(DEBOUNCE_MS);
    const before = result.current.events;

    act(() => { capturedTopics['monitoring/events']?.(storedEvent({ id: 1, t: 500, label: 'existing' })); });

    expect(result.current.events).toBe(before);
  });

  it('reconnect triggers a refetch, resyncing coverage after a socket drop', async () => {
    const { rerender } = renderHook(() => useMonitoringEvents([0, 1000], true, true));
    await advance(DEBOUNCE_MS);
    fetchEventsMock.mockClear();
    fetchPrivacyMock.mockClear();

    mockConnected = false;
    rerender();
    mockConnected = true;
    rerender();
    await advance(0);

    expect(fetchEventsMock).toHaveBeenCalledTimes(1);
    expect(fetchPrivacyMock).toHaveBeenCalledTimes(1);
  });

  it('does not refetch on a steady connection - only on an actual drop-then-reconnect', async () => {
    const { rerender } = renderHook(() => useMonitoringEvents([0, 1000], true, true));
    await advance(DEBOUNCE_MS);
    fetchEventsMock.mockClear();

    rerender(); // connected stays true throughout - no edge to react to
    await advance(0);

    expect(fetchEventsMock).not.toHaveBeenCalled();
  });

  it('skips the reconnect-triggered refetch while the initial fetch is still in flight', async () => {
    const pendingEvents = deferred<MonitoringEventDto[]>();
    fetchEventsMock.mockReturnValueOnce(pendingEvents.promise);

    const { rerender } = renderHook(() => useMonitoringEvents([0, 1000], true, true));
    await advance(DEBOUNCE_MS); // the initial debounce fires - the GET is now in flight (pending)
    fetchEventsMock.mockClear();

    mockConnected = false;
    rerender();
    mockConnected = true;
    rerender();
    await advance(0);

    // No second concurrent fetch fired while loadInFlightRef was true.
    expect(fetchEventsMock).not.toHaveBeenCalled();

    await act(async () => {
      pendingEvents.resolve([]);
      await Promise.resolve();
    });
    await flush();
  });

  it('a push landing while the initial fetch is in flight survives it, instead of being discarded when the fetch commits', async () => {
    const pendingEvents = deferred<MonitoringEventDto[]>();
    fetchEventsMock.mockReturnValueOnce(pendingEvents.promise);

    const { result } = renderHook(() => useMonitoringEvents([0, 1000], true, true));
    await advance(DEBOUNCE_MS); // the initial debounce fires - the GET is now in flight (pending)
    act(() => { capturedTopics['monitoring/events']?.(storedEvent({ id: 99, t: 900, label: 'pushed-during-flight' })); });

    await act(async () => {
      // Resolves as of an earlier moment than the push - a naive wholesale
      // replace on commit would silently drop the pushed event.
      pendingEvents.resolve([storedEvent({ id: 1, t: 100, label: 'from-get' })]);
      await Promise.resolve();
    });
    await flush();

    expect(result.current.events.map(e => e.label).sort()).toEqual(['from-get', 'pushed-during-flight']);
  });

  it('a privacy end push landing while the initial fetch is in flight survives it, instead of being overwritten by the GET\'s still-open session', async () => {
    const pendingPrivacy = deferred<PrivacyFetchResult>();
    fetchPrivacyMock.mockReturnValueOnce(pendingPrivacy.promise);

    const { result } = renderHook(() => useMonitoringEvents([0, 1000], true, true));
    await advance(DEBOUNCE_MS); // the initial debounce fires - the GET is now in flight (pending)
    act(() => {
      capturedTopics['monitoring/privacy']?.(privacySession({ app: 'chrome.exe', capability: 'webcam', start: 500, end: 700 }));
    });

    await act(async () => {
      // Resolves with the session still open, as of before the end push.
      pendingPrivacy.resolve(okPrivacy([privacySession({ app: 'chrome.exe', capability: 'webcam', start: 500, end: null })]));
      await Promise.resolve();
    });
    await flush();

    const privacyEvent = result.current.events.find(e => e.kind === 'privacy-webcam');
    expect(privacyEvent?.endT).toBe(700);
  });

  it('a detached (not following) sub-slack pan still fetches - trust-extension only holds at the live edge', async () => {
    const { rerender } = renderHook(
      ({ domain, following }: { domain: [number, number]; following: boolean }) => useMonitoringEvents(domain, true, following),
      { initialProps: { domain: [0, 1000] as [number, number], following: false } },
    );
    await advance(DEBOUNCE_MS);
    fetchEventsMock.mockClear();

    // Well inside DOMAIN_TO_COVERAGE_SLACK_MS (5000ms) - would be trusted
    // (no fetch) while following, but a detached pan has no live push
    // safety net for the newly-panned-into span.
    rerender({ domain: [500, 1500], following: false });
    await advance(DEBOUNCE_MS);

    expect(fetchEventsMock).toHaveBeenCalledTimes(1);
    expect(fetchEventsMock).toHaveBeenCalledWith(500, 1500, undefined);
  });

  it('extends coverage with Math.max instead of shrinking it on a leftward pan while following', async () => {
    const { rerender } = renderHook(
      ({ domain }: { domain: [number, number] }) => useMonitoringEvents(domain, true, true),
      { initialProps: { domain: [0, 10_000] as [number, number] } },
    );
    await advance(DEBOUNCE_MS); // coveredTo settles at 10_000
    fetchEventsMock.mockClear();

    // `to` pans left while `from` stays put (so this alone never trips the
    // `from < coveredFrom` fetch path) - within slack of the ORIGINAL
    // coveredTo, so no fetch, but a plain assignment (rather than Math.max)
    // would wrongly shrink coveredTo down to 9_000 here.
    rerender({ domain: [0, 9_000] });
    await advance(DEBOUNCE_MS);
    expect(fetchEventsMock).not.toHaveBeenCalled();

    // A `to` that's within slack of the real coveredTo (10_000 + 5_000 =
    // 15_000) but past what a shrunk-to-9_000 coveredTo would tolerate
    // (9_000 + 5_000 = 14_000) - only stays fetch-free if coveredTo was
    // never actually shrunk by the previous render.
    rerender({ domain: [0, 14_500] });
    await advance(DEBOUNCE_MS);
    expect(fetchEventsMock).not.toHaveBeenCalled();
  });
});
