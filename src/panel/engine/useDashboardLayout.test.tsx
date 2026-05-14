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

// defaultLayout.ts now reads from the install-defaults cache. Stub the cache
// with the canonical layouts so the seeded-desktop test assertion (clock +
// monitoring widgets) matches the canonical install-defaults.json values.
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
});
