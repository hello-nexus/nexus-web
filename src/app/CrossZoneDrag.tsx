// CrossZoneDragProvider + the useCrossZoneDrag hook share one context object
// defined in this file.

import {
  createContext, useCallback, useContext, useMemo, useRef, useState,
  type MutableRefObject, type ReactNode,
} from 'react';

/**
 * Cross-zone drag signal — published by the embedded panel when a pinnable
 * widget starts being dragged, consumed by the sidebar so it can mount a
 * pointer-tracked drop target and accept a drop independently of dnd-kit.
 *
 * A side-channel rather than stretching the panel's DndContext across the
 * layout: that DndContext is wired into the grid's sort / paginate /
 * long-press / edge-advance machinery, and hoisting it would thread those
 * signals through the sidebar too. The panel publishes the in-flight widget
 * type; the sidebar listens to `pointermove` / `pointerup` for hover + drop.
 * The panel's onDragEnd stays the single arbiter for the in-grid sort.
 */
export interface CrossZoneDragValue {
  /**
   * Widget type currently being dragged when it's a pinnable app key, or
   * null. Pinnable-only so the sidebar can stay inert for non-eligible
   * drags (clock, media, calculator etc.).
   */
  draggingPinnableType: string | null;
  setDraggingPinnableType: (type: string | null) => void;
  /**
   * Ref to a drop-commit callback registered by the sidebar's drop target.
   * Invoked by the panel's onDragEnd BEFORE it clears drag state: under
   * React 19 that clear unmounts the sidebar (detaching its pointerup
   * listener) in a synchronous flush before the native pointerup lands.
   * The handler reads the latest pointermove insertion index and pins it.
   */
  dropHandlerRef: MutableRefObject<(() => void) | null>;
}

const CrossZoneDragContext = createContext<CrossZoneDragValue | null>(null);

export function CrossZoneDragProvider({ children }: { children: ReactNode }) {
  const [draggingPinnableType, setDraggingPinnableType] = useState<string | null>(null);
  const dropHandlerRef = useRef<(() => void) | null>(null);
  const setter = useCallback((type: string | null) => {
    setDraggingPinnableType(type);
  }, []);
  const value = useMemo<CrossZoneDragValue>(
    () => ({ draggingPinnableType, setDraggingPinnableType: setter, dropHandlerRef }),
    [draggingPinnableType, setter],
  );
  return (
    <CrossZoneDragContext.Provider value={value}>
      {children}
    </CrossZoneDragContext.Provider>
  );
}

/**
 * Safe accessor: returns a no-op shim when called outside the provider so
 * the panel kiosk / overlay surfaces (which don't render the dashboard
 * layout) can call it unconditionally without crashing.
 */
export function useCrossZoneDrag(): CrossZoneDragValue {
  const ctx = useContext(CrossZoneDragContext);
  if (ctx) return ctx;
  // Stable shim ref so callers can safely mutate .current — the kiosk has
  // no sidebar to pin to, so any writes here are no-ops by design.
  return SHIM_VALUE;
}

const SHIM_VALUE: CrossZoneDragValue = {
  draggingPinnableType: null,
  setDraggingPinnableType: () => { /* no provider — drag-to-pin disabled */ },
  dropHandlerRef: { current: null },
};
