// Category + sensor option-building shared by every sensor picker UI
// (MonitoringSettings' widget settings pane, the deck Monitoring action
// editor). Keeping this in one module means both pickers resolve the exact
// same option list/order for a given device from the exact same sensor data.
import type { useSensors } from '../../../hooks/useSensors';
import type { useSensorExtras } from '../../../hooks/useSensorExtras';
import type { buildNetworkSensors } from './networkSensors';
import { networkSensorOptions } from './networkSensors';
import { bareSensorLabel } from './sensorNames';
import { extrasSensorsForDevice, igpuSensors, sensorsForCategory, smartStorageSensors } from './sensorCategories';
import type { DeviceKey } from './perfSlots';

export interface SensorOption {
  value: string;
  label: string;
  sensorName?: string;
}

// Picker order: the Tryx-shared categories (SENSOR_CATEGORIES, quick through
// fps) interleaved with their related widget-only categories (iGPU next to
// GPU, SSD SMART next to Storage, DIMMs next to Memory), then the remaining
// extras-topic groups. 'fan' is never offered here (see perfSlots' DeviceKey
// doc). 'igpu' is hidden by visibleDeviceKeys whenever the box has no
// integrated card beside the primary GPU.
export const DEVICE_OPTION_KEYS: readonly DeviceKey[] = [
  'quick', 'cpu', 'gpu', 'igpu', 'memory', 'memoryModule', 'motherboard',
  'storage', 'smart', 'network', 'fps',
  'battery', 'cooler', 'psu', 'embeddedController',
];

export const CATEGORY_LABEL_KEYS: Record<DeviceKey, string> = {
  quick: 'monitoring.settings.category.quick',
  cpu: 'monitoring.settings.category.cpu',
  gpu: 'monitoring.settings.category.gpu',
  igpu: 'monitoring.settings.category.igpu',
  memory: 'monitoring.settings.category.memory',
  memoryModule: 'monitoring.settings.category.memoryModule',
  motherboard: 'monitoring.settings.category.motherboard',
  // Legacy value only, migrated away on mount - never offered in DEVICE_OPTION_KEYS.
  fan: 'monitoring.settings.category.motherboard',
  storage: 'monitoring.settings.category.storage',
  smart: 'monitoring.settings.category.smart',
  network: 'monitoring.settings.category.network',
  fps: 'monitoring.settings.category.fps',
  battery: 'monitoring.settings.category.battery',
  cooler: 'monitoring.settings.category.cooler',
  psu: 'monitoring.settings.category.psu',
  embeddedController: 'monitoring.settings.category.embeddedController',
};

function uniqueOptions(options: SensorOption[]): SensorOption[] {
  const seen = new Set<string>();
  return options.filter(option => {
    if (!option.value || seen.has(option.value)) return false;
    seen.add(option.value);
    return true;
  });
}

export function sensorsForDevice(
  sensors: ReturnType<typeof useSensors>,
  networkSensors: ReturnType<typeof buildNetworkSensors>,
  extras: ReturnType<typeof useSensorExtras>,
  device: DeviceKey,
): SensorOption[] {
  let options: SensorOption[];
  switch (device) {
    case 'quick':
      options = sensorsForCategory('quick', sensors, networkSensors, []).map(s => ({ value: s.id, label: s.name, sensorName: s.name }));
      break;
    case 'cpu':
    case 'gpu':
    case 'memory':
    case 'motherboard':
      options = sensorsForCategory(device, sensors, networkSensors, []).map(s => ({
        value: s.id,
        label: `${bareSensorLabel(device, s.name) || s.name} (${s.type})`,
        sensorName: s.name,
      }));
      break;
    case 'fan':
      options = sensors.motherboard
        .filter(s => s.type === 'Fan')
        .map(s => ({ value: s.id, label: s.name, sensorName: s.name }));
      break;
    case 'storage':
      options = sensorsForCategory('storage', sensors, networkSensors, []).map(s => ({ value: s.id, label: s.name, sensorName: s.name }));
      break;
    case 'igpu':
      options = igpuSensors(sensors).map(s => ({
        value: s.id,
        label: `${bareSensorLabel(device, s.name) || s.name} (${s.type})`,
        sensorName: s.name,
      }));
      break;
    case 'smart':
      options = smartStorageSensors(sensors).map(s => ({
        value: s.id,
        label: `${bareSensorLabel(device, s.name) || s.name} (${s.type})`,
        sensorName: s.name,
      }));
      break;
    case 'memoryModule':
    case 'battery':
    case 'cooler':
    case 'psu':
    case 'embeddedController':
      options = extrasSensorsForDevice(device, extras).map(s => ({
        value: s.id,
        label: `${bareSensorLabel(device, s.name) || s.name} (${s.type})`,
        sensorName: s.name,
      }));
      break;
    case 'network':
      options = sensorsForCategory('network', sensors, networkSensors, []).length > 0
        ? networkSensorOptions().map(o => ({ value: o.value, label: bareSensorLabel('network', o.label) || o.label }))
        : [];
      break;
    case 'fps':
      options = sensorsForCategory('fps', sensors, networkSensors, []).map(s => ({ value: s.name, label: s.name }));
      break;
    default:
      options = [];
  }

  return uniqueOptions(options);
}

export function selectedSensorValue(options: SensorOption[], storedKey: string): string {
  if (storedKey && options.some(opt => opt.value === storedKey)) return storedKey;
  const byName = storedKey ? options.find(opt => opt.sensorName === storedKey) : undefined;
  if (byName) return byName.value;
  return options[0]?.value ?? '';
}

// Categories with 0 sensors are hidden from a picker - offering one just
// resolves to a permanently empty gauge. Two categories are exempt: the
// picker's own currently-selected device (so the Select's value never goes
// stale/blank if its category loses its last sensor mid-session) and 'fps',
// a capability category that only populates while a game is running.
export function visibleDeviceKeys(
  keys: readonly DeviceKey[],
  currentDevice: DeviceKey,
  sensors: ReturnType<typeof useSensors>,
  networkSensors: ReturnType<typeof buildNetworkSensors>,
  extras: ReturnType<typeof useSensorExtras>,
): DeviceKey[] {
  return keys.filter(device =>
    device === currentDevice ||
    device === 'fps' ||
    sensorsForDevice(sensors, networkSensors, extras, device).length > 0
  );
}
