import { widgetLayoutSize, type PanelWidgetSize } from '../../types';
import type { GaugeDesignKey } from './gauges';

// 'fan' is kept only so a widget saved before the motherboard category
// existed keeps resolving its Fan-typed sensor; it is no longer offered in
// either picker (see MonitoringSettings' DEVICE_OPTIONS).
//
// 'smart' (LHM SSD SMART, storage topic) and the extras-topic categories
// ('memoryModule', 'battery', 'cooler', 'psu', 'embeddedController') are
// widget-only: they are deliberately NOT part of sensorCategories.ts'
// SENSOR_CATEGORIES, so the Tryx overlay picker (which mirrors that shared
// set) never offers them - see useSensors.storageSensors and
// useSensorExtras for why each is gated off that surface.
export type DeviceKey =
  | 'quick' | 'cpu' | 'gpu' | 'memory' | 'motherboard' | 'fan' | 'storage' | 'network' | 'fps'
  | 'smart' | 'memoryModule' | 'battery' | 'cooler' | 'psu' | 'embeddedController';

// DeviceKeys resolved from the "extras" topic (useSensorExtras), as opposed
// to the always-on "storage"/summary topics. Widgets gate their extras
// subscription on whether any active slot uses one of these.
export const EXTRAS_DEVICE_KEYS: readonly DeviceKey[] = [
  'memoryModule', 'battery', 'cooler', 'psu', 'embeddedController',
];

export function isExtrasBackedDevice(device: DeviceKey): boolean {
  return (EXTRAS_DEVICE_KEYS as readonly string[]).includes(device);
}

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

// Wide Micro counts (6/8). On the wide 4x2 tile they split into two side-by-side
// columns (3+3, 4+4); on the tall 2x4 they stack in one column. A square 2x2 has
// room for neither, so it never offers them.
export const MICRO_WIDE_COUNTS = [6, 8] as const;

// The Micro layout reuses a subset of the gauge design vocabulary for its row
// style: Progress Bar (caption over a thin fill track), Fill (value fill
// sweeping the whole row behind the caption), and Backdrop (dim filled history
// graph behind the caption). Rendered by MicroBar, not the tile GaugeComponents.
export const MICRO_DESIGN_KEYS: GaugeDesignKey[] = ['bar', 'fill', 'backdrop'];
export const DEFAULT_MICRO_DESIGN: GaugeDesignKey = 'bar';

export const DEFAULT_SLOTS: SlotConfig[] = [
  { device: 'quick', sensor: 'summary/cpu-usage',    design: 'sparkline' },
  { device: 'quick', sensor: 'summary/memory-usage', design: 'halfgauge' },
  { device: 'quick', sensor: 'summary/cpu-temp',     design: 'sparkline' },
  { device: 'quick', sensor: 'summary/vram-usage',   design: 'sparkline' },
];

// Default slot count for a freshly-resized widget when no explicit count is
// persisted. Always a multi-sensor count, never the Micro count - existing
// widgets without a configured count keep their pre-Micro behavior.
export function defaultSlotCountForSize(rawSize: PanelWidgetSize): number {
  const size = widgetLayoutSize(rawSize);
  switch (size) {
    case '4x4': return 4;
    case '2x4':
    case '4x2': return 2;
    default: return 1;
  }
}

export function slotCountOptionsForSize(rawSize: PanelWidgetSize): number[] {
  const size = widgetLayoutSize(rawSize);
  switch (size) {
    case '4x4': return [2, 4];
    case '2x4': return [2, MICRO_MIN_COUNT, MICRO_MAX_COUNT, ...MICRO_WIDE_COUNTS];
    case '4x2': return [1, 2, MICRO_MIN_COUNT, MICRO_MAX_COUNT, ...MICRO_WIDE_COUNTS];
    case '2x2': return [1, MICRO_MIN_COUNT, MICRO_MAX_COUNT];
    default: return [1];
  }
}

export function microSupportsSize(rawSize: PanelWidgetSize): boolean {
  const size = widgetLayoutSize(rawSize);
  return size === '2x2' || size === '4x2' || size === '2x4';
}

// Whether a (size, count) pair signals the Micro layout. Both inputs are
// required - count=4 means Micro on 2x2/4x2/2x4 but multi on 4x4.
export function isMicroLayout(size: PanelWidgetSize, count: number): boolean {
  if (!microSupportsSize(size)) return false;
  return (count >= MICRO_MIN_COUNT && count <= MICRO_MAX_COUNT) || isWideMicroCount(count);
}

// A Micro slot count (6/8). Membership only - the single/two-column layout
// decision is size-dependent (see isTwoColumnMicro).
export function isWideMicroCount(count: number): boolean {
  return (MICRO_WIDE_COUNTS as readonly number[]).includes(count);
}

// The wide 6/8 counts lay out in two columns only on the wide 4x2 tile; the
// tall 2x4 stacks them in one column, and 3/4 stay single-column everywhere.
export function isTwoColumnMicro(size: PanelWidgetSize, count: number): boolean {
  return size === '4x2' && isWideMicroCount(count);
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
