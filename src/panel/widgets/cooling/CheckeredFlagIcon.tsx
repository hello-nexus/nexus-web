/**
 * Checkered race flag - the Max cooling mode's icon.
 *
 * lucide-react 1.8 ships no checkered flag (`flag`, `flag-triangle-*` and
 * `flag-off` only), so this redraws lucide's own Flag outline at the same
 * 24x24 viewBox and 2px stroke and clips a checker fill into the flag
 * field, keeping it flush with the lucide icons beside it in the cooling
 * mode row.
 *
 * Deliberately not a fourth SignalBarsIcon bar: that 1/2/3 scale reads as a
 * temperature-driven curve getting steeper, and Max is not steeper - it is
 * flat 100% at every temperature, so it gets its own mark.
 */
interface CheckeredFlagIconProps {
  /** Explicit pixel size. Omit to let the caller's className size the SVG. */
  size?: number | string;
  className?: string;
}

// lucide's Flag path minus the pole, closed back down the staff so the
// checker fill has a region to clip against.
const FIELD =
  'M4 4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.333 2q2 0 3.067-.8A1 1 0 0 1 20 4v10a1 1 0 0 1-.4.8A6 6 0 0 1 16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.528z';
// lucide's Flag path verbatim - pole plus field - stroked over the fill.
const OUTLINE =
  'M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.333 2q2 0 3.067-.8A1 1 0 0 1 20 4v10a1 1 0 0 1-.4.8A6 6 0 0 1 16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.528';

// 3x2 checkerboard over the field's bounding box (x 4-20, y 2-16). Three
// columns is the coarsest grid that still reads as a checker, which is what
// matters at the 14px the cooling tabs and curve chips render at.
const COLS = 3, ROWS = 2;
const CELL_W = 16 / COLS, CELL_H = 14 / ROWS;
const CELLS = Array.from({ length: COLS * ROWS }, (_, i) => ({ col: i % COLS, row: Math.floor(i / COLS) }))
  .filter(({ col, row }) => (col + row) % 2 === 0)
  .map(({ col, row }) => ({ x: 4 + col * CELL_W, y: 2 + row * CELL_H }));

// Static id, matching the DesignIcons convention. Several instances render on
// one page (tab row, mode tiles, curve chips, panel widget); they all define
// an identical clip, so first-match resolution picks an equivalent one.
const CLIP_ID = 'nx-checkered-flag-clip';

export function CheckeredFlagIcon({ size, className }: CheckeredFlagIconProps) {
  const explicit = size !== undefined ? { width: size, height: size } : {};
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      {...explicit}
      className={className}
      fill="none"
      aria-hidden="true"
    >
      <clipPath id={CLIP_ID}><path d={FIELD} /></clipPath>
      <g clipPath={`url(#${CLIP_ID})`}>
        {CELLS.map(cell => (
          <rect
            key={`${cell.x}-${cell.y}`}
            x={cell.x}
            y={cell.y}
            width={CELL_W}
            height={CELL_H}
            fill="currentColor"
            fillOpacity={0.85}
          />
        ))}
      </g>
      <path
        d={OUTLINE}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default CheckeredFlagIcon;
