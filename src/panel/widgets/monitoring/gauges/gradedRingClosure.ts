/**
 * Where a graded closed ring's reveal stands against its own start. The mask is
 * the ungraded stroke, so its start cap reaches half a stroke behind the start
 * and its end cap half a stroke past the reveal.
 * - `closing`: the two caps touch or overlap, so the start region shows fill
 *   and the hot end color may sit beside the first color there.
 * - `complete`: nothing is left to cap; the mask is the whole closed path.
 */
export function gradedRingClosure(reveal: number, length: number, strokeWidth: number) {
  return { complete: reveal >= length, closing: reveal >= length - strokeWidth };
}
