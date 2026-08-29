// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildPanelDevices } from './usePanelDevices';
import type { PanelDeviceRecord } from '../api/panel';

const LABELS = {
  simulated: 'Simulated',
  phone: 'Phone',
  online: 'Online',
  paired: 'Paired',
  recentlyActive: 'Recently active',
  running: 'Running',
  simulatedSuffix: ' (Simulated)',
  linkOff: 'Nexus Link is off',
};

function xeneonRecord(displayName: string): PanelDeviceRecord {
  return {
    id: 'rec-1',
    displayName,
    firstSeenAt: 0,
    lastSeenAt: 1,
    displayId: 'disp-1',
    capabilities: {
      surface: 'monitor',
      family: 'xeneon-edge',
      touch: true,
      cssWidth: 1707,
      cssHeight: 480,
      dpr: 1.5,
      dpi: 183,
    },
  };
}

function firstDevice(record: PanelDeviceRecord) {
  const devices = buildPanelDevices({
    curatedDevices: [],
    phoneSessions: [],
    records: [record],
    status: null,
    simulatedPanels: [],
    labels: LABELS,
  });
  return devices[0];
}

describe('buildPanelDevices promoted-monitor branding', () => {
  it('replaces the Windows PnP-identity default name with the family name', () => {
    const device = firstDevice(xeneonRecord('CRX ED00'));
    expect(device.name).toBe('Xeneon Edge');
    expect(device.iconSrc).toBe('/assets/devices/corsair.svg');
  });

  it('replaces the EDID product-name default with the family name', () => {
    expect(firstDevice(xeneonRecord('CORSAIR XENEON EDGE')).name).toBe('Xeneon Edge');
    expect(firstDevice(xeneonRecord('XENEON EDGE')).name).toBe('Xeneon Edge');
  });

  it('keeps a user rename but still shows the family icon', () => {
    const device = firstDevice(xeneonRecord('Living Room Strip'));
    expect(device.name).toBe('Living Room Strip');
    expect(device.iconSrc).toBe('/assets/devices/corsair.svg');
  });

  it('carries the record touch capability onto the device entry', () => {
    expect(firstDevice(xeneonRecord('CRX ED00')).capabilities.touch).toBe(true);
  });
});

describe('buildPanelDevices Nexus Link off state', () => {
  it('keeps a disabled record in the list (physically attached, unmanaged rather than disconnected)', () => {
    const record = { ...xeneonRecord('Xeneon Edge'), enabled: false };
    const devices = buildPanelDevices({
      curatedDevices: [],
      phoneSessions: [],
      records: [record],
      status: null,
      simulatedPanels: [],
      labels: LABELS,
    });
    expect(devices).toHaveLength(1);
    expect(devices[0].linkEnabled).toBe(false);
    expect(devices[0].subtitle).toBe('Nexus Link is off');
  });

  it('marks an enabled (or absent-enabled) record as linkEnabled with the resolution subtitle', () => {
    const enabledDevice = firstDevice({ ...xeneonRecord('Xeneon Edge'), enabled: true });
    expect(enabledDevice.linkEnabled).toBe(true);
    expect(enabledDevice.subtitle).toBe('Online - 1707x480');

    const absentEnabledDevice = firstDevice(xeneonRecord('Xeneon Edge'));
    expect(absentEnabledDevice.linkEnabled).toBe(true);
  });

  it('still hides a disabled record whose bound monitor is unplugged', () => {
    const record = { ...xeneonRecord('Xeneon Edge'), enabled: false, displayAttached: false };
    const devices = buildPanelDevices({
      curatedDevices: [],
      phoneSessions: [],
      records: [record],
      status: null,
      simulatedPanels: [],
      labels: LABELS,
    });
    expect(devices).toHaveLength(0);
  });
});

describe('buildPanelDevices streamed panels', () => {
  function krakenRecord(): PanelDeviceRecord {
    return {
      id: 'rec-lcd',
      displayName: 'NZXT Kraken LCD',
      firstSeenAt: 0,
      lastSeenAt: 1,
      streamed: true,
      capabilities: { surface: 'kraken', touch: false, cssWidth: 640, cssHeight: 640, dpr: 1 },
    };
  }

  it('lists a live streamed panel as an editable panel', () => {
    const device = firstDevice(krakenRecord());

    expect(device.id).toBe('stream:rec-lcd');
    expect(device.panelRecordId).toBe('rec-lcd');
    expect(device.runtimeSurface).toBe('kraken');
    expect(device.modalKind).toBe('panel-editor');
    expect(device.capabilities.layout).toBe(true);
    // Host-rendered glass: nothing to launch, no display controls, no touch.
    expect(device.capabilities.launchClose).toBe(false);
    expect(device.capabilities.displayControls).toBe(false);
    expect(device.capabilities.touch).toBe(false);
  });

  it('hides a record whose stream session is gone', () => {
    const record = { ...krakenRecord(), streamed: false };

    expect(buildPanelDevices({
      curatedDevices: [],
      phoneSessions: [],
      records: [record],
      status: null,
      simulatedPanels: [],
      labels: LABELS,
    })).toHaveLength(0);
  });
});
