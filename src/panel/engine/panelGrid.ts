import { useEffect, useState, type RefObject } from 'react';
import { panelGridCapacityForCanvas, type PanelGridCapacity } from './grid';
import type { PanelSurface } from '../types';
import { getPanelGridSizingSettings, PANEL_SIMULATION_CHANGED_EVENT } from '../../lib/panelSimulation';

// Reference cell size (pre-scale) used for the phone surface and as a
// canonical desktop cell baseline. The runtime grid is scaled around this.
export const PHONE_WIDGET_REFERENCE_CELL = 90;
export const DESKTOP_GRID_COLUMNS = 8;
export const DESKTOP_GRID_ROWS = 8;
// Hard cap on pages. Dragging a widget to the right edge creates a new page;
// this caps growth at 10 so the pager / persistence stay bounded.
export const MAX_PANEL_PAGES = 10;
export const DESKTOP_GRID_PADDING = 16;
export const DESKTOP_ACTION_TRAY_HEIGHT = 0;
export const DESKTOP_GRID_REFERENCE_CELL = PHONE_WIDGET_REFERENCE_CELL;
export const DEFAULT_SURFACE_DPI: Record<PanelSurface, number> = {
  y70: 337,
  q60: 220,
  phone: 460,
  desktop: 144,
  // Promoted OS monitors: a desk-distance density estimate (27" 1440p ≈ 109).
  monitor: 110,
};

export function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function readSafeAreaInsets() {
  if (typeof document === 'undefined') {
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }

  const probe = document.createElement('div');
  probe.style.position = 'fixed';
  probe.style.pointerEvents = 'none';
  probe.style.visibility = 'hidden';
  probe.style.top = 'env(safe-area-inset-top)';
  probe.style.right = 'env(safe-area-inset-right)';
  probe.style.bottom = 'env(safe-area-inset-bottom)';
  probe.style.left = 'env(safe-area-inset-left)';
  document.body.appendChild(probe);
  const style = getComputedStyle(probe);
  const insets = {
    top: Number.parseFloat(style.top) || 0,
    right: Number.parseFloat(style.right) || 0,
    bottom: Number.parseFloat(style.bottom) || 0,
    left: Number.parseFloat(style.left) || 0,
  };
  probe.remove();
  return insets;
}

export function usePanelPageScrollLock(enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;
    const html = document.documentElement;
    const body = document.body;
    const root = document.getElementById('root');
    const previous = {
      htmlOverflow: html.style.overflow,
      htmlHeight: html.style.height,
      bodyOverflow: body.style.overflow,
      bodyHeight: body.style.height,
      rootHeight: root?.style.height ?? '',
    };

    html.style.overflow = 'hidden';
    html.style.height = '100%';
    body.style.overflow = 'hidden';
    body.style.height = '100%';
    if (root) root.style.height = '100%';

    return () => {
      html.style.overflow = previous.htmlOverflow;
      html.style.height = previous.htmlHeight;
      body.style.overflow = previous.bodyOverflow;
      body.style.height = previous.bodyHeight;
      if (root) root.style.height = previous.rootHeight;
    };
  }, [enabled]);
}

export function useRuntimePanelGrid(
  surface: PanelSurface,
  rootRef?: RefObject<HTMLElement | null>,
  simulator = false,
  deviceDpi?: number,
  // Widget-padding ratio (panelWidgetPaddingRatio of the theme setting).
  // Defaults to 0 for callers that don't have a theme in scope.
  widgetPaddingRatio = 0,
): PanelGridCapacity {
  // Initialise from the surface without touching `rootRef` (no ref reads
  // during render). The effect below re-reads with the mounted root on first
  // paint.
  const [metrics, setMetrics] = useState(() => readRuntimePanelGrid(surface, null, simulator, deviceDpi, widgetPaddingRatio));

  useEffect(() => {
    const update = () => setMetrics(readRuntimePanelGrid(surface, rootRef?.current ?? null, simulator, deviceDpi, widgetPaddingRatio));
    update();
    const observed = rootRef?.current ?? null;
    const observer = observed && typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(update)
      : null;
    if (observed && observer) observer.observe(observed);
    window.visualViewport?.addEventListener('resize', update);
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    window.addEventListener(PANEL_SIMULATION_CHANGED_EVENT, update);
    return () => {
      window.visualViewport?.removeEventListener('resize', update);
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      window.removeEventListener(PANEL_SIMULATION_CHANGED_EVENT, update);
      observer?.disconnect();
    };
  }, [surface, rootRef, simulator, deviceDpi, widgetPaddingRatio]);

  return metrics;
}

// `deviceDpi` is the device record's physical density (capabilities.dpi,
// stamped for curated known displays), expressed in the same pixel space the
// runtime measures: native px on a kiosk (css x dpr), CSS px in the simulator
// (the parent divides by the device DPR before passing it). Absent, density
// falls back to the per-surface estimate.
export function readRuntimePanelGrid(
  surface: PanelSurface,
  root?: HTMLElement | null,
  simulator = false,
  deviceDpi?: number,
  widgetPaddingRatio = 0,
): PanelGridCapacity {
  if (typeof window === 'undefined') {
    return panelGridCapacityForCanvas(682, 2560, {
      surface,
      dpi: deviceDpi ?? DEFAULT_SURFACE_DPI[surface],
      sizing: getPanelGridSizingSettings(),
      paddingRatio: widgetPaddingRatio,
    });
  }

  if (surface === 'desktop') {
    // Desktop dashboard uses a fixed cell size so window resize doesn't
    // rescale widgets; the grid clips past its container instead. The cell
    // isn't canvas-derived, so gap is solved directly against it rather than
    // via resolvePanelSpacing; page padding stays 0 (the embedded grid sits
    // inside the shared .content wrapper, which already insets it).
    return {
      columns: DESKTOP_GRID_COLUMNS,
      rows: DESKTOP_GRID_ROWS,
      cellSize: DESKTOP_GRID_REFERENCE_CELL,
      rowSize: DESKTOP_GRID_REFERENCE_CELL,
      contentScale: DESKTOP_GRID_REFERENCE_CELL,
      gap: widgetPaddingRatio * DESKTOP_GRID_REFERENCE_CELL,
      padding: 0,
    };
  }

  // The simulator iframe is sized at the device's native pixels (e.g.
  // 682x2560 for Y70). The host DPR would inflate the physical-size calc and
  // trip the 4-to-8 column jump on Retina hosts, so treat cssWidth/cssHeight
  // as device pixels directly.
  const dpr = simulator
    ? 1
    : Number.isFinite(window.devicePixelRatio) && window.devicePixelRatio > 0
      ? window.devicePixelRatio
      : 1;
  const rect = root?.getBoundingClientRect();
  const cssWidth = Math.max(1, Math.round(rect?.width ?? window.innerWidth));
  const cssHeight = Math.max(1, Math.round(rect?.height ?? window.innerHeight));
  const width = Math.max(1, Math.round(cssWidth * dpr));
  const height = Math.max(1, Math.round(cssHeight * dpr));
  const capacity = panelGridCapacityForCanvas(width, height, {
    surface,
    dpi: deviceDpi ?? estimateRuntimePanelDpi(surface),
    sizing: getPanelGridSizingSettings(),
    paddingRatio: widgetPaddingRatio,
  });
  // Column/row counts are decided in physical px (density), but contentScale
  // (and gap/padding, injected as CSS custom properties) drive CSS lengths,
  // so they must be CSS px. At >100% Windows scaling the CSS viewport shrinks
  // while physical px stays, so a physical-based value renders ~dpr times too
  // large. No-op at 100% (dpr 1) and for the simulator (dpr forced to 1
  // above).
  return {
    ...capacity,
    contentScale: capacity.contentScale / dpr,
    gap: capacity.gap / dpr,
    padding: capacity.padding / dpr,
  };
}

export function estimateRuntimePanelDpi(surface: PanelSurface): number {
  if (surface !== 'phone') return DEFAULT_SURFACE_DPI[surface];
  const dpr = Number.isFinite(window.devicePixelRatio) && window.devicePixelRatio > 0
    ? window.devicePixelRatio
    : 1;
  const shortSideCss = Math.min(window.innerWidth, window.innerHeight);
  if (shortSideCss >= 700 && dpr <= 2.25) return 264;
  if (dpr >= 2.75) return 460;
  if (dpr >= 1.75) return 326;
  return 160;
}

// CSS px spanning one physical millimeter on this surface - lets a gesture
// threshold be set as real finger travel instead of raw CSS px. A CSS px is not
// a fixed physical size: a phone's mobile viewport anchors it near the
// reference density, but on the Y70 Edge kiosk devicePixelRatio is only the
// Windows display-scaling factor (~1.5), not the panel's ~337 PPI, so the same
// CSS px is far less finger travel there. estimateRuntimePanelDpi is native
// px/inch; gesture coordinates are CSS px, hence the /dpr.
export function cssPxPerMm(surface: PanelSurface): number {
  if (typeof window === 'undefined') return DEFAULT_SURFACE_DPI[surface] / 25.4;
  const dpr = Number.isFinite(window.devicePixelRatio) && window.devicePixelRatio > 0
    ? window.devicePixelRatio
    : 1;
  return estimateRuntimePanelDpi(surface) / 25.4 / dpr;
}
