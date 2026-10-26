// Canonical shape for the panel widget engine. Mirrors
// nexus-service/Models/Panel/PanelLayoutDto.cs. Keep in sync.

// '2x2round' occupies a 2x2 cell block but is masked to a circle. It exists for
// round glass (the Kraken LCD) and is reserved to those surfaces.
export const PANEL_WIDGET_SIZES = ['1x1', '2x2', '2x4', '4x1', '4x2', '4x4', '2x2round'] as const;
export type PanelBaseWidgetSize = typeof PANEL_WIDGET_SIZES[number];
// A freeform widget span stored as '<cols>x<rows>' beyond the fixed enum. Only widgets whose manifest opts in (`freeform`) may carry one.
export type FreeformWidgetSize = `${number}x${number}`;
export type PanelWidgetSize = PanelBaseWidgetSize | FreeformWidgetSize;
// 'monitor' = a user-promoted OS monitor hosting a fullscreen kiosk
// (service-stamped surface; see PanelSurfaces.Monitor in nexus-service).
// 'lcd-round' / 'lcd-square' / 'lcd-wide' = a cooler LCD fed pushed frames. These are not
// one model's resolution: the panel record carries the real pixel size, so a Galahad II
// LCD, a Kraken and an ID-Cooling FX-LCD share 'lcd-round'.
// The three differ only in the shape of the one tile they carry, which the surface picks.
export const PANEL_SURFACES = [
  'y70', 'q60', 'phone', 'desktop', 'monitor',
  'lcd-round', 'lcd-square', 'lcd-wide',
] as const;
export type PanelSurface = typeof PANEL_SURFACES[number];

// What the service still persists on every Kraken record (and in profile files), so older
// builds find it. Records read as 'lcd-round' through canonicalPanelRecord (src/api/panel.ts);
// the web never stamps it.
export const LEGACY_KRAKEN_SURFACE = 'kraken';
export const NZXT_KRAKEN_FAMILY = 'nzxt-kraken';
// The Kraken's grid density, stamped on its record because 'lcd-round' estimates another.
export const KRAKEN_PANEL_DPI = 240;

// Whether a surface accepts direct pointer input. Q60 is display-only;
// desktop, phone, Y70 support interactive widget controls (desktop via mouse).
// 'monitor' is per-DEVICE: a promoted monitor is interactive only when an
// integrated touch digitizer targets it (capabilities.touch on its record);
// plain monitors are glanceable displays like the Q-series.
export function surfaceSupportsTouch(surface: PanelSurface, deviceTouch?: boolean): boolean {
  if (surface === 'monitor') return deviceTouch === true;
  // Cooler glass is a framebuffer on a USB pipe with no input path at all.
  return surface !== 'q60'
    && surface !== 'lcd-round' && surface !== 'lcd-square' && surface !== 'lcd-wide';
}

export type SurfaceInputMode = 'touch' | 'pointer' | 'none';

// The operator's input method at this surface, for SDK widgets branching on
// touch vs mouse vs no input at all. Desktop is mouse ('pointer'), Y70/phone
// are direct touch, cooler glass and the Q-series are display-only ('none').
// 'monitor' follows the same per-device digitizer rule as surfaceSupportsTouch.
export function surfaceInputMode(surface: PanelSurface, deviceTouch?: boolean): SurfaceInputMode {
  if (surface === 'desktop') return 'pointer';
  if (surface === 'monitor') return deviceTouch === true ? 'touch' : 'none';
  return surfaceSupportsTouch(surface) ? 'touch' : 'none';
}

// The tile shape an SDK widget is actually rendered into. Only '2x2round'
// (round glass: the Kraken LCD) masks to a circle; every other size is rect.
export function widgetDisplayShape(size: PanelWidgetSize): 'rect' | 'round' {
  return size === '2x2round' ? 'round' : 'rect';
}

// Whether this surface is rendered off-screen by the streamed-panels engine
// and pushed to the device as encoded video (the Kraken LCD, the round/square/
// wide cooler glass, the Q-series ArtInChip pipeline) rather than shown in a
// real, user-facing browser window on this PC. An SDK widget's audio must stay
// silent on these surfaces - the render runs on the host machine's speakers,
// not the device the operator is looking at.
//
// 'monitor' is ambiguous by surface id alone: a promoted OS display and the
// ArtInChip D213's streamed capture both use it (D213PanelDiscovery.cs in
// nexus-service). `displayBound` (PanelDeviceRecord.displayId set) tells them
// apart - PanelDisplayBoundContext supplies the real per-device value.
export function isStreamedPanelSurface(surface: PanelSurface, displayBound = true): boolean {
  if (surface === 'lcd-round' || surface === 'lcd-square'
    || surface === 'lcd-wide' || surface === 'q60') return true;
  return surface === 'monitor' && !displayBound;
}

// Whether the operator at this surface has a usable text-entry method: desktop
// (physical keyboard) and phone/tablet (on-screen keyboard). The Y70 kiosk is
// touch-only with no keyboard and the Q-series is display-only, so neither
// should render text inputs. Gate any free-text field on this; when the panel
// is edited remotely from a desktop modal the operator's own keyboard applies,
// not the target surface's.
export function surfaceSupportsTextInput(surface: PanelSurface): boolean {
  return surface === 'desktop' || surface === 'phone';
}

// Whether the operator editing a panel can type into free-text fields.
// True when: the settings sheet is rendered in a desktop editor context
// (desktopEditor=true), the native app shell is running (nexusShellPlatform
// global set by the Windows/macOS shell), or the target surface itself has a
// keyboard (phone/desktop). False only on the on-device Y70/Q60 kiosk sheet
// where no keyboard is present.
// Reads nexusShellPlatform directly rather than importing windowActions to
// avoid a circular dependency between panel/types.ts and app/windowActions.ts.
export function canEditFreeText(surface?: PanelSurface, desktopEditor?: boolean): boolean {
  if (desktopEditor) return true;
  const w = typeof window !== 'undefined' ? (window as Window & { nexusShellPlatform?: string }) : null;
  const shell = w?.nexusShellPlatform;
  if (shell === 'windows-app' || shell === 'mac-app') return true;
  if (surface === undefined) return true;
  return surfaceSupportsTextInput(surface);
}

// Surfaces hosting one widget at a fixed size. Add a surface by adding an
// entry here; nothing else should branch on a literal surface name. Q-series
// LCD: ~240x800 portrait strip, no touch, room for one tile.
export const SINGLE_WIDGET_SURFACE_SIZE: Readonly<Partial<Record<PanelSurface, PanelWidgetSize>>> = {
  q60: '2x4',
  // Cooler LCDs: one tile, masked to the glass's shape.
  'lcd-round': '2x2round',
  'lcd-square': '2x2',
  // Wide cooler glass (a 1600x720 Thermalright Wonder Vision): a landscape tile.
  // Like the rest of the family it stays one widget with no pager and no placing.
  'lcd-wide': '4x2',
};

/** The shape of a surface's display: a round display carries one circular tile, every other surface is rectangular. */
export function surfaceDisplayShape(surface: PanelSurface): 'rect' | 'round' {
  const size = singleWidgetSurfaceSize(surface);
  return size ? widgetDisplayShape(size) : 'rect';
}

export function singleWidgetSurfaceSize(surface: PanelSurface): PanelWidgetSize | undefined {
  return SINGLE_WIDGET_SURFACE_SIZE[surface];
}

// The size a widget should lay out and theme for. The round tile is a 2x2 cell
// block masked to a circle, so widgets treat it as 2x2 and the card fits that
// square inside the circle; without this every `size === '2x2'` branch falls
// through to the largest layout, which then overflows the glass.
export function widgetLayoutSize(size: PanelWidgetSize): PanelWidgetSize {
  return size === '2x2round' ? '2x2' : size;
}

// Cooler glass fed pushed frames: the service can turn the bytes for a pump head
// mounted upside down. The Kraken is excluded - its transport has no such filter.
const MOUNT_ORIENTABLE_SURFACES: ReadonlySet<PanelSurface> =
  new Set<PanelSurface>(['lcd-round', 'lcd-square', 'lcd-wide']);

export function surfaceSupportsMountOrientation(surface: PanelSurface, family?: string | null): boolean {
  return MOUNT_ORIENTABLE_SURFACES.has(surface) && family !== NZXT_KRAKEN_FAMILY;
}

// Square cooler glass can be landscape, where its tile is shorter than the
// width-derived cell, so content scales to the shorter cell side.
const SHORT_SIDE_CONTENT_SURFACES: ReadonlySet<PanelSurface> = new Set<PanelSurface>(['lcd-square']);

export function surfaceScalesContentToShortSide(surface: PanelSurface): boolean {
  return SHORT_SIDE_CONTENT_SURFACES.has(surface);
}

export function isSingleWidgetSurface(surface: PanelSurface): boolean {
  return singleWidgetSurfaceSize(surface) !== undefined;
}

// Pages are reached by swiping, so a panel without touch keeps one page, except a
// display-bound multi-widget panel, which has a clickable pager.
export function surfaceAllowsPages(surface: PanelSurface, deviceTouch?: boolean, displayBound = false): boolean {
  return surfaceSupportsTouch(surface, deviceTouch) || (displayBound && !isSingleWidgetSurface(surface));
}

// Widget size: 'large' shows fewer, bigger widgets; 'small' a denser grid. A panel
// that offers the switch lays out each size as another surface does, while its own
// surface keeps driving the hardware (touch, render cost, offline behaviour).
export const PANEL_WIDGET_SIZE_MODES = ['large', 'small'] as const;
export type PanelWidgetSizeMode = typeof PANEL_WIDGET_SIZE_MODES[number];

export const ICUE_LINK_LCD5_FAMILY = 'icue-link-lcd5';
export const HYDROSHIFT2_CURVE_FAMILY = 'lianli-hydroshift2-curve';
export const LIANLI_SCREEN88_FAMILY = 'lianli-screen88';
export const ASUS_GLACIAL_LCD_FAMILY = 'asus-glacial-lcd';

export interface PanelWidgetSizeOptions {
  default: PanelWidgetSizeMode;
  layoutSurface: Readonly<Record<PanelWidgetSizeMode, PanelSurface>>;
  // Physical px/inch of the glass, for a size laid out as a density-sized grid.
  dpi?: number;
  // Short-axis slot count a size forces, replacing the density-derived one.
  shortSideSlots?: Readonly<Partial<Record<PanelWidgetSizeMode, number>>>;
  // Share of the density-derived short-axis slot count a size keeps.
  densitySlotShare?: Readonly<Partial<Record<PanelWidgetSizeMode, number>>>;
}

// The Q-series and the iCUE LINK 5" LCD share one portrait glass size: Large is the
// Q-series' one full-screen tile, Small a monitor grid sized by the glass's density.
const ONE_TILE_OR_GRID: Readonly<Record<PanelWidgetSizeMode, PanelSurface>> = { large: 'q60', small: 'monitor' };

export function panelWidgetSizeOptions(surface: PanelSurface, family?: string | null): PanelWidgetSizeOptions | undefined {
  if (surface === 'q60') return { default: 'large', layoutSurface: ONE_TILE_OR_GRID };
  if (surface === 'monitor' && family === ICUE_LINK_LCD5_FAMILY) return { default: 'small', layoutSurface: ONE_TILE_OR_GRID };
  // HydroShift II OLED Curved: Large is its one wide tile, Small a landscape grid
  // sized by the glass's physical density at its rendered resolution.
  if (surface === 'lcd-wide' && family === HYDROSHIFT2_CURVE_FAMILY) {
    return { default: 'large', layoutSurface: { large: 'lcd-wide', small: 'monitor' }, dpi: 379 };
  }
  // ASUS Glacial LCD: Large is its one full-glass tile, Small a monitor grid sized by density.
  if (surface === 'lcd-square' && family === ASUS_GLACIAL_LCD_FAMILY) {
    return { default: 'large', layoutSurface: { large: 'lcd-square', small: 'monitor' } };
  }
  // Lian Li Universal Screen 8.8: Large forces a coarse short axis, so cells are fewer and bigger.
  if (surface === 'monitor' && family === LIANLI_SCREEN88_FAMILY) {
    return { default: 'small', layoutSurface: { large: 'monitor', small: 'monitor' }, shortSideSlots: { large: 2 } };
  }
  // A plain OS monitor: Large halves its density grid's short axis, so cells double.
  if (surface === 'monitor' && !family) {
    return { default: 'small', layoutSurface: { large: 'monitor', small: 'monitor' }, densitySlotShare: { large: 0.5 } };
  }
  return undefined;
}

// A grid whose short axis a Widget size forces; landscape means the short axis is its rows.
export interface ForcedGrid {
  slots: number;
  landscape: boolean;
}

export function forcedGridOf(slots: number | undefined, landscape: boolean): ForcedGrid | undefined {
  return slots === undefined ? undefined : { slots, landscape };
}

// The short-axis slot count a Widget size forces, if any. `densitySlots` is the
// glass's density-derived count (columnsForPhysicalSize), which a share scales.
export function widgetSizeShortSideSlots(
  options: PanelWidgetSizeOptions | undefined,
  mode: PanelWidgetSizeMode | undefined,
  densitySlots: number | undefined,
): number | undefined {
  if (!options || !mode) return undefined;
  const share = options.densitySlotShare?.[mode];
  if (share === undefined) return options.shortSideSlots?.[mode];
  return densitySlots === undefined ? undefined : Math.max(2, Math.round(densitySlots * share));
}

// Short-axis cell counts a record's grid density may name (even, so a 2x2 tile always fits).
export const GRID_SLOTS_MIN = 2;
export const GRID_SLOTS_MAX = 64;

/** The record's own grid density when valid, else undefined. */
export function normalizeGridSlots(value: number | null | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const even = Math.round(value / 2) * 2;
  return Math.min(GRID_SLOTS_MAX, Math.max(GRID_SLOTS_MIN, even));
}

export function panelShortSideSlots(
  surface: PanelSurface,
  family: string | null | undefined,
  widgetSize: string | null | undefined,
  densitySlots?: number,
  gridSlots?: number | null,
): number | undefined {
  // Only a monitor grid takes the override; a single-tile layout has no density to set.
  const own = surface === 'monitor' && !isSingleWidgetSurface(panelLayoutSurface(surface, family, widgetSize))
    ? normalizeGridSlots(gridSlots)
    : undefined;
  if (own !== undefined) return own;
  return widgetSizeShortSideSlots(
    panelWidgetSizeOptions(surface, family),
    resolvePanelWidgetSize(surface, family, widgetSize),
    densitySlots,
  );
}

// Density for a panel's grid: the record's own, else the glass's when Widget size
// lays it out as another surface (whose estimate would be wrong for this glass).
export function panelLayoutDpi(
  surface: PanelSurface,
  family: string | null | undefined,
  widgetSize: string | null | undefined,
  recordDpi: number | null | undefined,
  surfaceDpi: Readonly<Record<PanelSurface, number>>,
): number | undefined {
  if (recordDpi) return recordDpi;
  if (panelLayoutSurface(surface, family, widgetSize) === surface) return undefined;
  return panelWidgetSizeOptions(surface, family)?.dpi ?? surfaceDpi[surface];
}

export function resolvePanelWidgetSize(
  surface: PanelSurface,
  family: string | null | undefined,
  widgetSize: string | null | undefined,
): PanelWidgetSizeMode | undefined {
  const options = panelWidgetSizeOptions(surface, family);
  if (!options) return undefined;
  return widgetSize === 'large' || widgetSize === 'small' ? widgetSize : options.default;
}

// The surface whose layout rules (grid, single tile, sizes, playlist) the panel follows.
export function panelLayoutSurface(
  surface: PanelSurface,
  family: string | null | undefined,
  widgetSize: string | null | undefined,
): PanelSurface {
  const options = panelWidgetSizeOptions(surface, family);
  const mode = resolvePanelWidgetSize(surface, family, widgetSize);
  return options && mode ? options.layoutSurface[mode] : surface;
}

// A panel with no stored background starts solid, except a Q-series cooler, whose
// page runs on the cooler's own SoC rather than the PC.
export function surfaceDefaultsToAnimatedBackground(surface: PanelSurface): boolean {
  return surface === 'q60';
}

/** Input the widget registry sees: a display-bound panel always has its mouse. */
export function widgetInputOf(deviceTouch: boolean | undefined, displayBound: boolean): boolean | undefined {
  return displayBound ? true : deviceTouch;
}

// Whether a press on the canvas can drag, resize or remove widgets. The device-page
// preview is edited with the dashboard's mouse, so any multi-widget panel qualifies
// there; on the glass itself a touch surface does, and so does a display-bound
// multi-widget panel, which its mouse edits.
export function panelCanvasEditable(surface: PanelSurface, deviceTouch: boolean | undefined, preview: boolean, displayBound = false): boolean {
  if (preview) return !isSingleWidgetSurface(surface);
  return surfaceSupportsTouch(surface, deviceTouch) || (displayBound && !isSingleWidgetSurface(surface));
}

// Sizes reserved for single-widget surfaces. Multi-widget surfaces hide them
// from the size picker and snap persisted widgets to the nearest non-reserved
// size on reconcile.
//
// Derived from SINGLE_WIDGET_SURFACE_SIZE, minus the sizes multi-widget surfaces
// also offer. '2x4' and '2x2round' are genuinely reserved - a Q60 strip and round
// glass - but square cooler glass takes a plain '2x2' and wide glass a plain '4x2',
// and reserving either would hide an ordinary size from the picker everywhere and
// snap existing widgets off it.
const SHARED_WITH_MULTI_WIDGET_SURFACES: ReadonlySet<PanelWidgetSize> =
  new Set<PanelWidgetSize>(['2x2', '4x2']);

export const SINGLE_WIDGET_SIZES: ReadonlySet<PanelWidgetSize> = new Set(
  Object.values(SINGLE_WIDGET_SURFACE_SIZE).filter(
    (s): s is PanelWidgetSize => s !== undefined && !SHARED_WITH_MULTI_WIDGET_SURFACES.has(s),
  ),
);

// Largest side a stored freeform span may claim; keeps a corrupt string from
// producing an absurd grid track.
const FREEFORM_MAX_SIDE = 32;

/** The span a '<cols>x<rows>' string names, or null when it is not one. */
export function parseWidgetSizeSpan(size: string | null | undefined): { cols: number; rows: number } | null {
  const match = /^([1-9]\d?)x([1-9]\d?)$/.exec(size ?? '');
  if (!match) return null;
  const cols = Number(match[1]);
  const rows = Number(match[2]);
  return cols <= FREEFORM_MAX_SIDE && rows <= FREEFORM_MAX_SIDE ? { cols, rows } : null;
}

/** A '<cols>x<rows>' span outside the fixed enum. */
export function isFreeformWidgetSize(size: string | null | undefined): size is FreeformWidgetSize {
  return parseWidgetSizeSpan(size) !== null && !PANEL_WIDGET_SIZES.includes(size as PanelBaseWidgetSize);
}

export function normalizePanelWidgetSize(size: string | null | undefined): PanelWidgetSize {
  if (PANEL_WIDGET_SIZES.includes(size as PanelBaseWidgetSize)) return size as PanelWidgetSize;
  return isFreeformWidgetSize(size) ? size : '4x4';
}

export function normalizePanelWidgetSizeForSurface(
  size: string | null | undefined,
  surface: PanelSurface,
): PanelWidgetSize {
  const normalized = normalizePanelWidgetSize(size);
  const single = singleWidgetSurfaceSize(surface);
  if (single !== undefined) return single;
  return normalized;
}

/**
 * Per-widget config value on the wire (raw JSON). Widgets read scalars or
 * declared structured shapes. Shared by native and marketplace widgets.
 */
export type PanelConfigValue =
  | string
  | number
  | boolean
  | null
  | PanelConfigValue[]
  | { [key: string]: PanelConfigValue };

export interface PanelWidget {
  id: string;
  type: string;
  size: PanelWidgetSize;
  // Top-left cell of the widget's rect on its page grid; canonical placement.
  // Gaps are allowed and NEVER auto-filled. The renderer reads these directly,
  // not a flat order.
  col: number;
  row: number;
  isImmersive?: boolean;
  // A locked widget cannot be dragged, resized or edited until unlocked.
  locked?: boolean;
  config?: Record<string, PanelConfigValue>;
}

export interface PanelPage {
  id: string;
  label?: string;
  widgets: PanelWidget[];
}

export interface PanelWidgetPlaylist {
  enabled: boolean;
  /** Seconds each widget holds; one of SLIDESHOW_INTERVALS. */
  interval: number;
  shuffle: boolean;
  /** Enabled widget types in play order, each at most once. */
  types: string[];
  /** Every arranged widget type, enabled or not, in the editor's library order. */
  order: string[];
  /** Manual jump from the editor's arrows; `at` (unix ms) re-fires a jump to the same type. */
  cursor?: { type: string; at: number };
}

export interface PanelLayout {
  layoutSchemaVersion: number;
  surface: PanelSurface;
  pages: PanelPage[];
  activePageId?: string;
  // Single-widget surfaces (Q-series) show one widget at a time; swapping which
  // widget is shown would otherwise discard the outgoing one's config. This
  // remembers each widget type's last config so switching back restores it.
  // Keyed by widget type. Unused (undefined) on multi-widget surfaces, where
  // every widget's config already lives on its own PanelWidget in `pages`.
  singleWidgetConfigs?: Record<string, Record<string, PanelConfigValue>>;
  // Single-widget surfaces: widget types the panel rotates through. Unused on
  // multi-widget surfaces.
  widgetPlaylist?: PanelWidgetPlaylist;
  // Widget the panel opens straight into immersive view on load, skipping the
  // dashboard. At most one, and it must be on the first page - the toggle that
  // sets it is only reachable there, so normalizePanelLayout drops an id that
  // names no first-page widget rather than stranding it.
  immersiveOnLoadWidgetId?: string;
}
