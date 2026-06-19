import type { TopologyDisplay } from '../../../api/displays';

export interface MonitorRect {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Windows-style seam between adjacent monitor rectangles. */
const RECT_INSET_PX = 2;
const ROW_GAP_PX = 16;

/**
 * Lay monitor rectangles out inside a container, Windows-display-settings
 * style. Map mode (every display has bounds): uniform scale of the virtual
 * desktop's bounding box, centered. Row mode (any display lacks bounds -
 * Linux): aspect-correct rectangles in a horizontal row. Pure math, no DOM.
 */
export function layoutMonitorRects(
  displays: TopologyDisplay[],
  containerWidth: number,
  containerHeight: number,
  padding = 24,
): MonitorRect[] {
  if (displays.length === 0 || containerWidth <= 0 || containerHeight <= 0) return [];
  const innerW = Math.max(1, containerWidth - 2 * padding);
  const innerH = Math.max(1, containerHeight - 2 * padding);

  const mappable = displays.every((d) => d.bounds !== null);
  if (!mappable) return layoutRow(displays, containerWidth, containerHeight, innerW, innerH);

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const d of displays) {
    const b = d.bounds!;
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  const bboxW = Math.max(1, maxX - minX);
  const bboxH = Math.max(1, maxY - minY);
  // Uniform scale only: a per-rect minimum size would break adjacency.
  const scale = Math.min(innerW / bboxW, innerH / bboxH);
  const offsetX = padding + (innerW - bboxW * scale) / 2;
  const offsetY = padding + (innerH - bboxH * scale) / 2;

  return displays.map((d) => {
    const b = d.bounds!;
    return inset({
      id: d.id,
      left: offsetX + (b.x - minX) * scale,
      top: offsetY + (b.y - minY) * scale,
      width: b.width * scale,
      height: b.height * scale,
    });
  });
}

function layoutRow(
  displays: TopologyDisplay[],
  containerWidth: number,
  containerHeight: number,
  innerW: number,
  innerH: number,
): MonitorRect[] {
  // Equal heights, widths from each display's aspect ratio, single row.
  const aspects = displays.map((d) => {
    const w = d.resolution.width > 0 ? d.resolution.width : 16;
    const h = d.resolution.height > 0 ? d.resolution.height : 9;
    return w / h;
  });
  const totalAspect = aspects.reduce((sum, a) => sum + a, 0);
  const gaps = ROW_GAP_PX * (displays.length - 1);
  // Height that fits the row horizontally, clamped to the container height.
  const height = Math.min(innerH, (innerW - gaps) / totalAspect);
  const rowWidth = height * totalAspect + gaps;
  let left = (containerWidth - rowWidth) / 2;
  const top = (containerHeight - height) / 2;

  return displays.map((d, i) => {
    const width = height * aspects[i];
    const rect = inset({ id: d.id, left, top, width, height });
    left += width + ROW_GAP_PX;
    return rect;
  });
}

function inset(rect: MonitorRect): MonitorRect {
  if (rect.width <= 2 * RECT_INSET_PX || rect.height <= 2 * RECT_INSET_PX) return rect;
  return {
    ...rect,
    left: rect.left + RECT_INSET_PX,
    top: rect.top + RECT_INSET_PX,
    width: rect.width - 2 * RECT_INSET_PX,
    height: rect.height - 2 * RECT_INSET_PX,
  };
}

/** Windows-settings-style number; array order when the OS gave none. */
export function displayNumberLabel(display: TopologyDisplay, index: number): string {
  return String(display.number > 0 ? display.number : index + 1);
}
