// Synthwave perspective grid: one SVG drawn at a fixed height along the bottom of a card face, so the floor reads the same on every card size and costs one background layer.

const W = 1600;
const H = 40;
const ROWS = 8;
const COLUMNS = 40;
const COLUMN_STEP = 38;

interface GridInk {
  rows: string;
  columns: string;
  peak: number;
}

const INK: Record<'dark' | 'light', GridInk> = {
  dark: { rows: '#2fe6ff', columns: '#ff3fd0', peak: 0.48 },
  light: { rows: '#1a98c0', columns: '#c8329c', peak: 0.38 },
};

// The viewBox is far wider than any card, so a wide card shows more grid to the sides and a narrow one crops them. The horizon is the y=0 edge (the card middle) and the stroke alpha rises with distance from it, so the grid fades out toward the middle.
export function synthwaveGridSvg(mode: 'dark' | 'light'): string {
  const ink = INK[mode];
  const rows: string[] = [];
  for (let k = 1; k <= ROWS; k++) {
    const y = +(H * (k / ROWS) ** 2).toFixed(2);
    rows.push(`M0 ${y}H${W}`);
  }
  const columns: string[] = [];
  for (let j = -COLUMNS; j <= COLUMNS; j++) columns.push(`M${W / 2} 0L${W / 2 + j * COLUMN_STEP} ${H}`);
  const fade = (id: string, color: string) =>
    `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${H}"><stop offset="0.3" stop-color="${color}" stop-opacity="0"/><stop offset="1" stop-color="${color}" stop-opacity="${ink.peak}"/></linearGradient>`;
  const stroke = (d: string, id: string) => `<path d="${d}" stroke="url(#${id})" fill="none" stroke-width="1.4" vector-effect="non-scaling-stroke"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><defs>${fade('r', ink.rows)}${fade('c', ink.columns)}</defs><g>${stroke(columns.join(''), 'c')}${stroke(rows.join(''), 'r')}</g></svg>`;
}

export function synthwaveGridUrl(mode: 'dark' | 'light'): string {
  return `url("data:image/svg+xml,${encodeURIComponent(synthwaveGridSvg(mode))}")`;
}

export function synthwaveGridVars(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const mode of ['dark', 'light'] as const) {
    out[`--sw-floor-${mode}`] = synthwaveGridUrl(mode);
  }
  return out;
}
