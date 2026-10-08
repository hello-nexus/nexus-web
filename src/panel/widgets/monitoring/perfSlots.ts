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

// Multi-device Micro: each row picks its own device (`micro_device{N}`, falling
// back to the shared `micro_device`) and the bottom device caption is dropped.
export function isMicroMultiDevice(config: Record<string, PanelConfigValue> | undefined): boolean {
  return config?.micro_multiDevice === true;
}

export function microRowDevice(config: Record<string, PanelConfigValue> | undefined, row: number): DeviceKey {
  const shared = (config?.micro_device as DeviceKey | undefined) ?? 'cpu';
  if (!isMicroMultiDevice(config)) return shared;
  return (config?.[`micro_device${row}`] as DeviceKey | undefined) ?? shared;
}

export const DEFAULT_DESIGN: GaugeDesignKey = 'sparkline';

// The round glass is the one surface whose default is the Ring: it fills the
// frame, where the filled line would float in a circle.
export const DEFAULT_ROUND_DESIGN: GaugeDesignKey = 'caterpillar';

export const DEFAULT_SLOTS: SlotConfig[] = [
  { device: 'quick', sensor: 'summary/cpu-usage',    design: DEFAULT_DESIGN },
  { device: 'quick', sensor: 'summary/memory-usage', design: 'halfgauge' },
  { device: 'quick', sensor: 'summary/cpu-temp',     design: DEFAULT_DESIGN },
  { device: 'quick', sensor: 'summary/vram-usage',   design: DEFAULT_DESIGN },
  // Only the 4x2/4x4 hero layouts reach past four slots.
  { device: 'quick', sensor: 'summary/gpu-usage',    design: DEFAULT_DESIGN },
  { device: 'quick', sensor: 'summary/gpu-temp',     design: DEFAULT_DESIGN },
  { device: 'quick', sensor: 'summary/cpu-clock',    design: DEFAULT_DESIGN },
];

// Design a slot renders when none is stored for it; a small cell starts on Large Value.
export function defaultSlotDesign(size: PanelWidgetSize, slotIndex: number, layout?: SlotLayout): GaugeDesignKey {
  if (layout && isSmallCell(size, layout, slotIndex)) return HERO_SMALL_DESIGN_KEYS[0];
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

// Hero: large slots over a row of small ones. On 2x2/2x4 its count collides
// with Micro, so the stored `slotHero` flag tells them apart, never the count.
export interface HeroSpec {
  count: number;
  // Leading slots that render large; the rest are the small row.
  large: number;
}

export function heroSpecForSize(rawSize: PanelWidgetSize): HeroSpec | null {
  switch (widgetLayoutSize(rawSize)) {
    case '2x4': return { count: 3, large: 1 };
    // The whole 2x2 tile is barely larger than one 2x4 hero cell, so even its
    // top slot takes the small designs.
    case '2x2': return { count: 3, large: 0 };
    case '4x2': return { count: 5, large: 2 };
    case '4x4': return { count: 7, large: 4 };
    default: return null;
  }
}

export function heroSupportsSize(rawSize: PanelWidgetSize): boolean {
  return heroSpecForSize(rawSize) != null;
}

export function isHeroLayout(size: PanelWidgetSize, count: number, hero: boolean | undefined): boolean {
  return hero === true && heroSpecForSize(size)?.count === count;
}

// Locale key suffix naming a size's hero layout in the slot pickers.
function heroLabelKey(size: PanelWidgetSize): 'slotHero' | 'slotHeroWide' | 'slotHeroGrid' {
  const large = heroSpecForSize(size)?.large;
  return large === 4 ? 'slotHeroGrid' : large === 2 ? 'slotHeroWide' : 'slotHero';
}

// Two sensors on a 2x2, side by side ('columns') or stacked ('rows'). Larger
// tiles take their two-slot orientation from their shape and store none.
export type SlotSplit = 'columns' | 'rows';
export const SPLIT_COUNT = 2;

// One entry in the editor's slot picker. Hero and split can reuse a plain
// count, so their flags are part of the identity.
export interface SlotLayout {
  count: number;
  hero: boolean;
  split?: SlotSplit;
}

export function splitSupportsSize(rawSize: PanelWidgetSize): boolean {
  return widgetLayoutSize(rawSize) === '2x2';
}

export function isSplitLayout(size: PanelWidgetSize, layout: SlotLayout): boolean {
  return layout.split != null && layout.count === SPLIT_COUNT && splitSupportsSize(size);
}

// Stable React key / aria discriminator for a picker entry.
export function slotLayoutKey(layout: SlotLayout): string {
  if (layout.hero) return `hero${layout.count}`;
  return layout.split ? `${layout.count}${layout.split}` : String(layout.count);
}

// The config patch that stores a picked layout; null clears a stale split.
export function slotLayoutPatch(layout: SlotLayout): Record<string, PanelConfigValue> {
  return { slotCount: layout.count, slotHero: layout.hero, slotSplit: layout.split ?? null };
}

// Locale key suffix for a picker entry with its own name; null means the plain count label.
export function slotLayoutLabelKey(size: PanelWidgetSize, layout: SlotLayout):
  'slotHero' | 'slotHeroWide' | 'slotHeroGrid' | 'slotSplitColumns' | 'slotSplitRows' | null {
  if (layout.hero) return heroLabelKey(size);
  if (layout.split) return layout.split === 'rows' ? 'slotSplitRows' : 'slotSplitColumns';
  return null;
}

export function slotLayoutOptionsForSize(rawSize: PanelWidgetSize): SlotLayout[] {
  const options: SlotLayout[] = slotCountOptionsForSize(rawSize).map(count => ({ count, hero: false }));
  if (splitSupportsSize(rawSize)) {
    const afterSolo = options.findIndex(o => o.count === 1) + 1;
    options.splice(afterSolo, 0,
      { count: SPLIT_COUNT, hero: false, split: 'columns' },
      { count: SPLIT_COUNT, hero: false, split: 'rows' });
  }
  const spec = heroSpecForSize(rawSize);
  if (!spec) return options;
  // Hero holds independent multi-sensor slots, so it belongs with the
  // other multi-sensor layouts: ahead of the first Micro entry, not at the end.
  const firstMicro = options.findIndex(o => isMicroLayout(rawSize, o.count, o.hero));
  const hero: SlotLayout = { count: spec.count, hero: true };
  if (firstMicro < 0) options.push(hero);
  else options.splice(firstMicro, 0, hero);
  return options;
}

export function resolvedSlotLayoutForSize(
  size: PanelWidgetSize,
  configuredCount: number | undefined,
  configuredHero: boolean | undefined,
  configuredSplit?: SlotSplit,
): SlotLayout {
  // A hero count need not be in slotCountOptionsForSize, so it skips that check.
  if (configuredCount != null && isHeroLayout(size, configuredCount, configuredHero)) {
    return { count: configuredCount, hero: true };
  }
  // A split needs its stored flag, so a two-slot count carried over by a resize
  // from a larger tile keeps resolving to the size default.
  if (configuredCount === SPLIT_COUNT && configuredSplit && splitSupportsSize(size)) {
    return { count: SPLIT_COUNT, hero: false, split: configuredSplit };
  }
  return { count: resolvedSlotCountForSize(size, configuredCount), hero: false };
}

// Decodes the stored `slotCount` / `slotHero` / `slotSplit` keys.
export function resolvedSlotLayout(
  size: PanelWidgetSize,
  config: Record<string, PanelConfigValue> | undefined,
): SlotLayout {
  const split = config?.slotSplit;
  return resolvedSlotLayoutForSize(
    size,
    config?.slotCount as number | undefined,
    config?.slotHero === true,
    split === 'columns' || split === 'rows' ? split : undefined,
  );
}

// The value-first designs every small cell offers, and its default. The wide
// and grid Hero small cells (4x2, 4x4) hold only these.
export const HERO_SMALL_DESIGN_KEYS: GaugeDesignKey[] = ['text', 'numberfill'];

// Small cells add the designs that still read at their shape. A tall narrow
// cell (side by side, 2x4 Hero small) overflows a ring's value; a short wide
// one (stacked, 2x2 Hero top) shrinks a figure above the value to a sliver.
export const NARROW_CELL_DESIGN_KEYS: GaugeDesignKey[] = [
  ...HERO_SMALL_DESIGN_KEYS,
  'sparkline', 'line', 'mirrorwave', 'backdrop', 'microbars', 'heatmap', 'segments',
  'bar', 'fill', 'thermo', 'battery', 'hbar', 'dotgrid', 'halfgauge', 'wedge', 'dial',
];
export const SHORT_CELL_DESIGN_KEYS: GaugeDesignKey[] = [
  ...HERO_SMALL_DESIGN_KEYS,
  'backdrop', 'segments', 'bar', 'fill', 'battery', 'dotgrid',
];
// The 2x2 Hero's bottom cells, the smallest: Dot Grid overlaps the value there.
export const COMPACT_CELL_DESIGN_KEYS: GaugeDesignKey[] = [
  ...HERO_SMALL_DESIGN_KEYS,
  'backdrop', 'bar', 'fill', 'battery',
];

function heroSmallDesignKeys(size: PanelWidgetSize, slotIndex: number): GaugeDesignKey[] {
  switch (widgetLayoutSize(size)) {
    case '2x2': return slotIndex === 0 ? SHORT_CELL_DESIGN_KEYS : COMPACT_CELL_DESIGN_KEYS;
    case '2x4': return NARROW_CELL_DESIGN_KEYS;
    default: return HERO_SMALL_DESIGN_KEYS;
  }
}

function isSmallCell(size: PanelWidgetSize, layout: SlotLayout, slotIndex: number): boolean {
  if (isSplitLayout(size, layout)) return true;
  const spec = heroSpecForSize(size);
  return !!spec && isHeroLayout(size, layout.count, layout.hero) && slotIndex >= spec.large;
}

// Which gauge designs a given slot may use. Every size offers the same list -
// no surface has designs of its own - unless a small cell narrows it.
export function designKeysForSlot(
  size: PanelWidgetSize,
  layout: SlotLayout,
  slotIndex: number,
): GaugeDesignKey[] {
  if (isSplitLayout(size, layout)) return layout.split === 'rows' ? SHORT_CELL_DESIGN_KEYS : NARROW_CELL_DESIGN_KEYS;
  if (!isSmallCell(size, layout, slotIndex)) return GAUGE_DESIGN_KEYS;
  return heroSmallDesignKeys(size, slotIndex);
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
