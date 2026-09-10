import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DevicePanel } from './DevicePanel';
import type { LightingDevice } from '../../../../api/lighting';
import { MAX_DEVICE_GROUPS, type DeviceGroup } from '../../../../lib/deviceGroups';
import styles from '../LightingPage.module.scss';

vi.mock('../../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
    language: 'en',
  }),
}));

const device = (id: string, name: string, extra: Partial<LightingDevice> = {}): LightingDevice => ({
  id, name, ledsOn: true, ledCount: 10,
  canvasX: 0, canvasY: 0, canvasW: 1, canvasH: 1, canvasRotation: 0,
  ...extra,
});

const devices = [device('d1', 'Strip one'), device('d2', 'Strip two'), device('d3', 'Strip three')];

function renderPanel(groups: DeviceGroup[], onGroupsChange = vi.fn()) {
  render(
    <DevicePanel
      devices={devices}
      selectedIds={new Set()}
      onSetSelection={() => {}}
      onTogglePower={() => {}}
      onSetPower={() => {}}
      onToggleControlled={() => {}}
      onSetControlled={() => {}}
      lightingOff={false}
      onOpenSettings={() => {}}
      groups={groups}
      onGroupsChange={onGroupsChange}
    />,
  );
  return onGroupsChange;
}

describe('DevicePanel user groups', () => {
  it('renders every card at the top level with no groups', () => {
    renderPanel([]);
    expect(screen.getByText('Strip one')).toBeTruthy();
    expect(screen.getByText('Strip three')).toBeTruthy();
  });

  it('renders a group header and keeps its members rendered once', () => {
    renderPanel([{ id: 'g1', name: 'Desk', members: ['d2'] }]);
    expect(screen.getByText('Desk')).toBeTruthy();
    expect(screen.getAllByText('Strip two')).toHaveLength(1);
  });

  it('shows an empty group so a freshly created one is visible', () => {
    renderPanel([{ id: 'g1', name: 'Desk', members: [] }]);
    expect(screen.getByText('Desk')).toBeTruthy();
  });

  it('adds a group from the rail button', () => {
    const onGroupsChange = renderPanel([]);
    fireEvent.click(screen.getByText('lighting.devices.groupAdd'));
    expect(onGroupsChange).toHaveBeenCalledTimes(1);
    expect(onGroupsChange.mock.calls[0][0]).toHaveLength(1);
  });

  it('hides the add button once the cap is reached', () => {
    const full = Array.from({ length: MAX_DEVICE_GROUPS }, (_, i) => ({ id: `g${i}`, name: `G${i}`, members: [] }));
    renderPanel(full);
    expect(screen.queryByText('lighting.devices.groupAdd')).toBeNull();
  });

  it('deletes a group from its header menu, leaving the cards behind', () => {
    const onGroupsChange = renderPanel([{ id: 'g1', name: 'Desk', members: ['d2'] }]);
    fireEvent.click(screen.getByRole('button', { name: /groupActions.*Desk/ }));
    fireEvent.click(screen.getByRole('button', { name: /groupDelete/ }));
    expect(onGroupsChange).toHaveBeenCalledWith([]);
  });

  it('renames a group from its header title', () => {
    const onGroupsChange = renderPanel([{ id: 'g1', name: 'Desk', members: ['d2'] }]);
    fireEvent.click(screen.getAllByRole('button', { name: /groupActions/ })[0]);
    fireEvent.click(screen.getByText('lighting.devices.rename'));
    const input = screen.getByDisplayValue('Desk');
    fireEvent.change(input, { target: { value: 'Shelf' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onGroupsChange).toHaveBeenCalledWith([{ id: 'g1', name: 'Shelf', members: ['d2'] }]);
  });

  it('offers no add button when the rail is not groupable', () => {
    render(
      <DevicePanel
        devices={devices}
        selectedIds={new Set()}
        onSetSelection={() => {}}
        onTogglePower={() => {}}
        onSetPower={() => {}}
        onToggleControlled={() => {}}
        onSetControlled={() => {}}
        lightingOff={false}
        onOpenSettings={() => {}}
      />,
    );
    expect(screen.queryByText('lighting.devices.groupAdd')).toBeNull();
  });

  it('keeps an emptied group where it sat, rather than sliding it to the tail', () => {
    // 'after' is what holds the slot: the group owns no card to anchor to.
    renderPanel([{ id: 'g1', name: 'Desk', members: [], after: 'd1' }]);
    const rail = document.querySelectorAll('[class*="deviceCard"], [class*="motherboardGroup"]');
    const labels = Array.from(rail).map(el => el.textContent ?? '');
    const groupAt = labels.findIndex(l => l.includes('Desk'));
    const lastAt = labels.findIndex(l => l.includes('Strip three'));
    expect(groupAt).toBeGreaterThanOrEqual(0);
    expect(groupAt).toBeLessThan(lastAt);
  });

  it('renames a group from the header title', () => {
    const onGroupsChange = renderPanel([{ id: 'g1', name: 'Desk', members: ['d2'] }]);
    fireEvent.click(screen.getAllByRole('button', { name: /groupActions/ })[0]);
    fireEvent.click(screen.getByText('lighting.devices.rename'));
    const input = screen.getByDisplayValue('Desk');
    fireEvent.change(input, { target: { value: 'Shelf' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onGroupsChange.mock.calls[0][0][0].name).toBe('Shelf');
  });
});

// One device's zones (the keeb's keys + underglow) stack into one card with no
// group header; a motherboard's headers keep theirs.
describe('DevicePanel split card', () => {
  const keeb = [
    device('keeb:tkl-1:keys', 'HYTE Keeb TKL - Keys', { parentDeviceId: 'keeb:tkl-1', zoneIndex: 0, deviceId: 'keeb:tkl-1', type: 'ledstrip' }),
    device('keeb:tkl-1:underglow', 'HYTE Keeb TKL - Underglow', { parentDeviceId: 'keeb:tkl-1', zoneIndex: 1, deviceId: 'keeb:tkl-1', type: 'ledstrip' }),
  ];
  const board = [
    device('openrgb-0-0', 'B850I - ARGB header 1', { parentDeviceId: 'openrgb-0', zoneIndex: 0, deviceId: 'openrgb-0', type: 'motherboard' }),
    device('openrgb-0-1', 'B850I - ARGB header 2', { parentDeviceId: 'openrgb-0', zoneIndex: 1, deviceId: 'openrgb-0', type: 'motherboard' }),
  ];

  function renderRail(list: LightingDevice[], onSetSelection = vi.fn()) {
    render(
      <DevicePanel
        devices={list}
        selectedIds={new Set()}
        onSetSelection={onSetSelection}
        onTogglePower={() => {}}
        onSetPower={() => {}}
        onToggleControlled={() => {}}
        onSetControlled={() => {}}
        lightingOff={false}
        onOpenSettings={() => {}}
      />,
    );
    return onSetSelection;
  }

  it('stacks the keeb into one card with both zones and no group header', () => {
    renderRail(keeb);
    expect(screen.queryByRole('button', { name: /motherboardHeader/ })).toBeNull();
    const stack = document.querySelector(`.${styles.deviceCardStack}`);
    expect(stack).not.toBeNull();
    const members = stack!.querySelectorAll(`.${styles.deviceCard}`);
    expect(members).toHaveLength(2);
    expect(members[0].textContent).toContain('HYTE Keeb TKL - Keys');
    expect(members[1].textContent).toContain('HYTE Keeb TKL - Underglow');
  });

  it('rounds only the outer corners of the stack and seams the zones', () => {
    renderRail(keeb);
    const members = document.querySelectorAll(`.${styles.deviceCardStack} .${styles.deviceCard}`);
    expect(members[0].className).toContain(styles.deviceCardStackFirst);
    expect(members[0].className).not.toContain(styles.deviceCardStackSeam);
    expect(members[1].className).toContain(styles.deviceCardStackLast);
    expect(members[1].className).toContain(styles.deviceCardStackSeam);
  });

  it('selects each zone of the stack on its own', () => {
    const onSetSelection = renderRail(keeb);
    fireEvent.click(screen.getByText('HYTE Keeb TKL - Underglow'));
    expect(onSetSelection).toHaveBeenCalledWith(new Set(['keeb:tkl-1:underglow']), 'keeb:tkl-1:underglow');
    fireEvent.click(screen.getByText('HYTE Keeb TKL - Keys'));
    expect(onSetSelection).toHaveBeenLastCalledWith(new Set(['keeb:tkl-1:keys']), 'keeb:tkl-1:keys');
  });

  it('gives each zone of the stack its own menu', () => {
    renderRail(keeb);
    expect(screen.getAllByRole('button', { name: 'lighting.devices.moreActions' })).toHaveLength(2);
  });

  it('keeps a motherboard under a group header with one card per header', () => {
    renderRail(board);
    expect(screen.getByRole('button', { name: /motherboardHeader/ })).toBeTruthy();
    expect(document.querySelector(`.${styles.deviceCardStack}`)).toBeNull();
    expect(screen.getByText('B850I')).toBeTruthy();
    expect(screen.getByText('ARGB header 1')).toBeTruthy();
    expect(screen.getByText('ARGB header 2')).toBeTruthy();
  });
});
