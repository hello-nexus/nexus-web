// Gesture arbitration for the touch board, kept pure so the thresholds are
// unit-testable without synthesizing PointerEvents.

// Sideways travel that moves the piece one column.
export const MOVE_CELL_FRACTION = 1;
// The hard drop is deliberately the bluntest action: it needs a longer pull
// than a move, and a gesture that has already moved sideways can never reach
// it, so a left/right swipe that drifts down never drops the piece.
export const DROP_CELL_FRACTION = 2.5;
// Travel beyond this stops the gesture counting as a tap. Without it a
// downward pull short of the drop threshold would fall through to
// tap-to-rotate and spin the piece the player was trying to place.
export const TAP_SLOP_CELL_FRACTION = 0.5;

export type BlocksGesture = {
  startX: number;
  startY: number;
  lastX: number;
  // Latches once the piece has moved sideways; a horizontal gesture can never
  // hard drop, however far down it wanders afterwards.
  horizontal: boolean;
  // Latches once the pointer travels past the tap slop, in any direction.
  dragged: boolean;
};

export type BlocksGestureResult = {
  gesture: BlocksGesture;
  move: -1 | 0 | 1;
  drop: boolean;
};

export function beginGesture(x: number, y: number): BlocksGesture {
  return { startX: x, startY: y, lastX: x, horizontal: false, dragged: false };
}

export function updateGesture(
  gesture: BlocksGesture,
  x: number,
  y: number,
  cellSize: number,
): BlocksGestureResult {
  if (cellSize <= 0) return { gesture, move: 0, drop: false };

  const stepDx = x - gesture.lastX;
  const totalDx = x - gesture.startX;
  const dy = y - gesture.startY;

  let next = gesture;
  if (Math.abs(totalDx) > cellSize * TAP_SLOP_CELL_FRACTION || Math.abs(dy) > cellSize * TAP_SLOP_CELL_FRACTION) {
    next = { ...next, dragged: true };
  }

  let move: -1 | 0 | 1 = 0;
  if (Math.abs(stepDx) > cellSize * MOVE_CELL_FRACTION) {
    move = stepDx > 0 ? 1 : -1;
    next = { ...next, lastX: x, horizontal: true };
  }

  const drop = !next.horizontal && dy > cellSize * DROP_CELL_FRACTION;
  return { gesture: next, move, drop };
}
