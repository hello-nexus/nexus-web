export interface LogoClearance {
  /** Room to add above the specs. */
  top: number;
  /** The first row cannot get below the logo, so it ends short of the logo's width instead. */
  narrowFirst: boolean;
}

/**
 * How the specs column keeps clear of the corner logo. `logoBottom` is the logo's lower edge (clearance included) measured
 * from the top of the frame that centers the specs, and `columnHeight` is that frame's height. Centered, the first row starts
 * at half the free height; adding `p` on top moves it to half of (free + p), so staying below the logo takes `2 * logoBottom - free`.
 * The reserve never exceeds the free height, so the last row never clips. When even that cannot lift the first row past
 * the logo (the free height is under the logo's own), the first row is narrowed beside the logo instead.
 */
export function specsClearance(logoBottom: number, columnHeight: number, specsHeight: number): LogoClearance {
  const free = Math.max(0, columnHeight - specsHeight);
  return { top: Math.min(free, Math.max(0, 2 * logoBottom - free)), narrowFirst: logoBottom > free };
}
