import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UiSettingsProvider } from '../../../hooks/useUiSettings';
import type { ServiceState } from '../../../types/service';
import { CoolingPage } from './CoolingPage';
import { renameFan } from '../../../api/cooling';
import { identifyLianLiWirelessFan } from '../../../api/lianli-wireless';
import { allowSlowAsyncUtils } from '../../../__tests__/slowAsyncUtils';

allowSlowAsyncUtils();

// Rendered outside I18nProvider, so t() falls back to raw keys.

vi.mock('../../../hooks/useSystemSpecs', () => ({
  useSystemSpecs: () => ({ specs: { motherboard: 'ROG STRIX Z790-E' } }),
}));

// The service answers a rename as deviceName on every fan in that block.
const blockNames: Record<string, string> = {};

vi.mock('../../../api/lianli-wireless', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../api/lianli-wireless')>()),
  identifyLianLiWirelessFan: vi.fn(async () => true),
}));

vi.mock('../../../api/cooling', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../api/cooling')>();
  const fan = (id: string, name: string, device?: [string, string]) => ({
    id, name, dutyPercent: 40, rpm: 1000, mode: 'Manual',
    classification: 'Controllable', calibrated: true, controlled: true,
    isGpu: !!device,
    deviceId: device?.[0] ?? null,
    deviceName: blockNames[device?.[0] ?? 'motherboard'] ?? device?.[1] ?? null,
    originalDeviceName: device && blockNames[device[0]] ? device[1] : null,
  });
  const CARD: [string, string] = ['/gpu-nvidia/0', 'NVIDIA GeForce RTX 3070'];
  const CHAIN: [string, string] = ['lianli-wireless:998D1DE566E1', 'Lian Li Wireless Fan'];
  return {
    ...original,
    fetchFanChannels: vi.fn(async () => ({
      channels: [
        fan('fan-cpu', 'CPU Fan'),
        fan('fan-chassis', 'Chassis Fan'),
        fan('fan-gpu-1', 'GPU Fan 1', CARD),
        fan('fan-gpu-2', 'GPU Fan 2', CARD),
        { ...fan('lianli-wireless:998D1DE566E1:port0', 'Wireless Fan 1', CHAIN), isGpu: false },
      ],
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
    renameFan: vi.fn(async (id: string, name: string) => {
      if (name === '') delete blockNames[id]; else blockNames[id] = name;
    }),
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

// Outside I18nProvider every menu button carries the same raw key, so blocks are
// told apart by rail order. Clicking the button again closes the menu.
const toggleMenu = (blockIndex: number) =>
  fireEvent.click(screen.getAllByRole('button', { name: /groupActions/ })[blockIndex]);
const BOARD = 0;
const GPU = 1;

// Rename is a context-menu action, not a click on the title.
const startRename = (blockIndex: number) => {
  toggleMenu(blockIndex);
  fireEvent.click(screen.getByText(/fan\.rename$/));
};

describe('CoolingPage wireless chain block', () => {
  it('identifies by the chain MAC and only on the wireless block', async () => {
    renderAdvanced();
    await waitFor(() => expect(screen.getByText('Lian Li Wireless Fan')).toBeInTheDocument());
    const menus = screen.getAllByRole('button', { name: /groupActions/ });
    expect(menus).toHaveLength(3);

    fireEvent.click(menus[0]);
    expect(screen.queryByRole('button', { name: 'devices.lianli-wireless.identify' })).toBeNull();
    fireEvent.click(menus[0]);

    fireEvent.click(menus[2]);
    fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-wireless.identify' }));
    expect(identifyLianLiWirelessFan).toHaveBeenCalledWith('998D1DE566E1');
    // Busy window, same label as the controller page's button.
    await waitFor(() => expect(screen.queryByText('devices.lianli-flex.identifying')).toBeNull());
  });
});

describe('CoolingPage rail block renames', () => {
  beforeEach(() => {
    for (const key of Object.keys(blockNames)) delete blockNames[key];
  });

  it('groups the board from specs and the card from the name it reports', async () => {
    renderAdvanced();
    await waitFor(() => expect(screen.getByText('ROG STRIX Z790-E')).toBeInTheDocument());
    expect(screen.getByText('NVIDIA GeForce RTX 3070')).toBeInTheDocument();
    // Both members of each block sit under its header, not loose on the rail.
    expect(screen.getByText('GPU Fan 1')).toBeInTheDocument();
    expect(screen.getByText('GPU Fan 2')).toBeInTheDocument();
  });

  it('renames a GPU group under its card id, not a fan id', async () => {
    renderAdvanced();
    await waitFor(() => expect(screen.getByText('NVIDIA GeForce RTX 3070')).toBeInTheDocument());

    startRename(GPU);
    const input = screen.getByDisplayValue('NVIDIA GeForce RTX 3070');
    fireEvent.change(input, { target: { value: 'Main card' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(renameFan).toHaveBeenCalledWith('/gpu-nvidia/0', 'Main card');
    await waitFor(() => expect(screen.getByText('Main card')).toBeInTheDocument());
    // The board's own block keeps its spec-sheet name.
    expect(screen.getByText('ROG STRIX Z790-E')).toBeInTheDocument();
  });

  it('offers Reset name only once the block is renamed, and falls back to specs', async () => {
    renderAdvanced();
    await waitFor(() => expect(screen.getByText('ROG STRIX Z790-E')).toBeInTheDocument());

    toggleMenu(BOARD);
    expect(screen.queryByRole('button', { name: /resetName/ })).toBeNull();
    toggleMenu(BOARD);

    startRename(BOARD);
    const input = screen.getByDisplayValue('ROG STRIX Z790-E');
    fireEvent.change(input, { target: { value: 'Board headers' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(screen.getByText('Board headers')).toBeInTheDocument());

    // Selecting a menu row closes the menu on a 120ms exit timer, where the
    // menu button closes it at once, so Reset name is reached by reopening.
    await waitFor(() => expect(screen.queryByText(/fan\.rename$/)).toBeNull());
    toggleMenu(BOARD);
    fireEvent.click(screen.getByRole('button', { name: /resetName/ }));
    expect(renameFan).toHaveBeenCalledWith('motherboard', '');
    await waitFor(() => expect(screen.getByText('ROG STRIX Z790-E')).toBeInTheDocument());
  });
});
