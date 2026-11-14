// One SVG per clock design, on the same grid and stroke as monitoring/gauges/DesignIcons.tsx.

import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;

const base = {
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  xmlns: 'http://www.w3.org/2000/svg',
} as const;
const stroke = { stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

// Seven-segment digit "8" with its left edge at x.
const sevenSegment = (x: number) =>
  `M${x + 1} 4H${x + 5}M${x + 1} 12H${x + 5}M${x + 1} 20H${x + 5}`
  + `M${x} 5.5V10.5M${x + 6} 5.5V10.5M${x} 13.5V18.5M${x + 6} 13.5V18.5`;

export function LedDesignIcon(p: P) {
  return (
    <svg {...base} {...p}>
      <path d={`${sevenSegment(2)}${sevenSegment(16)}`} {...stroke} strokeWidth={1.6} />
      <circle cx="12" cy="9" r="1.2" fill="currentColor" />
      <circle cx="12" cy="15" r="1.2" fill="currentColor" />
    </svg>
  );
}

// 3x5 dot-matrix digit "2": lit dots solid, unlit dots dim.
const DOT_ROWS = [[1, 1, 1], [0, 0, 1], [1, 1, 1], [1, 0, 0], [1, 1, 1]];

export function DotsDesignIcon(p: P) {
  return (
    <svg {...base} {...p}>
      {DOT_ROWS.flatMap((row, r) => row.map((on, c) => (
        <circle key={`${r}-${c}`} cx={6 + c * 6} cy={3.5 + r * 4.25} r="1.5" fill="currentColor" opacity={on ? 1 : 0.2} />
      )))}
    </svg>
  );
}

export function DigitalDesignIcon(p: P) {
  return (
    <svg {...base} {...p}>
      <path d="M4 8L6.5 6V18" {...stroke} />
      <circle cx="12" cy="10" r="1.2" fill="currentColor" />
      <circle cx="12" cy="15" r="1.2" fill="currentColor" />
      <ellipse cx="18" cy="12" rx="2.5" ry="6" {...stroke} />
    </svg>
  );
}

export function SplitFlapDesignIcon(p: P) {
  return (
    <svg {...base} {...p}>
      <rect x="5" y="3" width="14" height="18" rx="2" {...stroke} />
      <path d="M5 12H19" {...stroke} />
      <path d="M9.5 8.5H14.5" {...stroke} opacity="0.5" />
      <path d="M9.5 16H14.5" {...stroke} />
    </svg>
  );
}

// A digit window with the neighboring digits sliding past.
export function RollingDesignIcon(p: P) {
  return (
    <svg {...base} {...p}>
      <rect x="5" y="3" width="14" height="18" rx="2" {...stroke} />
      <ellipse cx="12" cy="12" rx="2.5" ry="3.5" {...stroke} />
      <path d="M9.5 6.5H14.5M9.5 17.5H14.5" {...stroke} opacity="0.4" />
    </svg>
  );
}
