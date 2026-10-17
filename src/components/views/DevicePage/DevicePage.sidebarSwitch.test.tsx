import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UnifiedDevice } from '../../../hooks/useUnifiedDevices';

// The control-off gate (NexusControlOff) carries a second switch, "Show in
// sidebar", beside the Nexus Control one. It reads and writes the hidden set
// that the sidebar filters on.

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('../../common/Toast/Toast', () => ({
  useToast: () => ({ push: vi.fn() }),
}));
vi.mock('../../../hooks/useConflictApps', () => ({
  useConflictApps: () => ({ conflicts: [], ready: true }),
}));
vi.mock('../../../api/displays', () => ({ promoteDisplayToPanel: vi.fn() }));
vi.mock('./PanelDevicePage', () => ({
  PanelDevicePage: () => <div data-testid="panel-device-page" />,
}));

let mockHidden: readonly string[] = [];
const setHidden = vi.fn();
vi.mock('../../../hooks/useUiSettings', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../hooks/useUiSettings')>()),
  useSidebarHiddenDevices: () => ({ hidden: mockHidden, setHidden }),
}));

let mockUnified: UnifiedDevice[] = [];
vi.mock('../../../hooks/useUnifiedDevices', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../hooks/useUnifiedDevices')>()),
  useUnifiedDevices: () => ({ unified: mockUnified, controlDevice: vi.fn() }),
}));

import { DevicePage } from './DevicePage';

function curatedDevice(overrides: Partial<UnifiedDevice> = {}): UnifiedDevice {
  return {
    key: 'curated-elite',
    shortName: 'Elite Capellix LCD',
    name: 'Elite Capellix LCD',
    subtitle: 'cooler',
    category: 'cooler',
    iconSrc: '/assets/devices/corsair.svg',
    connected: true,
    kind: 'curated',
    curatedId: 'elite',
    navigable: true,
    nexusControlEnabled: false,
    supportsNexusControl: true,
    experimental: false,
    requiresBeta: false,
    ...overrides,
  };
}

beforeEach(() => {
  setHidden.mockReset();
  mockHidden = [];
  mockUnified = [];
});

describe('DevicePage control-off "Show in sidebar" switch', () => {
  it('reads ON by default and hides the device when flipped off', () => {
    mockUnified = [curatedDevice()];
    render(<DevicePage deviceKey="curated-elite" serviceOnline />);

    const toggle = screen.getByRole('switch', { name: 'devices.nexusControlOff.showInSidebar' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(toggle);
    expect(setHidden).toHaveBeenCalledWith('curated-elite', true);
  });

  it('reads OFF for a hidden device and shows it again when flipped on', () => {
    mockHidden = ['curated-elite'];
    mockUnified = [curatedDevice()];
    render(<DevicePage deviceKey="curated-elite" serviceOnline />);

    const toggle = screen.getByRole('switch', { name: 'devices.nexusControlOff.showInSidebar' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(toggle);
    expect(setHidden).toHaveBeenCalledWith('curated-elite', false);
  });

  it('is absent once Nexus Control is on, where the normal page renders', () => {
    mockUnified = [curatedDevice({ nexusControlEnabled: true, curatedId: 'unknown-handler' })];
    render(<DevicePage deviceKey="curated-elite" serviceOnline />);

    expect(screen.queryByRole('switch', { name: 'devices.nexusControlOff.showInSidebar' })).toBeNull();
  });

  it('renders on a promoted monitor control-off gate too', () => {
    mockUnified = [curatedDevice({
      key: 'panel-display:rec1', kind: 'panel', curatedId: undefined,
      panelDevice: {
        id: 'display:rec1', name: 'Xeneon Edge', subtitle: '', status: 'online', statusLabel: 'Online',
        connectionKind: 'attached-monitor', managementMode: 'managed', surfaceProfileKey: 'monitor-rec1',
        iconSrc: '/x.svg',
        capabilities: { layout: true, theme: true, displayControls: false, launchClose: false, pairing: false, presence: false, touch: true },
        displayId: 'disp1', panelRecordId: 'rec1', linkEnabled: false,
      },
    })];
    render(<DevicePage deviceKey="panel-display:rec1" serviceOnline />);

    fireEvent.click(screen.getByRole('switch', { name: 'devices.nexusControlOff.showInSidebar' }));
    expect(setHidden).toHaveBeenCalledWith('panel-display:rec1', true);
  });
});
