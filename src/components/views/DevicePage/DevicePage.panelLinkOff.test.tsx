import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UnifiedDevice } from '../../../hooks/useUnifiedDevices';
import type { PanelDevice } from '../../../panel/device/panelDevices';

// A promoted-monitor panel (the Xeneon Edge and any other promoted display)
// with Nexus Link off stays in the unified device list (see
// usePanelDevices.test.ts), so DevicePage must route it to an accurate
// off-state gate instead of the generic "not connected" empty state, with a
// toggle that calls POST /displays/{id}/panel (promoteDisplayToPanel) to
// turn it back on. Contrast PanelDevicePage.nexusLink.test.tsx, which covers
// the reverse direction (the on-page toggle turning Nexus Link off).

const promoteDisplayToPanelMock = vi.fn();
const toastPushMock = vi.fn();

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${JSON.stringify(vars)}` : key),
  }),
}));
vi.mock('../../common/Toast/Toast', () => ({
  useToast: () => ({ push: toastPushMock }),
}));
vi.mock('../../../hooks/useConflictApps', () => ({
  useConflictApps: () => ({ conflicts: [], ready: true }),
}));
vi.mock('../../../api/displays', () => ({
  promoteDisplayToPanel: (...a: unknown[]) => promoteDisplayToPanelMock(...a),
}));
vi.mock('./PanelDevicePage', () => ({
  PanelDevicePage: () => <div data-testid="panel-device-page" />,
}));

let mockUnified: UnifiedDevice[] = [];
vi.mock('../../../hooks/useUnifiedDevices', () => ({
  useUnifiedDevices: () => ({ unified: mockUnified, controlDevice: vi.fn() }),
}));

import { DevicePage } from './DevicePage';

function monitorPanelDevice(overrides: Partial<PanelDevice> = {}): PanelDevice {
  return {
    id: 'display:rec1',
    name: 'Xeneon Edge',
    subtitle: 'Nexus Link is off',
    status: 'online',
    statusLabel: 'Online',
    connectionKind: 'attached-monitor',
    managementMode: 'managed',
    surfaceProfileKey: 'monitor-rec1',
    iconSrc: '/assets/devices/corsair.svg',
    capabilities: {
      layout: true, theme: true, displayControls: false, launchClose: false,
      pairing: false, presence: false, touch: true,
    },
    displayId: 'disp1',
    panelRecordId: 'rec1',
    linkEnabled: false,
    ...overrides,
  };
}

function monitorDevice(overrides: Partial<UnifiedDevice> = {}): UnifiedDevice {
  return {
    key: 'panel-display:rec1',
    shortName: 'Xeneon Edge',
    name: 'Xeneon Edge',
    subtitle: 'Nexus Link is off',
    category: 'display',
    iconSrc: '/assets/devices/corsair.svg',
    connected: true,
    kind: 'panel',
    panelDevice: monitorPanelDevice(),
    navigable: true,
    nexusControlEnabled: true,
    supportsNexusControl: false,
    experimental: false,
    ...overrides,
  };
}

beforeEach(() => {
  promoteDisplayToPanelMock.mockReset();
  toastPushMock.mockReset();
  mockUnified = [];
});

describe('DevicePage promoted-monitor Nexus Link off', () => {
  it('shows the accurate off-state gate instead of "not connected" for a disabled promoted monitor', () => {
    mockUnified = [monitorDevice()];
    render(<DevicePage deviceKey="panel-display:rec1" serviceOnline />);

    expect(screen.getByText('Xeneon Edge')).toBeInTheDocument();
    expect(screen.getByText('devices.nexusControlOff.enableHint')).toBeInTheDocument();
    expect(screen.queryByText('devices.page.notConnected')).not.toBeInTheDocument();
  });

  it('re-promotes the display when the toggle is switched on', () => {
    mockUnified = [monitorDevice()];
    promoteDisplayToPanelMock.mockResolvedValue({ id: 'rec1' });
    render(<DevicePage deviceKey="panel-display:rec1" serviceOnline />);

    const toggle = screen.getByRole('switch', { name: 'devices.nexusControl' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(toggle);

    expect(promoteDisplayToPanelMock).toHaveBeenCalledWith('disp1');
  });

  it('surfaces a toast when the re-promote request fails', async () => {
    mockUnified = [monitorDevice()];
    promoteDisplayToPanelMock.mockResolvedValue(null);
    render(<DevicePage deviceKey="panel-display:rec1" serviceOnline />);

    fireEvent.click(screen.getByRole('switch', { name: 'devices.nexusControl' }));

    await waitFor(() => expect(toastPushMock).toHaveBeenCalledWith({ title: 'displays.error.promote' }));
  });

  it('does not toast when the re-promote request succeeds', async () => {
    mockUnified = [monitorDevice()];
    promoteDisplayToPanelMock.mockResolvedValue({ id: 'rec1' });
    render(<DevicePage deviceKey="panel-display:rec1" serviceOnline />);

    fireEvent.click(screen.getByRole('switch', { name: 'devices.nexusControl' }));

    await waitFor(() => expect(promoteDisplayToPanelMock).toHaveBeenCalled());
    expect(toastPushMock).not.toHaveBeenCalled();
  });

  it('dispatches to the normal panel page (no off-gate) once Nexus Link is on', () => {
    mockUnified = [monitorDevice({ panelDevice: monitorPanelDevice({ linkEnabled: true }) })];
    render(<DevicePage deviceKey="panel-display:rec1" serviceOnline />);

    expect(screen.getByTestId('panel-device-page')).toBeInTheDocument();
    expect(screen.queryByText('devices.nexusControlOff.enableHint')).not.toBeInTheDocument();
  });
});
