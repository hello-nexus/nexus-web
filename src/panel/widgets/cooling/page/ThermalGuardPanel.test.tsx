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
    const { container } = render(<ThermalGuardPanel guard={null} onUndo={() => {}} onKeep={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('has no switch: the on/off control lives in Settings', () => {
    render(<ThermalGuardPanel guard={{ ...base, state: 'floor' }} onUndo={() => {}} onKeep={() => {}} />);
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('shows nothing while normal', () => {
    const { container } = render(<ThermalGuardPanel guard={base} onUndo={() => {}} onKeep={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows nothing when the guard is off, even with a heal on file', () => {
    const guard: GuardResponse = {
      ...base, state: 'off',
      heal: { undoAvailable: true, healedAtUtcMs: 1, channels: [{ id: 'a', name: 'Fan #2', hazard: 'manual-low' }] },
    };
    const { container } = render(<ThermalGuardPanel guard={guard} onUndo={() => {}} onKeep={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('treats enabled false as off even while the state still reads normal', () => {
    const { container } = render(<ThermalGuardPanel guard={{ ...base, enabled: false, watchdogLatched: true }} onUndo={() => {}} onKeep={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the latched banner when the watchdog handed the fans to the BIOS', () => {
    render(<ThermalGuardPanel guard={{ ...base, watchdogLatched: true, watchdogResumes: true }} onUndo={() => {}} onKeep={() => {}} />);
    expect(screen.getByRole('alert').textContent).toMatch(/cooling\.guard\.latched$/);
  });

  it.each([[false], [undefined]])('says only a restart or a guard toggle clears a latch when watchdogResumes is %s', (watchdogResumes) => {
    render(<ThermalGuardPanel guard={{ ...base, watchdogLatched: true, watchdogResumes }} onUndo={() => {}} onKeep={() => {}} />);
    expect(screen.getByRole('alert').textContent).toContain('cooling.guard.latchedHeld');
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
    render(<ThermalGuardPanel guard={guard} onUndo={() => {}} onKeep={() => {}} />);
    expect(screen.getByRole('alert').textContent).toMatch(text);
  });

  it('lists healed channels with an Undo that fires', () => {
    const onUndo = vi.fn();
    const guard: GuardResponse = {
      ...base,
      heal: { undoAvailable: true, healedAtUtcMs: 1, channels: [{ id: 'a', name: 'Fan #2', hazard: 'manual-low' }] },
    };
    render(<ThermalGuardPanel guard={guard} onUndo={onUndo} onKeep={() => {}} />);
    expect(screen.getByText('cooling.guard.heal.was.manualLow')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'cooling.guard.heal.undo' }));
    expect(onUndo).toHaveBeenCalled();
  });

  it('hides the heal notice once undo is no longer available', () => {
    const guard: GuardResponse = { ...base, heal: { undoAvailable: false, healedAtUtcMs: 1, channels: [{ id: 'a', name: 'Fan #2', hazard: 'manual-low' }] } };
    render(<ThermalGuardPanel guard={guard} onUndo={() => {}} onKeep={() => {}} />);
    expect(screen.queryByRole('button', { name: 'cooling.guard.heal.undo' })).toBeNull();
  });

  it('shows an error even before the guard has loaded', () => {
    render(<ThermalGuardPanel guard={null} error="save failed" onUndo={() => {}} onKeep={() => {}} />);
    expect(screen.getByRole('alert').textContent).toBe('save failed');
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('offers Undo and Keep together, and Keep fires onKeep', () => {
    const onKeep = vi.fn();
    const guard: GuardResponse = {
      ...base,
      heal: { undoAvailable: true, healedAtUtcMs: 1, channels: [{ id: 'a', name: 'Fan #2', hazard: 'manual-low' }] },
    };
    render(<ThermalGuardPanel guard={guard} onUndo={() => {}} onKeep={onKeep} />);
    const buttons = screen.getAllByRole('button').map(b => b.textContent);
    expect(buttons).toEqual(['cooling.guard.heal.undo', 'cooling.guard.heal.keep']);
    fireEvent.click(screen.getByRole('button', { name: 'cooling.guard.heal.keep' }));
    expect(onKeep).toHaveBeenCalled();
  });

  it.each([
    ['floor', 'warning'],
    ['tripped', 'warning'],
    ['escalated', 'critical'],
  ] as const)('shows the %s banner in the %s tone', (state, tone) => {
    render(<ThermalGuardPanel guard={{ ...base, state }} onUndo={() => {}} onKeep={() => {}} />);
    expect(screen.getByRole('alert').getAttribute('data-tone')).toBe(tone);
  });

  it('shows the latched banner and an error in the critical tone', () => {
    render(<ThermalGuardPanel guard={{ ...base, watchdogLatched: true }} error="oops" onUndo={() => {}} onKeep={() => {}} />);
    expect(screen.getAllByRole('alert').map(a => a.getAttribute('data-tone'))).toEqual(['critical', 'critical']);
  });
});
