// Frozen ink for the add-widget catalog tile. Hand-drawn coordinates so the
// preview reads as a real sketch (a wave, a check, a circled note) instead of
// the empty board a fresh instance would show.

import type { Stroke } from './whiteboardTypes';

function arc(cx: number, cy: number, r: number, from: number, to: number, steps: number) {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = from + ((to - from) * i) / steps;
    return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
  });
}

export const WHITEBOARD_PREVIEW_STROKES: Stroke[] = [
  {
    tool: 'pen',
    color: '#7dd3fc',
    width: 5,
    points: Array.from({ length: 33 }, (_, i) => ({
      x: -70 + i * 4.4,
      y: -22 + Math.sin(i / 3.1) * 16,
    })),
  },
  {
    tool: 'pen',
    color: '#f472b6',
    width: 6,
    points: [
      { x: -44, y: 26 },
      { x: -28, y: 44 },
      { x: 6, y: 2 },
    ],
  },
  {
    tool: 'pen',
    color: '#fbbf24',
    width: 4,
    points: arc(38, 26, 26, 0, Math.PI * 1.85, 26),
  },
];
