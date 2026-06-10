import type { CSSProperties } from 'react';

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
 * Each bar is a dim slot rect plus a full-opacity highlight rect that
 * scales from the bar's bottom edge: with `animate`, level increases
 * grow the highlight upward and decreases drain it top-down.
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
  /** Transition level changes (bottom-up fill / top-down drain). Leave off
   *  for static renders and so an initial hydration snaps into place. */
  animate?: boolean;
}

// Heights 6 / 13 / 20 give a clean stepped progression; widths 4 with
// 2-unit gaps fits the square viewBox comfortably. Bottom-aligned at y=22.
const BARS = [
  { x: 2, y: 16, height: 6 },
  { x: 10, y: 9, height: 13 },
  { x: 18, y: 2, height: 20 },
];

function highlightStyle(lit: boolean, animate: boolean): CSSProperties {
  return {
    transform: lit ? 'scaleY(1)' : 'scaleY(0)',
    // fill-box anchors the scale to each rect's own bottom edge.
    transformBox: 'fill-box',
    transformOrigin: 'center bottom',
    transition: animate ? 'transform var(--ease-slow) ease' : 'none',
  };
}

export function SignalBarsIcon({ level, size, className, animate = false }: SignalBarsIconProps) {
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
      {BARS.map((bar, i) => (
        <g key={i}>
          <rect {...bar} width="4" rx="1" fill="currentColor" fillOpacity={dim} />
          <rect
            {...bar}
            width="4"
            rx="1"
            fill="currentColor"
            data-bar-highlight={i + 1}
            style={highlightStyle(level >= i + 1, animate)}
          />
        </g>
      ))}
    </svg>
  );
}

export default SignalBarsIcon;
