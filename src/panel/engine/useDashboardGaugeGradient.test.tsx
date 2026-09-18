import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_GAUGE_GRADIENT } from '../theme/gaugeGradient';

const fetchPreferencesMock = vi.fn();
const savePreferencesMock = vi.fn();

vi.mock('../../api/profiles', () => ({
  fetchPreferences: (...args: unknown[]) => fetchPreferencesMock(...args),
  savePreferences: (...args: unknown[]) => savePreferencesMock(...args),
}));

vi.mock('../../hooks/useMultiplexSocket', () => ({
  useTopicCallback: () => {},
}));

import { useDashboardGaugeGradient } from './useDashboardGaugeGradient';

const STORED = [{ at: 0.1, color: 'accent' }, { at: 0.9, color: '#ef4444' }];

beforeEach(() => {
  fetchPreferencesMock.mockReset();
  savePreferencesMock.mockReset();
  savePreferencesMock.mockResolvedValue(undefined);
});

describe('useDashboardGaugeGradient', () => {
  it('reads the profile list, keeping a docked stop', async () => {
    fetchPreferencesMock.mockResolvedValue({ panel: { dashboardGaugeGradient: STORED } });
    const { result } = renderHook(() => useDashboardGaugeGradient(true));
    await waitFor(() => expect(result.current.stops).toEqual(STORED));
  });

  it('falls back to the default when the profile has none', async () => {
    fetchPreferencesMock.mockResolvedValue({ panel: {} });
    const { result } = renderHook(() => useDashboardGaugeGradient(true));
    await waitFor(() => expect(fetchPreferencesMock).toHaveBeenCalled());
    expect(result.current.stops).toEqual(DEFAULT_GAUGE_GRADIENT);
  });

  it('never touches the profile while disabled', () => {
    renderHook(() => useDashboardGaugeGradient(false));
    expect(fetchPreferencesMock).not.toHaveBeenCalled();
  });

  it('previews locally and writes only on commit', async () => {
    fetchPreferencesMock.mockResolvedValue({ panel: {} });
    const { result } = renderHook(() => useDashboardGaugeGradient(true));
    await waitFor(() => expect(fetchPreferencesMock).toHaveBeenCalled());
    act(() => result.current.preview(STORED));
    expect(result.current.stops).toEqual(STORED);
    expect(savePreferencesMock).not.toHaveBeenCalled();
    act(() => result.current.commit(STORED));
    expect(savePreferencesMock).toHaveBeenCalledWith({ panel: { dashboardGaugeGradient: STORED } });
  });
});
