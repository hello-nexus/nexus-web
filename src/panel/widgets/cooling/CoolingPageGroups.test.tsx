import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UiSettingsProvider } from '../../../hooks/useUiSettings';
import type { ServiceState } from '../../../types/service';
import type { DeviceGroup } from '../../../lib/deviceGroups';
import { CoolingPage } from './CoolingPage';
import { saveFanGroups } from '../../../api/cooling';

// Rendered outside I18nProvider, so t() falls back to raw keys.

vi.mock('../../../hooks/useSystemSpecs', () => ({
  useSystemSpecs: () => ({ specs: { motherboard: 'ROG STRIX Z790-E' } }),
}));

// The groups the service hands back with the channel list.
const served: { groups: DeviceGroup[] } = { groups: [] };

vi.mock('../../../api/cooling', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../api/cooling')>();
  // Distinct RPMs: the readout is the click target a test selects a card by,
  // the name being a rename field.
  const fan = (id: string, name: string, rpm: number, device?: [string, string]) => ({
    id, name, dutyPercent: 40, rpm, mode: 'Manual',
    classification: 'Controllable', calibrated: true, controlled: true,
    deviceId: device?.[0] ?? null,
    deviceName: device?.[1] ?? null,
  });
  const HUB: [string, string] = ['np50:AABB', 'HYTE NP50'];
  return {
    ...original,
    fetchFanChannels: vi.fn(async () => ({
      channels: [
        fan('fan-cpu', 'CPU Fan', 1100),
        fan('fan-chassis', 'Chassis Fan', 1200),
        fan('fan-rear', 'Rear Fan', 1300),
        fan('fan-hub-1', 'Port 1', 1400, HUB),
        fan('fan-hub-2', 'Port 2', 1500, HUB),
      ],
      groups: served.groups,
    })),
    fetchTemperatureSources: vi.fn(async () => ({
      sources: [{ id: 'cpu-package', name: 'CPU Package', category: 'CPU', value: 52 }],
    })),
    fetchCurves: vi.fn(async () => ({ globalSpeedModifier: 1, curves: [] })),
    fetchProfiles: vi.fn(async () => ({ profiles: [], active: 'custom' })),
    fetchCalibrationResults: vi.fn(async () => ({ results: [] })),
    fetchCoolingPresets: vi.fn(async () => ({ presets: [], activeId: null })),
    applyProfile: vi.fn(async () => undefined),
    saveCurves: vi.fn(async () => undefined),
    saveFanGroups: vi.fn(async () => undefined),
  };
});

const serviceState = { cooling: { calibrating: false } } as unknown as ServiceState;

function renderAdvanced() {
  localStorage.setItem('nexus_settings', JSON.stringify({
    general: { coolingDashboardMode: 'advanced', lightingDashboardMode: 'advanced' },
  }));
  return render(
    <UiSettingsProvider>
      <CoolingPage serviceOnline serviceState={serviceState} />
    </UiSettingsProvider>,
  );
}

const lastSaved = (): DeviceGroup[] => {
  const calls = vi.mocked(saveFanGroups).mock.calls;
  return calls[calls.length - 1][0];
};
// Outside I18nProvider every menu button carries the same raw key, so headers
// are told apart by rail order: the board block, then the hub, then any
// top-level user group.
const headerMenu = (index: number) => fireEvent.click(screen.getAllByRole('button', { name: 'cooling.fan.groupActions' })[index]);
const BOARD = 0;
const HUB = 1;
const cardMenu = (index: number) => fireEvent.click(screen.getAllByRole('button', { name: 'cooling.fan.moreActions' })[index]);
const headerOf = (menuIndex: number) =>
  screen.getAllByRole('button', { name: 'cooling.fan.groupActions' })[menuIndex].closest('[class*="header"]')!;

describe('CoolingPage nested groups', () => {
  beforeEach(() => {
    served.groups = [];
    vi.mocked(saveFanGroups).mockClear();
  });

  it('renders a group inside the board block with the fan it holds', async () => {
    served.groups = [{ id: 'inner', name: 'Intake', members: ['fan-chassis'], parent: 'motherboard', after: 'fan-cpu' }];
    renderAdvanced();
    await waitFor(() => expect(screen.getByText('Intake')).toBeInTheDocument());
    const board = headerOf(BOARD).parentElement!;
    const inner = screen.getByText('Intake').closest('[class*="section"]')!;
    expect(board.contains(inner)).toBe(true);
    expect(inner.textContent).toContain('Chassis Fan');
    expect(screen.getAllByText('Chassis Fan')).toHaveLength(1);
  });

  it('gives the board and hub blocks an icon and a user group none', async () => {
    served.groups = [{ id: 'g1', name: 'Desk', members: [] }];
    renderAdvanced();
    await waitFor(() => expect(screen.getByText('Desk')).toBeInTheDocument());
    // The chevron button carries the icon: a lucide board glyph, or masked art.
    const boardToggle = headerOf(BOARD).querySelector('button')!;
    expect(boardToggle.querySelectorAll('svg')).toHaveLength(2);
    const hubToggle = headerOf(HUB).querySelector('button')!;
    expect(hubToggle.querySelector('[style*="icon-url"]')).not.toBeNull();
    const deskToggle = headerOf(2).querySelector('button')!;
    expect(deskToggle.querySelectorAll('svg')).toHaveLength(1);
    expect(deskToggle.querySelector('[style*="icon-url"]')).toBeNull();
  });

  it('makes a group inside the board from a selection of its fans', async () => {
    renderAdvanced();
    await waitFor(() => expect(screen.getByText('CPU Fan')).toBeInTheDocument());
    fireEvent.click(screen.getByText('1,200'));
    fireEvent.click(screen.getByText('1,300'), { ctrlKey: true, metaKey: true });
    cardMenu(1);
    fireEvent.click(screen.getByText('cooling.fan.moveToNewGroupCount.other'));
    expect(lastSaved()[0]).toMatchObject({ members: ['fan-chassis', 'fan-rear'], parent: 'motherboard', after: 'fan-cpu' });
  });

  it('offers no group for fans on two different blocks', async () => {
    renderAdvanced();
    await waitFor(() => expect(screen.getByText('CPU Fan')).toBeInTheDocument());
    fireEvent.click(screen.getByText('1,300'));
    fireEvent.click(screen.getByText('1,400'), { ctrlKey: true, metaKey: true });
    cardMenu(2);
    expect(screen.queryByText(/moveToNewGroupCount/)).toBeNull();
  });

  it('selects every fan of a block from its header menu', async () => {
    renderAdvanced();
    await waitFor(() => expect(screen.getByText('HYTE NP50')).toBeInTheDocument());
    headerMenu(HUB);
    fireEvent.click(screen.getByText('cooling.fan.selectGroupCount.other'));
    // The selection shows as the bulk menu on a selected card, and not on another.
    cardMenu(3);
    expect(screen.getByText('cooling.fan.moveToNewGroupCount.other')).toBeInTheDocument();
    cardMenu(3);
    cardMenu(0);
    expect(screen.queryByText('cooling.fan.moveToNewGroupCount.other')).toBeNull();
  });

  it('lets a hub block make a group of itself from its header menu', async () => {
    renderAdvanced();
    await waitFor(() => expect(screen.getByText('HYTE NP50')).toBeInTheDocument());
    headerMenu(HUB);
    fireEvent.click(screen.getByText('cooling.fan.moveToNewGroup'));
    expect(lastSaved()[0]).toMatchObject({ members: ['np50:AABB'], parent: null });
  });
});
