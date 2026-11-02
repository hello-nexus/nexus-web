import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
    t: (key: string, params?: Record<string, string>) => (key === 'displays.numberedName' && params ? `${params.name} (${params.n})` : key),
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
const fetchConflicts = vi.fn(async () => [] as unknown[]);
vi.mock('../api/conflicts', () => ({
  fetchConflicts: () => fetchConflicts(),
  killConflict: vi.fn(),
}));
vi.mock('../hooks/useConflictApps', () => ({
  useConflictApps: () => ({ conflicts: [], ready: false }),
}));
let mockTopology: { displays: Array<{ id: string; number: number }> } | null = null;
vi.mock('../hooks/useDisplayTopology', () => ({
  useDisplayTopology: () => ({ topology: mockTopology, loading: false, refresh: vi.fn() }),
}));
let mockFirmwareUpdates: ReadonlySet<string> = new Set();
vi.mock('../hooks/useFirmwareUpdates', () => ({
  useFirmwareUpdates: () => mockFirmwareUpdates,
}));
// Menu gating for the simulated-device remover; flipped per test.
// Hoisted: the widget registry reads the flag while the mock is first resolved.
const devToolsFlag = vi.hoisted(() => ({ on: true }));
vi.mock('../lib/devTools', () => ({ get DEV_TOOLS() { return devToolsFlag.on; } }));

// Hidden set and setter are driven per test; every other path sees an empty set.
let mockHidden: readonly string[] = [];
const setHidden = vi.fn();
vi.mock('../hooks/useUiSettings', async importOriginal => ({
  ...(await importOriginal<typeof import('../hooks/useUiSettings')>()),
  useSidebarHiddenDevices: () => ({ hidden: mockHidden, setHidden }),
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
  return render(
    <SidebarDevicesSection
      serviceOnline
      activeDeviceKey=""
      compact={false}
      onSelect={() => {}}
      onHeaderClick={() => {}}
      headerActive={false}
      onOpenFirmware={() => {}}
    />,
  );
}

describe('SidebarDevicesSection display numbers', () => {
  afterEach(() => { mockTopology = null; });
  const two = () => [
    monitorDevice({ key: 'a', shortName: 'DEL A0B8', panelDevice: monitorPanelDevice({ id: 'display:a', displayId: 'd1', genericDisplay: true }) }),
    monitorDevice({ key: 'b', shortName: 'DEL A0B8', panelDevice: monitorPanelDevice({ id: 'display:b', displayId: 'd2', genericDisplay: true }) }),
  ];

  it('suffixes identical display names with the shared display number', () => {
    mockUnified = two();
    mockTopology = { displays: [{ id: 'd1', number: 1 }, { id: 'd2', number: 2 }] };
    renderSidebar();
    expect(screen.getByText('DEL A0B8 (1)')).toBeTruthy();
    expect(screen.getByText('DEL A0B8 (2)')).toBeTruthy();
  });

  it('shows no number when there is only one screen', () => {
    mockUnified = [two()[0]];
    mockTopology = { displays: [{ id: 'd1', number: 1 }] };
    renderSidebar();
    expect(screen.getByText('DEL A0B8')).toBeTruthy();
  });

  it('shows no number on a branded panel', () => {
    mockUnified = [two()[0], monitorDevice({ key: 'c', panelDevice: monitorPanelDevice({ id: 'display:c', displayId: 'd2' }) })];
    mockTopology = { displays: [{ id: 'd1', number: 1 }, { id: 'd2', number: 2 }] };
    renderSidebar();
    expect(screen.getByText('Xeneon Edge')).toBeTruthy();
  });

  it('numbers branded panels that share a name', () => {
    mockUnified = [
      monitorDevice({ key: 'c', panelDevice: monitorPanelDevice({ id: 'display:c', displayId: 'd1' }) }),
      monitorDevice({ key: 'd', panelDevice: monitorPanelDevice({ id: 'display:d', displayId: 'd2' }) }),
    ];
    mockTopology = { displays: [{ id: 'd1', number: 1 }, { id: 'd2', number: 2 }] };
    renderSidebar();
    expect(screen.getAllByText(/Xeneon Edge/)).toHaveLength(2);
    expect(screen.queryByText('Xeneon Edge')).toBeNull();
  });
});

describe('SidebarDevicesSection panel toggle wording', () => {
  const generic = (linkEnabled: boolean) => monitorDevice({
    nexusControlEnabled: linkEnabled,
    panelDevice: monitorPanelDevice({ linkEnabled, genericDisplay: true }),
  });

  it('calls the toggle on a generic display a Nexus panel and demotes through the Displays API', () => {
    mockUnified = [generic(true)];
    renderSidebar();
    fireEvent.contextMenu(screen.getByRole('button', { name: /Xeneon Edge/ }));
    expect(screen.queryByRole('menuitem', { name: 'lighting.devices.menuControlOff' })).toBeNull();
    fireEvent.click(screen.getByRole('menuitem', { name: 'sidebar.device.panelOff' }));
    expect(demoteDisplayPanel).toHaveBeenCalledWith('disp1');
  });

  it('offers turning a generic display panel back on', () => {
    mockUnified = [generic(false)];
    renderSidebar();
    fireEvent.contextMenu(screen.getByRole('button', { name: /Xeneon Edge/ }));
    expect(screen.getByRole('menuitem', { name: 'sidebar.device.panelOn' })).toBeTruthy();
  });

  const usb = (secondaryMonitor: boolean, on: boolean) => monitorDevice({
    key: 'panel-stream:rec9', curatedId: 'nzxt-kraken', supportsNexusControl: true, nexusControlEnabled: on,
    panelDevice: monitorPanelDevice({ displayId: undefined, secondaryMonitor }),
  });

  it('calls the toggle on a USB panel a Nexus panel while its secondary monitor is on', () => {
    mockUnified = [usb(true, true)];
    renderSidebar();
    fireEvent.contextMenu(screen.getByRole('button', { name: /Xeneon Edge/ }));
    expect(screen.getByRole('menuitem', { name: 'sidebar.device.panelOff' })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: 'lighting.devices.menuControlOff' })).toBeNull();
  });

  it('keeps Nexus Control wording for a USB panel with its secondary monitor off', () => {
    mockUnified = [usb(false, true)];
    renderSidebar();
    fireEvent.contextMenu(screen.getByRole('button', { name: /Xeneon Edge/ }));
    expect(screen.getByRole('menuitem', { name: 'lighting.devices.menuControlOff' })).toBeTruthy();
  });

  it('keeps Nexus Control wording for a branded display panel', () => {
    mockUnified = [monitorDevice({ nexusControlEnabled: true, panelDevice: monitorPanelDevice({ linkEnabled: true }) })];
    renderSidebar();
    fireEvent.contextMenu(screen.getByRole('button', { name: /Xeneon Edge/ }));
    expect(screen.getByRole('menuitem', { name: 'lighting.devices.menuControlOff' })).toBeTruthy();
  });
});

describe('SidebarDevicesSection hidden devices', () => {
  const controlOn = () => monitorDevice({
    key: 'curated-on', shortName: 'Keeb TKL', name: 'Keeb TKL', kind: 'curated', curatedId: 'keeb',
    panelDevice: undefined, supportsNexusControl: true, nexusControlEnabled: true,
  });

  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { mockHidden = []; });

  it('omits a hidden device whose Nexus Control is off', () => {
    mockHidden = ['panel-display:rec1'];
    mockUnified = [monitorDevice(), controlOn()];
    renderSidebar();
    expect(screen.queryByText('Xeneon Edge')).toBeNull();
    expect(screen.getByText('Keeb TKL')).toBeTruthy();
  });

  it('lists a hidden device once its Nexus Control is on', () => {
    mockHidden = ['curated-on'];
    mockUnified = [controlOn()];
    renderSidebar();
    expect(screen.getByText('Keeb TKL')).toBeTruthy();
  });

  it('lists a control-off device that is not hidden', () => {
    mockHidden = ['curated-on'];
    mockUnified = [monitorDevice()];
    renderSidebar();
    expect(screen.getByText('Xeneon Edge')).toBeTruthy();
  });

  it('offers Hide from sidebar on a control-off row and writes its key', () => {
    mockUnified = [monitorDevice()];
    renderSidebar();
    fireEvent.contextMenu(screen.getByRole('button', { name: /Xeneon Edge/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'sidebar.device.hide' }));
    expect(setHidden).toHaveBeenCalledWith('panel-display:rec1', true);
  });

  it('does not offer Hide on a row whose Nexus Control is on', () => {
    mockUnified = [controlOn()];
    renderSidebar();
    fireEvent.contextMenu(screen.getByRole('button', { name: /Keeb TKL/ }));
    expect(screen.queryByRole('menuitem', { name: 'sidebar.device.hide' })).toBeNull();
    expect(screen.getByRole('menuitem', { name: 'lighting.devices.menuControlOff' })).toBeTruthy();
  });

  it('does not offer Hide on a device that never supports Nexus Control', () => {
    mockUnified = [monitorDevice({ supportsNexusControl: false, nexusControlEnabled: true })];
    renderSidebar();
    fireEvent.contextMenu(screen.getByRole('button', { name: /Xeneon Edge/ }));
    expect(screen.queryByRole('menuitem', { name: 'sidebar.device.hide' })).toBeNull();
  });
});

describe('SidebarDevicesSection ordering', () => {
  it('sorts rows by the brand their logo shows, then by label', () => {
    const curated = { kind: 'curated' as const, panelDevice: undefined, supportsNexusControl: false, nexusControlEnabled: true };
    mockUnified = [
      monitorDevice({ ...curated, key: 'curated-keeb', shortName: 'HYTE Keeb TKL', name: 'HYTE Keeb TKL', iconSrc: '/assets/devices/hyte.svg' }),
      monitorDevice({ ...curated, key: 'streamdeck:SN1', shortName: 'Elgato Stream Deck +', name: 'Elgato Stream Deck +', iconSrc: '/assets/devices/elgato.svg' }),
      // No brand in the name, but the Corsair logo groups it under Corsair.
      monitorDevice(),
    ];
    renderSidebar();

    expect(screen.getAllByText(/^(Keeb TKL|Stream Deck \+|Xeneon Edge)$/).map(el => el.textContent))
      .toEqual(['Xeneon Edge', 'Stream Deck +', 'Keeb TKL']);
  });
});

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

describe('SidebarDevicesSection warning and update glyphs', () => {
  const deck = (nexusControlEnabled: boolean) => monitorDevice({
    key: 'streamdeck:SN1',
    kind: 'curated',
    curatedId: 'streamdeck-plus',
    panelDevice: undefined,
    supportsNexusControl: true,
    nexusControlEnabled,
    warning: 'elgato-software-running',
  });

  beforeEach(() => {
    mockFirmwareUpdates = new Set(['streamdeck-plus']);
  });

  afterEach(() => {
    mockFirmwareUpdates = new Set();
  });

  it('shows both glyphs while Nexus Control is on', () => {
    mockUnified = [deck(true)];
    renderSidebar();
    expect(screen.getByRole('img', { name: 'devices.warning.elgatoSoftwareRunning' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'devices.firmwareUpdate.tooltip' })).toBeInTheDocument();
  });

  it('opens Firmware Updates from the glyph without selecting the row', () => {
    mockUnified = [deck(true)];
    const onSelect = vi.fn();
    const onOpenFirmware = vi.fn();
    render(
      <SidebarDevicesSection
        serviceOnline
        activeDeviceKey=""
        compact={false}
        onSelect={onSelect}
        onHeaderClick={() => {}}
        headerActive={false}
        onOpenFirmware={onOpenFirmware}
      />,
    );
    const glyph = screen.getByRole('button', { name: 'devices.firmwareUpdate.tooltip' });
    fireEvent.click(glyph);
    fireEvent.keyDown(glyph, { key: 'Enter' });
    expect(onOpenFirmware).toHaveBeenCalledTimes(2);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('hides both glyphs while Nexus Control is off', () => {
    mockUnified = [deck(false)];
    renderSidebar();
    expect(screen.queryByRole('img', { name: 'devices.warning.elgatoSoftwareRunning' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'devices.firmwareUpdate.tooltip' })).not.toBeInTheDocument();
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
    devToolsFlag.on = true;
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

  it('holds turning Nexus Control on behind the end-app prompt while the competing app runs', async () => {
    fetchConflicts.mockResolvedValueOnce([
      { id: 'lian-li-l-connect', displayName: 'Lian Li L-Connect', category: 'lighting', processName: 'L-Connect 3.exe', pid: 7 },
    ]);
    mockUnified = [monitorDevice({
      key: 'curated-lianli',
      shortName: 'Lian Li Uni Hub',
      kind: 'curated',
      curatedId: 'lianli',
      panelDevice: undefined,
      nexusControlEnabled: false,
      conflictAppId: 'lian-li-l-connect',
    })];
    renderSidebar();
    openMenuOn('Lian Li Uni Hub');
    fireEvent.click(screen.getByRole('menuitem', { name: 'lighting.devices.menuControlOn' }));
    await waitFor(() => expect(screen.getByText('devices.conflictEnable.title')).toBeInTheDocument());
    expect(controlDevice).not.toHaveBeenCalled();
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
    devToolsFlag.on = false;
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
    devToolsFlag.on = true;
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
    view.rerender(<SidebarDevicesSection serviceOnline activeDeviceKey="" compact={false} onSelect={() => {}} onHeaderClick={() => {}} headerActive={false} onOpenFirmware={() => {}} />);
    mockUnified = [tryxSim];
    view.rerender(<SidebarDevicesSection serviceOnline activeDeviceKey="" compact={false} onSelect={() => {}} onHeaderClick={() => {}} headerActive={false} onOpenFirmware={() => {}} />);
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
    view.rerender(<SidebarDevicesSection serviceOnline activeDeviceKey="" compact={false} onSelect={() => {}} onHeaderClick={() => {}} headerActive={false} onOpenFirmware={() => {}} />);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

describe('SidebarDevicesSection SMBus pseudo-device exclusion', () => {
  // The Memory (SMBus) card has no settings page of its own (hasPage: false
  // on the wire, which useUnifiedDevices maps to navigable: false), so the
  // sidebar's own `.filter(d => d.navigable)` keeps it out without any
  // bus-specific check here.
  it('never lists the non-navigable SMBus device', () => {
    mockUnified = [monitorDevice({
      key: 'curated-smbus-dram',
      shortName: 'devices.smbusDram.name',
      name: 'devices.smbusDram.name',
      kind: 'curated',
      curatedId: 'smbus-dram',
      panelDevice: undefined,
      navigable: false,
      supportsNexusControl: true,
      nexusControlEnabled: true,
      bus: 'smbus',
    })];
    renderSidebar();
    expect(screen.queryByText('devices.smbusDram.name')).not.toBeInTheDocument();
    expect(screen.getByText('sidebar.devices.empty')).toBeInTheDocument();
  });
});

describe('SidebarDevicesSection cooler LCD rows', () => {
  it('lists a cooler LCD with Nexus Control off', () => {
    mockUnified = [monitorDevice({
      key: 'curated-lianli-hydroshift2',
      shortName: 'Lian Li HydroShift II',
      name: 'Lian Li HydroShift II',
      kind: 'curated',
      curatedId: 'lianli-hydroshift2',
      panelDevice: undefined,
      supportsNexusControl: true,
      nexusControlEnabled: false,
    })];
    renderSidebar();
    expect(screen.getByText('Lian Li HydroShift II')).toBeInTheDocument();
  });

  it('highlights the panel row while its page is open on the curated key', () => {
    mockUnified = [monitorDevice({
      key: 'panel-stream-rec1',
      shortName: 'Lian Li HydroShift II LCD-S',
      curatedId: 'lianli-hydroshift2',
    })];
    render(<SidebarDevicesSection serviceOnline activeDeviceKey="curated-lianli-hydroshift2" compact={false} onSelect={() => {}} onHeaderClick={() => {}} headerActive={false} onOpenFirmware={() => {}} />);
    expect(screen.getByText('Lian Li HydroShift II LCD-S').closest('button')?.className).toMatch(/active/);
  });
});

describe('SidebarDevicesSection order', () => {
  it('lists rows alphabetically by label, a disconnected device keeping its place', () => {
    mockUnified = [
      monitorDevice({ key: 'd-z', shortName: 'Zeta Hub' }),
      monitorDevice({ key: 'd-a', shortName: 'alpha fan', connected: false, category: 'fan' }),
      monitorDevice({ key: 'd-m', shortName: 'Mid Strip', category: 'ledstrip' }),
    ];
    renderSidebar();

    const labels = ['alpha fan', 'Mid Strip', 'Zeta Hub'].map(n => screen.getByText(n));
    expect(labels[0].compareDocumentPosition(labels[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(labels[1].compareDocumentPosition(labels[2]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
