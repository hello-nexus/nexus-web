// CrossZoneDragProvider + the useCrossZoneDrag hook share one context object
// defined in this file; splitting the consumer hook into a sibling module
// would just be ceremony.
 
import {
  createContext, useCallback, useContext, useMemo, useRef, useState,
  type MutableRefObject, type ReactNode,
} from 'react';

/**
 * Cross-zone drag signal — published by the embedded panel when a pinnable
 * widget starts being dragged, consumed by the sidebar so it can mount a
 * pointer-tracked drop target and accept a drop independently of dnd-kit.
 *
 * Why a context instead of stretching the panel's DndContext to the sidebar:
 * the panel grid's DndContext is wired into its own sort / paginate /
 * long-press / edge-advance machinery. Hoisting it across the layout would
 * mean threading those signals through the sidebar column too. The drop
 * the user wants here ("dragged the widget over the sidebar, let go") is
 * better modelled as a side-channel — the panel publishes "drag is in
 * flight, here's the widget type", the sidebar listens directly to
 * `pointermove` / `pointerup` to interpret hover + drop. The panel's
 * regular onDragEnd remains the single arbiter for the in-grid sort.
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
   * Invoked by the panel's onDragEnd BEFORE clearing the drag state — this
   * sidesteps a React 19 timing bug where the sidebar would unmount (and
   * its document pointerup listener detach) inside dnd-kit's onDragEnd
   * synchronous flush, before the native pointerup reached other document
   * listeners. The handler reads the latest insertion index (continuously
   * updated by pointermove during the drag) and pins if non-null.
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
