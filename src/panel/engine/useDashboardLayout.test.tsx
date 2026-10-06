import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PanelLayout } from '../types';
import { defaultLayoutForDashboard } from './defaultLayout';

const fetchPreferencesMock = vi.fn();
const savePreferencesMock = vi.fn();
const broadcastLayoutChangedMock = vi.fn();

vi.mock('../../api/profiles', () => ({
  fetchPreferences: (...args: unknown[]) => fetchPreferencesMock(...args),
  savePreferences: (...args: unknown[]) => savePreferencesMock(...args),
}));

vi.mock('../../hooks/useMultiplexSocket', () => ({
  useTopicCallback: () => {},
}));

vi.mock('./panelSync', () => ({
  broadcastLayoutChanged: () => broadcastLayoutChangedMock(),
  onLayoutChanged: () => () => {},
}));

// defaultLayout.ts reads from the install-defaults cache. Stub the cache
// with the canonical layouts so the seeded-desktop test assertion (clock +
// monitoring widgets) matches the install-defaults.json values.
vi.mock('../../api/installDefaultsCache', () => ({
  preloadInstallDefaults: () => Promise.resolve(null),
  getInstallDefaults: () => ({
    panel: {
      layouts: {
        desktop: {
          layoutSchemaVersion: 2,
          surface: 'desktop',
          widgets: [
            { type: 'clock',      size: '4x2', col: 0, row: 0 },
            { type: 'monitoring', size: '4x4', col: 0, row: 2 },
          ],
        },
        y70:   { layoutSchemaVersion: 2, surface: 'y70',   widgets: [] },
        phone: { layoutSchemaVersion: 2, surface: 'phone', widgets: [] },
        q60:   { layoutSchemaVersion: 2, surface: 'q60',   widgets: [] },
      },
    },
  }),
}));

import { useDashboardLayout } from './useDashboardLayout';

beforeEach(() => {
  fetchPreferencesMock.mockReset();
  savePreferencesMock.mockReset();
  broadcastLayoutChangedMock.mockReset();
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('useDashboardLayout', () => {
  it('uses the seeded desktop layout when preferences have no dashboard layout', async () => {
    fetchPreferencesMock.mockResolvedValue({});

    const { result } = renderHook(() => useDashboardLayout());

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.layout.surface).toBe('desktop');
    expect(result.current.layout.pages[0].widgets.map(w => w.type)).toEqual([
      'clock',
      'monitoring',
    ]);
  });

  it('normalizes and persists through profile preferences', async () => {
    const savedLayout: PanelLayout = {
      layoutSchemaVersion: 2,
      surface: 'desktop',
      pages: [
        {
          id: 'p1',
          widgets: [
            { id: 'w1', type: 'clock', size: '4x4', col: 0, row: 0 },
            { id: 'bad', type: 'does-not-exist', size: '4x4', col: 4, row: 0 },
          ],
        },
      ],
    };
    fetchPreferencesMock.mockResolvedValue({ panel: { dashboardLayout: savedLayout } });
    savePreferencesMock.mockResolvedValue({ error: false, msg: 'ok' });

    const { result } = renderHook(() => useDashboardLayout());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    expect(result.current.layout.pages[0].widgets.map(w => w.id)).toEqual(['w1']);

    act(() => {
      result.current.setLayout(defaultLayoutForDashboard());
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(savePreferencesMock).toHaveBeenCalledWith({
      panel: { dashboardLayout: expect.objectContaining({ surface: 'desktop' }) },
    });
    expect(broadcastLayoutChangedMock).toHaveBeenCalledTimes(1);
  });

  const single = (type: string): PanelLayout => ({
    layoutSchemaVersion: 2,
    surface: 'desktop',
    pages: [{ id: 'p1', widgets: [{ id: `w-${type}`, type, size: '4x4', col: 0, row: 0 }] }],
  });
  const savedTypes = () => savePreferencesMock.mock.calls.map(
    ([body]) => (body as { panel: { dashboardLayout: PanelLayout } }).panel.dashboardLayout.pages[0].widgets[0].type,
  );

  it('saves an edit still under the debounce when it unmounts', async () => {
    fetchPreferencesMock.mockResolvedValue({ panel: { dashboardLayout: single('clock') } });
    savePreferencesMock.mockResolvedValue({ error: false, msg: 'ok' });
    const { result, unmount } = renderHook(() => useDashboardLayout());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    act(() => { result.current.setLayout(single('weather')); });
    unmount();

    expect(savedTypes()).toEqual(['weather']);
  });

  it('replaceFromService saves pending edits first, drops edits made meanwhile, and reloads', async () => {
    fetchPreferencesMock.mockResolvedValue({ panel: { dashboardLayout: single('clock') } });
    savePreferencesMock.mockResolvedValue({ error: false, msg: 'ok' });
    const { result } = renderHook(() => useDashboardLayout());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    let finishSwitch!: (value: string) => void;
    const op = vi.fn(() => new Promise<string>(resolve => { finishSwitch = resolve; }));
    act(() => { result.current.setLayout(single('weather')); });
    let switched!: Promise<string>;
    act(() => { switched = result.current.replaceFromService(op); });
    await waitFor(() => expect(op).toHaveBeenCalled());
    expect(savedTypes()).toEqual(['weather']);

    act(() => { result.current.setLayout(single('timer')); });
    fetchPreferencesMock.mockResolvedValue({ panel: { dashboardLayout: single('calendar') } });
    await act(async () => {
      finishSwitch('done');
      await expect(switched).resolves.toBe('done');
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(result.current.layout.pages[0].widgets[0].type).toBe('calendar');
    expect(savedTypes()).toEqual(['weather']);
  });

  it('keeps edits off until the last of two overlapping switches lands', async () => {
    fetchPreferencesMock.mockResolvedValue({ panel: { dashboardLayout: single('clock') } });
    savePreferencesMock.mockResolvedValue({ error: false, msg: 'ok' });
    const { result } = renderHook(() => useDashboardLayout());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    const finish: Array<() => void> = [];
    const op = () => new Promise<void>(resolve => { finish.push(resolve); });
    let first!: Promise<void>;
    act(() => {
      first = result.current.replaceFromService(op);
      void result.current.replaceFromService(op);
    });
    await waitFor(() => expect(finish).toHaveLength(2));
    await act(async () => {
      finish[0]();
      await first;
    });

    act(() => { result.current.setLayout(single('timer')); });
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(savedTypes()).toEqual([]);
  });

  it('applies only the latest fetch when an older one resolves late', async () => {
    let resolveOld!: (prefs: unknown) => void;
    fetchPreferencesMock.mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; }));
    fetchPreferencesMock.mockResolvedValue({ panel: { dashboardLayout: single('calendar') } });
    const { result } = renderHook(() => useDashboardLayout());
    await act(async () => { await result.current.replaceFromService(() => Promise.resolve()); });
    expect(result.current.layout.pages[0].widgets[0].type).toBe('calendar');

    await act(async () => { resolveOld({ panel: { dashboardLayout: single('clock') } }); });

    expect(result.current.layout.pages[0].widgets[0].type).toBe('calendar');
  });
});
