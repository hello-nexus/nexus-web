import { useCallback, useEffect, useRef, useState } from 'react';
import { loadBoard, saveBoard, subscribeBoard } from './whiteboardStore';
import {
  createEmptyBoard,
  type Board,
  type Stroke,
  type ViewTransform,
  type WhiteboardBackground,
} from './whiteboardTypes';

// Undo depth. Deep enough to walk back a mistake, shallow enough that the
// history of a busy board is not a second copy of it in memory.
const HISTORY_LIMIT = 50;

/** Coalesces the bursts of updates a drawing session produces into one write per quiet moment. */
const SAVE_DEBOUNCE_MS = 400;

// Ceiling on one stroke's point count. Strokes are simplified on commit, so
// reaching this takes a pathological gesture; the cap exists because a single
// stroke over the store's whole-board size cap is the one case trimming older
// strokes cannot resolve.
const MAX_STROKE_POINTS = 5000;

function capStrokePoints(stroke: Stroke): Stroke {
  if (stroke.points.length <= MAX_STROKE_POINTS) return stroke;
  return { ...stroke, points: stroke.points.slice(0, MAX_STROKE_POINTS) };
}

export interface WhiteboardBoardState {
  board: Board;
  canUndo: boolean;
  canRedo: boolean;
  commitStroke: (stroke: Stroke) => void;
  undo: () => void;
  redo: () => void;
  clear: () => void;
  setView: (view: ViewTransform) => void;
  setBackground: (background: WhiteboardBackground) => void;
  setPenColor: (color: string) => void;
  setPenWidth: (width: number) => void;
  setEraserWidth: (width: number) => void;
}

/**
 * Owns one board's ink, view, and tool settings, persisted device-locally.
 *
 * `readOnly` callers (the grid tile) skip history and writes entirely and just
 * follow the store, so a tile can never write over what the fullscreen view is
 * drawing.
 */
export function useWhiteboardBoard(widgetId: string, readOnly = false): WhiteboardBoardState {
  const [board, setBoard] = useState<Board>(() => (widgetId ? loadBoard(widgetId) : createEmptyBoard()));
  const [undoStack, setUndoStack] = useState<Stroke[][]>([]);
  const [redoStack, setRedoStack] = useState<Stroke[][]>([]);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<Board | null>(null);

  // Reload when the widget id changes (a different board) and follow writes
  // made elsewhere - the tile behind an open fullscreen view, or another tab.
  useEffect(() => {
    if (!widgetId) return;
    setBoard(loadBoard(widgetId));
    setUndoStack([]);
    setRedoStack([]);
    return subscribeBoard(widgetId, () => {
      // Our own debounced write also notifies; ignoring it while one is queued
      // keeps a save from clobbering strokes drawn since it was scheduled.
      if (pendingRef.current) return;
      setBoard(loadBoard(widgetId));
    });
  }, [widgetId]);

  const flush = useCallback(() => {
    const pending = pendingRef.current;
    if (!pending || !widgetId) return;
    const written = saveBoard(widgetId, pending);
    pendingRef.current = null;
    // saveBoard trims to fit its size cap; adopt what actually landed so the
    // in-memory board and storage cannot diverge.
    if (written !== pending.strokes) {
      setBoard(prev => (prev.strokes === pending.strokes ? { ...prev, strokes: written } : prev));
    }
  }, [widgetId]);

  const schedule = useCallback((next: Board) => {
    if (readOnly || !widgetId) return;
    pendingRef.current = next;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(flush, SAVE_DEBOUNCE_MS);
  }, [readOnly, widgetId, flush]);

  // Write on unmount so closing the fullscreen view mid-debounce still lands
  // the last strokes.
  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    flush();
  }, [flush]);

  // Every mutation goes through here. React may re-invoke a setState updater
  // (StrictMode does it on every commit), so updaters stay pure: history and
  // the save schedule are computed from a ref that mirrors the board, never
  // from inside an updater.
  const boardRef = useRef(board);
  boardRef.current = board;

  const apply = useCallback((next: Board, historyFrom?: Stroke[]) => {
    if (historyFrom) {
      setUndoStack(prev => {
        const grown = [...prev, historyFrom];
        return grown.length > HISTORY_LIMIT ? grown.slice(grown.length - HISTORY_LIMIT) : grown;
      });
      setRedoStack([]);
    }
    boardRef.current = next;
    setBoard(next);
    schedule(next);
  }, [schedule]);

  const commitStroke = useCallback((stroke: Stroke) => {
    const prev = boardRef.current;
    apply({ ...prev, strokes: [...prev.strokes, capStrokePoints(stroke)] }, prev.strokes);
  }, [apply]);

  const undo = useCallback(() => {
    const history = undoStack;
    if (history.length === 0) return;
    const restore = history[history.length - 1];
    const prev = boardRef.current;
    setUndoStack(history.slice(0, -1));
    setRedoStack(r => [...r, prev.strokes]);
    boardRef.current = { ...prev, strokes: restore };
    setBoard(boardRef.current);
    schedule(boardRef.current);
  }, [undoStack, schedule]);

  const redo = useCallback(() => {
    const stack = redoStack;
    if (stack.length === 0) return;
    const restore = stack[stack.length - 1];
    const prev = boardRef.current;
    setRedoStack(stack.slice(0, -1));
    setUndoStack(u => [...u, prev.strokes]);
    boardRef.current = { ...prev, strokes: restore };
    setBoard(boardRef.current);
    schedule(boardRef.current);
  }, [redoStack, schedule]);

  const clear = useCallback(() => {
    const prev = boardRef.current;
    if (prev.strokes.length === 0) return;
    apply({ ...prev, strokes: [] }, prev.strokes);
  }, [apply]);

  const patch = useCallback((fields: Partial<Board>) => {
    apply({ ...boardRef.current, ...fields });
  }, [apply]);

  const setView = useCallback((view: ViewTransform) => patch({ view }), [patch]);
  const setBackground = useCallback((background: WhiteboardBackground) => patch({ background }), [patch]);
  const setPenColor = useCallback((penColor: string) => patch({ penColor }), [patch]);
  const setPenWidth = useCallback((penWidth: number) => patch({ penWidth }), [patch]);
  const setEraserWidth = useCallback((eraserWidth: number) => patch({ eraserWidth }), [patch]);

  return {
    board,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    commitStroke,
    undo,
    redo,
    clear,
    setView,
    setBackground,
    setPenColor,
    setPenWidth,
    setEraserWidth,
  };
}
