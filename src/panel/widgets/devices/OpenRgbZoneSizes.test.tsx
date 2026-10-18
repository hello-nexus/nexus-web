import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { OpenRgbZone, OpenRgbZoneDevice } from '../../../api/openRgbZones';

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { OpenRgbZoneSizes } from './OpenRgbZoneSizes';

const zone = (over: Partial<OpenRgbZone>): OpenRgbZone => ({
  index: 0, name: 'Fan 1', ledCount: 0, ledsMin: 0, ledsMax: 34, resizable: true, needsSize: true, ...over,
});
const device = (zones: OpenRgbZone[]): OpenRgbZoneDevice => ({ deviceId: 'openrgb-1', name: 'Commander Core', zones });

describe('OpenRgbZoneSizes', () => {
  it('shows the prompt and one slider per sizable zone, spanning the range', () => {
    render(<OpenRgbZoneSizes onSetSize={vi.fn()} device={device([
      zone({ index: 0, name: 'Pump', resizable: false, needsSize: false }),
      zone({ index: 1, name: 'Fan 1' }),
      zone({ index: 2, name: 'Fan 2', ledsMax: 20 }),
    ])} />);
    expect(screen.getByText('devices.openrgb.zoneSizePrompt')).toBeTruthy();
    expect(screen.queryByText('Pump')).toBeNull();
    const sliders = screen.getAllByRole('slider') as HTMLInputElement[];
    expect(sliders).toHaveLength(2);
    expect(sliders[0].min).toBe('0');
    expect(sliders[0].max).toBe('34');
    expect(sliders[1].max).toBe('20');
  });

  it('omits the prompt and starts collapsed once every zone is sized', () => {
    render(<OpenRgbZoneSizes onSetSize={vi.fn()} device={device([zone({ needsSize: false, ledCount: 12 })])} />);
    expect(screen.queryByText('devices.openrgb.zoneSizePrompt')).toBeNull();
    expect(screen.queryByRole('slider')).toBeNull();
  });

  it('renders nothing when no zone has a range', () => {
    const { container } = render(<OpenRgbZoneSizes onSetSize={vi.fn()} device={device([zone({ resizable: false })])} />);
    expect(container.firstChild).toBeNull();
  });

  it('clamps a stored count above the range for display', () => {
    render(<OpenRgbZoneSizes onSetSize={vi.fn()} device={device([zone({ ledCount: 99 })])} />);
    expect((screen.getByRole('slider') as HTMLInputElement).value).toBe('34');
  });

  it('applies a value on release and warns when the service refuses it', async () => {
    const onSetSize = vi.fn(() => Promise.resolve(false));
    render(<OpenRgbZoneSizes onSetSize={onSetSize} device={device([zone({ index: 3 })])} />);
    const slider = screen.getByRole('slider');
    fireEvent.change(slider, { target: { value: '12' } });
    fireEvent.pointerDown(slider);
    fireEvent.pointerUp(window);
    await vi.waitFor(() => expect(onSetSize).toHaveBeenCalledWith('openrgb-1', 3, 12));
    expect(await screen.findByText('devices.openrgb.zoneSizeFailed')).toBeTruthy();
  });
});
