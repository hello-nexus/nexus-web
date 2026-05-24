// Canonical shape for the panel widget engine. Mirrors
// nexus-service/Models/Panel/PanelLayoutDto.cs. Keep in sync.

export const PANEL_WIDGET_SIZES = ['1x1', '2x2', '2x4', '4x2', '4x4'] as const;
export type PanelWidgetSize = typeof PANEL_WIDGET_SIZES[number];
export type PanelSurface = 'y70' | 'q60' | 'phone' | 'desktop';

// Single source of truth for whether a panel surface accepts direct pointer
// input. Q60 is display-only; desktop, phone, and Y70 all support interactive
// widget controls even though desktop uses a mouse rather than touch.
export function surfaceSupportsTouch(surface: PanelSurface): boolean {
  return surface !== 'q60';
}

// Surfaces that host exactly one widget at a time, each locked to a
// single fixed widget size. Adding a new such surface = adding an entry
// here; nothing else in the codebase should branch on a literal surface
// name. The Q-series LCD is the original example: 240x800-ish portrait
// strip with no touch and no room for a second tile.
export const SINGLE_WIDGET_SURFACE_SIZE: Readonly<Partial<Record<PanelSurface, PanelWidgetSize>>> = {
  q60: '2x4',
};

export function singleWidgetSurfaceSize(surface: PanelSurface): PanelWidgetSize | undefined {
  return SINGLE_WIDGET_SURFACE_SIZE[surface];
}

export function isSingleWidgetSurface(surface: PanelSurface): boolean {
  return singleWidgetSurfaceSize(surface) !== undefined;
}

// Sizes reserved for single-widget surfaces. Multi-widget surfaces hide
// these from the size picker and snap any persisted widget at one of
// these sizes to the nearest non-reserved size on reconcile.
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
 * Per-widget config value on the wire. Raw JSON — widgets read scalars
 * (`string` / `number` / `boolean`) directly or structured shapes (arrays,
 * objects) declared by the widget itself. Same shape native panel widgets
 * and marketplace widgets share.
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
  // Top-left cell of this widget's rect on its page grid. (col, row)
  // is the canonical placement: gaps between widgets are allowed and
  // are NEVER auto-filled. The renderer reads these directly; nothing
  // walks a flat order to compute placement.
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

export interface PanelDock {
  enabled: boolean;
  // Persisted across pages. Each entry must be size '1x1'.
  widgets: PanelWidget[];
}

export interface PanelLayout {
  layoutSchemaVersion: number;
  surface: PanelSurface;
  pages: PanelPage[];
  activePageId?: string;
  dock?: PanelDock;
}
