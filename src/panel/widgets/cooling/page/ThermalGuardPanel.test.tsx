import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { GuardResponse } from '../../../../api/cooling';
import { ThermalGuardPanel } from './ThermalGuardPanel';

// Rendered outside I18nProvider, so t() falls back to raw keys.

const base: GuardResponse = {
  state: 'normal', guardTempC: 60, limitC: 100, limitSource: 'hardware', sinceUtcMs: null, lastTrip: null,
  heal: { undoAvailable: false, healedAtUtcMs: null, channels: [] },
};

describe('ThermalGuardPanel', () => {
  it('renders nothing before the guard loads', () => {
    const { container } = render(<ThermalGuardPanel guard={null} onToggle={() => {}} onUndo={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the switch on and no banner while normal', () => {
    render(<ThermalGuardPanel guard={base} onToggle={() => {}} onUndo={() => {}} />);
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows the switch off, and nothing else, when the guard is off', () => {
    render(<ThermalGuardPanel guard={{ ...base, state: 'off' }} onToggle={() => {}} onUndo={() => {}} />);
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('reports the next value when toggled', () => {
    const onToggle = vi.fn();
    render(<ThermalGuardPanel guard={base} onToggle={onToggle} onUndo={() => {}} />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onToggle).toHaveBeenCalledWith(false);
  });

  it.each([
    ['floor', null, /banner\.floor/],
    ['tripped', 'limit', /banner\.tripLimit/],
    ['tripped', 'cooling-loss', /banner\.tripLoss/],
    ['escalated', 'limit', /banner\.escalated/],
  ] as const)('shows the %s banner (%s)', (state, reason, text) => {
    const guard: GuardResponse = {
      ...base, state,
      lastTrip: reason ? { atUtcMs: 1, peakC: 99, reason, escalated: state === 'escalated' } : null,
    };
    render(<ThermalGuardPanel guard={guard} onToggle={() => {}} onUndo={() => {}} />);
    expect(screen.getByRole('alert').textContent).toMatch(text);
  });

  it('lists healed channels with an Undo that fires', () => {
    const onUndo = vi.fn();
    const guard: GuardResponse = {
      ...base,
      heal: { undoAvailable: true, healedAtUtcMs: 1, channels: [{ id: 'a', name: 'Fan #2', hazard: 'manual-low' }] },
    };
    render(<ThermalGuardPanel guard={guard} onToggle={() => {}} onUndo={onUndo} />);
    expect(screen.getByText('cooling.guard.hazard.manualLow')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'cooling.guard.heal.undo' }));
    expect(onUndo).toHaveBeenCalled();
  });

  it('hides the heal notice once undo is no longer available', () => {
    const guard: GuardResponse = { ...base, heal: { undoAvailable: false, healedAtUtcMs: 1, channels: [{ id: 'a', name: 'Fan #2', hazard: 'manual-low' }] } };
    render(<ThermalGuardPanel guard={guard} onToggle={() => {}} onUndo={() => {}} />);
    expect(screen.queryByRole('button', { name: 'cooling.guard.heal.undo' })).toBeNull();
  });

  it('says the guard cannot act when the CPU temperature is unreadable', () => {
    render(<ThermalGuardPanel guard={{ ...base, state: 'inactive', guardTempC: null }} onToggle={() => {}} onUndo={() => {}} />);
    expect(screen.getByRole('status').textContent).toContain('cooling.guard.inactive');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('disables the switch while a toggle is in flight', () => {
    render(<ThermalGuardPanel guard={base} toggling onToggle={() => {}} onUndo={() => {}} />);
    expect(screen.getByRole('switch')).toBeDisabled();
  });

  it('shows an error even before the guard has loaded', () => {
    render(<ThermalGuardPanel guard={null} error="save failed" onToggle={() => {}} onUndo={() => {}} />);
    expect(screen.getByRole('alert').textContent).toBe('save failed');
    expect(screen.queryByRole('switch')).toBeNull();
  });
});
