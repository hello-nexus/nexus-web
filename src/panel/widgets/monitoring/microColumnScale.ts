// Vertical Bars shows every value at one size: the smallest scale any column
// needs to fit its own width (1 = natural size, never enlarged).
export function columnFitScale(box: number, natural: number): number {
  if (!(box > 0) || !(natural > 0)) return 1;
  return Math.min(1, box / natural);
}

export function uniformColumnScale(needed: Iterable<number>): number {
  let scale = 1;
  for (const n of needed) if (n < scale) scale = n;
  return scale;
}
