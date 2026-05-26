import { useEffect, useState, type RefObject } from 'react';
import type { PanelSurface } from './types';
import { PHONE_WIDGET_REFERENCE_CELL, readSafeAreaInsets } from './panelGrid';
import styles from './PanelApp.module.scss';

export const PHONE_PANEL_PWA_KEY = 'nexus_phone_panel_pwa';

export function usePhonePanelManifest(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    localStorage.setItem(PHONE_PANEL_PWA_KEY, '1');

    const manifest = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    const previousManifest = manifest?.getAttribute('href');
    if (manifest) manifest.href = '/panel-phone.webmanifest';

    const appleTitle = document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]');
    const previousAppleTitle = appleTitle?.getAttribute('content');
    if (appleTitle) appleTitle.content = 'Nexus Panel';

    const title = document.title;
    document.title = 'Nexus Panel';

    return () => {
      if (manifest && previousManifest) manifest.href = previousManifest;
      if (appleTitle && previousAppleTitle) appleTitle.content = previousAppleTitle;
      document.title = title;
    };
  }, [enabled]);
}

export function useIsLandscape(surface: PanelSurface): boolean {
  // Y70 + Q60 are physically fixed orientations and don't flip; only
  // 'phone' surface honours `(orientation: landscape)`.
  const [isLandscape, setIsLandscape] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (surface !== 'phone') {
      // Reset to portrait baseline when leaving the phone surface so a
      // previously-latched landscape value doesn't persist on Y70/Q60.
       
      setIsLandscape(false);
      return;
    }
    const mq = window.matchMedia('(orientation: landscape)');
    const update = () => setIsLandscape(mq.matches);
    update();
    if (mq.addEventListener) {
      mq.addEventListener('change', update);
      return () => mq.removeEventListener('change', update);
    }
    mq.addListener(update);
    return () => mq.removeListener(update);
  }, [surface]);
  return isLandscape;
}

export function usePhoneContentScale(enabled: boolean, rootRef: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    if (!enabled) return;
    const root = rootRef.current;
    if (!root) return;

    const update = () => {
      const grid = root.querySelector<HTMLElement>(`.${styles.grid}`);
      if (!grid) return;

      const scale = readPhoneWidgetScale(root, grid);
      if (Number.isFinite(scale) && scale > 0) {
        root.style.setProperty('--panel-widget-scale', scale.toFixed(4));
      }
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(root);
    const grid = root.querySelector<HTMLElement>(`.${styles.grid}`);
    if (grid) observer.observe(grid);
    window.visualViewport?.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);

    return () => {
      observer.disconnect();
      window.visualViewport?.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, [enabled, rootRef]);
}

export function readPhoneWidgetScale(root: HTMLElement, grid: HTMLElement) {
  const rootStyle = getComputedStyle(root);
  const gridStyle = getComputedStyle(grid);
  const columnGap = Number.parseFloat(gridStyle.columnGap) || 0;
  const rowGap = Number.parseFloat(gridStyle.rowGap) || columnGap;
  const isLandscape = window.matchMedia('(orientation: landscape)').matches;
  const measuredScale = readMeasuredPhoneWidgetScale(grid, columnGap, rowGap, isLandscape);
  if (measuredScale !== undefined) return measuredScale;

  const cellSize = readPhoneGridCellSize(rootStyle, columnGap, rowGap, isLandscape);
  return cellSize / PHONE_WIDGET_REFERENCE_CELL;
}

export function readPhoneGridCellSize(
  rootStyle: CSSStyleDeclaration,
  columnGap: number,
  rowGap: number,
  isLandscape: boolean,
) {
  const cssCellSize = Number.parseFloat(rootStyle.getPropertyValue('--panel-cell-size'));
  if (Number.isFinite(cssCellSize) && cssCellSize > 0) return cssCellSize;

  const viewport = window.visualViewport;
  const viewportWidth = isLandscape
    ? Math.max(window.innerWidth, viewport?.width ?? 0)
    : viewport?.width ?? window.innerWidth;
  const viewportHeight = isLandscape
    ? Math.max(window.innerHeight, viewport?.height ?? 0)
    : viewport?.height ?? window.innerHeight;
  const safeArea = readSafeAreaInsets();
  const safeTop = Math.max(8, safeArea.top);
  const safeRight = Math.max(8, safeArea.right);
  const safeBottom = isLandscape ? safeTop : Math.max(8, safeArea.bottom);
  const safeLeft = Math.max(8, safeArea.left);

  if (isLandscape) {
    const rows = Number.parseInt(rootStyle.getPropertyValue('--panel-rows'), 10) || 4;
    return (viewportHeight - safeTop - safeBottom - (rows - 1) * rowGap) / rows;
  }

  const columns = Number.parseInt(rootStyle.getPropertyValue('--panel-columns'), 10) || 4;
  return (viewportWidth - safeLeft - safeRight - (columns - 1) * columnGap) / columns;
}

export function readMeasuredPhoneWidgetScale(grid: HTMLElement, columnGap: number, rowGap: number, isLandscape: boolean) {
  // Skip hoisted cells - fixed-position motion wrappers don't reflect the
  // grid's actual cell size and would skew the global widget scale.
  const cells = Array.from(grid.querySelectorAll<HTMLElement>('[data-panel-widget-id]'))
    .filter(cell => !cell.classList.contains(styles.cellEditorDocked) && !cell.classList.contains(styles.cellResizeMotion));
  const scales = cells
    .map(cell => {
      const cellStyle = getComputedStyle(cell);
      const columnSpan = readGridSpan(cell.style.gridColumn, cellStyle.gridColumnEnd, cellStyle.gridColumn) ?? 1;
      const rowSpan = readGridSpan(cell.style.gridRow, cellStyle.gridRowEnd, cellStyle.gridRow) ?? 1;
      if (!isLandscape) {
        const width = (cell.offsetWidth - (columnSpan - 1) * columnGap) / columnSpan;
        const height = (cell.offsetHeight - (rowSpan - 1) * rowGap) / rowSpan;
        const cellSize = Math.min(width, height);
        return cellSize / PHONE_WIDGET_REFERENCE_CELL;
      }

      const widthScale = cell.offsetWidth / (columnSpan * PHONE_WIDGET_REFERENCE_CELL);
      const heightScale = cell.offsetHeight / (rowSpan * PHONE_WIDGET_REFERENCE_CELL);
      return Math.min(widthScale, heightScale);
    })
    .filter(scale => Number.isFinite(scale) && scale > 0);
  return scales.length ? Math.max(...scales) : undefined;
}

export function readGridSpan(...values: string[]) {
  for (const value of values) {
    const match = /span\s+(\d+)/.exec(value);
    if (!match) continue;
    const span = Number.parseInt(match[1], 10);
    if (Number.isFinite(span) && span > 0) return span;
  }
  return undefined;
}
