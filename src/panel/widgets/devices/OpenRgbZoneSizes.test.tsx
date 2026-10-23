import { act, fireEvent, render, screen } from '@testing-library/react';
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

  const drag = (slider: HTMLElement, value: string) => {
    fireEvent.pointerDown(slider);
    fireEvent.change(slider, { target: { value } });
    fireEvent.pointerUp(window);
  };

  it('applies a value on release and reports a refused write', async () => {
    const onSetSize = vi.fn(() => Promise.resolve(false));
    const onFailed = vi.fn();
    render(<OpenRgbZoneSizes onSetSize={onSetSize} onFailed={onFailed} device={device([zone({ index: 3 })])} />);
    drag(screen.getByRole('slider'), '12');
    await vi.waitFor(() => expect(onSetSize).toHaveBeenCalledWith('openrgb-1', 3, 12));
    await vi.waitFor(() => expect(onFailed).toHaveBeenCalled());
  });

  it('keeps the chosen count shown until the write settles', async () => {
    let settle: (ok: boolean) => void = () => undefined;
    const onSetSize = vi.fn(() => new Promise<boolean>(r => { settle = r; }));
    render(<OpenRgbZoneSizes onSetSize={onSetSize} device={device([zone({ ledCount: 12, needsSize: false })])} />);
    fireEvent.click(screen.getByRole('button', { name: /zoneSizesToggle/ }));
    const slider = screen.getByRole('slider') as HTMLInputElement;
    drag(slider, '20');
    await vi.waitFor(() => expect(onSetSize).toHaveBeenCalledWith('openrgb-1', 0, 20));
    expect(slider.value).toBe('20');
    await act(async () => { settle(true); });
    await vi.waitFor(() => expect(slider.value).toBe('12'));
  });

  it('does not confirm an unsized zone on a key press alone', async () => {
    const onSetSize = vi.fn(() => Promise.resolve(true));
    render(<OpenRgbZoneSizes onSetSize={onSetSize} device={device([zone({})])} />);
    const slider = screen.getByRole('slider');
    fireEvent.keyUp(slider, { key: 'Tab' });
    await new Promise(r => setTimeout(r, 20));
    expect(onSetSize).not.toHaveBeenCalled();
  });

  it('confirms an unsized zone at the value it shows on a plain release', async () => {
    const onSetSize = vi.fn(() => Promise.resolve(true));
    render(<OpenRgbZoneSizes onSetSize={onSetSize} device={device([zone({ index: 2, ledCount: 5 })])} />);
    const slider = screen.getByRole('slider');
    fireEvent.pointerDown(slider);
    fireEvent.pointerUp(window);
    await vi.waitFor(() => expect(onSetSize).toHaveBeenCalledWith('openrgb-1', 2, 5));
  });

  it('confirms an unsized zone stored below its minimum at the minimum', async () => {
    const onSetSize = vi.fn(() => Promise.resolve(true));
    render(<OpenRgbZoneSizes onSetSize={onSetSize} device={device([zone({ index: 2, ledCount: 0, ledsMin: 3 })])} />);
    const slider = screen.getByRole('slider');
    fireEvent.pointerDown(slider);
    fireEvent.pointerUp(window);
    await vi.waitFor(() => expect(onSetSize).toHaveBeenCalledWith('openrgb-1', 2, 3));
  });

  it('keeps an in-flight write draft when a later release changes nothing', async () => {
    let settle: (ok: boolean) => void = () => undefined;
    const onSetSize = vi.fn(() => new Promise<boolean>(r => { settle = r; }));
    render(<OpenRgbZoneSizes onSetSize={onSetSize} device={device([zone({ ledCount: 12, needsSize: false })])} />);
    fireEvent.click(screen.getByRole('button', { name: /zoneSizesToggle/ }));
    const slider = screen.getByRole('slider') as HTMLInputElement;
    drag(slider, '20');
    await vi.waitFor(() => expect(onSetSize).toHaveBeenCalledTimes(1));
    fireEvent.pointerDown(slider);
    fireEvent.pointerUp(window);
    await new Promise(r => setTimeout(r, 20));
    expect(onSetSize).toHaveBeenCalledTimes(1);
    expect(slider.value).toBe('20');
    await act(async () => { settle(true); });
  });

  it('does not confirm an unsized zone on a right-click release', async () => {
    const onSetSize = vi.fn(() => Promise.resolve(true));
    render(<OpenRgbZoneSizes onSetSize={onSetSize} device={device([zone({ ledCount: 5 })])} />);
    const slider = screen.getByRole('slider');
    fireEvent.pointerDown(slider, { button: 2 });
    fireEvent.pointerUp(window);
    await new Promise(r => setTimeout(r, 20));
    expect(onSetSize).not.toHaveBeenCalled();
  });

  it('forgets a cancelled press so a later key press cannot confirm', async () => {
    const onSetSize = vi.fn(() => Promise.resolve(true));
    render(<OpenRgbZoneSizes onSetSize={onSetSize} device={device([zone({ ledCount: 5 })])} />);
    const slider = screen.getByRole('slider');
    fireEvent.pointerDown(slider, { button: 0 });
    fireEvent.pointerCancel(slider);
    fireEvent.keyUp(slider, { key: 'Tab' });
    await new Promise(r => setTimeout(r, 20));
    expect(onSetSize).not.toHaveBeenCalled();
  });

  it('cues an unsized zone as not set and lets Enter confirm the shown count', async () => {
    const onSetSize = vi.fn(() => Promise.resolve(true));
    render(<OpenRgbZoneSizes onSetSize={onSetSize} device={device([zone({ index: 4, ledCount: 5 })])} />);
    const slider = screen.getByRole('slider');
    expect(slider.getAttribute('aria-valuetext')).toBe('devices.openrgb.zoneUnset');
    expect(screen.getByText('5')).toBeTruthy();
    fireEvent.keyDown(slider, { key: 'Enter' });
    await vi.waitFor(() => expect(onSetSize).toHaveBeenCalledWith('openrgb-1', 4, 5));
  });
});
