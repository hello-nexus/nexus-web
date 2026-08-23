import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
const controlDevice = vi.fn();
vi.mock('../hooks/useUnifiedDevices', async importOriginal => ({
  ...(await importOriginal<typeof import('../hooks/useUnifiedDevices')>()),
  useUnifiedDevices: () => ({ unified: mockUnified, controlDevice }),
}));

// The row context menu reaches four teardown/gate APIs; each is mocked so a
// menu click asserts on the call rather than hitting the service or
// local storage.
const promoteDisplayToPanel = vi.fn(async () => true);
const demoteDisplayPanel = vi.fn(async () => true);
vi.mock('../api/displays', () => ({
  promoteDisplayToPanel: (id: string) => promoteDisplayToPanel(id),
  demoteDisplayPanel: (id: string) => demoteDisplayPanel(id),
}));
const clearSimulatedStreamDeck = vi.fn(async () => true);
vi.mock('../api/streamdeck', () => ({
  clearSimulatedStreamDeck: () => clearSimulatedStreamDeck(),
}));
const setSimulatedPanelConnected = vi.fn();
// The real useUnifiedDevices module is pulled in via importOriginal above, so
// the mock has to carry the exports it imports from here too - not just the
// one this component calls.
vi.mock('../lib/panelSimulation', () => ({
  setSimulatedPanelConnected: (id: string, connected: boolean) => setSimulatedPanelConnected(id, connected),
  getConnectedSimulatedPanels: () => [],
  PANEL_SIMULATION_CHANGED_EVENT: 'y70-simulate-changed',
}));
const setTryxSimulated = vi.fn();
vi.mock('../lib/tryxSimulation', () => ({
  setTryxSimulated: (on: boolean) => setTryxSimulated(on),
}));
// Menu gating for the simulated-device remover; flipped per test.
let devTools = true;
vi.mock('../lib/devTools', () => ({ get DEV_TOOLS() { return devTools; } }));

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
  return render(
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

describe('SidebarDevicesSection simulated badge', () => {
  // Device-agnostic: the badge also marks a simulated Tryx cooler and a
  // simulated Stream Deck, neither of which is a panel.
  it('labels the badge with the generic simulated string', () => {
    mockUnified = [monitorDevice({
      key: 'curated-tryx-sim',
      kind: 'curated',
      curatedId: 'tryx',
      panelDevice: undefined,
      simulated: true,
    })];
    renderSidebar();
    expect(screen.getByRole('img', { name: 'devices.simulated' })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'devices.panels.simulated' })).not.toBeInTheDocument();
  });
});

describe('SidebarDevicesSection row context menu', () => {
  beforeEach(() => {
    devTools = true;
    vi.clearAllMocks();
  });

  function openMenuOn(name: string) {
    fireEvent.contextMenu(screen.getByRole('button', { name: new RegExp(name) }));
  }

  it('offers turning Nexus Control off for a curated device that has it on', () => {
    mockUnified = [monitorDevice({
      key: 'curated-lianli',
      shortName: 'Lian Li Uni Hub',
      kind: 'curated',
      curatedId: 'lianli',
      panelDevice: undefined,
      nexusControlEnabled: true,
    })];
    renderSidebar();
    openMenuOn('Lian Li Uni Hub');
    fireEvent.click(screen.getByRole('menuitem', { name: 'lighting.devices.menuControlOff' }));
    expect(controlDevice).toHaveBeenCalledWith('lianli', false);
  });

  it('offers turning Nexus Control on for a curated device that has it off', () => {
    mockUnified = [monitorDevice({
      key: 'curated-lianli',
      shortName: 'Lian Li Uni Hub',
      kind: 'curated',
      curatedId: 'lianli',
      panelDevice: undefined,
      nexusControlEnabled: false,
    })];
    renderSidebar();
    openMenuOn('Lian Li Uni Hub');
    fireEvent.click(screen.getByRole('menuitem', { name: 'lighting.devices.menuControlOn' }));
    expect(controlDevice).toHaveBeenCalledWith('lianli', true);
  });

  // A promoted monitor has no first-party handler: its gate is the same
  // display promote/demote call the Devices page and Displays tab make.
  it('promotes the display for a promoted monitor instead of calling controlDevice', () => {
    mockUnified = [monitorDevice()];
    renderSidebar();
    openMenuOn('Xeneon Edge');
    fireEvent.click(screen.getByRole('menuitem', { name: 'lighting.devices.menuControlOn' }));
    expect(promoteDisplayToPanel).toHaveBeenCalledWith('disp1');
    expect(controlDevice).not.toHaveBeenCalled();
  });

  it('renders no menu for a device with neither a control gate nor a simulator', () => {
    mockUnified = [monitorDevice({
      key: 'curated-keeb',
      shortName: 'Keeb',
      kind: 'curated',
      curatedId: 'keeb',
      panelDevice: undefined,
      supportsNexusControl: false,
    })];
    renderSidebar();
    openMenuOn('Keeb');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('disconnects a simulated panel by its source id', () => {
    mockUnified = [monitorDevice({
      key: 'panel-simulated:q60',
      shortName: 'Q60',
      supportsNexusControl: false,
      panelDevice: monitorPanelDevice({
        id: 'simulated:q60',
        sourceId: 'q60',
        connectionKind: 'simulated',
        displayId: undefined,
      }),
    })];
    renderSidebar();
    openMenuOn('Q60');
    fireEvent.click(screen.getByRole('menuitem', { name: 'sidebar.device.removeSimulated' }));
    expect(setSimulatedPanelConnected).toHaveBeenCalledWith('q60', false);
  });

  it('clears the simulated Tryx cooler', () => {
    mockUnified = [monitorDevice({
      key: 'curated-tryx-sim',
      shortName: 'Tryx Panorama',
      kind: 'curated',
      curatedId: 'tryx',
      panelDevice: undefined,
      simulated: true,
      supportsNexusControl: false,
    })];
    renderSidebar();
    openMenuOn('Tryx Panorama');
    fireEvent.click(screen.getByRole('menuitem', { name: 'sidebar.device.removeSimulated' }));
    expect(setTryxSimulated).toHaveBeenCalledWith(false);
  });

  it('clears a simulated Stream Deck through the service', () => {
    mockUnified = [monitorDevice({
      key: 'streamdeck:sim-0080',
      shortName: 'Stream Deck MK.2',
      kind: 'curated',
      curatedId: 'streamdeck',
      streamdeckSerial: 'sim-0080',
      panelDevice: undefined,
      simulated: true,
      supportsNexusControl: false,
    })];
    renderSidebar();
    openMenuOn('Stream Deck MK.2');
    fireEvent.click(screen.getByRole('menuitem', { name: 'sidebar.device.removeSimulated' }));
    expect(clearSimulatedStreamDeck).toHaveBeenCalled();
  });

  // The remover is a dev-tools affordance: a release bundle must not offer it
  // even if a simulated record somehow reaches the list.
  it('hides the simulated remover in a release build', () => {
    devTools = false;
    mockUnified = [monitorDevice({
      key: 'curated-tryx-sim',
      shortName: 'Tryx Panorama',
      kind: 'curated',
      curatedId: 'tryx',
      panelDevice: undefined,
      simulated: true,
      supportsNexusControl: false,
    })];
    renderSidebar();
    openMenuOn('Tryx Panorama');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

// Removing a simulated device unmounts the menu synchronously, so the menu's
// own close animation never completes and its onClose never fires. The row key
// must still be dropped, or the menu reappears by itself when a device with
// that key comes back (same simulator re-enabled from Tools).
describe('SidebarDevicesSection context menu staleness', () => {
  it('does not reopen the menu when a removed device returns', () => {
    devTools = true;
    const tryxSim = monitorDevice({
      key: 'curated-tryx-sim',
      shortName: 'Tryx Panorama',
      kind: 'curated',
      curatedId: 'tryx',
      panelDevice: undefined,
      simulated: true,
      supportsNexusControl: false,
    });
    mockUnified = [tryxSim];
    const view = renderSidebar();
    fireEvent.contextMenu(screen.getByRole('button', { name: /Tryx Panorama/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'sidebar.device.removeSimulated' }));

    mockUnified = [];
    view.rerender(<SidebarDevicesSection serviceOnline activeDeviceKey="" compact={false} onSelect={() => {}} onHeaderClick={() => {}} headerActive={false} />);
    mockUnified = [tryxSim];
    view.rerender(<SidebarDevicesSection serviceOnline activeDeviceKey="" compact={false} onSelect={() => {}} onHeaderClick={() => {}} headerActive={false} />);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  // Same latch, reached without the row ever leaving: an actionless row mounts
  // no menu, so nothing can clear the key it stored.
  it('does not reopen the menu when an actionless row gains a control gate', () => {
    const keeb = monitorDevice({
      key: 'curated-keeb',
      shortName: 'Keeb',
      kind: 'curated',
      curatedId: 'keeb',
      panelDevice: undefined,
      supportsNexusControl: false,
    });
    mockUnified = [keeb];
    const view = renderSidebar();
    fireEvent.contextMenu(screen.getByRole('button', { name: /Keeb/ }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    mockUnified = [{ ...keeb, supportsNexusControl: true }];
    view.rerender(<SidebarDevicesSection serviceOnline activeDeviceKey="" compact={false} onSelect={() => {}} onHeaderClick={() => {}} headerActive={false} />);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
