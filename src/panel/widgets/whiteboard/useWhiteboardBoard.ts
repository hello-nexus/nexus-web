import { useCallback, useEffect, useRef, useState } from 'react';
import { clearBoard, loadBoard, saveBoard, subscribeBoard } from './whiteboardStore';
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
    pendingRef.current = null;
    const written = saveBoard(widgetId, pending);
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

  const update = useCallback((patch: (prev: Board) => Board) => {
    setBoard(prev => {
      const next = patch(prev);
      if (next === prev) return prev;
      schedule(next);
      return next;
    });
  }, [schedule]);

  const pushHistory = useCallback((strokes: Stroke[]) => {
    setUndoStack(prev => {
      const next = [...prev, strokes];
      return next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next;
    });
    setRedoStack([]);
  }, []);

  const commitStroke = useCallback((stroke: Stroke) => {
    update(prev => {
      pushHistory(prev.strokes);
      return { ...prev, strokes: [...prev.strokes, stroke] };
    });
  }, [update, pushHistory]);

  const undo = useCallback(() => {
    setUndoStack(prevUndo => {
      if (prevUndo.length === 0) return prevUndo;
      const restore = prevUndo[prevUndo.length - 1];
      setBoard(prev => {
        setRedoStack(prevRedo => [...prevRedo, prev.strokes]);
        const next = { ...prev, strokes: restore };
        schedule(next);
        return next;
      });
      return prevUndo.slice(0, -1);
    });
  }, [schedule]);

  const redo = useCallback(() => {
    setRedoStack(prevRedo => {
      if (prevRedo.length === 0) return prevRedo;
      const restore = prevRedo[prevRedo.length - 1];
      setBoard(prev => {
        setUndoStack(prevUndo => [...prevUndo, prev.strokes]);
        const next = { ...prev, strokes: restore };
        schedule(next);
        return next;
      });
      return prevRedo.slice(0, -1);
    });
  }, [schedule]);

  const clear = useCallback(() => {
    update(prev => {
      if (prev.strokes.length === 0) return prev;
      pushHistory(prev.strokes);
      return { ...prev, strokes: [] };
    });
  }, [update, pushHistory]);

  const setView = useCallback((view: ViewTransform) => {
    update(prev => ({ ...prev, view }));
  }, [update]);

  const setBackground = useCallback((background: WhiteboardBackground) => {
    update(prev => ({ ...prev, background }));
  }, [update]);

  const setPenColor = useCallback((penColor: string) => {
    update(prev => ({ ...prev, penColor }));
  }, [update]);

  const setPenWidth = useCallback((penWidth: number) => {
    update(prev => ({ ...prev, penWidth }));
  }, [update]);

  const setEraserWidth = useCallback((eraserWidth: number) => {
    update(prev => ({ ...prev, eraserWidth }));
  }, [update]);

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

/** Wipes a board's stored ink. Exported for the widget-removal path. */
export function forgetWhiteboard(widgetId: string): void {
  clearBoard(widgetId);
}
