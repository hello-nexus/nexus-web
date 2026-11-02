export interface HintRect { left: number; top: number; width: number; height: number; }

/** How a single widget's hover notice splits between "Edit widget" and "Edit background": stacked (widget on top) unless the tile is wider than tall. */
export function splitOrientation(cols: number, rows: number): 'stacked' | 'side' {
  return cols > rows ? 'side' : 'stacked';
}

/** The largest axis-aligned rectangle of the canvas that no widget rect covers, or null when widgets fill it. */
export function largestFreeRect(canvas: { width: number; height: number }, widgets: readonly HintRect[]): HintRect | null {
  const clamp = (v: number, max: number) => Math.min(max, Math.max(0, v));
  const covered = widgets
    .map(r => ({ x1: clamp(r.left, canvas.width), x2: clamp(r.left + r.width, canvas.width), y1: clamp(r.top, canvas.height), y2: clamp(r.top + r.height, canvas.height) }))
    .filter(r => r.x2 > r.x1 && r.y2 > r.y1);
  const xs = [...new Set([0, canvas.width, ...covered.flatMap(r => [r.x1, r.x2])])].sort((a, b) => a - b);
  const ys = [...new Set([0, canvas.height, ...covered.flatMap(r => [r.y1, r.y2])])].sort((a, b) => a - b);
  const cols = xs.length - 1;
  const rows = ys.length - 1;
  const blocked = (i: number, j: number) => covered.some(r => r.x1 < xs[i + 1] && r.x2 > xs[i] && r.y1 < ys[j + 1] && r.y2 > ys[j]);
  const grid = Array.from({ length: rows }, (_, j) => Array.from({ length: cols }, (_, i) => blocked(i, j)));
  let best: HintRect | null = null;
  let bestArea = 0;
  for (let j1 = 0; j1 < rows; j1++) {
    // widthOk[i] stays true while column i is free in every row from j1 down to j2.
    const widthOk = Array.from({ length: cols }, () => true);
    for (let j2 = j1; j2 < rows; j2++) {
      for (let i = 0; i < cols; i++) widthOk[i] = widthOk[i] && !grid[j2][i];
      let i1 = 0;
      while (i1 < cols) {
        if (!widthOk[i1]) { i1++; continue; }
        let i2 = i1;
        while (i2 + 1 < cols && widthOk[i2 + 1]) i2++;
        const rect = { left: xs[i1], top: ys[j1], width: xs[i2 + 1] - xs[i1], height: ys[j2 + 1] - ys[j1] };
        const area = rect.width * rect.height;
        if (area > bestArea) { best = rect; bestArea = area; }
        i1 = i2 + 1;
      }
    }
  }
  return best;
}

/** Whether a free area is big enough to hold the notice; otherwise the notice centers on the canvas. */
export function isRoomyFreeRect(rect: HintRect, canvas: { width: number; height: number }): boolean {
  const side = Math.min(canvas.width, canvas.height);
  return Math.min(rect.width, rect.height) >= side * ROOMY_MIN_SIDE_RATIO && rect.width * rect.height >= canvas.width * canvas.height * ROOMY_MIN_AREA_RATIO;
}

// Share of the canvas a free area needs, per side and by area, to hold the notice.
const ROOMY_MIN_SIDE_RATIO = 0.2;
const ROOMY_MIN_AREA_RATIO = 0.05;

// Content box inside a half of a single-widget canvas, as shares of the canvas or circle.
const RECT_SAFE_W = 0.84;
const RECT_SAFE_H = 0.8;
const ROUND_SAFE_W_FULL = 0.68;
const ROUND_SAFE_W_HALF = 0.66;
const ROUND_SAFE_H_FULL = 0.5;
const ROUND_SAFE_H_HALF = 0.21;
// Label font size as a share of the safe height; a narrow glyph is this wide in em, and a wide (CJK) glyph is a full em.
const FONT_TO_SAFE_H = 0.22;
const NARROW_GLYPH_EM = 0.6;
const ICON_TO_SAFE_H = 0.5;
const ICON_TO_SAFE_W = 0.25;
const MIN_FONT_PX = 8;
const MIN_ICON_PX = 10;

const WIDE_GLYPH = /[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe6f\uff00-\uff60\uffe0-\uffe6]/;

/** The label's width in narrow-glyph units: a CJK or fullwidth glyph counts as a full em, wider than a Latin one. */
export function labelWidthUnits(label: string): number {
  let units = 0;
  for (const ch of label) units += WIDE_GLYPH.test(ch) ? 1 / NARROW_GLYPH_EM : 1;
  return units;
}

export interface NoticeFit { icon: number; font: number; }

/**
 * Icon and label sizes (px) that fit a notice inside its half of a single-widget canvas.
 * A round canvas offers only the box inscribed in the circle (half or whole).
 */
export function fitNoticeContent(opts: {
  width: number;
  height: number;
  round: boolean;
  part: 'start' | 'end' | 'full';
  /** The label's width in narrow-glyph units (labelWidthUnits). */
  labelChars: number;
  /** The whole canvas's shorter side; on round glass this is the circle's diameter. */
  diameter?: number;
}): NoticeFit {
  const { width, height, round, part, labelChars } = opts;
  const diameter = opts.diameter ?? Math.min(width, height);
  const safeW = round ? (part === 'full' ? diameter * ROUND_SAFE_W_FULL : diameter * ROUND_SAFE_W_HALF) : width * RECT_SAFE_W;
  const safeH = round ? (part === 'full' ? diameter * ROUND_SAFE_H_FULL : diameter * ROUND_SAFE_H_HALF) : height * RECT_SAFE_H;
  const font = Math.max(MIN_FONT_PX, Math.min(safeH * FONT_TO_SAFE_H, safeW / (Math.max(1, labelChars) * NARROW_GLYPH_EM)));
  const icon = Math.max(MIN_ICON_PX, Math.min(safeH * ICON_TO_SAFE_H, safeW * ICON_TO_SAFE_W));
  return { icon, font };
}
