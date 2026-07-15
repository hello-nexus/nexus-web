import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UnifiedDevice } from '../../../hooks/useUnifiedDevices';

// The Devices-page device row is the ONLY place a device's Nexus
// Control/Link on/off toggle lives - never on the device's own page (see
// PanelDevicePage, which no longer renders one). This covers a
// promoted-monitor row (Xeneon Edge, no first-party handler) wired to the
// display promote/demote API, and proves a curated device row (handler-
// backed, e.g. Stream Deck) keeps using controlDevice unchanged.

const promoteDisplayToPanelMock = vi.fn();
const demoteDisplayPanelMock = vi.fn();
const toastPushMock = vi.fn();
const controlDeviceMock = vi.fn();

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${JSON.stringify(vars)}` : key),
  }),
}));
vi.mock('../../../components/common/Toast/Toast', () => ({
  useToast: () => ({ push: toastPushMock }),
}));
vi.mock('../../../api/displays', () => ({
  promoteDisplayToPanel: (...a: unknown[]) => promoteDisplayToPanelMock(...a),
  demoteDisplayPanel: (...a: unknown[]) => demoteDisplayPanelMock(...a),
}));
vi.mock('../../../hooks/useUsbDevices', () => ({
  useUsbDevices: () => ({ devices: [], loading: false, refresh: vi.fn() }),
}));

let mockUnified: UnifiedDevice[] = [];
vi.mock('../../../hooks/useUnifiedDevices', () => ({
  useUnifiedDevices: () => ({
    unified: mockUnified,
    merged: [],
    webhidAvailable: false,
    controlDevice: controlDeviceMock,
  }),
}));

import { DevicesPage } from './DevicesPage';

function monitorRow(overrides: Partial<UnifiedDevice> = {}): UnifiedDevice {
  return {
    key: 'panel-display:rec1',
    shortName: 'Xeneon Edge',
    name: 'Xeneon Edge',
    subtitle: 'Online',
    category: 'display',
    iconSrc: '/assets/devices/corsair.svg',
    connected: true,
    kind: 'panel',
    panelDevice: {
      id: 'display:rec1',
      name: 'Xeneon Edge',
      subtitle: 'Online',
      status: 'online',
      statusLabel: 'Online',
      connectionKind: 'attached-monitor',
      managementMode: 'managed',
      surfaceProfileKey: 'monitor-rec1',
      runtimeSurface: 'monitor',
      iconSrc: '/assets/devices/corsair.svg',
      capabilities: {
        layout: true, theme: true, displayControls: false, launchClose: false,
        pairing: false, presence: false, touch: true,
      },
      displayId: 'disp1',
      panelRecordId: 'rec1',
      linkEnabled: true,
    },
    navigable: true,
    nexusControlEnabled: true,
    supportsNexusControl: true,
    experimental: false,
    ...overrides,
  };
}

function curatedRow(overrides: Partial<UnifiedDevice> = {}): UnifiedDevice {
  return {
    key: 'curated-streamdeck',
    shortName: 'Stream Deck',
    name: 'Stream Deck',
    subtitle: 'controller',
    category: 'controller',
    iconSrc: '/assets/devices/elgato.svg',
    connected: true,
    kind: 'curated',
    curatedId: 'streamdeck',
    navigable: true,
    nexusControlEnabled: true,
    supportsNexusControl: true,
    experimental: false,
    ...overrides,
  };
}

beforeEach(() => {
  promoteDisplayToPanelMock.mockReset();
  demoteDisplayPanelMock.mockReset();
  toastPushMock.mockReset();
  controlDeviceMock.mockReset();
  mockUnified = [];
});

describe('DevicesPage device-row Nexus Link/Control toggle', () => {
  it('renders a working toggle for the promoted-monitor row and demotes the display on click', () => {
    demoteDisplayPanelMock.mockResolvedValue({ error: false });
    mockUnified = [monitorRow()];
    render(<DevicesPage serviceOnline onDeviceSelect={() => {}} />);

    const toggle = screen.getByRole('switch', { name: 'devices.nexusControl' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(toggle);
    expect(demoteDisplayPanelMock).toHaveBeenCalledWith('disp1');
    expect(promoteDisplayToPanelMock).not.toHaveBeenCalled();
    expect(controlDeviceMock).not.toHaveBeenCalled();
  });

  it('promotes the display when the toggle is switched back on', () => {
    promoteDisplayToPanelMock.mockResolvedValue({ id: 'rec1' });
    mockUnified = [monitorRow({ nexusControlEnabled: false })];
    render(<DevicesPage serviceOnline onDeviceSelect={() => {}} />);

    const toggle = screen.getByRole('switch', { name: 'devices.nexusControl' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(toggle);
    expect(promoteDisplayToPanelMock).toHaveBeenCalledWith('disp1');
    expect(demoteDisplayPanelMock).not.toHaveBeenCalled();
  });

  it('surfaces a toast when the demote request fails', async () => {
    demoteDisplayPanelMock.mockResolvedValue(null);
    mockUnified = [monitorRow()];
    render(<DevicesPage serviceOnline onDeviceSelect={() => {}} />);

    fireEvent.click(screen.getByRole('switch', { name: 'devices.nexusControl' }));
    await waitFor(() => expect(toastPushMock).toHaveBeenCalledWith({ title: 'displays.error.demote' }));
  });

  it('surfaces a toast when the promote request fails', async () => {
    promoteDisplayToPanelMock.mockResolvedValue(null);
    mockUnified = [monitorRow({ nexusControlEnabled: false })];
    render(<DevicesPage serviceOnline onDeviceSelect={() => {}} />);

    fireEvent.click(screen.getByRole('switch', { name: 'devices.nexusControl' }));
    await waitFor(() => expect(toastPushMock).toHaveBeenCalledWith({ title: 'displays.error.promote' }));
  });

  it('leaves a curated device row (Stream Deck) wired to controlDevice, unchanged', () => {
    mockUnified = [curatedRow()];
    render(<DevicesPage serviceOnline onDeviceSelect={() => {}} />);

    const toggle = screen.getByRole('switch', { name: 'devices.nexusControl' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(toggle);

    expect(controlDeviceMock).toHaveBeenCalledWith('streamdeck', false);
    expect(promoteDisplayToPanelMock).not.toHaveBeenCalled();
    expect(demoteDisplayPanelMock).not.toHaveBeenCalled();
  });

  it('renders no toggle for a device row with supportsNexusControl false', () => {
    mockUnified = [curatedRow({ supportsNexusControl: false })];
    render(<DevicesPage serviceOnline onDeviceSelect={() => {}} />);
    expect(screen.queryByRole('switch', { name: 'devices.nexusControl' })).toBeNull();
  });
});
