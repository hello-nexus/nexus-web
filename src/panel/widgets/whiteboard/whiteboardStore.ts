// Device-local persistence for a whiteboard instance.
//
// Boards live in localStorage, not in the panel layout: a drawing is unbounded
// user content, and the layout is persisted into the service settings store,
// where one oversized or unparseable field discards the whole file. Keeping the
// ink device-local also matches the surface it is drawn on - the board belongs
// to the panel you drew it on, the same way game best-scores do.

import { createEmptyBoard, type Board, type Stroke, type WhiteboardBackground } from './whiteboardTypes';

const STORAGE_PREFIX = 'nexus_panel_whiteboard_';

/**
 * Ceiling on one board's serialized length in UTF-16 code units (what
 * `String.length` and the localStorage quota both count). Well under the ~5 MB
 * origin budget, which the panel shares with every other consumer. Oldest
 * strokes are dropped when a save would exceed it.
 */
export const MAX_BOARD_CHARS = 512 * 1024;

/** Second, cheaper guard so a save never has to serialize an unbounded array to discover it is too big. */
export const MAX_STROKES = 4000;

function storageKey(widgetId: string): string {
  return STORAGE_PREFIX + widgetId;
}

type Listener = () => void;

// Same-document notification. The `storage` event only fires in OTHER
// documents, so the tile sitting behind the fullscreen view would never hear a
// change without this.
const listeners = new Map<string, Set<Listener>>();

export function subscribeBoard(widgetId: string, listener: Listener): () => void {
  let set = listeners.get(widgetId);
  if (!set) {
    set = new Set();
    listeners.set(widgetId, set);
  }
  set.add(listener);

  const onStorage = (e: StorageEvent) => {
    if (e.key === storageKey(widgetId)) listener();
  };
  window.addEventListener('storage', onStorage);

  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(widgetId);
    window.removeEventListener('storage', onStorage);
  };
}

function notify(widgetId: string): void {
  const set = listeners.get(widgetId);
  if (!set) return;
  for (const listener of set) listener();
}

function isPoint(v: unknown): v is { x: number; y: number } {
  if (typeof v !== 'object' || v === null) return false;
  const p = v as { x?: unknown; y?: unknown };
  return Number.isFinite(p.x) && Number.isFinite(p.y);
}

function parseStroke(raw: unknown): Stroke | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const s = raw as Partial<Stroke>;
  if (!Array.isArray(s.points) || s.points.length === 0) return null;
  if (!s.points.every(isPoint)) return null;
  if (typeof s.color !== 'string') return null;
  if (!Number.isFinite(s.width) || (s.width as number) <= 0) return null;
  const tool = s.tool === 'eraser' ? 'eraser' : 'pen';
  return { tool, color: s.color, width: s.width as number, points: s.points as Stroke['points'] };
}

function parseBackground(raw: unknown): WhiteboardBackground {
  return raw === 'light' || raw === 'transparent' || raw === 'dark' ? raw : 'dark';
}

/**
 * Reads a board, falling back to a fresh one for anything unreadable. A board
 * is never load-bearing enough to justify surfacing a parse error - a corrupt
 * entry degrades to an empty canvas, and every field is validated
 * independently so one bad value does not discard the rest of the drawing.
 */
export function loadBoard(widgetId: string): Board {
  const board = createEmptyBoard();
  let raw: string | null;
  try {
    raw = localStorage.getItem(storageKey(widgetId));
  } catch {
    return board;
  }
  if (!raw) return board;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return board;
  }
  if (typeof parsed !== 'object' || parsed === null) return board;

  const data = parsed as Record<string, unknown>;
  if (Array.isArray(data.strokes)) {
    board.strokes = data.strokes
      .map(parseStroke)
      .filter((s): s is Stroke => s !== null)
      .slice(-MAX_STROKES);
  }
  board.background = parseBackground(data.background);
  if (typeof data.penColor === 'string') board.penColor = data.penColor;
  if (Number.isFinite(data.penWidth)) board.penWidth = data.penWidth as number;
  if (Number.isFinite(data.eraserWidth)) board.eraserWidth = data.eraserWidth as number;

  const view = data.view as Record<string, unknown> | undefined;
  if (view && Number.isFinite(view.scale) && Number.isFinite(view.panX) && Number.isFinite(view.panY)) {
    board.view = { scale: view.scale as number, panX: view.panX as number, panY: view.panY as number };
  }
  return board;
}

/**
 * Persists a board, dropping oldest strokes until it fits the size cap.
 * Returns the strokes actually written, so a caller holding more than fit can
 * reconcile instead of silently disagreeing with what is on disk.
 */
export function saveBoard(widgetId: string, board: Board): Stroke[] {
  let strokes = board.strokes.length > MAX_STROKES ? board.strokes.slice(-MAX_STROKES) : board.strokes;
  let payload = JSON.stringify({ ...board, strokes });

  // Trim from the oldest end until the payload fits, never below one stroke:
  // emptying the array would discard the whole drawing to save it.
  while (payload.length > MAX_BOARD_CHARS && strokes.length > 1) {
    strokes = strokes.slice(Math.max(1, Math.floor(strokes.length / 2)));
    payload = JSON.stringify({ ...board, strokes });
  }

  try {
    localStorage.setItem(storageKey(widgetId), payload);
  } catch {
    // Quota or blocked storage: the in-memory board stays authoritative for
    // this session and the drawing is simply not durable.
    return strokes;
  }
  notify(widgetId);
  return strokes;
}

export function clearBoard(widgetId: string): void {
  try {
    localStorage.removeItem(storageKey(widgetId));
  } catch {
    // Nothing to recover from - the caller resets its in-memory board anyway.
  }
  notify(widgetId);
}
