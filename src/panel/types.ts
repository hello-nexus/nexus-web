// Canonical shape for the panel widget engine. Mirrors
// nexus-service/Models/Panel/PanelLayoutDto.cs. Keep in sync.

// '2x2round' occupies a 2x2 cell block but is masked to a circle. It exists for
// round glass (the Kraken LCD) and is reserved to those surfaces.
export const PANEL_WIDGET_SIZES = ['1x1', '2x2', '2x4', '4x2', '4x4', '2x2round'] as const;
export type PanelWidgetSize = typeof PANEL_WIDGET_SIZES[number];
// 'monitor' = a user-promoted OS monitor hosting a fullscreen kiosk
// (service-stamped surface; see PanelSurfaces.Monitor in nexus-service).
// 'lcd-round' / 'lcd-square' / 'lcd-wide' = a cooler LCD fed pushed JPEG frames. Unlike
// 'kraken' these are not one model's resolution: the panel record carries the real pixel
// size, so a 480x480 Galahad II LCD and a 240x240 ID-Cooling FX-LCD share 'lcd-round'.
// The three differ only in the shape of the one tile they carry, which the surface picks.
export type PanelSurface =
  | 'y70' | 'q60' | 'phone' | 'desktop' | 'monitor' | 'kraken'
  | 'lcd-round' | 'lcd-square' | 'lcd-wide';

// Whether a surface accepts direct pointer input. Q60 is display-only;
// desktop, phone, Y70 support interactive widget controls (desktop via mouse).
// 'monitor' is per-DEVICE: a promoted monitor is interactive only when an
// integrated touch digitizer targets it (capabilities.touch on its record);
// plain monitors are glanceable displays like the Q-series.
export function surfaceSupportsTouch(surface: PanelSurface, deviceTouch?: boolean): boolean {
  if (surface === 'monitor') return deviceTouch === true;
  // Cooler glass is a framebuffer on a USB pipe with no input path at all.
  return surface !== 'q60' && surface !== 'kraken'
    && surface !== 'lcd-round' && surface !== 'lcd-square' && surface !== 'lcd-wide';
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
  // 640x640 round glass: one circular tile.
  kraken: '2x2round',
  // Cooler LCDs: one tile, masked to the glass's shape.
  'lcd-round': '2x2round',
  'lcd-square': '2x2',
  // Wide cooler glass (a 1600x720 Thermalright Wonder Vision): a landscape tile.
  // Like the rest of the family it stays one widget with no pager and no placing.
  'lcd-wide': '4x2',
};

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

export function surfaceSupportsMountOrientation(surface: PanelSurface): boolean {
  return MOUNT_ORIENTABLE_SURFACES.has(surface);
}

export function isSingleWidgetSurface(surface: PanelSurface): boolean {
  return singleWidgetSurfaceSize(surface) !== undefined;
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

export function normalizePanelWidgetSize(size: string | null | undefined): PanelWidgetSize {
  return PANEL_WIDGET_SIZES.includes(size as PanelWidgetSize)
    ? size as PanelWidgetSize
    : '4x4';
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
  config?: Record<string, PanelConfigValue>;
}

export interface PanelPage {
  id: string;
  label?: string;
  widgets: PanelWidget[];
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
}
