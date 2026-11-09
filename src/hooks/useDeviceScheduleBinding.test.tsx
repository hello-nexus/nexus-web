import { fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDeviceScheduleBinding } from './useDeviceScheduleBinding';

const api = vi.hoisted(() => ({
  fetchBrightnessSchedule: vi.fn(),
  setBrightnessSchedule: vi.fn().mockResolvedValue(null),
  fetchScheduleFollowDevices: vi.fn(),
  setScheduleFollowDevice: vi.fn(),
  fetchGlobalBrightness: vi.fn().mockResolvedValue({ value: 1 }),
  fetchIdleDim: vi.fn().mockResolvedValue(null),
  setIdleDim: vi.fn().mockResolvedValue(null),
}));
vi.mock('../api/lighting', () => api);
vi.mock('./useMultiplexSocket', () => ({ useTopicCallback: () => {} }));
vi.mock('../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${JSON.stringify(vars)}` : key),
  }),
}));

const schedule = (enabled: boolean) => ({
  enabled,
  points: [{ hour: 0, brightness: 40 }, { hour: 12, brightness: 40 }],
  defaults: [], sunShift: false, location: null, lightingFollows: true,
  sun: { status: 'no-location', date: '2026-03-05', sunriseMin: null, sunsetMin: null, sunPoints: [], resolvedLocation: null },
});

describe('useDeviceScheduleBinding', () => {
  beforeEach(() => {
    api.fetchBrightnessSchedule.mockReset().mockResolvedValue(schedule(true));
    api.fetchScheduleFollowDevices.mockReset().mockResolvedValue({
      devices: [{ key: 'y70', follows: false, levelPercent: 100, appliedPercent: 80 }],
    });
    api.setScheduleFollowDevice.mockReset().mockResolvedValue(null);
  });

  it('gives no binding without a key or while the service is offline', async () => {
    const noKey = renderHook(() => useDeviceScheduleBinding(null, true));
    const offline = renderHook(() => useDeviceScheduleBinding('y70', false));
    await new Promise(r => setTimeout(r, 20));
    expect(noKey.result.current.binding).toBeNull();
    expect(offline.result.current.binding).toBeNull();
    expect(api.fetchScheduleFollowDevices).not.toHaveBeenCalled();
  });

  it('binds the device to its own entry and a device the service lists as not following', async () => {
    const { result } = renderHook(() => useDeviceScheduleBinding('y70', true));
    await waitFor(() => expect(result.current.binding?.scheduleOn).toBe(true));
    await waitFor(() => expect(result.current.binding?.follows).toBe(false));
  });

  it('does not follow when the service does not list the key', async () => {
    const { result } = renderHook(() => useDeviceScheduleBinding('display-9', true));
    await waitFor(() => expect(result.current.binding).not.toBeNull());
    expect(result.current.binding?.follows).toBe(false);
  });

  it('writes the switch for its own key', async () => {
    const { result } = renderHook(() => useDeviceScheduleBinding('corsair-lcd', true));
    await waitFor(() => expect(result.current.binding).not.toBeNull());
    result.current.binding?.onFollowsChange(false);
    await waitFor(() => expect(api.setScheduleFollowDevice).toHaveBeenCalledWith('corsair-lcd', false));
  });

  it('opens the real schedule editor from the edit action', async () => {
    function Harness() {
      const { binding, modal } = useDeviceScheduleBinding('y70', true);
      return <>{binding && <button type="button" onClick={binding.onEdit}>edit</button>}{modal}</>;
    }
    render(<Harness />);
    fireEvent.click(await screen.findByText('edit'));
    expect(await screen.findByText('lighting.schedule.enable.label')).toBeInTheDocument();
  });
});
