// Shared selector for the Devices page "Available" tab and the dashboard
// Devices widget. Both share one list and `key` namespace so a widget click
// can deep-link to a card on the page by matching keys.

import { useEffect, useMemo, useState } from 'react';
import { useDevices } from './useDevices';
import { usePanelDevices } from './usePanelDevices';
import { usePeripherals, type Peripheral } from './usePeripherals';
import { useWebHidPeripherals } from './useWebHidPeripherals';
import { useStreamDecks } from './useStreamDecks';
import {
  getConnectedSimulatedPanels,
  PANEL_SIMULATION_CHANGED_EVENT,
} from '../lib/panelSimulation';
import { isRemotePanel, type PanelDevice } from '../panel/device/panelDevices';
import { useTryxSimulated } from '../lib/tryxSimulation';
import { useTranslation } from '../lib/i18n';
import {
  getAllMarketplaceListings,
  subscribeMarketplaceRegistry,
} from '../widgets/marketplaceRegistry';
import type { AppInstalledListing } from '../widgets/types';

export type UnifiedDeviceKind = 'panel' | 'curated' | 'peripheral' | 'app-device';

export interface UnifiedDevice {
  key: string;
  shortName: string;
  name: string;
  subtitle: string;
  category: string;
  iconSrc: string;
  connected: boolean;
  kind: UnifiedDeviceKind;
  curatedId?: string;
  peripheral?: Peripheral;
  panelDevice?: PanelDevice;
  /** Dev-tools simulated device: the page runs on mock data, no hardware. */
  simulated?: boolean;
  // Whether this device has its own settings page. Drives the sidebar
  // DEVICES section (only navigable devices get a row) and whether the
  // Devices-list card is clickable. Devices whose controls live on shared
  // pages (e.g. MiniHub - fans on Cooling, ARGB on Lighting) are
  // non-navigable so a click doesn't land on a "no page yet" placeholder.
  navigable: boolean;
  // Whether the device is actively managed. For a first-party curated
  // handler this mirrors the handler's on/off gate; for a promoted-monitor
  // panel entry (panelDevice.displayId set) it mirrors panelDevice.linkEnabled.
  // Always true for every other kind (peripheral/app-device, non-monitor
  // panels), which have no toggle.
  nexusControlEnabled: boolean;
  // Gates whether the on/off toggle renders on the Devices-page row. True for
  // first-party curated handlers, and for a promoted-monitor panel entry
  // (panelDevice.displayId set) - its toggle calls the display promote/demote
  // API instead of the handler control API. False for every other
  // panel/peripheral/app-device kind and plugin devices.
  supportsNexusControl: boolean;
  // True for a Nexus Control device driving non-HYTE/iBUYPOWER hardware
  // (experimental support); drives the "Experimental" badge. Always false for
  // panel devices (no promoted-monitor handler is experimental) and whenever
  // supportsNexusControl is false.
  experimental: boolean;
  // Device-level issue code (e.g. "usb-disconnected") surfaced as a warning
  // icon on the sidebar row and the Devices-page card; undefined = no issue.
  warning?: string;
  // Conflict-app catalog id competing with this device; drives the
  // device-page enable gate when Nexus Control is off.
  conflictAppId?: string;
  // Present only on a per-deck Stream Deck entry (curatedId 'streamdeck'):
  // the specific physical deck's serial. Threads through DevicePage to
  // StreamDeckDevicePage so the page shows exactly this deck - one sidebar
  // entry per deck, no in-page picker.
  streamdeckSerial?: string;
}

// A simulated panel carries the marker on its panel record; the Tryx sim sets
// `simulated` directly. Neither marker alone covers both.
export function isSimulatedDevice(device: UnifiedDevice): boolean {
  return device.panelDevice?.connectionKind === 'simulated' || device.simulated === true;
}

const CATEGORY_ICONS: Record<string, string> = {
  mouse: '/assets/devices/mouse.svg',
  keyboard: '/assets/devices/keyboard.svg',
  headset: '/assets/devices/headset.svg',
  gamepad: '/assets/devices/gamepad.svg',
  display: '/assets/devices/y70.svg',
  controller: '/assets/devices/cnvs.svg',
  cooler: '/assets/devices/np50.svg',
};

const CURATED_ICONS: Record<string, string> = {
  cnvs: '/assets/devices/cnvs.svg',
  corsair: '/assets/devices/corsair.svg',
  lianli: '/assets/devices/lianli.svg',
  // Q60 and Q80 share the QSeriesHandler (id 'qseries') on the service side.
  // Use the Q60 art as the family icon since the silhouettes are nearly
  // identical at thumbnail size.
  qseries: '/assets/devices/q60.svg',
  y70: '/assets/devices/y70.svg',
  keeb: '/assets/devices/keeb.svg',
  np50: '/assets/devices/np50.svg',
  'fan-hub': '/assets/devices/ibuypower.svg',
  // No AW5 art yet; the brand mark reads better here than the generic glyph.
  aw5: '/assets/devices/ibuypower.svg',
  smarthub: '/assets/devices/smarthub.svg',
  'lianli-tl': '/assets/devices/lianli.svg',
  'lianli-aio': '/assets/devices/lianli.svg',
  'lianli-wireless': '/assets/devices/lianli.svg',
  strimer: '/assets/devices/device.svg',
  tryx: '/assets/devices/tryx.svg',
  streamdeck: '/assets/devices/elgato.svg',
};

const CURATED_SHORT_NAMES: Record<string, string> = {
  // Real connected Y70 of any variant is just "Y70 Touch" (no resolution
  // class on a hardware row). Simulator entries carry the 2.5K / 4K suffix;
  // see SIMULATED_PANEL_PRESETS in panelSimulation.ts and the
  // simulated-vs-real branch in buildUnifiedList below.
  y70: 'Y70 Touch',
  'y70-4k': 'Y70 Touch',
  // qseries omitted: the service reports the actual product name ("Q60" /
  // "Q80") on the device record; overriding would collapse both to
  // "Q-series".
  cnvs: 'CNVS',
  corsair: 'Corsair iCUE LINK Hub',
  keeb: 'Keeb',
  lianli: 'Lian Li Uni Hub',
  'fan-hub': 'iBUYPOWER MiniHub',
  aw5: 'iBUYPOWER AW5',
  'lianli-tl': 'Lian Li Uni Fan TL',
  'lianli-aio': 'Lian Li Galahad II',
  'lianli-wireless': 'Lian Li Uni Fan Wireless',
  strimer: 'Lian Li Strimer',
  tryx: 'Tryx Panorama',
};

const FALLBACK_ICON = '/assets/devices/device.svg';

// Curated devices the service detects but that have no dedicated settings
// page - their controls live on shared pages. Keep them in the device list
// (status/firmware) but don't give them a sidebar row or a clickable card
// that would land on the empty "no page yet" placeholder.
//   fan-hub (iBUYPOWER MiniHub): fans → Cooling page, ARGB → Lighting page.
//   aw5 (iBUYPOWER AW5): the vendor driver owns the cooler; Nexus only reports
//     that it is present, so there is nothing to configure anywhere.
const CURATED_WITHOUT_PAGE = new Set<string>(['fan-hub', 'aw5']);

export function useUnifiedDevices(enabled: boolean) {
  const { t } = useTranslation();
  const tryxSimulated = useTryxSimulated();
  const [simulatedPanels, setSimulatedPanels] = useState(() => getConnectedSimulatedPanels());
  const [deviceApps, setDeviceApps] = useState<AppInstalledListing[]>(
    () => getAllMarketplaceListings().filter(a => a.category === 'device'),
  );

  useEffect(() => {
    const handler = () => setSimulatedPanels(getConnectedSimulatedPanels());
    window.addEventListener(PANEL_SIMULATION_CHANGED_EVENT, handler);
    return () => window.removeEventListener(PANEL_SIMULATION_CHANGED_EVENT, handler);
  }, []);

  useEffect(() => {
    return subscribeMarketplaceRegistry(() => {
      setDeviceApps(getAllMarketplaceListings().filter(a => a.category === 'device'));
    });
  }, []);

  const { devices, controlDevice } = useDevices(enabled);
  const peripherals = usePeripherals(enabled);
  const webhid = useWebHidPeripherals(enabled);
  const { decks: streamDecks } = useStreamDecks(enabled);
  // Y70 follows the same rules as every other panel: in the list only if
  // (a) physically connected to this host, or (b) its simulator is active
  // (then it's in `simulatedPanels`). No always-on phantom.
  const panels = usePanelDevices(enabled, { simulatedPanels });

  const merged: Peripheral[] = useMemo(() => {
    const servicePeripherals = peripherals.peripherals.map(p => ({ ...p, source: 'service' as const }));
    const servicePids = new Set(servicePeripherals.map(p => p.productId.toLowerCase()));
    const webhidPeripherals = webhid.peripherals
      .filter(p => !servicePids.has(p.productId.toLowerCase()))
      .map(p => ({ ...p, source: 'webhid' as const }));
    return [...servicePeripherals, ...webhidPeripherals];
  }, [peripherals.peripherals, webhid.peripherals]);

  const unified = useMemo(() => {
    // Paired phones (remote panel sessions) are remote controls, not hardware
    // Nexus controls, so they're never devices - excluded from every device
    // surface (Devices page, sidebar, search, detail route). Managed from the
    // Pair Phone modal via /panel/phone/sessions instead.
    const filteredPanels = panels.devices.filter(p => !isRemotePanel(p.connectionKind));
    const list = buildUnifiedList(filteredPanels, devices, merged, deviceApps);

    // Stream Deck: one sidebar/Devices-page entry PER physical deck (real or
    // simulated), keyed by serial - not the single 'streamdeck' handler row
    // buildUnifiedList already skips. nexusControlEnabled/supportsNexusControl
    // are handler-level (one on/off gate for every deck), so every entry
    // mirrors the same handler row; warning/conflictAppId come straight off
    // each deck since the service already computes them per deck. shortName
    // is the generic family label (matches every other curated/panel device's
    // sidebar row); name is the deck's own persisted name so the Devices-page
    // card still tells two same-model decks apart.
    const streamdeckHandler = devices.find(d => d.id === 'streamdeck');
    const deckSupportsControl = streamdeckHandler?.supportsNexusControl ?? false;
    const deckControlEnabled = streamdeckHandler?.nexusControlEnabled ?? true;
    // A deck's own `connected` tracks whether the worker holds its HID open,
    // and StreamDeckConnectionWorker.Tick drops every surface while Nexus
    // Control is off - a deliberate release, not an absence. The handler row's
    // `connected` is USB enumeration, which the gate never touches, so it
    // still answers "is the hardware there".
    // The handler signal is per-model, not per-deck, and deck records persist
    // unpruned: while control is off, every deck ever attached to this machine
    // reads attached as long as any one of them is plugged in.
    const deckControlOff = deckSupportsControl && !deckControlEnabled;
    const deckPresentWhileReleased = deckControlOff && (streamdeckHandler?.connected ?? false);
    for (const deck of streamDecks) {
      // A simulated deck (serial `sim-*`) only belongs in the list while its
      // simulator is active; a disconnected one is a leftover persisted record,
      // not a device the user owns, so it must not show as a phantom entry.
      if (deck.serial.startsWith('sim-') && !deck.connected) continue;
      list.push({
        key: `streamdeck:${deck.serial}`,
        shortName: t('devices.streamdeck.modelName', { model: deck.model }),
        name: deck.name,
        subtitle: streamdeckHandler?.category ?? 'controller',
        category: streamdeckHandler?.category ?? 'controller',
        iconSrc: CURATED_ICONS.streamdeck ?? FALLBACK_ICON,
        connected: deck.connected || deckPresentWhileReleased,
        kind: 'curated',
        curatedId: 'streamdeck',
        streamdeckSerial: deck.serial,
        simulated: deck.serial.startsWith('sim-'),
        navigable: true,
        nexusControlEnabled: deckControlEnabled,
        supportsNexusControl: deckSupportsControl,
        experimental: false,
        warning: deck.warning,
        conflictAppId: deck.conflictAppId,
      });
    }

    // Dev-tools: a simulated Tryx so the device page renders with no hardware.
    // Skipped if a real Tryx is already present, to avoid a duplicate row.
    if (tryxSimulated && !list.some(d => d.curatedId === 'tryx')) {
      list.push({
        key: 'curated-tryx-sim',
        shortName: t('devices.tryx.simulatedName'),
        name: CURATED_SHORT_NAMES.tryx ?? 'Tryx Panorama',
        subtitle: 'cooler',
        category: 'cooler',
        iconSrc: CURATED_ICONS.tryx ?? FALLBACK_ICON,
        connected: true,
        kind: 'curated',
        curatedId: 'tryx',
        simulated: true,
        navigable: true,
        nexusControlEnabled: true,
        supportsNexusControl: false,
        experimental: false,
      });
    }
    return list;
  }, [panels.devices, devices, merged, deviceApps, streamDecks, tryxSimulated, t]);

  return {
    unified,
    merged,
    webhidAvailable: webhid.available,
    controlDevice,
  };
}

function buildUnifiedList(
  panelDevices: PanelDevice[],
  curated: { id: string; name: string; category: string; connected: boolean; firmwareVersion: string; nexusControlEnabled?: boolean; supportsNexusControl?: boolean; experimental?: boolean; warning?: string | null; conflictAppId?: string }[],
  peripherals: Peripheral[],
  deviceApps: AppInstalledListing[] = [],
): UnifiedDevice[] {
  const list: UnifiedDevice[] = [];
  const claimedCuratedIds = new Set<string>();

  for (const p of panelDevices) {
    if (p.sourceId) claimedCuratedIds.add(p.sourceId);
    const sourceId = p.sourceId;
    // Real connected panels use CURATED_SHORT_NAMES so the sidebar shows a
    // normalized label ("Y70 Touch") regardless of variant. Simulator entries
    // keep their preset name so the resolution suffix ("Y70 Touch 2.5K" /
    // "Y70 Touch 4K") stays visible.
    const isSimulated = p.connectionKind === 'simulated';
    const shortName = isSimulated
      ? p.name
      : (sourceId && CURATED_SHORT_NAMES[sourceId]) || p.name;
    // A hardware panel (Q60/Y70) is backed by a first-party handler of the same
    // id; inherit its Nexus Control gate so the toggle shows on the panel card.
    const backing = sourceId ? curated.find(c => c.id === sourceId) : undefined;
    // A promoted-monitor panel (Xeneon Edge, etc) has no first-party handler
    // (no sourceId) - its on/off state is the record's own `linkEnabled`, and
    // the row toggle always renders for it (DevicesPage wires it to the
    // display promote/demote API, not controlDevice).
    const isPromotedMonitor = !!p.displayId;
    list.push({
      key: `panel-${p.id}`,
      shortName,
      name: p.name,
      subtitle: p.subtitle,
      category: 'display',
      iconSrc: p.iconSrc,
      connected: p.status !== 'offline',
      kind: 'panel',
      panelDevice: p,
      curatedId: sourceId,
      navigable: true,
      nexusControlEnabled: isPromotedMonitor ? (p.linkEnabled ?? true) : (backing?.nexusControlEnabled ?? true),
      // A simulated panel has no hardware to hand back to another app, so the
      // Nexus Control gate is meaningless on it.
      supportsNexusControl: isSimulated
        ? false
        : isPromotedMonitor ? true : (backing?.supportsNexusControl ?? false),
      experimental: backing?.experimental ?? false,
      warning: p.warning ?? undefined,
      conflictAppId: backing?.conflictAppId,
    });
  }

  for (const d of curated) {
    if (claimedCuratedIds.has(d.id)) continue;
    // Superseded by the per-deck 'streamdeck' entries built in
    // useUnifiedDevices, so the singleton handler row never doubles them up.
    if (d.id === 'streamdeck') continue;
    if (!d.connected) continue;
    list.push({
      key: `curated-${d.id}`,
      shortName: CURATED_SHORT_NAMES[d.id] || d.name,
      name: d.name,
      subtitle: d.category,
      category: d.category,
      iconSrc: CURATED_ICONS[d.id] || CATEGORY_ICONS[d.category] || FALLBACK_ICON,
      connected: d.connected,
      kind: 'curated',
      curatedId: d.id,
      navigable: !CURATED_WITHOUT_PAGE.has(d.id),
      nexusControlEnabled: d.nexusControlEnabled ?? true,
      supportsNexusControl: d.supportsNexusControl ?? false,
      experimental: d.experimental ?? false,
      warning: d.warning ?? undefined,
      conflictAppId: d.conflictAppId,
    });
  }

  for (const p of peripherals) {
    list.push({
      key: `peripheral-${p.id}`,
      shortName: p.name,
      name: p.name,
      subtitle: p.vendor,
      category: p.category,
      iconSrc: CATEGORY_ICONS[p.category] || FALLBACK_ICON,
      connected: true,
      kind: 'peripheral',
      peripheral: p,
      // Detection-only peripherals (no capabilities - nothing to configure)
      // have no settings page, so they're non-navigable: kept off the sidebar
      // and shown as a static card on the Devices page rather than deep-linking
      // to an empty "No Capabilities" page.
      navigable: p.capabilities.length > 0,
      nexusControlEnabled: true,
      supportsNexusControl: false,
      experimental: false,
    });
  }

  for (const app of deviceApps) {
    list.push({
      key: `app-device-${app.id}`,
      shortName: app.name,
      name: app.name,
      subtitle: 'device',
      category: 'device',
      iconSrc: app.iconUrl ?? FALLBACK_ICON,
      connected: true,
      kind: 'app-device',
      navigable: true,
      nexusControlEnabled: true,
      supportsNexusControl: false,
      experimental: false,
    });
  }

  return list;
}
