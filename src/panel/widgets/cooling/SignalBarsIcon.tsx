/**
 * Cellphone-style signal-bars icon used to communicate a cooling speed
 * profile at a glance:
 *
 *   1 bar lit  → silent
 *   2 bars lit → balanced
 *   3 bars lit → turbo
 *
 * Inactive bars stay drawn at reduced opacity so the unfilled "slots"
 * are visible and the icon reads as a level indicator rather than just
 * a varying-width chart. ViewBox is square (24×24) — the bars are
 * bottom-aligned so they read like a cellphone reception indicator
 * regardless of size. Inherits the current text color so the icon
 * tints with the surrounding card.
 *
 * Standalone — the previous fan-plus-bars composite was split here per
 * design feedback. The cooling app uses lucide-react's <Fan /> wherever
 * a fan icon is needed (e.g. the app manifest icon, the page header).
 */
interface SignalBarsIconProps {
  level: 1 | 2 | 3;
  /** Optional explicit pixel width. When omitted, the SVG sizes itself via CSS
   *  (the caller's className controls width/height) — preferred for fluid
   *  responsive layouts. */
  size?: number;
  className?: string;
}

export function SignalBarsIcon({ level, size, className }: SignalBarsIconProps) {
  const dim = 0.22;
  const explicit = size !== undefined
    ? { width: size, height: size }
    : {};
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      {...explicit}
      className={className}
      fill="none"
      aria-hidden="true"
    >
      {/* Three bars, bottom-aligned at y=22. Heights 6 / 13 / 20 give a
          clean stepped progression; widths 4 with 2-unit gaps fits a
          square viewBox comfortably. */}
      <rect x="2"  y="16" width="4" height="6"  rx="1" fill="currentColor" fillOpacity={level >= 1 ? 1 : dim} />
      <rect x="10" y="9"  width="4" height="13" rx="1" fill="currentColor" fillOpacity={level >= 2 ? 1 : dim} />
      <rect x="18" y="2"  width="4" height="20" rx="1" fill="currentColor" fillOpacity={level >= 3 ? 1 : dim} />
    </svg>
  );
}

export default SignalBarsIcon;
