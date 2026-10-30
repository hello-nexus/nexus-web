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
  return Math.min(rect.width, rect.height) >= side * 0.2 && rect.width * rect.height >= canvas.width * canvas.height * 0.05;
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
  labelChars: number;
  /** The whole canvas's shorter side; on round glass this is the circle's diameter. */
  diameter?: number;
}): NoticeFit {
  const { width, height, round, part, labelChars } = opts;
  const diameter = opts.diameter ?? Math.min(width, height);
  const safeW = round ? (part === 'full' ? diameter * 0.68 : diameter * 0.66) : width * 0.84;
  const safeH = round ? (part === 'full' ? diameter * 0.5 : diameter * 0.21) : height * 0.8;
  const font = Math.max(8, Math.min(safeH * 0.22, safeW / (Math.max(1, labelChars) * 0.6)));
  const icon = Math.max(10, Math.min(safeH * 0.5, safeW * 0.25));
  return { icon, font };
}
