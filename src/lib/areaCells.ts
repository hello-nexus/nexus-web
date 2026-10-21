export interface AreaCell {
  index: number;
  /** "x,y x,y ..." for an SVG polygon in the unit square. */
  points: string;
}

/** The drawable cells of a card: empty and degenerate entries (disabled LEDs) are skipped, index stays card-local. */
export function areaCellPolygons(cells: readonly (readonly number[])[] | null | undefined): AreaCell[] {
  const out: AreaCell[] = [];
  cells?.forEach((c, index) => {
    if (c.length < 6) return;
    const pts: string[] = [];
    for (let i = 0; i + 1 < c.length; i += 2) pts.push(`${c[i]},${c[i + 1]}`);
    out.push({ index, points: pts.join(' ') });
  });
  return out;
}
