import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchPanelDevices,
  fetchPanelPhoneSessions,
  fetchPanelStatus,
  type PanelDeviceRecord,
  type PanelPhoneSession,
  type PanelStatus,
} from '../api/panel';
import { useTopicCallback } from './useMultiplexSocket';
import { useTranslation } from '../lib/i18n';
import {
  formatPanelInches,
  getSimulatedPanelGridCapacity,
  getSimulatedPanelPhysicalSize,
  type SimulatedPanelDefinition,
} from '../lib/panelSimulation';
import { useDevices, type DeviceListItem } from './useDevices';
import {
  panelIconForSource,
  PANEL_MONITOR_ICON,
  type PanelDevice,
  type PanelDeviceCapabilities,
} from '../panel/device/panelDevices';
import type { PanelSurface } from '../panel/types';

const Y70_CAPABILITIES: PanelDeviceCapabilities = {
  layout: true,
  theme: true,
  displayControls: true,
  launchClose: true,
  pairing: false,
  presence: false,
  touch: true,
};

const WIDGET_PANEL_CAPABILITIES: PanelDeviceCapabilities = {
  layout: true,
  theme: true,
  displayControls: false,
  launchClose: false,
  pairing: false,
  presence: false,
  touch: true,
};

const EXTERNAL_PANEL_CAPABILITIES: PanelDeviceCapabilities = {
  layout: false,
  theme: false,
  displayControls: false,
  launchClose: false,
  pairing: true,
  presence: true,
  touch: true,
};

// User-promoted OS monitors hosting a kiosk. Layout + theme edit like any
// panel; no Y70 hardware controls (those are serial/DDC Y70-specific).
// `touch` is per-device - stamped from the record (Windows pointer-device
// association at promote time).
const HOSTED_MONITOR_CAPABILITIES: Omit<PanelDeviceCapabilities, 'touch'> = {
  layout: true,
  theme: true,
  displayControls: false,
  launchClose: false,
  pairing: false,
  presence: false,
};

const WIDGET_PANEL_PROFILES: Partial<Record<string, {
  surface: PanelSurface;
  width: number;
  height: number;
  dpi: number;
}>> = {
  y70: { surface: 'y70', width: 682, height: 2560, dpi: 337 },
  // Q-series (Q60 + Q80) share this profile. Bench-verified on a real Q60
  // (2026-05-15): wm size 720x1280, wm density 240, 60 Hz, MT8167 Android 11.
  // The `qseries` key matches QSeriesHandler.Id on the service side.
  qseries: { surface: 'q60', width: 720, height: 1280, dpi: 240 },
};

const WIDGET_PANEL_IDS = new Set(Object.keys(WIDGET_PANEL_PROFILES));

export function usePanelDevices(
  enabled: boolean,
  {
    simulatedPanels = [],
  }: {
    simulatedPanels?: SimulatedPanelDefinition[];
  } = {},
) {
  const { t } = useTranslation();
  const { devices: curatedDevices } = useDevices(enabled);
  const [status, setStatus] = useState<PanelStatus | null>(null);
  const [phoneSessions, setPhoneSessions] = useState<PanelPhoneSession[]>([]);
  const [records, setRecords] = useState<PanelDeviceRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [panelStatus, sessions, deviceRecords] = await Promise.all([
      fetchPanelStatus(),
      fetchPanelPhoneSessions(),
      fetchPanelDevices(),
    ]);
    setStatus(panelStatus ?? null);
    setPhoneSessions(sessions?.sessions ?? []);
    setRecords(deviceRecords?.devices ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    // Initial REST seed for panel status + phone sessions; push updates
    // arrive via the `panel/device` topic below.
    void refresh();
  }, [enabled, refresh]);

  // Push-driven refresh: panel/device fires on every device CRUD; the same
  // topic also rides on phone-presence subscribe/unsubscribe via the service
  // hub, so a phone connecting/disconnecting bumps the count without a poll.
  useTopicCallback('panel/device', enabled, () => {
    void refresh();
  });

  const devices = useMemo(() => {
    return buildPanelDevices({
      curatedDevices,
      phoneSessions,
      records,
      status,
      simulatedPanels,
      labels: {
        simulated: t('devices.panels.simulated'),
        phone: t('devices.panels.phone'),
        online: t('devices.connected'),
        paired: t('phonePair.statusPaired'),
        recentlyActive: t('phonePair.statusRecentlyActive'),
        running: t('devices.panels.running'),
        simulatedSuffix: t('devices.panels.simulatedSuffix'),
      },
    });
  }, [curatedDevices, phoneSessions, records, status, simulatedPanels, t]);

  return { devices, loading };
}

function buildPanelDevices({
  curatedDevices,
  phoneSessions,
  records,
  status,
  simulatedPanels,
  labels,
}: {
  curatedDevices: DeviceListItem[];
  phoneSessions: PanelPhoneSession[];
  records: PanelDeviceRecord[];
  status: PanelStatus | null;
  simulatedPanels: SimulatedPanelDefinition[];
  labels: {
    simulated: string;
    phone: string;
    online: string;
    paired: string;
    recentlyActive: string;
    running: string;
    simulatedSuffix: string;
  };
}): PanelDevice[] {
  const devices: PanelDevice[] = [];
  const connectedWidgetPanels = curatedDevices.filter(d => d.connected && d.category === 'display' && WIDGET_PANEL_IDS.has(d.id));
  const simulatedDefinitions = simulatedPanels;

  for (const device of connectedWidgetPanels) {
    const profile = WIDGET_PANEL_PROFILES[device.id];
    if (!profile) continue;
    const isY70 = device.id === 'y70';
    const capacity = getPanelProfileCapacity(profile);
    devices.push({
      id: `device:${device.id}`,
      sourceId: device.id,
      name: device.name,
      subtitle: `${profile.width}x${profile.height} @ ${profile.dpi} dpi - short ${formatPanelInches(capacity.shortSideInches)} - ${capacity.columns}x${capacity.rows} grid`,
      status: status?.kioskRunning && isY70 ? 'running' : 'online',
      statusLabel: status?.kioskRunning && isY70 ? labels.running : labels.online,
      connectionKind: 'attached-monitor',
      managementMode: 'managed',
      surfaceProfileKey: isY70 ? 'y70-portrait' : `${device.id}-display`,
      runtimeSurface: profile.surface,
      previewSize: { width: profile.width, height: profile.height },
      previewDpi: profile.dpi,
      iconSrc: panelIconForSource(device.id),
      capabilities: isY70 ? Y70_CAPABILITIES : WIDGET_PANEL_CAPABILITIES,
      modalKind: isY70 ? 'y70-compat' : 'panel-editor',
      warning: device.warning,
    });
  }

  for (const panel of simulatedDefinitions) {
    if (connectedWidgetPanels.some(d => d.id === panel.id)) continue;
    const capacity = getSimulatedPanelGridCapacity(panel);
    const physical = getSimulatedPanelPhysicalSize(panel);
    devices.push({
      id: `simulated:${panel.id}`,
      sourceId: panel.id,
      // Bare device name; the localized "(Simulated)" suffix is applied at
      // the page-title level (see PanelDevicePage) so the sidebar entry stays
      // compact ("Y70" / "Q60").
      name: panel.name,
      subtitle: `${labels.simulated} - ${panel.width}x${panel.height} @ ${panel.dpi} dpi - short ${formatPanelInches(physical.shortSideInches)} - ${capacity.columns}x${capacity.rows} grid`,
      status: 'online',
      statusLabel: labels.online,
      connectionKind: 'simulated',
      managementMode: 'managed-test',
      surfaceProfileKey: `simulated-${panel.id}`,
      runtimeSurface: panel.surface,
      previewSize: { width: panel.width, height: panel.height },
      previewDpi: panel.dpi,
      iconSrc: panelIconForSource(panel.id),
      capabilities: panel.surface === 'y70' ? Y70_CAPABILITIES : WIDGET_PANEL_CAPABILITIES,
      modalKind: panel.surface === 'y70' ? 'y70-compat' : 'panel-editor',
    });
  }

  // Promoted-monitor panels: backed directly by a display-bound record the
  // service created on POST /displays/{id}/panel. Hidden while the bound
  // monitor is unplugged (displayAttached === false); unknown topology
  // (null/undefined) keeps the row visible rather than flickering it away.
  for (const record of records) {
    // Off panels keep their record (config persistence) but host no kiosk -
    // no device entry until turned back on from the Displays tab.
    if (!record.displayId || record.displayAttached === false || record.enabled === false) continue;
    const cssWidth = record.capabilities?.cssWidth ?? 0;
    const cssHeight = record.capabilities?.cssHeight ?? 0;
    // CSS pixels, same convention as the Y70/phone subtitles. Reconstructing
    // native px (css x dpr) double-rounds and drifts by a pixel at 150%.
    const resolution = cssWidth > 0 && cssHeight > 0 ? `${cssWidth}x${cssHeight}` : '';
    devices.push({
      id: `display:${record.id}`,
      panelRecordId: record.id,
      displayId: record.displayId,
      name: record.displayName,
      subtitle: resolution ? `${labels.online} - ${resolution}` : labels.online,
      status: 'online',
      statusLabel: labels.online,
      connectionKind: 'attached-monitor',
      managementMode: 'managed',
      surfaceProfileKey: `monitor-${record.id}`,
      runtimeSurface: (record.capabilities?.surface as PanelSurface | undefined) ?? 'monitor',
      previewSize: cssWidth > 0 && cssHeight > 0 ? { width: cssWidth, height: cssHeight } : undefined,
      iconSrc: PANEL_MONITOR_ICON,
      capabilities: { ...HOSTED_MONITOR_CAPABILITIES, touch: record.capabilities?.touch ?? false },
      modalKind: 'panel-editor',
    });
  }

  for (const session of phoneSessions) {
    const recentlyActive = session.recentlyActive;
    devices.push({
      id: `external:phone:${session.id}`,
      sourceId: session.id,
      name: session.name || labels.phone,
      subtitle: labels.phone,
      status: recentlyActive ? 'recently-active' : 'paired',
      statusLabel: recentlyActive ? labels.recentlyActive : labels.paired,
      connectionKind: 'remote',
      managementMode: 'self-managed',
      surfaceProfileKey: 'phone-responsive',
      runtimeSurface: 'phone',
      iconSrc: PANEL_MONITOR_ICON,
      capabilities: EXTERNAL_PANEL_CAPABILITIES,
    });
  }

  return devices;
}

function getPanelProfileCapacity(profile: {
  surface: PanelSurface;
  width: number;
  height: number;
  dpi: number;
}) {
  const capacity = getSimulatedPanelGridCapacity({
    id: 'profile',
    name: 'Profile',
    ...profile,
  });
  const physical = getSimulatedPanelPhysicalSize(profile);
  return {
    ...capacity,
    shortSideInches: physical.shortSideInches,
    diagonalInches: physical.diagonalInches,
  };
}
