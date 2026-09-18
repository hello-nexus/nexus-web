import { widgetLayoutSize, type PanelConfigValue, type PanelWidgetSize } from '../../types';
import { FRAME_FILLING_DESIGNS, GAUGE_DESIGN_KEYS } from './gauges';
import type { GaugeDesignKey } from './gauges';

// 'fan' is kept only so a widget saved before the motherboard category
// existed keeps resolving its Fan-typed sensor; it is no longer offered in
// either picker (see MonitoringSettings' DEVICE_OPTIONS).
//
// 'gpu2' (discrete cards beyond the primary), 'igpu' (the integrated GPU
// beside a discrete primary), 'smart' (LHM SSD SMART, storage topic) and the
// extras-topic categories ('memoryModule', 'battery', 'cooler', 'psu',
// 'embeddedController') are widget-only: they are deliberately NOT part of
// sensorCategories.ts' SENSOR_CATEGORIES, so the Tryx overlay picker (which
// mirrors that shared set) never offers them - see useSensors.storageSensors
// and useSensorExtras for why each is gated off that surface, and
// sensorCategories.gpu2Components / igpuComponents for the two GPU ones.
export type DeviceKey =
  | 'quick' | 'cpu' | 'gpu' | 'gpu2' | 'igpu' | 'memory' | 'motherboard' | 'fan' | 'storage' | 'network' | 'fps'
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

export const DEFAULT_DESIGN: GaugeDesignKey = 'sparkline';

// The round glass is the one surface whose default is the Ring: it fills the
// frame, where the filled line would float in a circle.
export const DEFAULT_ROUND_DESIGN: GaugeDesignKey = 'caterpillar';

export const DEFAULT_SLOTS: SlotConfig[] = [
  { device: 'quick', sensor: 'summary/cpu-usage',    design: DEFAULT_DESIGN },
  { device: 'quick', sensor: 'summary/memory-usage', design: 'halfgauge' },
  { device: 'quick', sensor: 'summary/cpu-temp',     design: DEFAULT_DESIGN },
  { device: 'quick', sensor: 'summary/vram-usage',   design: DEFAULT_DESIGN },
];

// Design a slot renders when none is stored for it.
export function defaultSlotDesign(size: PanelWidgetSize, slotIndex: number): GaugeDesignKey {
  if (size === '2x2round') return DEFAULT_ROUND_DESIGN;
  return DEFAULT_SLOTS[slotIndex]?.design ?? DEFAULT_DESIGN;
}

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

// count=4 means Micro on 2x2/4x2/2x4 but multi on 4x4, and count=3 with the
// hero flag is the Hero layout - so all three inputs decide this, none default.
export function isMicroLayout(size: PanelWidgetSize, count: number, hero: boolean): boolean {
  if (!microSupportsSize(size)) return false;
  if (isHeroLayout(size, count, hero)) return false;
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

// The Hero layout: one large slot across the top with two small ones side by
// side beneath. It shares its slot count with the Micro layout on the same
// sizes, so the two are told apart by the stored `slotHero` flag, never by
// count alone.
export const HERO_SLOT_COUNT = 3;

// Only the tall/square tiles have a sensible big-over-two-small split; the wide
// 4x2 would give each bottom slot a sliver, and 4x4 already has the 2x2 grid.
export function heroSupportsSize(rawSize: PanelWidgetSize): boolean {
  const size = widgetLayoutSize(rawSize);
  return size === '2x2' || size === '2x4';
}

export function isHeroLayout(size: PanelWidgetSize, count: number, hero: boolean | undefined): boolean {
  return hero === true && count === HERO_SLOT_COUNT && heroSupportsSize(size);
}

// One entry in the editor's slot picker. Hero reuses count 3, so the flag is
// part of the identity.
export interface SlotLayout {
  count: number;
  hero: boolean;
}

// Stable React key / aria discriminator for a picker entry.
export function slotLayoutKey(layout: SlotLayout): string {
  return layout.hero ? `hero${layout.count}` : String(layout.count);
}

export function slotLayoutOptionsForSize(rawSize: PanelWidgetSize): SlotLayout[] {
  const options: SlotLayout[] = slotCountOptionsForSize(rawSize).map(count => ({ count, hero: false }));
  if (!heroSupportsSize(rawSize)) return options;
  // Hero holds three independent multi-sensor slots, so it belongs with the
  // other multi-sensor layouts: ahead of the first Micro entry, not at the end.
  const firstMicro = options.findIndex(o => isMicroLayout(rawSize, o.count, o.hero));
  const hero: SlotLayout = { count: HERO_SLOT_COUNT, hero: true };
  if (firstMicro < 0) options.push(hero);
  else options.splice(firstMicro, 0, hero);
  return options;
}

export function resolvedSlotLayoutForSize(
  size: PanelWidgetSize,
  configuredCount: number | undefined,
  configuredHero: boolean | undefined,
): SlotLayout {
  const count = resolvedSlotCountForSize(size, configuredCount);
  return { count, hero: isHeroLayout(size, count, configuredHero) };
}

// Decodes the stored `slotCount` / `slotHero` pair.
export function resolvedSlotLayout(
  size: PanelWidgetSize,
  config: Record<string, PanelConfigValue> | undefined,
): SlotLayout {
  return resolvedSlotLayoutForSize(
    size,
    config?.slotCount as number | undefined,
    config?.slotHero === true,
  );
}

// The Hero layout's small slots hold a reading and nothing else, so they are
// limited to the two value-first designs. On 2x2 that includes the top slot -
// the whole tile is barely larger than one 2x4 hero cell.
export const HERO_SMALL_DESIGN_KEYS: GaugeDesignKey[] = ['text', 'numberfill'];

// Which gauge designs a given slot may use. Every size offers the same list -
// no surface has designs of its own - unless the Hero layout narrows it.
export function designKeysForSlot(
  size: PanelWidgetSize,
  layout: SlotLayout,
  slotIndex: number,
): GaugeDesignKey[] {
  if (!isHeroLayout(size, layout.count, layout.hero)) return GAUGE_DESIGN_KEYS;
  if (slotIndex > 0 || widgetLayoutSize(size) === '2x2') return HERO_SMALL_DESIGN_KEYS;
  return GAUGE_DESIGN_KEYS;
}

// Clamp a stored design to what the slot currently allows, so a layout or size
// change never renders a design the picker no longer offers (e.g. a Sparkline
// left in a slot that just became a Hero small cell).
export function resolveSlotDesign(
  size: PanelWidgetSize,
  layout: SlotLayout,
  slotIndex: number,
  design: GaugeDesignKey,
): GaugeDesignKey {
  const allowed = designKeysForSlot(size, layout, slotIndex);
  return allowed.includes(design) ? design : allowed[0];
}

// Whether this design on this size fills the round glass edge to edge, so the
// tile drops its padding and scales the figure by the reciprocal of the card's
// fit. Shared by the live tile and the catalog preview.
export function designFillsRoundFrame(size: PanelWidgetSize, design: GaugeDesignKey): boolean {
  return size === '2x2round' && FRAME_FILLING_DESIGNS.has(design);
}

export function isFullBleedRound(
  size: PanelWidgetSize,
  config: Record<string, PanelConfigValue> | undefined,
): boolean {
  if (size !== '2x2round') return false;
  if (resolvedSlotLayout(size, config).count !== 1) return false;
  const stored = (config?.slot0_design as GaugeDesignKey | undefined)
    ?? defaultSlotDesign(size, 0);
  return designFillsRoundFrame(size, stored);
}
