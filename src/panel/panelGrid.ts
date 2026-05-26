import { useEffect, useState, type RefObject } from 'react';
import { panelGridCapacityForCanvas, type PanelGridCapacity } from './engine/grid';
import type { PanelSurface } from './types';
import { getPanelGridSizingSettings, PANEL_SIMULATION_CHANGED_EVENT } from '../lib/panelSimulation';

// Reference cell size (pre-scale) used for the phone surface and as a
// canonical desktop cell baseline. The runtime grid is scaled around this.
export const PHONE_WIDGET_REFERENCE_CELL = 90;
export const DESKTOP_GRID_COLUMNS = 8;
export const DESKTOP_GRID_ROWS = 8;
// Hard cap on how many pages a panel can grow to. The user can drag
// a widget toward the right edge to create a new empty page on
// demand; this stops them at 10 so the pager / persistence don't
// have to deal with unbounded growth.
export const MAX_PANEL_PAGES = 10;
export const DESKTOP_GRID_PADDING = 16;
export const DESKTOP_ACTION_TRAY_HEIGHT = 0;
export const DESKTOP_GRID_REFERENCE_CELL = PHONE_WIDGET_REFERENCE_CELL;
export const DEFAULT_SURFACE_DPI: Record<PanelSurface, number> = {
  y70: 337,
  q60: 220,
  phone: 460,
  desktop: 144,
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
): PanelGridCapacity {
  // Initialise from the surface without touching `rootRef` so we don't
  // read a ref during render. The effect below immediately re-reads with
  // the mounted root and replaces this value on the first paint.
  const [metrics, setMetrics] = useState(() => readRuntimePanelGrid(surface, null, simulator));

  useEffect(() => {
    const update = () => setMetrics(readRuntimePanelGrid(surface, rootRef?.current ?? null, simulator));
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
  }, [surface, rootRef, simulator]);

  return metrics;
}

export function readRuntimePanelGrid(surface: PanelSurface, root?: HTMLElement | null, simulator = false): PanelGridCapacity {
  if (typeof window === 'undefined') {
    return panelGridCapacityForCanvas(682, 2560, {
      surface,
      dpi: DEFAULT_SURFACE_DPI[surface],
      sizing: getPanelGridSizingSettings(),
    });
  }

  if (surface === 'desktop') {
    // Desktop dashboard uses a fixed widget cell size so resizing the
    // window does not rescale widgets. The grid clips past its container
    // bounds rather than shrinking widget chrome.
    return {
      columns: DESKTOP_GRID_COLUMNS,
      rows: DESKTOP_GRID_ROWS,
      cellSize: DESKTOP_GRID_REFERENCE_CELL,
      rowSize: DESKTOP_GRID_REFERENCE_CELL,
      contentScale: DESKTOP_GRID_REFERENCE_CELL,
    };
  }

  // In simulator mode the iframe is sized at the device's native pixel
  // dimensions (e.g. 682x2560 for Y70); the host browser's DPR would
  // inflate the physical-size calc and trip the 4-to-8 column jump on
  // Retina hosts, so treat cssWidth/cssHeight as device pixels directly.
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
  return panelGridCapacityForCanvas(width, height, {
    surface,
    dpi: estimateRuntimePanelDpi(surface),
    sizing: getPanelGridSizingSettings(),
  });
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
