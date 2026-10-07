import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { GuardResponse } from '../../../api/cooling';
import { ThermalGuardSettingView } from './ThermalGuardSetting';

// Rendered outside I18nProvider, so t() falls back to raw keys.

const base: GuardResponse = {
  state: 'normal', guardTempC: 55, limitC: 95, limitSource: 'spec',
  detectedLimitC: 95, detectedLimitSource: 'spec', limitOverrideC: null,
  sinceUtcMs: null, lastTrip: null,
  heal: { undoAvailable: false, healedAtUtcMs: null, channels: [] },
};

function view(guard: GuardResponse, over: Partial<{ pending: boolean; error: string | null }> = {}) {
  const handlers = { onToggle: vi.fn(), onSetLimit: vi.fn(), onClearLimit: vi.fn() };
  render(<ThermalGuardSettingView guard={guard} pending={over.pending ?? false} error={over.error ?? null} {...handlers} />);
  return handlers;
}

describe('ThermalGuardSettingView', () => {
  it('shows the switch on and toggles it', () => {
    const h = view(base);
    const sw = screen.getByRole('switch', { name: 'cooling.guard.label' });
    expect(sw.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(sw);
    expect(h.onToggle).toHaveBeenCalledWith(false);
  });

  it('drives the switch from enabled, so a lagging state does not flip it', () => {
    view({ ...base, enabled: false, state: 'normal' });
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false');
  });

  it('shows the switch off when the guard is off', () => {
    view({ ...base, state: 'off' });
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false');
  });

  it('disables the switch while a write is pending, but not the slider or Reset', () => {
    view({ ...base, limitC: 102, limitSource: 'user', limitOverrideC: 102 }, { pending: true });
    expect(screen.getByRole('switch')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'cooling.guard.limit.reset' })).not.toBeDisabled();
    // Disabling the slider would drop keyboard focus mid-adjustment.
    expect(screen.getByRole('slider')).not.toBeDisabled();
  });

  it('shows an inline error', () => {
    view(base, { error: 'nope' });
    expect(screen.getByRole('alert').textContent).toContain('nope');
  });

  it('notes an unreadable CPU temperature', () => {
    view({ ...base, state: 'inactive' });
    expect(screen.getByRole('status').textContent).toContain('cooling.guard.inactive');
  });

  it('shows the slider for a hardware limit too, preset to the detected value', () => {
    view({ ...base, limitC: 100, limitSource: 'hardware', detectedLimitC: 100, detectedLimitSource: 'hardware' });
    expect((screen.getByRole('slider') as HTMLInputElement).value).toBe('100');
    expect(screen.getByText(/cooling\.guard\.limit\.detectedHardware/)).toBeTruthy();
  });

  it('shows a slider for a spec limit with the detected value, note, and no reset', () => {
    view(base);
    const slider = screen.getByRole('slider') as HTMLInputElement;
    expect(slider.min).toBe('90');
    expect(slider.max).toBe('110');
    expect(slider.value).toBe('95');
    expect(screen.getByText(/cooling\.guard\.limit\.detectedSpec/)).toBeTruthy();
    expect(screen.getByText(/cooling\.guard\.limit\.note/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'cooling.guard.limit.reset' })).toBeNull();
  });

  it('names the default source when nothing better is known', () => {
    view({ ...base, detectedLimitSource: 'default' });
    expect(screen.getByText(/cooling\.guard\.limit\.detectedDefault/)).toBeTruthy();
  });

  it('commits on release, not on every drag tick', () => {
    const h = view(base);
    const slider = screen.getByRole('slider');
    fireEvent.pointerDown(slider);
    fireEvent.change(slider, { target: { value: '100' } });
    fireEvent.change(slider, { target: { value: '102' } });
    expect(h.onSetLimit).not.toHaveBeenCalled();
    fireEvent.pointerUp(slider);
    return vi.waitFor(() => { expect(h.onSetLimit).toHaveBeenCalledExactlyOnceWith(102); });
  });

  it('shows the override and a Reset that clears it', () => {
    const h = view({ ...base, limitC: 102, limitSource: 'user', limitOverrideC: 102 });
    expect((screen.getByRole('slider') as HTMLInputElement).value).toBe('102');
    fireEvent.click(screen.getByRole('button', { name: 'cooling.guard.limit.reset' }));
    expect(h.onClearLimit).toHaveBeenCalled();
  });

  const off = { ...base, state: 'off' as const, limitC: undefined, limitSource: undefined, limitOverrideC: 102 };

  it('reads the override while the guard is off, and dragging back to the detected value still writes', async () => {
    const h = view(off);
    const slider = screen.getByRole('slider') as HTMLInputElement;
    expect(slider.value).toBe('102');
    fireEvent.pointerDown(slider);
    fireEvent.change(slider, { target: { value: '95' } });
    fireEvent.pointerUp(slider);
    await vi.waitFor(() => { expect(h.onSetLimit).toHaveBeenCalledExactlyOnceWith(95); });
  });

  it('shows the pending limit instead of the server value until it is confirmed', () => {
    render(<ThermalGuardSettingView guard={off} pending pendingLimit={100} error={null} onToggle={() => {}} onSetLimit={() => {}} onClearLimit={() => {}} />);
    expect((screen.getByRole('slider') as HTMLInputElement).value).toBe('100');
  });

  it('shows the detected value while a reset is pending', () => {
    render(<ThermalGuardSettingView guard={off} pending pendingLimit="reset" error={null} onToggle={() => {}} onSetLimit={() => {}} onClearLimit={() => {}} />);
    expect((screen.getByRole('slider') as HTMLInputElement).value).toBe('95');
  });

  it('sends one write for a burst of keyboard steps', async () => {
    const h = view(base);
    const slider = screen.getByRole('slider');
    for (const v of ['96', '97', '98']) {
      fireEvent.change(slider, { target: { value: v } });
      fireEvent.keyUp(slider);
    }
    await vi.waitFor(() => { expect(h.onSetLimit).toHaveBeenCalledExactlyOnceWith(98); });
  });

  const notchLeft = () => (screen.getByText('cooling.guard.limit.throttleMark').parentElement as HTMLElement).style.left;

  it('bounds the bar at 90 to 110 for a 95 degree part', () => {
    view(base);
    const slider = screen.getByRole('slider') as HTMLInputElement;
    expect([slider.min, slider.max]).toEqual(['90', '110']);
  });

  it('extends the bar to include an 89 degree part, preset to it', () => {
    view({ ...base, limitC: 89, detectedLimitC: 89 });
    const slider = screen.getByRole('slider') as HTMLInputElement;
    expect([slider.min, slider.max, slider.value]).toEqual(['89', '110', '89']);
  });

  it('draws the throttle-point notch at the detected value', () => {
    view(base);
    expect(notchLeft()).toBe('25%');
  });

  it('keeps the notch at the detected value while an override is set', () => {
    view({ ...base, limitC: 102, limitSource: 'user', limitOverrideC: 102 });
    expect(notchLeft()).toBe('25%');
    expect((screen.getByRole('slider') as HTMLInputElement).value).toBe('102');
  });
});
