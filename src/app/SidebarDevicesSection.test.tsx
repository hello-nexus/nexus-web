import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { UnifiedDevice } from '../hooks/useUnifiedDevices';
import type { PanelDevice } from '../panel/device/panelDevices';

// The sidebar DEVICES section shows the same "Nexus Link off" glyph for a
// promoted-monitor panel (Xeneon Edge and similar) whose Nexus Link toggle is
// off as it already shows for a curated device with Nexus Control off. Both
// go through the same `supportsNexusControl && !nexusControlEnabled` gate -
// useUnifiedDevices.ts mirrors a promoted monitor's `panelDevice.linkEnabled`
// into `nexusControlEnabled` and always sets `supportsNexusControl` for it, so
// the icon needs no panel-specific check of its own.

vi.mock('../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

let mockUnified: UnifiedDevice[] = [];
vi.mock('../hooks/useUnifiedDevices', () => ({
  useUnifiedDevices: () => ({ unified: mockUnified }),
}));

import { SidebarDevicesSection } from './SidebarDevicesSection';

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
    // Mirrors the default fixture's linkEnabled: false, per
    // useUnifiedDevices.ts's promoted-monitor mapping.
    nexusControlEnabled: false,
    supportsNexusControl: true,
    experimental: false,
    ...overrides,
  };
}

function renderSidebar() {
  render(
    <SidebarDevicesSection
      serviceOnline
      activeDeviceKey=""
      compact={false}
      onSelect={() => {}}
      onHeaderClick={() => {}}
      headerActive={false}
    />,
  );
}

describe('SidebarDevicesSection Nexus Link off indicator', () => {
  it('shows the off glyph for a promoted monitor whose Nexus Link is off', () => {
    mockUnified = [monitorDevice()];
    renderSidebar();
    expect(screen.getByRole('img', { name: 'devices.nexusControlOff.sidebarTooltip' })).toBeInTheDocument();
  });

  it('does not show the off glyph for a promoted monitor whose Nexus Link is on', () => {
    mockUnified = [monitorDevice({
      panelDevice: monitorPanelDevice({ linkEnabled: true }),
      nexusControlEnabled: true,
    })];
    renderSidebar();
    expect(screen.queryByRole('img', { name: 'devices.nexusControlOff.sidebarTooltip' })).not.toBeInTheDocument();
  });

  it('still shows the off glyph for a curated device with Nexus Control off', () => {
    mockUnified = [monitorDevice({
      key: 'curated-lianli',
      kind: 'curated',
      curatedId: 'lianli',
      panelDevice: undefined,
      supportsNexusControl: true,
      nexusControlEnabled: false,
    })];
    renderSidebar();
    expect(screen.getByRole('img', { name: 'devices.nexusControlOff.sidebarTooltip' })).toBeInTheDocument();
  });
});
