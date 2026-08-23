import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StaticDeviceSelect } from './StaticDeviceSelect';
import type { LightingDevice } from '../../../../api/lighting';

vi.mock('../../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
    language: 'en',
  }),
}));

function device(id: string, name: string): LightingDevice {
  return {
    id, name, ledsOn: true, ledCount: 10,
    canvasX: 0, canvasY: 0, canvasW: 1, canvasH: 1, canvasRotation: 0,
  };
}

const devices = [device('a', 'Case Strip'), device('b', 'AIO Pump')];

describe('StaticDeviceSelect', () => {
  it('lists every device', () => {
    render(<StaticDeviceSelect devices={devices} selectedIds={new Set()} onSetSelection={vi.fn()} />);
    expect(screen.getByText('Case Strip')).toBeInTheDocument();
    expect(screen.getByText('AIO Pump')).toBeInTheDocument();
  });

  // Touch has no Cmd/Ctrl, so a tap has to toggle rather than replace - picking
  // a second device must not drop the first.
  it('toggles additively instead of replacing the selection', () => {
    const onSetSelection = vi.fn();
    render(<StaticDeviceSelect devices={devices} selectedIds={new Set(['a'])} onSetSelection={onSetSelection} />);

    fireEvent.click(screen.getByText('AIO Pump'));
    expect([...onSetSelection.mock.calls[0][0]].sort()).toEqual(['a', 'b']);
  });

  it('deselects a device that is already selected', () => {
    const onSetSelection = vi.fn();
    render(<StaticDeviceSelect devices={devices} selectedIds={new Set(['a', 'b'])} onSetSelection={onSetSelection} />);

    fireEvent.click(screen.getByText('Case Strip'));
    expect([...onSetSelection.mock.calls[0][0]]).toEqual(['b']);
  });

  it('selects all and clears', () => {
    const onSetSelection = vi.fn();
    const { rerender } = render(
      <StaticDeviceSelect devices={devices} selectedIds={new Set()} onSetSelection={onSetSelection} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'lighting.ledMap.selectAll' }));
    expect([...onSetSelection.mock.calls[0][0]].sort()).toEqual(['a', 'b']);

    rerender(<StaticDeviceSelect devices={devices} selectedIds={new Set(['a', 'b'])} onSetSelection={onSetSelection} />);
    fireEvent.click(screen.getByRole('button', { name: 'lighting.ledMap.selectNone' }));
    expect([...onSetSelection.mock.calls[1][0]]).toEqual([]);
  });

  // The strip must read THIS device's assignment. Without a pick it samples the
  // shared effect canvas, which in a per-device mode shows something unrelated -
  // it reads as a stale readout on every card.
  it('gives each card its own pick rather than the shared canvas', () => {
    const ledPickFor = vi.fn((id: string) => (
      id === 'a' ? { key: 'flat:red-3', hex: '#ff0000', slot: 0, version: '1' } : undefined
    ));
    render(
      <StaticDeviceSelect
        devices={devices}
        selectedIds={new Set()}
        onSetSelection={vi.fn()}
        ledPickFor={ledPickFor}
      />,
    );
    expect(ledPickFor).toHaveBeenCalledWith('a');
    expect(ledPickFor).toHaveBeenCalledWith('b');
  });

  it('shows the empty state when no lighting devices exist', () => {
    render(<StaticDeviceSelect devices={[]} selectedIds={new Set()} onSetSelection={vi.fn()} />);
    expect(screen.getByText('lighting.devices.empty')).toBeInTheDocument();
  });
});
