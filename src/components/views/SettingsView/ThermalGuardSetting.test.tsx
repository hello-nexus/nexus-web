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

  it('shows the switch off when the guard is off', () => {
    view({ ...base, state: 'off' });
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false');
  });

  it('disables the controls while a write is pending', () => {
    view(base, { pending: true });
    expect(screen.getByRole('switch')).toBeDisabled();
    expect(screen.getByRole('slider')).toBeDisabled();
  });

  it('shows an inline error', () => {
    view(base, { error: 'nope' });
    expect(screen.getByRole('alert').textContent).toContain('nope');
  });

  it('notes an unreadable CPU temperature', () => {
    view({ ...base, state: 'inactive' });
    expect(screen.getByRole('status').textContent).toContain('cooling.guard.inactive');
  });

  it('shows a hardware limit as a read-only line with no slider', () => {
    view({ ...base, limitC: 100, limitSource: 'hardware', detectedLimitC: 100, detectedLimitSource: 'hardware' });
    expect(screen.getByText('cooling.guard.limit.hardware')).toBeTruthy();
    expect(screen.queryByRole('slider')).toBeNull();
  });

  it('shows a slider for a spec limit with the detected value, note, and no reset', () => {
    view(base);
    const slider = screen.getByRole('slider') as HTMLInputElement;
    expect(slider.min).toBe('80');
    expect(slider.max).toBe('120');
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
});
