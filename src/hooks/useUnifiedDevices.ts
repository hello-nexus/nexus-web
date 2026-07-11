// Shared selector for the Devices page "Available" tab and the dashboard
// Devices widget. Both share one list and `key` namespace so a widget click
// can deep-link to a card on the page by matching keys.

import { useEffect, useMemo, useState } from 'react';
import { useDevices } from './useDevices';
import { usePanelDevices } from './usePanelDevices';
import { usePeripherals, type Peripheral } from './usePeripherals';
import { useWebHidPeripherals } from './useWebHidPeripherals';
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
  firmwareVersion?: string;
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
  // Whether the service actively controls this device. Always true for
  // non-curated kinds (panel/peripheral/app-device), which have no toggle.
  nexusControlEnabled: boolean;
  // True only for first-party curated handlers; gates whether the on/off
  // toggle renders. False for panel/peripheral/app-device and plugin devices.
  supportsNexusControl: boolean;
  // Device-level issue code (e.g. "usb-disconnected") surfaced as a warning
  // icon on the sidebar row and the Devices-page card; undefined = no issue.
  warning?: string;
  // Conflict-app catalog id competing with this device; drives the
  // device-page enable gate when Nexus Control is off.
  conflictAppId?: string;
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
  smarthub: '/assets/devices/smarthub.svg',
  'lianli-tl': '/assets/devices/lianli.svg',
  'lianli-aio': '/assets/devices/lianli.svg',
  'lianli-wireless': '/assets/devices/lianli.svg',
  strimer: '/assets/devices/device.svg',
  tryx: '/assets/devices/tryx.svg',
  streamdeck: '/assets/devices/streamdeck.svg',
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
  'lianli-tl': 'Lian Li Uni Fan TL',
  'lianli-aio': 'Lian Li Galahad II',
  'lianli-wireless': 'Lian Li Uni Fan Wireless',
  strimer: 'Lian Li Strimer',
  tryx: 'Tryx Panorama',
  // Model variants (Mini / MK.2 / XL / ...) stay on the service's own `name`
  // for the fuller Devices-page card; the sidebar/compact row uses the
  // family name, same as y70's resolution variants.
  streamdeck: 'Stream Deck',
};

const FALLBACK_ICON = '/assets/devices/device.svg';

// Curated devices the service detects but that have no dedicated settings
// page - their controls live on shared pages. Keep them in the device list
// (status/firmware) but don't give them a sidebar row or a clickable card
// that would land on the empty "no page yet" placeholder.
//   fan-hub (iBUYPOWER MiniHub): fans → Cooling page, ARGB → Lighting page.
const CURATED_WITHOUT_PAGE = new Set<string>(['fan-hub']);

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
      });
    }
    return list;
  }, [panels.devices, devices, merged, deviceApps, tryxSimulated, t]);

  return {
    unified,
    merged,
    webhidAvailable: webhid.available,
    controlDevice,
  };
}

function buildUnifiedList(
  panelDevices: PanelDevice[],
  curated: { id: string; name: string; category: string; connected: boolean; firmwareVersion: string; nexusControlEnabled?: boolean; supportsNexusControl?: boolean; warning?: string | null; conflictAppId?: string }[],
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
      nexusControlEnabled: backing?.nexusControlEnabled ?? true,
      supportsNexusControl: backing?.supportsNexusControl ?? false,
      warning: p.warning ?? undefined,
      conflictAppId: backing?.conflictAppId,
    });
  }

  for (const d of curated) {
    if (claimedCuratedIds.has(d.id)) continue;
    if (!d.connected) continue;
    list.push({
      key: `curated-${d.id}`,
      shortName: CURATED_SHORT_NAMES[d.id] || d.name,
      name: d.name,
      subtitle: d.category,
      category: d.category,
      iconSrc: CURATED_ICONS[d.id] || CATEGORY_ICONS[d.category] || FALLBACK_ICON,
      connected: d.connected,
      firmwareVersion: d.firmwareVersion || undefined,
      kind: 'curated',
      curatedId: d.id,
      navigable: !CURATED_WITHOUT_PAGE.has(d.id),
      nexusControlEnabled: d.nexusControlEnabled ?? true,
      supportsNexusControl: d.supportsNexusControl ?? false,
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
    });
  }

  return list;
}
