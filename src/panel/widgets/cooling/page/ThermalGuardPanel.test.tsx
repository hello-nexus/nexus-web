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
    const { container } = render(<ThermalGuardPanel guard={null} onUndo={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('has no switch: the on/off control lives in Settings', () => {
    render(<ThermalGuardPanel guard={{ ...base, state: 'floor' }} onUndo={() => {}} />);
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('shows nothing while normal', () => {
    const { container } = render(<ThermalGuardPanel guard={base} onUndo={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows nothing when the guard is off, even with a heal on file', () => {
    const guard: GuardResponse = {
      ...base, state: 'off',
      heal: { undoAvailable: true, healedAtUtcMs: 1, channels: [{ id: 'a', name: 'Fan #2', hazard: 'manual-low' }] },
    };
    const { container } = render(<ThermalGuardPanel guard={guard} onUndo={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the latched banner when the watchdog handed the fans to the BIOS', () => {
    render(<ThermalGuardPanel guard={{ ...base, watchdogLatched: true }} onUndo={() => {}} />);
    expect(screen.getByRole('alert').textContent).toContain('cooling.guard.latched');
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
    render(<ThermalGuardPanel guard={guard} onUndo={() => {}} />);
    expect(screen.getByRole('alert').textContent).toMatch(text);
  });

  it('lists healed channels with an Undo that fires', () => {
    const onUndo = vi.fn();
    const guard: GuardResponse = {
      ...base,
      heal: { undoAvailable: true, healedAtUtcMs: 1, channels: [{ id: 'a', name: 'Fan #2', hazard: 'manual-low' }] },
    };
    render(<ThermalGuardPanel guard={guard} onUndo={onUndo} />);
    expect(screen.getByText('cooling.guard.hazard.manualLow')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'cooling.guard.heal.undo' }));
    expect(onUndo).toHaveBeenCalled();
  });

  it('hides the heal notice once undo is no longer available', () => {
    const guard: GuardResponse = { ...base, heal: { undoAvailable: false, healedAtUtcMs: 1, channels: [{ id: 'a', name: 'Fan #2', hazard: 'manual-low' }] } };
    render(<ThermalGuardPanel guard={guard} onUndo={() => {}} />);
    expect(screen.queryByRole('button', { name: 'cooling.guard.heal.undo' })).toBeNull();
  });

  it('shows an error even before the guard has loaded', () => {
    render(<ThermalGuardPanel guard={null} error="save failed" onUndo={() => {}} />);
    expect(screen.getByRole('alert').textContent).toBe('save failed');
    expect(screen.queryByRole('switch')).toBeNull();
  });
});
