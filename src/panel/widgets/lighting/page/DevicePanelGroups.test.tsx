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

// One device's zones (the keeb's keys + underglow) stack into one card under
// the device name, with no group header; a motherboard's headers keep theirs.
describe('DevicePanel split card', () => {
  const keeb = [
    device('keeb:tkl-1:keys', 'HYTE Keeb TKL - Keys', { parentDeviceId: 'keeb:tkl-1', zoneIndex: 0, deviceId: 'keeb:tkl-1' }),
    device('keeb:tkl-1:underglow', 'HYTE Keeb TKL - Underglow', { parentDeviceId: 'keeb:tkl-1', zoneIndex: 1, deviceId: 'keeb:tkl-1' }),
  ];
  // The T1 board: each port is its own device under the board, and one port
  // carries a three-product chain.
  const port = (suffix: string, deviceSuffix: string, name: string, ledCount: number) =>
    device(`openrgb-C000-${suffix}`, `B850I AORUS PRO - ${name}`, { parentDeviceId: 'openrgb-C000', zoneIndex: 0, deviceId: `openrgb-C000-${deviceSuffix}`, ledCount });
  const board = [
    port('0', '0', 'ARGB_V2_1', 8),
    port('2', '2', 'LED_C', 1),
    port('1:z0', '1', 'ARGB_V2_2 - QX Fan 1', 34),
    port('1:z1', '1', 'ARGB_V2_2 - Generic ARGB Strip - 20 LED 2', 20),
    port('1:z2', '1', 'ARGB_V2_2 - Corsair QL Fan - 34 LED 3', 34),
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

  it('stacks the keeb into one card: the name once in a header row, then a block per zone', () => {
    renderRail(keeb);
    expect(screen.queryByRole('button', { name: /motherboardHeader/ })).toBeNull();
    const stack = document.querySelector(`.${styles.deviceCardStack}`);
    expect(stack).not.toBeNull();
    const name = stack!.querySelector(`.${styles.deviceCardStackName}`);
    expect(name?.textContent).toBe('HYTE Keeb TKL');
    expect(screen.getAllByText('HYTE Keeb TKL')).toHaveLength(1);
    const members = stack!.querySelectorAll(`.${styles.deviceCard}`);
    expect(members).toHaveLength(2);
    expect(members[0].textContent).toContain('Keys');
    expect(members[1].textContent).toContain('Underglow');
    expect(screen.queryByText('HYTE Keeb TKL - Keys')).toBeNull();
  });

  it('puts the header first, seams every zone to the row above, and rounds only the last', () => {
    renderRail(keeb);
    const stack = document.querySelector(`.${styles.deviceCardStack}`)!;
    expect(stack.firstElementChild?.className).toContain(styles.deviceCardStackHeader);
    const members = stack.querySelectorAll(`.${styles.deviceCard}`);
    expect(members[0].className).toContain(styles.deviceCardStacked);
    expect(members[0].className).not.toContain(styles.deviceCardStackLast);
    expect(members[1].className).toContain(styles.deviceCardStacked);
    expect(members[1].className).toContain(styles.deviceCardStackLast);
  });

  it('selects each zone of the stack on its own', () => {
    const onSetSelection = renderRail(keeb);
    fireEvent.click(screen.getByText('Underglow'));
    expect(onSetSelection).toHaveBeenCalledWith(new Set(['keeb:tkl-1:underglow']), 'keeb:tkl-1:underglow');
    fireEvent.click(screen.getByText('Keys'));
    expect(onSetSelection).toHaveBeenLastCalledWith(new Set(['keeb:tkl-1:keys']), 'keeb:tkl-1:keys');
  });

  it('shows each zone its own LED count and no total on the header', () => {
    renderRail([{ ...keeb[0], ledCount: 96 }, { ...keeb[1], ledCount: 51 }]);
    expect(screen.getByText('96')).toBeTruthy();
    expect(screen.getByText('51')).toBeTruthy();
    const header = document.querySelector(`.${styles.deviceCardStackHeader}`);
    expect(header?.textContent).toBe('HYTE Keeb TKL');
  });

  it('gives each zone of the stack its own menu', () => {
    renderRail(keeb);
    expect(screen.getAllByRole('button', { name: 'lighting.devices.moreActions' })).toHaveLength(2);
  });

  it('gives a board one row per port under its group header: cards, and a split for the chained port', () => {
    renderRail(board);
    expect(screen.getByRole('button', { name: /motherboardHeader/ })).toBeTruthy();
    expect(screen.getByText('B850I AORUS PRO')).toBeTruthy();
    expect(screen.getByText('ARGB_V2_1')).toBeTruthy();
    expect(screen.getByText('LED_C')).toBeTruthy();
    const stacks = document.querySelectorAll(`.${styles.deviceCardStack}`);
    expect(stacks).toHaveLength(1);
    expect(stacks[0].querySelector(`.${styles.deviceCardStackHeader}`)?.textContent).toBe('ARGB_V2_2');
    expect(stacks[0].querySelectorAll(`.${styles.deviceCard}`)).toHaveLength(3);
    expect(screen.getByText('QX Fan 1')).toBeTruthy();
    expect(screen.getByText('Generic ARGB Strip - 20 LED 2')).toBeTruthy();
    expect(screen.getByText('Corsair QL Fan - 34 LED 3')).toBeTruthy();
    expect(screen.queryByText(/ARGB_V2_2 - /)).toBeNull();
  });

  it('selects one product of a chained port on its own', () => {
    const onSetSelection = renderRail(board);
    fireEvent.click(screen.getByText('Generic ARGB Strip - 20 LED 2'));
    expect(onSetSelection).toHaveBeenCalledWith(new Set(['openrgb-C000-1:z1']), 'openrgb-C000-1:z1');
  });
});

// The header row is the device: a click selects every zone under it, and its
// kebab carries the group header's device-level rows.
describe('DevicePanel split card header', () => {
  const keeb = [
    device('keeb:tkl-1:keys', 'HYTE Keeb TKL - Keys', { parentDeviceId: 'keeb:tkl-1', zoneIndex: 0, deviceId: 'keeb:tkl-1' }),
    device('keeb:tkl-1:underglow', 'HYTE Keeb TKL - Underglow', { parentDeviceId: 'keeb:tkl-1', zoneIndex: 1, deviceId: 'keeb:tkl-1' }),
  ];
  const port = (suffix: string, deviceSuffix: string, name: string) =>
    device(`openrgb-C000-${suffix}`, `B850I AORUS PRO - ${name}`, { parentDeviceId: 'openrgb-C000', zoneIndex: 0, deviceId: `openrgb-C000-${deviceSuffix}` });
  const board = [
    port('0', '0', 'ARGB_V2_1'),
    port('1:z0', '1', 'ARGB_V2_2 - QX Fan 1'),
    port('1:z1', '1', 'ARGB_V2_2 - Generic ARGB Strip - 20 LED 2'),
    port('1:z2', '1', 'ARGB_V2_2 - Corsair QL Fan - 34 LED 3'),
  ];

  function renderRail(list: LightingDevice[], over: Partial<React.ComponentProps<typeof DevicePanel>> = {}) {
    const mocks = { onSetSelection: vi.fn(), onSetPower: vi.fn(), onSetControlled: vi.fn(), onRenameDevice: vi.fn() };
    render(
      <DevicePanel
        devices={list}
        selectedIds={new Set()}
        onSetSelection={mocks.onSetSelection}
        onTogglePower={() => {}}
        onSetPower={mocks.onSetPower}
        onToggleControlled={() => {}}
        onSetControlled={mocks.onSetControlled}
        lightingOff={false}
        onOpenSettings={() => {}}
        onRenameDevice={mocks.onRenameDevice}
        {...over}
      />,
    );
    return mocks;
  }
  const headerName = (name: string) => {
    const el = Array.from(document.querySelectorAll(`.${styles.deviceCardStackName}`)).find(n => n.textContent === name);
    if (!el) throw new Error(name);
    return el;
  };
  const openMenu = (name: string) => fireEvent.click(screen.getByRole('button', { name: new RegExp(`groupActions.*${name}`) }));

  it('selects every zone of the device when the header is clicked', () => {
    const { onSetSelection } = renderRail(keeb);
    fireEvent.click(headerName('HYTE Keeb TKL'));
    expect(onSetSelection).toHaveBeenCalledWith(new Set(['keeb:tkl-1:keys', 'keeb:tkl-1:underglow']), 'keeb:tkl-1:keys');
  });

  it('selects all three products of a chained port from its header', () => {
    const { onSetSelection } = renderRail(board);
    fireEvent.click(headerName('ARGB_V2_2'));
    expect(onSetSelection).toHaveBeenCalledWith(
      new Set(['openrgb-C000-1:z0', 'openrgb-C000-1:z1', 'openrgb-C000-1:z2']), 'openrgb-C000-1:z0');
  });

  it('adds the whole device to a selection with the modifier held', () => {
    const { onSetSelection } = renderRail([device('d9', 'Strip'), ...keeb], { selectedIds: new Set(['d9']) });
    fireEvent.click(headerName('HYTE Keeb TKL'), { metaKey: true, ctrlKey: true });
    expect(onSetSelection).toHaveBeenCalledWith(new Set(['d9', 'keeb:tkl-1:keys', 'keeb:tkl-1:underglow']), 'keeb:tkl-1:keys');
  });

  it('takes a fully selected device back out with the modifier held', () => {
    const { onSetSelection } = renderRail([device('d9', 'Strip'), ...keeb], { selectedIds: new Set(['d9', 'keeb:tkl-1:keys', 'keeb:tkl-1:underglow']) });
    fireEvent.click(headerName('HYTE Keeb TKL'), { metaKey: true, ctrlKey: true });
    expect(onSetSelection).toHaveBeenCalledWith(new Set(['d9']), 'd9');
  });

  it('selects on a name click and never opens an editor there', () => {
    const { onSetSelection } = renderRail(keeb);
    fireEvent.click(headerName('HYTE Keeb TKL'));
    expect(screen.queryByDisplayValue('HYTE Keeb TKL')).toBeNull();
    expect(onSetSelection).toHaveBeenCalledTimes(1);
  });

  it('lays the header out as the name, then the kebab pinned last', () => {
    renderRail(keeb);
    const header = document.querySelector(`.${styles.deviceCardStackHeader}`)!;
    // The name rides inside a display:contents no-dnd wrapper, so it is the
    // first child's content rather than the first child itself.
    expect(header.children[0].contains(header.querySelector(`.${styles.deviceCardStackName}`))).toBe(true);
    expect(header.children).toHaveLength(2);
    expect(header.lastElementChild?.tagName).toBe('BUTTON');
    expect(header.lastElementChild?.className).toContain(styles.deviceCardStackMenuBtn);
  });

  it('turns every zone of the device off from the header menu', () => {
    const { onSetPower } = renderRail(keeb);
    openMenu('HYTE Keeb TKL');
    fireEvent.click(screen.getByRole('button', { name: /menuLightsOff/ }));
    expect(onSetPower).toHaveBeenCalledWith('keeb:tkl-1:keys', false);
    expect(onSetPower).toHaveBeenCalledWith('keeb:tkl-1:underglow', false);
  });

  it('offers to turn the device on once every zone is off', () => {
    const { onSetPower } = renderRail(keeb.map(d => ({ ...d, ledsOn: false })));
    openMenu('HYTE Keeb TKL');
    fireEvent.click(screen.getByRole('button', { name: /menuLightsOn/ }));
    expect(onSetPower).toHaveBeenCalledWith('keeb:tkl-1:keys', true);
    expect(onSetPower).toHaveBeenCalledWith('keeb:tkl-1:underglow', true);
  });

  it('releases every zone of the device from Nexus Control from the header menu', () => {
    const { onSetControlled } = renderRail(keeb);
    openMenu('HYTE Keeb TKL');
    fireEvent.click(screen.getByRole('button', { name: /menuControlOff/ }));
    expect(onSetControlled).toHaveBeenCalledWith('keeb:tkl-1:keys', false);
    expect(onSetControlled).toHaveBeenCalledWith('keeb:tkl-1:underglow', false);
  });

  it('renames the device from the header menu, keyed on the device id', () => {
    const { onRenameDevice } = renderRail(keeb);
    openMenu('HYTE Keeb TKL');
    fireEvent.click(screen.getByText('lighting.devices.rename'));
    const input = screen.getByDisplayValue('HYTE Keeb TKL');
    fireEvent.change(input, { target: { value: '  Desk keyboard  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onRenameDevice).toHaveBeenCalledWith('keeb:tkl-1', 'Desk keyboard');
  });

  it('shows the device rename in the header and offers to reset it', () => {
    const { onRenameDevice } = renderRail(keeb.map(d => ({ ...d, parentName: 'Desk keyboard' })));
    expect(headerName('Desk keyboard')).toBeTruthy();
    openMenu('Desk keyboard');
    fireEvent.click(screen.getByRole('button', { name: /resetName/ }));
    expect(onRenameDevice).toHaveBeenCalledWith('keeb:tkl-1', '');
  });

  it('renames a board port from its header, keyed on the port device id', () => {
    const { onRenameDevice } = renderRail(board);
    openMenu('ARGB_V2_2');
    expect(screen.queryByText('lighting.devices.resetName')).toBeNull();
    fireEvent.click(screen.getByText('lighting.devices.rename'));
    const input = screen.getByDisplayValue('ARGB_V2_2');
    fireEvent.change(input, { target: { value: 'Front fans' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onRenameDevice).toHaveBeenCalledWith('openrgb-C000-1', 'Front fans');
  });

  it('shows a port rename in its header and offers to reset it', () => {
    const { onRenameDevice } = renderRail(board.map(d => d.deviceId === 'openrgb-C000-1' ? { ...d, deviceName: 'Front fans' } : d));
    expect(headerName('Front fans')).toBeTruthy();
    expect(screen.getByText('ARGB_V2_1')).toBeTruthy();
    openMenu('Front fans');
    fireEvent.click(screen.getByRole('button', { name: /resetName/ }));
    expect(onRenameDevice).toHaveBeenCalledWith('openrgb-C000-1', '');
  });

  it('tints the header while any zone under it is selected, with no border of its own', () => {
    renderRail(keeb, { selectedIds: new Set(['keeb:tkl-1:underglow']) });
    const header = document.querySelector(`.${styles.deviceCardStackHeader}`)!;
    expect(header.className).toContain(styles.deviceCardStackHeaderSelected);
    expect(header.className).not.toContain(styles.deviceCardSelected);
    const members = document.querySelectorAll(`.${styles.deviceCardStack} .${styles.deviceCard}`);
    expect(members[0].className).not.toContain(styles.deviceCardSelected);
    expect(members[1].className).toContain(styles.deviceCardSelected);
  });

  it('drops the header tint once nothing under it is selected', () => {
    renderRail([device('d9', 'Strip'), ...keeb], { selectedIds: new Set(['d9']) });
    const header = document.querySelector(`.${styles.deviceCardStackHeader}`)!;
    expect(header.className).not.toContain(styles.deviceCardStackHeaderSelected);
  });

  it('leaves the header a plain label with no rename handler', () => {
    renderRail(keeb, { onRenameDevice: undefined });
    openMenu('HYTE Keeb TKL');
    expect(screen.getByRole('button', { name: /menuControlOff/ })).toBeTruthy();
    expect(screen.queryByText('lighting.devices.rename')).toBeNull();
  });
});
