// Wire + storage shapes for the whiteboard board. Points live in CANVAS space
// (an unbounded plane), never in screen space: the view transform (scale/pan)
// is applied at render time, so zooming or reorienting the panel never
// rewrites stored geometry.

export interface Point {
  x: number;
  y: number;
}

export type WhiteboardTool = 'pen' | 'eraser';

export interface Stroke {
  tool: WhiteboardTool;
  color: string;
  /** Canvas-space width. Scales with the view, so a stroke keeps its size relative to the drawing. */
  width: number;
  points: Point[];
}

/** Pan/zoom of the viewport onto the canvas plane. */
export interface ViewTransform {
  scale: number;
  panX: number;
  panY: number;
}

export type WhiteboardBackground = 'dark' | 'light' | 'transparent';

export interface Board {
  strokes: Stroke[];
  view: ViewTransform;
  background: WhiteboardBackground;
  penColor: string;
  penWidth: number;
  eraserWidth: number;
}

export const MIN_SCALE = 0.1;
export const MAX_SCALE = 10;

export const DEFAULT_VIEW: ViewTransform = { scale: 1, panX: 0, panY: 0 };

export function createEmptyBoard(): Board {
  return {
    strokes: [],
    view: { ...DEFAULT_VIEW },
    background: 'dark',
    penColor: '#ffffff',
    penWidth: 6,
    eraserWidth: 28,
  };
}
