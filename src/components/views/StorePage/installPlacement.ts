// Where a freshly installed app's widget can land: the Apps dashboard plus every
// connected panel whose surface takes it. Planning is pure so the modal previews
// exactly the layout a commit writes.

import {
  allocatePanelDevice, fetchPanelDevice, fetchPanelDevices, patchPanelDevice,
  type PanelDeviceRecord,
} from '../../../api/panel';
import { fetchPreferences, savePreferences } from '../../../api/profiles';
import type { UnifiedDevice } from '../../../hooks/useUnifiedDevices';
import { getPanelGridSizingSettings } from '../../../lib/panelSimulation';
import { createUuid } from '../../../lib/uuid';
import { normalizePanelWidgetPadding } from '../../../panel/background/panelBackground';
import { defaultLayoutForDashboard, defaultLayoutForSurface } from '../../../panel/engine/defaultLayout';
import {
  PANEL_GRID_COLS, PANEL_WIDGET_PADDING_DEFAULT_PERCENT, PANEL_Y70_LONG_AXIS_CELLS,
  panelGridCapacityForCanvas, panelWidgetPaddingRatio, sizeToSpan,
} from '../../../panel/engine/grid';
import { layoutRowExtent, type PaginateCapacity } from '../../../panel/engine/paginate';
import {
  DEFAULT_SURFACE_DPI, DESKTOP_GRID_REFERENCE_CELL, DESKTOP_GRID_ROWS, desktopAutoArrangeColumns,
} from '../../../panel/engine/panelGrid';
import { appendWidget, swapSingleWidget } from '../../../panel/engine/panelLayoutOps';
import { broadcastLayoutChanged } from '../../../panel/engine/panelSync';
import { normalizePanelLayout } from '../../../panel/engine/usePanelLayout';
import {
  isSingleWidgetSurface, panelLayoutDpi, forcedGridOf, panelLayoutSurface, panelShortSideSlots, singleWidgetSurfaceSize, surfaceAllowsPages, surfaceSupportsTouch,
  type ForcedGrid, type PanelLayout, type PanelPage, type PanelSurface, type PanelWidget, type PanelWidgetSize,
} from '../../../panel/types';
import { appAvailableForSurface, pickerSizeFor, sizesForSurface } from '../../../panel/widgets/registry';
import type { AppManifest } from '../../../panel/widgets/types';

export const DASHBOARD_TARGET_KEY = 'dashboard';

export interface PlacementTarget {
  key: string;
  name: string;
  /** Device glyph (a mask image); null for the Apps dashboard. */
  iconSrc: string | null;
  surface: PanelSurface;
  panelRecordId?: string;
  deviceTouch?: boolean;
  /** Screen size from the device profile; a record's own canvas wins. */
  screen?: { width: number; height: number };
  screenDpi?: number;
  screenDpr?: number;
}

export interface LoadedTarget {
  layout: PanelLayout;
  record?: PanelDeviceRecord;
}

export interface PlacementPlan {
  target: PlacementTarget;
  /** The surface whose layout rules the target follows (its Widget size). */
  surface: PanelSurface;
  layout: PanelLayout;
  widget: PanelWidget;
  page: PanelPage;
  capacity: PaginateCapacity;
  /** Type a single-widget screen shows now; the add replaces it. */
  replaces?: string;
  /** Screen size in CSS px, for the preview's aspect. */
  screen?: { width: number; height: number };
}

type AppMeta = AppManifest['meta'];

export function placementTargets(dashboardName: string, devices: readonly UnifiedDevice[]): PlacementTarget[] {
  const targets: PlacementTarget[] = [{ key: DASHBOARD_TARGET_KEY, name: dashboardName, iconSrc: null, surface: 'desktop' }];
  for (const device of devices) {
    const panel = device.panelDevice;
    if (device.kind !== 'panel' || !panel?.runtimeSurface || !panel.capabilities.layout || !device.nexusControlEnabled) continue;
    targets.push({
      key: device.key,
      name: device.shortName,
      iconSrc: device.iconSrc,
      surface: panel.runtimeSurface,
      panelRecordId: panel.panelRecordId,
      deviceTouch: panel.capabilities.touch,
      screen: panel.previewSize,
      screenDpi: panel.previewDpi,
      screenDpr: panel.previewDpr,
    });
  }
  return targets;
}

/** The dashboard columns visible at `width`, which a manual add is limited to. */
export function dashboardColumnsForWidth(width: number): number {
  return desktopAutoArrangeColumns(width, panelWidgetPaddingRatio(PANEL_WIDGET_PADDING_DEFAULT_PERCENT) * DESKTOP_GRID_REFERENCE_CELL);
}

export function placementSize(meta: AppMeta, surface: PanelSurface, deviceTouch?: boolean, forcedGrid?: ForcedGrid): PanelWidgetSize | null {
  const sizes = sizesForSurface(meta, surface, deviceTouch, forcedGrid);
  if (sizes.length === 0) return null;
  return sizes.includes(meta.defaultSize) ? meta.defaultSize : pickerSizeFor(meta, surface, deviceTouch, forcedGrid);
}

function deviceTouchOf(target: PlacementTarget, record?: PanelDeviceRecord): boolean | undefined {
  return record?.capabilities?.touch ?? target.deviceTouch;
}

// The surface the panel lays out as once its record is known, with the glass's own input.
function layoutOf(target: PlacementTarget, record?: PanelDeviceRecord): { surface: PanelSurface; deviceTouch?: boolean; shortSideSlots?: number; forcedGrid?: ForcedGrid } {
  const touch = deviceTouchOf(target, record);
  const surface = panelLayoutSurface(target.surface, record?.capabilities?.family, record?.widgetSize);
  const shortSideSlots = panelShortSideSlots(target.surface, record?.capabilities?.family, record?.widgetSize);
  const screen = screenOf(target, record);
  return {
    surface,
    deviceTouch: surface === target.surface ? touch : surfaceSupportsTouch(target.surface, touch),
    shortSideSlots,
    forcedGrid: forcedGridOf(shortSideSlots, !!screen && screen.width > screen.height),
  };
}

function screenOf(target: PlacementTarget, record?: PanelDeviceRecord): { width: number; height: number; dpr: number } | undefined {
  const caps = record?.capabilities;
  // The Q-series WebView reports physical px as its css size.
  if (caps?.cssWidth && caps.cssHeight) return { width: caps.cssWidth, height: caps.cssHeight, dpr: target.surface === 'q60' ? 1 : caps.dpr || 1 };
  return target.screen ? { ...target.screen, dpr: target.screenDpr || 1 } : undefined;
}

// Mirrors PanelDevicePage's editor grid; the runtime re-fits any drift on render.
function panelCapacity(target: PlacementTarget, record?: PanelDeviceRecord): PaginateCapacity {
  const { surface, shortSideSlots } = layoutOf(target, record);
  const single = singleWidgetSurfaceSize(surface);
  if (single) {
    const span = sizeToSpan(single);
    return { gridCols: span.cols, pageRows: span.rows };
  }
  const screen = screenOf(target, record);
  if (screen) {
    const capacity = panelGridCapacityForCanvas(
      Math.max(1, Math.round(screen.width * screen.dpr)),
      Math.max(1, Math.round(screen.height * screen.dpr)),
      {
        surface,
        dpi: panelLayoutDpi(target.surface, record?.capabilities?.family, record?.widgetSize, record?.capabilities?.dpi, DEFAULT_SURFACE_DPI)
          ?? target.screenDpi ?? DEFAULT_SURFACE_DPI[target.surface],
        sizing: getPanelGridSizingSettings(),
        shortSideSlots,
        paddingRatio: panelWidgetPaddingRatio(normalizePanelWidgetPadding(record?.widgetPadding)),
      },
    );
    return { gridCols: capacity.columns, pageRows: capacity.rows };
  }
  if (surface === 'y70') return { gridCols: PANEL_GRID_COLS, pageRows: PANEL_Y70_LONG_AXIS_CELLS };
  if (surface === 'monitor') return { gridCols: 8, pageRows: 6 };
  return { gridCols: 4, pageRows: 16 };
}

export function planPlacement(
  target: PlacementTarget,
  loaded: LoadedTarget,
  type: string,
  meta: AppMeta,
  dashboardColumns: number,
): PlacementPlan | null {
  const { layout, record } = loaded;
  const { surface, deviceTouch, forcedGrid } = layoutOf(target, record);
  if (!appAvailableForSurface(meta, surface, { deviceTouch, forcedGrid })) return null;
  const size = placementSize(meta, surface, deviceTouch, forcedGrid);
  if (!size) return null;
  if (meta.singleInstance && layout.pages.some(p => p.widgets.some(w => w.type === type))) return null;
  const screen = screenOf(target, record);
  const fresh: PanelWidget = { id: createUuid(), type, size, col: 0, row: 0 };

  if (isSingleWidgetSurface(surface)) {
    const current = layout.pages[0]?.widgets[0];
    if (current?.type === type) return null;
    const next = swapSingleWidget(layout, fresh);
    return {
      target, surface, layout: next, widget: next.pages[0].widgets[0], page: next.pages[0],
      capacity: panelCapacity(target, record), replaces: current?.type, screen,
    };
  }

  const dashboard = target.key === DASHBOARD_TARGET_KEY;
  // The dashboard grid grows with its content, so it always has a row below the last widget.
  const capacity = dashboard
    ? { gridCols: dashboardColumns, pageRows: Math.max(DESKTOP_GRID_ROWS, layoutRowExtent(layout)) + sizeToSpan(size).rows }
    : panelCapacity(target, record);
  const appended = appendWidget(layout, fresh, capacity, { singlePage: dashboard || !surfaceAllowsPages(surface, deviceTouch) });
  const page = appended.pages.find(p => p.widgets.some(w => w.id === fresh.id));
  const widget = page?.widgets.find(w => w.id === fresh.id);
  if (!page || !widget) return null;
  return {
    target, surface, layout: dashboard ? appended : { ...appended, activePageId: page.id },
    widget, page, capacity, screen,
  };
}

/** Null when the layout could not be read: a write from a guessed default would clobber it. */
export async function loadTarget(target: PlacementTarget): Promise<LoadedTarget | null> {
  if (target.key === DASHBOARD_TARGET_KEY) {
    const prefs = await fetchPreferences();
    if (!prefs) return null;
    const layout = normalizePanelLayout(prefs.panel?.dashboardLayout ?? defaultLayoutForDashboard(), 'desktop');
    return { layout: layout.pages.length > 1 ? { ...layout, pages: [layout.pages[0]] } : layout };
  }
  let record: PanelDeviceRecord | undefined;
  if (target.panelRecordId) {
    const found = await fetchPanelDevice(target.panelRecordId);
    if (!found) return null;
    record = found;
  } else {
    const list = await fetchPanelDevices();
    if (!list) return null;
    // Same binding as PanelDevicePage: the newest record for the surface that no display owns.
    record = list.devices.find(d => d.capabilities?.surface === target.surface && !d.displayId);
  }
  const laidOut = layoutOf(target, record);
  const layout = normalizePanelLayout(
    record?.layout ?? defaultLayoutForSurface(laidOut.surface),
    laidOut.surface,
    laidOut.deviceTouch,
    laidOut.forcedGrid,
  );
  return { layout, record };
}

/** Re-reads the target and writes a fresh plan, so an edit made while the modal was open survives. */
export async function commitPlacement(
  target: PlacementTarget,
  type: string,
  meta: AppMeta,
  dashboardColumns: number,
): Promise<boolean> {
  const loaded = await loadTarget(target);
  if (!loaded) return false;
  const plan = planPlacement(target, loaded, type, meta, dashboardColumns);
  if (!plan) return false;
  if (target.key === DASHBOARD_TARGET_KEY) {
    const saved = await savePreferences({ panel: { dashboardLayout: plan.layout } });
    if (saved === null) return false;
    broadcastLayoutChanged();
    return true;
  }
  // A surface that never connected has no record yet; PanelDevicePage allocates the same way.
  const id = loaded.record?.id
    ?? (await allocatePanelDevice({ surface: target.surface }, `${target.surface} panel`))?.id;
  if (!id) return false;
  const saved = await patchPanelDevice(id, { layout: plan.layout });
  if (!saved) return false;
  broadcastLayoutChanged();
  return true;
}
