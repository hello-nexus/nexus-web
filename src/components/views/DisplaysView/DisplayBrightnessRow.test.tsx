import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DisplayBrightnessRow } from './DisplayBrightnessRow';

const api = vi.hoisted(() => ({
  fetchDisplays: vi.fn(),
  setDisplayBrightness: vi.fn().mockResolvedValue(null),
}));
vi.mock('../../../api/displays', () => api);
vi.mock('../../../hooks/useMultiplexSocket', () => ({ useTopicCallback: () => {} }));
const sched = vi.hoisted(() => ({ useDeviceScheduleBinding: vi.fn() }));
vi.mock('../../../hooks/useDeviceScheduleBinding', () => sched);
vi.mock('../../../lib/i18n', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

const display = (supported: boolean, current: number | null = 70) => ({
  displays: [{ id: 'DEL-A0B8', brightnessControl: { supported, current } }],
});

describe('DisplayBrightnessRow', () => {
  beforeEach(() => {
    api.fetchDisplays.mockReset();
    api.setDisplayBrightness.mockClear();
    sched.useDeviceScheduleBinding.mockReset().mockReturnValue({ binding: null, modal: null });
  });

  it('renders nothing while the display does not report DDC brightness', async () => {
    api.fetchDisplays.mockResolvedValue(display(false));
    const { container } = render(<DisplayBrightnessRow displayId="DEL-A0B8" />);
    await waitFor(() => expect(api.fetchDisplays).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
    expect(sched.useDeviceScheduleBinding).toHaveBeenLastCalledWith(null, true);
  });

  it('shows the slider keyed by the display id and writes through the display API', async () => {
    api.fetchDisplays.mockResolvedValue(display(true, 70));
    render(<DisplayBrightnessRow displayId="DEL-A0B8" />);
    const slider = await screen.findByRole('slider', { name: 'devices.y70.brightness' });
    expect(slider).toHaveValue('70');
    expect(sched.useDeviceScheduleBinding).toHaveBeenLastCalledWith('DEL-A0B8', true);
    // A drag step moves the local value only; the write is the commit's alone.
    fireEvent.change(slider, { target: { value: '40' } });
    expect(api.setDisplayBrightness).not.toHaveBeenCalled();
    fireEvent.pointerUp(slider);
    await waitFor(() => expect(api.setDisplayBrightness).toHaveBeenCalledWith('DEL-A0B8', 40));
    expect(api.setDisplayBrightness).toHaveBeenCalledTimes(1);
  });
});
