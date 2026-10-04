import type { LightingDevice } from '../../api/lighting';
import { deviceRole } from './autoPlace';
import type { DeskKind } from './deskCatalog';

export interface HostPeripheral {
  category: DeskKind;
  /** The hardware's name, without the zone a multi-zone card adds. */
  name: string;
}

/** The desk products this PC's lighting devices say they are, one per physical device. */
export function hostPeripherals(devices: LightingDevice[]): HostPeripheral[] {
  const out: HostPeripheral[] = [];
  const seen = new Set<string>();
  for (const d of devices) {
    const role = deviceRole(d);
    if (role !== 'keyboard' && role !== 'mouse' && role !== 'mousepad' && role !== 'headphones' && role !== 'speaker') continue;
    const unit = d.deviceId ?? d.parentDeviceId ?? d.id;
    if (seen.has(unit)) continue;
    seen.add(unit);
    const hardware = d.originalName ?? d.name;
    // A zone card reads "<device> - <zone>".
    const name = (d.zoneIndex !== undefined || d.parentDeviceId ? hardware.split(' - ')[0] : hardware).trim();
    if (name) out.push({ category: role, name });
  }
  return out;
}
