import type { CSSProperties } from 'react';
import { sizeToSpan } from '../engine/grid';
import type { PanelSurface, PanelWidget } from '../types';
import { DESKTOP_GRID_PADDING, PHONE_WIDGET_REFERENCE_CELL, clampNumber, readSafeAreaInsets } from '../engine/panelGrid';
import { readPhoneGridCellSize } from '../device/panelPhone';

export interface EditorDockSourceRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface EditorDockMotion {
  widgetId: string;
  phase: 'open' | 'closing';
  style: CSSProperties;
  sourceRect?: EditorDockSourceRect;
}

export function buildEditorDockMotionStyle(
  root: HTMLElement | null,
  widget: PanelWidget,
  sourceRect?: EditorDockSourceRect,
  surface?: PanelSurface,
): CSSProperties {
  const span = sizeToSpan(widget.size);
  const rootStyle = root ? getComputedStyle(root) : null;
  const isDesktop = surface === 'desktop';
  const isLandscape = !isDesktop && window.matchMedia('(orientation: landscape)').matches;
  const gap = Number.parseFloat(rootStyle?.getPropertyValue('--panel-gap') ?? '') || 8;
  const cellSize = readEditorDockCellSize(rootStyle, sourceRect, span, gap, isLandscape);
  const width = span.cols * cellSize + (span.cols - 1) * gap;
  const height = span.rows * cellSize + (span.rows - 1) * gap;
  const viewport = window.visualViewport;
  const viewportWidth = viewport?.width ?? window.innerWidth;
  const viewportHeight = viewport?.height ?? window.innerHeight;
  const safeArea = readSafeAreaInsets();
  const sourceLeft = sourceRect
    ? sourceRect.left - (width - sourceRect.width) / 2
    : (viewportWidth - width) / 2;
  const sourceTop = sourceRect
    ? sourceRect.top - (height - sourceRect.height) / 2
    : (viewportHeight - height) / 2;
  let left: number;
  let top: number;

  if (isDesktop) {
    const rootRect = root?.getBoundingClientRect();
    const hasRootRect = Boolean(rootRect && rootRect.width > 0 && rootRect.height > 0);
    const pagePadding = Number.parseFloat(rootStyle?.getPropertyValue('--panel-page-padding') ?? '') || DESKTOP_GRID_PADDING;
    const sheetWidth = Math.min(440, viewportWidth * 0.92);
    const sheetGap = 24;
    const rootLeft = hasRootRect ? rootRect!.left : safeArea.left;
    const rootRight = hasRootRect ? rootRect!.right : viewportWidth - safeArea.right;
    const rootTop = hasRootRect ? rootRect!.top : safeArea.top;
    const rootBottom = hasRootRect ? rootRect!.bottom : viewportHeight - safeArea.bottom;
    const minLeft = Math.max(safeArea.left, rootLeft + pagePadding);
    const visibleRight = Math.min(rootRight - pagePadding, viewportWidth - sheetWidth - sheetGap);
    const maxLeft = Math.max(minLeft, visibleRight - width);
    const minTop = Math.max(safeArea.top, rootTop + pagePadding);
    const maxTop = Math.max(minTop, rootBottom - pagePadding - height);
    left = clampNumber(sourceLeft, minLeft, maxLeft);
    top = clampNumber(sourceTop, minTop, maxTop);
  } else {
    const minLeft = safeArea.left;
    const minTop = safeArea.top;
    const maxLeft = Math.max(minLeft, viewportWidth - width - safeArea.right);
    const maxTop = Math.max(minTop, viewportHeight - height - safeArea.bottom);
    left = isLandscape
      ? minLeft
      : clampNumber(sourceLeft, minLeft, maxLeft);
    top = isLandscape
      ? clampNumber(sourceTop, minTop, maxTop)
      : minTop;
  }
  const startX = sourceRect ? sourceRect.left - left : 0;
  const startY = sourceRect ? sourceRect.top - top : 0;
  const startScaleX = sourceRect ? sourceRect.width / width : 1;
  const startScaleY = sourceRect ? sourceRect.height / height : 1;
  const widgetScale = rootStyle?.getPropertyValue('--panel-widget-scale').trim() || '1';

  return {
    '--panel-editor-dock-left': `${Math.round(left)}px`,
    '--panel-editor-dock-top': `${Math.round(top)}px`,
    '--panel-editor-dock-width': `${Math.round(width)}px`,
    '--panel-editor-dock-height': `${Math.round(height)}px`,
    '--panel-editor-dock-start-x': `${Math.round(startX)}px`,
    '--panel-editor-dock-start-y': `${Math.round(startY)}px`,
    '--panel-editor-dock-start-scale-x': startScaleX.toFixed(4),
    '--panel-editor-dock-start-scale-y': startScaleY.toFixed(4),
    '--panel-widget-scale': widgetScale,
  } as CSSProperties;
}

function readEditorDockCellSize(
  rootStyle: CSSStyleDeclaration | null,
  sourceRect: EditorDockSourceRect | undefined,
  span: { cols: number; rows: number },
  gap: number,
  isLandscape: boolean,
) {
  const cssCellSize = Number.parseFloat(rootStyle?.getPropertyValue('--panel-cell-size') ?? '');
  if (Number.isFinite(cssCellSize) && cssCellSize > 0) return cssCellSize;

  if (rootStyle) {
    const viewportCellSize = readPhoneGridCellSize(rootStyle, gap, gap, isLandscape);
    if (Number.isFinite(viewportCellSize) && viewportCellSize > 0) return viewportCellSize;
  }

  if (sourceRect) {
    const cellWidth = (sourceRect.width - gap * (span.cols - 1)) / span.cols;
    const cellHeight = (sourceRect.height - gap * (span.rows - 1)) / span.rows;
    const sourceCellSize = Math.min(cellWidth, cellHeight);
    if (Number.isFinite(sourceCellSize) && sourceCellSize > 0) return sourceCellSize;
  }

  return PHONE_WIDGET_REFERENCE_CELL;
}

export function toEditorDockSourceRect(rect?: DOMRect): EditorDockSourceRect | undefined {
  return rect
    ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
    : undefined;
}

export function readEditorDockSlotRect(root: HTMLElement | null, widgetId: string): EditorDockSourceRect | undefined {
  if (!root) return undefined;
  const slots = Array.from(root.querySelectorAll<HTMLElement>('[data-panel-widget-slot-id]'));
  const slot = slots.find(el => el.dataset.panelWidgetSlotId === widgetId);
  const rect = slot?.getBoundingClientRect();
  if (!rect || rect.width <= 0 || rect.height <= 0) return undefined;
  return toEditorDockSourceRect(rect);
}
