// Geometry for labelled marks under a slider track. Pure, so it is testable without layout.

/** Where a value's mark points, in px along a track `trackW` wide whose knob is `knobPx` wide: the knob's own travel. */
export function markAnchor(pct: number, trackW: number, knobPx: number): number {
  const p = Math.min(1, Math.max(0, pct));
  return knobPx / 2 + Math.max(0, trackW - knobPx) * p;
}

/** Left edges for label boxes centered on their anchors, kept inside [0, trackW] and apart from each other by `gap`. When the boxes cannot all fit they overlap from the right edge. */
export function layoutMarks(boxes: ReadonlyArray<{ anchor: number; w: number }>, trackW: number, gap = 8): number[] {
  const order = boxes.map((_, i) => i).sort((a, b) => boxes[a].anchor - boxes[b].anchor);
  const left = new Array<number>(boxes.length).fill(0);
  let cursor = 0;
  for (const i of order) {
    const { anchor, w } = boxes[i];
    left[i] = Math.max(cursor, Math.min(Math.max(0, trackW - w), Math.max(0, anchor - w / 2)));
    cursor = left[i] + w + gap;
  }
  let limit = trackW;
  for (const i of [...order].reverse()) {
    const { w } = boxes[i];
    if (left[i] + w > limit) left[i] = Math.max(0, limit - w);
    limit = left[i] - gap;
  }
  return left;
}
