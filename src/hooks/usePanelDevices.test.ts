// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildPanelDevices, isTurnedOffPlainMonitor, titanIiLcdNames } from './usePanelDevices';
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

describe('buildPanelDevices USB device secondary monitor', () => {
  const streamed: PanelDeviceRecord = {
    id: 'usb-1', displayName: 'Kraken LCD', firstSeenAt: 0, lastSeenAt: 1, streamed: true, secondaryMonitor: true,
    capabilities: { surface: 'monitor', family: 'nzxt-kraken', cssWidth: 640, cssHeight: 640 },
  };
  // Leftover record bound to the virtual monitor; the service reports it detached.
  const leftover: PanelDeviceRecord = { ...xeneonRecord('Kraken LCD'), id: 'rec-virtual', displayAttached: false };

  it('lists one entry for the USB device and none for its virtual display', () => {
    const devices = buildPanelDevices({
      curatedDevices: [], phoneSessions: [], records: [streamed, leftover], status: null, simulatedPanels: [], labels: LABELS,
    });
    expect(devices.map(d => d.id)).toEqual(['stream:usb-1']);
    expect(devices[0].secondaryMonitor).toBe(true);
  });

  it('is not resurrected by the turned-off plain monitor path', () => {
    expect(isTurnedOffPlainMonitor({ ...leftover, enabled: false, capabilities: { surface: 'monitor' } })).toBe(false);
    const devices = buildPanelDevices({
      curatedDevices: [], phoneSessions: [], records: [streamed, { ...leftover, enabled: false }], status: null, simulatedPanels: [], labels: LABELS,
    });
    expect(devices).toHaveLength(1);
  });
});

describe('buildPanelDevices promoted-monitor branding', () => {
  it('replaces the Windows PnP-identity default name with the family name', () => {
    const device = firstDevice(xeneonRecord('CRX ED00'));
    expect(device.name).toBe('Corsair Xeneon Edge');
    expect(device.iconSrc).toBe('/assets/devices/corsair.svg');
  });

  it('replaces the EDID product-name default with the family name', () => {
    expect(firstDevice(xeneonRecord('CORSAIR XENEON EDGE')).name).toBe('Corsair Xeneon Edge');
    expect(firstDevice(xeneonRecord('XENEON EDGE')).name).toBe('Corsair Xeneon Edge');
  });

  it('keeps a user rename but still shows the family icon', () => {
    const device = firstDevice(xeneonRecord('Living Room Strip'));
    expect(device.name).toBe('Living Room Strip');
    expect(device.iconSrc).toBe('/assets/devices/corsair.svg');
  });

  it('gives a plain promoted monitor the promoted-monitor icon', () => {
    const record = xeneonRecord('DEL A0B8');
    record.capabilities = { surface: 'monitor', cssWidth: 1920, cssHeight: 1200 };
    expect(firstDevice(record).iconSrc).toBe('/assets/devices/monitor.svg');
  });

  it('carries the record touch capability onto the device entry', () => {
    expect(firstDevice(xeneonRecord('CRX ED00')).capabilities.touch).toBe(true);
  });

  it('brands the HYTE Y60 display from either default name and the HYTE icon', () => {
    for (const raw of ['RTK BC32', 'RTK FHD HDR']) {
      const record = xeneonRecord(raw);
      record.capabilities = { ...record.capabilities, family: 'hyte-y60', touch: false };
      const device = firstDevice(record);
      expect(device.name).toBe('HYTE Y60 Display');
      expect(device.iconSrc).toBe('/assets/devices/hyte.svg');
      expect(device.experimental).toBeUndefined();
    }
  });

  it('brands the iCUE LINK 5" LCD from its PnP identity, as a TITAN II LCD when that pump is on the hub', () => {
    const record = xeneonRecord('XMD 00EA');
    record.capabilities = { ...record.capabilities, family: 'icue-link-lcd5', touch: false };
    const device = firstDevice(record);
    expect(device.name).toBe('Corsair iCUE LINK 5" LCD');
    expect(device.iconSrc).toBe('/assets/devices/corsair.svg');
    expect(device.experimental).toBe(true);
    expect(firstDevice(xeneonRecord('CRX ED00')).experimental).toBeUndefined();

    const pump = { channel: 14, name: 'iCUE LINK TITAN II', deviceClass: 'Aio' as const, ledCount: 20, hasSpeed: true, hasTemperature: true, rpm: 2200, tempC: 28, serial: 'S' };
    const familyNames = titanIiLcdNames({ isConnected: true, firmware: '4.1.656', devices: [pump] });
    const onTitan = buildPanelDevices({ curatedDevices: [], phoneSessions: [], records: [record], status: null, simulatedPanels: [], familyNames, labels: LABELS })[0];
    expect(onTitan.name).toBe('Corsair TITAN II LCD');
    expect(titanIiLcdNames({ isConnected: true, firmware: '4.1.656', devices: [{ ...pump, name: 'iCUE LINK QX RGB' }] })).toEqual({});
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

  it('hides a plain monitor (no product family) once Nexus Control is off', () => {
    const plain = xeneonRecord('DELL U2415');
    const record = { ...plain, capabilities: { ...plain.capabilities!, family: undefined }, enabled: false };
    const devices = buildPanelDevices({
      curatedDevices: [],
      phoneSessions: [],
      records: [record],
      status: null,
      simulatedPanels: [],
      labels: LABELS,
    });
    expect(devices).toHaveLength(0);
    expect(firstDevice({ ...record, enabled: true }).linkEnabled).toBe(true);
    expect(isTurnedOffPlainMonitor(record)).toBe(true);
    expect(isTurnedOffPlainMonitor({ ...record, displayAttached: false })).toBe(false);
    expect(isTurnedOffPlainMonitor({ ...xeneonRecord('Xeneon Edge'), enabled: false })).toBe(false);
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

  it('carries the record warning onto the monitor panel device', () => {
    const build = (warning: string | null | undefined) => buildPanelDevices({
      curatedDevices: [],
      phoneSessions: [],
      records: [{ ...xeneonRecord('Xeneon Edge'), warning }],
      status: null,
      simulatedPanels: [],
      labels: LABELS,
    });
    expect(build('touch-permission')[0].warning).toBe('touch-permission');
    expect(build(null)[0].warning).toBeUndefined();
    expect(build(undefined)[0].warning).toBeUndefined();
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
      capabilities: { surface: 'lcd-round', family: 'nzxt-kraken', touch: false, cssWidth: 640, cssHeight: 640, dpr: 1 },
    };
  }

  it('lists a live streamed panel as an editable panel', () => {
    const device = firstDevice(krakenRecord());

    expect(device.id).toBe('stream:rec-lcd');
    expect(device.panelRecordId).toBe('rec-lcd');
    expect(device.runtimeSurface).toBe('lcd-round');
    expect(device.iconSrc).toBe('/assets/devices/nzxt.svg');
    expect(device.modalKind).toBe('panel-editor');
    expect(device.capabilities.layout).toBe(true);
    // Host-rendered glass: nothing to launch, no display controls, no touch.
    expect(device.capabilities.launchClose).toBe(false);
    expect(device.capabilities.displayControls).toBe(false);
    expect(device.capabilities.touch).toBe(false);
  });

  it('brands a Lian Li cooler LCD by its family', () => {
    const device = firstDevice({
      ...krakenRecord(),
      capabilities: { surface: 'lcd-square', family: 'lianli-hydroshift-lcd', touch: false, cssWidth: 480, cssHeight: 480, dpr: 1 },
    });

    expect(device.iconSrc).toBe('/assets/devices/lianli.svg');
  });

  it('claims a cooler LCD for the curated device its family names', () => {
    const devices = buildPanelDevices({
      curatedDevices: [{
        id: 'lianli-galahad2-lcd',
        name: 'Lian Li Galahad II LCD',
        category: 'cooler',
        connected: true,
        firmwareVersion: '',
        supportsNexusControl: true,
        nexusControlEnabled: true,
      }],
      phoneSessions: [],
      records: [{
        ...krakenRecord(),
        id: 'rec-galahad',
        displayName: 'Lian Li Galahad II LCD',
        capabilities: { surface: 'lcd-square', family: 'lianli-galahad2-lcd', touch: false, cssWidth: 480, cssHeight: 480, dpr: 1 },
      }],
      status: null,
      simulatedPanels: [],
      labels: LABELS,
    });

    expect(devices).toHaveLength(1);
    expect(devices[0]).toMatchObject({
      id: 'stream:rec-galahad',
      sourceId: 'lianli-galahad2-lcd',
      name: 'Lian Li Galahad II LCD',
    });
  });

  it('brands the TL and SL screen families without claiming a device row', () => {
    const screen = (id: string, family: string): PanelDeviceRecord => ({
      ...krakenRecord(),
      id,
      displayName: `Screen ${id}`,
      capabilities: { surface: 'lcd-round', family, touch: false, cssWidth: 400, cssHeight: 400, dpr: 1 },
    });
    const devices = buildPanelDevices({
      curatedDevices: [],
      phoneSessions: [],
      records: [screen('rec-1', 'lianli-tl-lcd'), screen('rec-2', 'lianli-wireless-lcd')],
      status: null,
      simulatedPanels: [],
      labels: LABELS,
    });

    expect(devices.map(d => [d.sourceId, d.iconSrc])).toEqual([
      [undefined, '/assets/devices/lianli.svg'],
      [undefined, '/assets/devices/lianli.svg'],
    ]);
  });

  it('leaves a cooler LCD unclaimed when no curated device matches its family', () => {
    const device = firstDevice({
      ...krakenRecord(),
      capabilities: { surface: 'lcd-square', family: 'lianli-hydroshift-lcd', touch: false, cssWidth: 480, cssHeight: 480, dpr: 1 },
    });

    expect(device.sourceId).toBeUndefined();
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

describe('buildPanelDevices simulator beside a real Y70', () => {
  const realY70 = { id: 'y70', name: 'HYTE Y70 Touch', category: 'display', connected: true, firmwareVersion: '' };
  const sim = { id: 'y70', name: 'HYTE Y70 Touch 2.5K', surface: 'y70' as const, width: 682, height: 2560, dpi: 337 };

  it('lists both, under distinct ids, with the simulator keeping its own source id', () => {
    const devices = buildPanelDevices({
      curatedDevices: [realY70],
      phoneSessions: [],
      records: [],
      status: null,
      simulatedPanels: [sim],
      labels: LABELS,
    });

    expect(devices.map(d => d.id)).toEqual(['device:y70', 'simulated:y70']);
    expect(devices[1]).toMatchObject({ connectionKind: 'simulated', sourceId: 'y70', runtimeSurface: 'y70' });
    expect(devices[0].connectionKind).not.toBe('simulated');
  });

  it('gives the simulator no hardware controls, so it cannot write to the real Y70', () => {
    const [, simulated] = buildPanelDevices({
      curatedDevices: [realY70],
      phoneSessions: [],
      records: [],
      status: null,
      simulatedPanels: [sim],
      labels: LABELS,
    });

    expect(simulated.capabilities).toMatchObject({ displayControls: false, launchClose: false, layout: true, touch: true });
  });
});
