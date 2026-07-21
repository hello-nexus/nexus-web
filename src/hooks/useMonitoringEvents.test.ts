import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mergeTimelineEvents, useMonitoringEvents } from './useMonitoringEvents';
import type { MonitoringEventDto } from '../api/monitoringEvents';
import type { PrivacyFetchResult, PrivacySession } from '../api/monitoringPrivacy';

// Exceeds the hook's own internal debounce window (250ms) so every timer
// advance in this file reliably crosses it.
const DEBOUNCE_MS = 300;

const fetchEventsMock = vi.fn<(from: number, to: number, limit?: number) => Promise<MonitoringEventDto[]>>();
const fetchPrivacyMock = vi.fn<(query: { from: number; to: number }) => Promise<PrivacyFetchResult>>();

vi.mock('../api/monitoringEvents', () => ({
  fetchMonitoringEvents: (from: number, to: number, limit?: number) => fetchEventsMock(from, to, limit),
}));
vi.mock('../api/monitoringPrivacy', () => ({
  fetchMonitoringPrivacy: (query: { from: number; to: number }) => fetchPrivacyMock(query),
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
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('does not fetch at all while disabled, and returns an empty array', async () => {
    const { result } = renderHook(() => useMonitoringEvents([0, 1000], false));
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
      ({ enabled }) => useMonitoringEvents([0, 5000], enabled),
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

    const { result } = renderHook(() => useMonitoringEvents([0, 5000], true));
    await advance(DEBOUNCE_MS);

    expect(fetchEventsMock).toHaveBeenCalledWith(0, 5000, undefined);
    expect(result.current.events.map(e => e.t)).toEqual([1000, 3000]);
  });

  it('renders stored events even when the privacy fetch reports unsupported', async () => {
    fetchEventsMock.mockResolvedValue([storedEvent({ label: 'Calculator' })]);
    fetchPrivacyMock.mockResolvedValue({ data: null, mocked: false, unsupported: true });

    const { result } = renderHook(() => useMonitoringEvents([0, 1000], true));
    await advance(DEBOUNCE_MS);

    expect(result.current.events).toHaveLength(1);
    expect(result.current.events[0].label).toBe('Calculator');
  });

  it('renders stored events even when the privacy fetch errors', async () => {
    fetchEventsMock.mockResolvedValue([storedEvent({ label: 'Calculator' })]);
    fetchPrivacyMock.mockResolvedValue({ data: null, mocked: false, unsupported: false });

    const { result } = renderHook(() => useMonitoringEvents([0, 1000], true));
    await advance(DEBOUNCE_MS);

    expect(result.current.events).toHaveLength(1);
  });

  it('debounces a domain change instead of fetching on every render', async () => {
    const { rerender } = renderHook(
      ({ domain }: { domain: [number, number] }) => useMonitoringEvents(domain, true),
      { initialProps: { domain: [0, 1000] as [number, number] } },
    );
    await advance(DEBOUNCE_MS);
    fetchEventsMock.mockClear();

    rerender({ domain: [0, 1100] });
    rerender({ domain: [0, 1200] });
    rerender({ domain: [0, 1300] });
    await advance(50);
    expect(fetchEventsMock).not.toHaveBeenCalled();

    await advance(DEBOUNCE_MS);
    expect(fetchEventsMock).toHaveBeenCalledTimes(1);
    expect(fetchEventsMock).toHaveBeenCalledWith(0, 1300, undefined);
  });

  it('refetch() fires immediately, bypassing the domain-change debounce', async () => {
    const { result } = renderHook(() => useMonitoringEvents([0, 1000], true));
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
      ({ domain }: { domain: [number, number] }) => useMonitoringEvents(domain, true),
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
      ({ domain }: { domain: [number, number] }) => useMonitoringEvents(domain, true),
      { initialProps: { domain: [0, 1000] as [number, number] } },
    );
    await advance(DEBOUNCE_MS);
    expect(result.current.events.map(e => e.label)).toEqual(['first']);

    fetchEventsMock.mockRejectedValueOnce(new Error('network down'));
    rerender({ domain: [0, 2000] });
    await expect(advance(DEBOUNCE_MS)).resolves.toBeUndefined();

    expect(result.current.events.map(e => e.label)).toEqual(['first']);
  });

  it('reports loading true while a fetch is in flight and false once it resolves', async () => {
    const pending = deferred<MonitoringEventDto[]>();
    fetchEventsMock.mockReturnValueOnce(pending.promise);

    const { result } = renderHook(() => useMonitoringEvents([0, 1000], true));
    await act(async () => { await vi.advanceTimersByTimeAsync(DEBOUNCE_MS); });
    expect(result.current.loading).toBe(true);

    await act(async () => { pending.resolve([]); await Promise.resolve(); });
    await flush();
    expect(result.current.loading).toBe(false);
  });
});
