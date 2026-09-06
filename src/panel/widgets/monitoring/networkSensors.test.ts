// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { buildNicNetworkSensors, NETWORK_SENSOR_IN, NETWORK_SENSOR_OUT, NETWORK_SENSOR_TOTAL } from './networkSensors';
import type { ExtrasComponent } from '../../../hooks/useSensorExtras';
import type { HardwareSensor } from '../../../hooks/useSensors';

function throughput(id: string, name: string, value: number): HardwareSensor {
  return { id, name, type: 'Throughput', value, units: 'B/s', formatted: `${value} B/s`, parent: { id: 'nic', name: 'NIC' } };
}

function nic(id: string, sensors: HardwareSensor[]): ExtrasComponent {
  return { id, name: id, sensors };
}

describe('buildNicNetworkSensors', () => {
  it('sums LibreHardwareMonitor upload/download speeds across every adapter', () => {
    const nics = [
      nic('eth', [throughput('a', 'Download Speed', 1000), throughput('b', 'Upload Speed', 200)]),
      nic('wifi', [throughput('c', 'Download Speed', 500), throughput('d', 'Upload Speed', 50)]),
    ];
    const [total, inbound, outbound] = buildNicNetworkSensors(nics);
    expect([total.id, inbound.id, outbound.id]).toEqual(['network-total', 'network-in', 'network-out']);
    expect([total.name, inbound.name, outbound.name])
      .toEqual([NETWORK_SENSOR_TOTAL, NETWORK_SENSOR_IN, NETWORK_SENSOR_OUT]);
    expect(inbound.value).toBe(1500);
    expect(outbound.value).toBe(250);
    expect(total.value).toBe(1750);
  });

  it('reads the Linux provider naming, "<iface> RX" / "<iface> TX", too', () => {
    const [total, inbound, outbound] = buildNicNetworkSensors([
      nic('eth0', [throughput('a', 'eth0 RX', 800), throughput('b', 'eth0 TX', 100)]),
    ]);
    expect(inbound.value).toBe(800);
    expect(outbound.value).toBe(100);
    expect(total.value).toBe(900);
  });

  it('ignores non-Throughput sensors on the same adapter', () => {
    const cumulative: HardwareSensor = {
      id: 'x', name: 'Data Downloaded', type: 'Data', value: 900, units: 'GB',
      formatted: '900 GB', parent: { id: 'nic', name: 'NIC' },
    };
    const [total] = buildNicNetworkSensors([nic('eth', [cumulative, throughput('a', 'Download Speed', 10)])]);
    expect(total.value).toBe(10);
  });

  // An empty list hides the category from a picker (visibleDeviceKeys) rather
  // than offering three permanently flat zeros.
  it('returns nothing when no adapter reports a directional throughput sensor', () => {
    expect(buildNicNetworkSensors([])).toEqual([]);
    expect(buildNicNetworkSensors([nic('eth', [throughput('a', 'Network Utilization', 5)])])).toEqual([]);
  });

  it('treats one unusable reading as zero without poisoning the other direction', () => {
    const [total, inbound, outbound] = buildNicNetworkSensors([
      nic('eth', [throughput('a', 'Download Speed', Number.NaN), throughput('b', 'Upload Speed', 64)]),
      nic('wifi', [throughput('c', 'Download Speed', -5)]),
    ]);
    expect(inbound.value).toBe(0);
    expect(outbound.value).toBe(64);
    expect(total.value).toBe(64);
  });
});
