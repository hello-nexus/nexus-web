import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DevicePanel } from './DevicePanel';
import type { LightingDevice, Pin } from '../../../../api/lighting';
import type { DeviceGroup } from '../../../../lib/deviceGroups';

vi.mock('../../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key),
    language: 'en',
  }),
}));

const device = (id: string, extra: Partial<LightingDevice> = {}): LightingDevice => ({
  id, name: `Strip ${id}`, ledsOn: true, ledCount: 10,
  canvasX: 0, canvasY: 0, canvasW: 1, canvasH: 1, canvasRotation: 0,
  ...extra,
});

// Each pin names its device, so a pin button's label says which card it is on.
const pinOf = (id: string): Pin => ({ kind: 'animate', effect: id });

function renderPanel(opts: {
  devices?: LightingDevice[];
  groups?: DeviceGroup[];
  pinned: string[];
  hint: string[];
  onPinHintPress?: () => void;
  onSetPin?: (ids: string[], pinned: boolean) => void;
  onPinHintTarget?: (id: string | null) => void;
}) {
  const pins = Object.fromEntries(opts.pinned.map(id => [id, pinOf(id)]));
  return render(
    <DevicePanel
      devices={opts.devices ?? [device('d1'), device('d2'), device('d3')]}
      selectedIds={new Set()}
      onSetSelection={() => {}}
      onTogglePower={() => {}}
      onSetPower={() => {}}
      onToggleControlled={() => {}}
      onSetControlled={() => {}}
      lightingOff={false}
      onOpenSettings={() => {}}
      groups={opts.groups ?? []}
      onGroupsChange={() => {}}
      pins={pins}
      pinSource="Rainbow"
      pinTargetName={pin => pin.effect ?? ''}
      onSetPin={opts.onSetPin ?? (() => {})}
      pinHintIds={new Set(opts.hint)}
      onPinHintPress={opts.onPinHintPress}
      onPinHintTarget={opts.onPinHintTarget}
    />,
  );
}

const marked = () => document.querySelectorAll('[data-coachmark="lighting-pin"]');
const markedDevice = () => (marked()[0] as HTMLElement | undefined)?.getAttribute('aria-label') ?? null;
const label = (id: string) => `lighting.pin.pinnedTo:${JSON.stringify({ name: id })}`;

describe('DevicePanel first-pin hint target', () => {
  beforeEach(() => localStorage.clear());

  it('marks only the top-most hinted card, whatever order the ids were pinned in', () => {
    renderPanel({ pinned: ['d3', 'd2', 'd1'], hint: ['d3', 'd2'] });
    expect(marked()).toHaveLength(1);
    expect(markedDevice()).toBe(label('d2'));
  });

  it('follows the rail order a group sets, not the device list order', () => {
    renderPanel({ groups: [{ id: 'g1', name: 'Desk', members: ['d3'], after: '' }], pinned: ['d1', 'd3'], hint: ['d1', 'd3'] });
    expect(marked()).toHaveLength(1);
    expect(markedDevice()).toBe(label('d3'));
  });

  it('skips a card hidden inside a collapsed group', () => {
    localStorage.setItem('lighting.collapsedDeviceGroups', JSON.stringify(['g1']));
    renderPanel({ groups: [{ id: 'g1', name: 'Desk', members: ['d3'], after: '' }], pinned: ['d1', 'd3'], hint: ['d1', 'd3'] });
    expect(markedDevice()).toBe(label('d1'));
  });

  it('skips a hinted card whose pin is gone, and cards outside the hinted set', () => {
    renderPanel({ pinned: ['d1', 'd3'], hint: ['d2', 'd3'] });
    expect(markedDevice()).toBe(label('d3'));
  });

  it('marks nothing without hint ids', () => {
    renderPanel({ pinned: ['d1'], hint: [] });
    expect(marked()).toHaveLength(0);
  });

  it('passes over a card that cannot render the pin button and marks the next one', () => {
    renderPanel({ devices: [device('d1', { ledCount: 0 }), device('d2')], pinned: ['d1', 'd2'], hint: ['d1', 'd2'] });
    expect(marked()).toHaveLength(1);
    expect(markedDevice()).toBe(label('d2'));
  });

  it('reports a press on the marked button, and not on an unmarked one', () => {
    const onPinHintPress = vi.fn();
    const onSetPin = vi.fn();
    renderPanel({ pinned: ['d1', 'd2'], hint: ['d1', 'd2'], onPinHintPress, onSetPin });
    fireEvent.click(screen.getByRole('button', { name: label('d2') }));
    expect(onSetPin).toHaveBeenCalledWith(['d2'], false);
    expect(onPinHintPress).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: label('d1') }));
    expect(onSetPin).toHaveBeenCalledWith(['d1'], false);
    expect(onPinHintPress).toHaveBeenCalledTimes(1);
  });

  it('reports the marked card, and null when none renders the hint', () => {
    const onPinHintTarget = vi.fn();
    const { rerender } = renderPanel({ pinned: ['d3', 'd2'], hint: ['d3', 'd2'], onPinHintTarget });
    expect(onPinHintTarget).toHaveBeenLastCalledWith('d2');
    rerender(<div />);
    const none = vi.fn();
    renderPanel({ pinned: ['d1'], hint: ['d2'], onPinHintTarget: none });
    expect(none).toHaveBeenLastCalledWith(null);
  });
});
