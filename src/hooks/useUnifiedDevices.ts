// Shared selector for the Devices page "Available" tab AND the
// dashboard Devices widget. Keeping both surfaces on the same unified
// list (and the same `key` namespace) means a widget click can deep-link
// straight to a card on the page by matching keys.

import { useEffect, useMemo, useState } from 'react';
import { useDevices } from './useDevices';
import { usePanelDevices } from './usePanelDevices';
import { usePeripherals, type Peripheral } from './usePeripherals';
import { useWebHidPeripherals } from './useWebHidPeripherals';
import {
  getConnectedSimulatedPanels,
  PANEL_SIMULATION_CHANGED_EVENT,
} from '../lib/panelSimulation';
import type { PanelDevice } from '../panel/panelDevices';

export type UnifiedDeviceKind = 'panel' | 'curated' | 'peripheral';

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
}

const CATEGORY_ICONS: Record<string, string> = {
  mouse: '/assets/devices/mouse.svg',
  keyboard: '/assets/devices/keyboard.svg',
  headset: '/assets/devices/headset.svg',
  gamepad: '/assets/devices/gamepad.svg',
  display: '/assets/devices/y70.svg',
  controller: '/assets/devices/cnvs.svg',
  hub: '/assets/devices/fan-hub.svg',
};

const CURATED_ICONS: Record<string, string> = {
  cnvs: '/assets/devices/cnvs.svg',
  // Q60 and Q80 share the QSeriesHandler (id 'qseries') on the service side.
  // Use the Q60 art as the family icon since the silhouettes are nearly
  // identical at thumbnail size.
  qseries: '/assets/devices/q60.svg',
  y70: '/assets/devices/y70.svg',
  keeb: '/assets/devices/keeb.svg',
  'fan-hub': '/assets/devices/fan-hub.svg',
};

const CURATED_SHORT_NAMES: Record<string, string> = {
  // Real connected Y70 of any variant is just "Y70 Touch" — the
  // user doesn't need to see resolution class on a hardware row.
  // Simulator entries carry the 2.5K / 4K suffix; see the
  // SIMULATED_PANEL_PRESETS in panelSimulation.ts and the
  // simulated-vs-real branch in buildUnifiedList below.
  y70: 'Y70 Touch',
  'y70-4k': 'Y70 Touch',
  // qseries deliberately omitted: the service reports the actual
  // product name ("Q60" / "Q80") on the device record. Overriding
  // here would collapse both to "Q-series" and lose the distinction
  // the user wants surfaced.
  cnvs: 'CNVS',
  keeb: 'Keeb',
  'fan-hub': 'iBUYPOWER MiniHub',
};

const FALLBACK_ICON = '/assets/devices/device.svg';

export function useUnifiedDevices(enabled: boolean) {
  const [simulatedPanels, setSimulatedPanels] = useState(() => getConnectedSimulatedPanels());

  useEffect(() => {
    const handler = () => setSimulatedPanels(getConnectedSimulatedPanels());
    window.addEventListener(PANEL_SIMULATION_CHANGED_EVENT, handler);
    return () => window.removeEventListener(PANEL_SIMULATION_CHANGED_EVENT, handler);
  }, []);

  const devices = useDevices(enabled);
  const peripherals = usePeripherals(enabled);
  const webhid = useWebHidPeripherals(enabled);
  // Y70 follows the same rules as Q60 / every other panel: it
  // appears in the list only if (a) physically connected to this
  // host, or (b) the user has activated its simulator (in which
  // case it'll be in `simulatedPanels`). No always-on phantom.
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
    // Phone sessions are stored server-side in settings.json and stick around
    // even after the phone hasn't pinged in months. The Available tab is for
    // currently-available devices, so we explicitly drop external-browser
    // sessions stuck in 'paired' (no recent keepalive). Any future status
    // values on phone sessions are surfaced by default; only the known
    // stale-pair state is filtered out.
    const filteredPanels = panels.devices.filter(p =>
      !(p.connectionKind === 'external-browser' && p.status === 'paired')
    );
    return buildUnifiedList(filteredPanels, devices.filter(d => d.connected), merged);
  }, [panels.devices, devices, merged]);

  return {
    unified,
    merged,
    webhidAvailable: webhid.available,
    requestWebHid: webhid.requestDevice,
  };
}

function buildUnifiedList(
  panelDevices: PanelDevice[],
  curated: { id: string; name: string; category: string; connected: boolean; firmwareVersion: string }[],
  peripherals: Peripheral[],
): UnifiedDevice[] {
  const list: UnifiedDevice[] = [];
  const claimedCuratedIds = new Set<string>();

  for (const p of panelDevices) {
    if (p.sourceId) claimedCuratedIds.add(p.sourceId);
    const sourceId = p.sourceId;
    // Real connected panels go through CURATED_SHORT_NAMES so the
    // sidebar shows a normalized hardware label ("Y70 Touch")
    // regardless of which variant is attached. Simulator entries
    // keep their preset name verbatim so the resolution-class suffix
    // ("Y70 Touch 2.5K" / "Y70 Touch 4K") stays visible.
    const isSimulated = p.connectionKind === 'simulated';
    const shortName = isSimulated
      ? p.name
      : (sourceId && CURATED_SHORT_NAMES[sourceId]) || p.name;
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
    });
  }

  for (const d of curated) {
    if (claimedCuratedIds.has(d.id)) continue;
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
    });
  }

  return list;
}
