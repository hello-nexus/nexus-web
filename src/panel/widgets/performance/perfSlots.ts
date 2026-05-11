import type { PanelWidgetSize } from '../../types';
import type { GaugeDesignKey } from './gauges';

export type DeviceKey = 'cpu' | 'gpu' | 'memory' | 'fan' | 'storage' | 'network' | 'fps';

export interface SlotConfig {
  device: DeviceKey;
  sensor: string;
  design: GaugeDesignKey;
}

// Slot counts that trigger the Micro layout (one device, multiple sensors,
// stacked progress bars + bottom label). Only meaningful on sizes returned
// by `microSupportsSize` - count=4 on 4x4 is still the multi-sensor 2x2 grid.
export const MICRO_MIN_COUNT = 3;
export const MICRO_MAX_COUNT = 4;

export const DEFAULT_SLOTS: SlotConfig[] = [
  { device: 'cpu',    sensor: 'CPU Total',    design: 'sparkline' },
  { device: 'gpu',    sensor: 'GPU Core',     design: 'sparkline' },
  { device: 'memory', sensor: 'Memory Usage', design: 'sparkline' },
  { device: 'fan',    sensor: '',             design: 'sparkline' },
];

// Default slot count for a freshly-resized widget when no explicit count is
// persisted. Always a multi-sensor count, never the Micro count - existing
// widgets without a configured count keep their pre-Micro behavior.
export function defaultSlotCountForSize(size: PanelWidgetSize): number {
  switch (size) {
    case '4x4': return 4;
    case '2x4':
    case '4x2': return 2;
    default: return 1;
  }
}

export function slotCountOptionsForSize(size: PanelWidgetSize): number[] {
  switch (size) {
    case '4x4': return [2, 4];
    case '2x4': return [2];
    case '4x2': return [1, 2, MICRO_MIN_COUNT, MICRO_MAX_COUNT];
    case '2x2': return [1, MICRO_MIN_COUNT, MICRO_MAX_COUNT];
    default: return [1];
  }
}

export function microSupportsSize(size: PanelWidgetSize): boolean {
  return size === '2x2' || size === '4x2';
}

// Whether a (size, count) pair signals the Micro layout. Both inputs are
// required - count=4 means Micro on 2x2/4x2 but multi on 4x4.
export function isMicroLayout(size: PanelWidgetSize, count: number): boolean {
  if (!microSupportsSize(size)) return false;
  return count >= MICRO_MIN_COUNT && count <= MICRO_MAX_COUNT;
}

export function resolvedSlotCountForSize(
  size: PanelWidgetSize,
  configuredCount: number | undefined,
): number {
  if (configuredCount == null) return defaultSlotCountForSize(size);
  const options = slotCountOptionsForSize(size);
  if (options.includes(configuredCount)) return configuredCount;
  return defaultSlotCountForSize(size);
}
