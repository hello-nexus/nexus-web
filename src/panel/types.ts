// Canonical shape for the panel widget engine. Mirrors
// nexus-service/Models/Panel/PanelLayoutDto.cs. Keep in sync.

export const PANEL_WIDGET_SIZES = ['1x1', '2x2', '2x4', '4x2', '4x4'] as const;
export type PanelWidgetSize = typeof PANEL_WIDGET_SIZES[number];
// 'monitor' = a user-promoted OS monitor hosting a fullscreen kiosk
// (service-stamped surface; see PanelSurfaces.Monitor in nexus-service).
export type PanelSurface = 'y70' | 'q60' | 'phone' | 'desktop' | 'monitor';

// Whether a surface accepts direct pointer input. Q60 is display-only;
// desktop, phone, Y70 support interactive widget controls (desktop via mouse).
// 'monitor' is per-DEVICE: a promoted monitor is interactive only when an
// integrated touch digitizer targets it (capabilities.touch on its record);
// plain monitors are glanceable displays like the Q-series.
export function surfaceSupportsTouch(surface: PanelSurface, deviceTouch?: boolean): boolean {
  if (surface === 'monitor') return deviceTouch === true;
  return surface !== 'q60';
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

// Surfaces hosting one widget at a fixed size. Add a surface by adding an
// entry here; nothing else should branch on a literal surface name. Q-series
// LCD: ~240x800 portrait strip, no touch, room for one tile.
export const SINGLE_WIDGET_SURFACE_SIZE: Readonly<Partial<Record<PanelSurface, PanelWidgetSize>>> = {
  q60: '2x4',
};

export function singleWidgetSurfaceSize(surface: PanelSurface): PanelWidgetSize | undefined {
  return SINGLE_WIDGET_SURFACE_SIZE[surface];
}

export function isSingleWidgetSurface(surface: PanelSurface): boolean {
  return singleWidgetSurfaceSize(surface) !== undefined;
}

// Sizes reserved for single-widget surfaces. Multi-widget surfaces hide them
// from the size picker and snap persisted widgets to the nearest non-reserved
// size on reconcile.
export const SINGLE_WIDGET_SIZES: ReadonlySet<PanelWidgetSize> = new Set(
  Object.values(SINGLE_WIDGET_SURFACE_SIZE).filter(
    (s): s is PanelWidgetSize => s !== undefined,
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
}
