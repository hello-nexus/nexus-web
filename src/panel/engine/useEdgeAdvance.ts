import { useCallback, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { PANEL_EDGE_ADVANCE_DWELL_MS } from './dragConstants';

// Auto-advance the pager when the drag dwells in the left/right edge
// zone past PANEL_EDGE_ADVANCE_DWELL_MS. Re-arming requires leaving and
// re-entering the zone, so parking near an edge doesn't churn pages.
export const EDGE_ADVANCE_PX = 64;

export function useEdgeAdvance(
  setActivePageIndex: Dispatch<SetStateAction<number>>,
  pageCountRef: MutableRefObject<number>,
) {
  const edgeAdvanceRef = useRef<{
    side: 'left' | 'right' | null;
    timer: number | null;
  }>({ side: null, timer: null });
  const clearEdgeAdvance = useCallback(() => {
    if (edgeAdvanceRef.current.timer !== null) {
      window.clearTimeout(edgeAdvanceRef.current.timer);
      edgeAdvanceRef.current.timer = null;
    }
    edgeAdvanceRef.current.side = null;
  }, []);
  const evaluateEdgeAdvance = useCallback((
    rect: { left: number; right: number } | null,
    pointerX?: number | null,
  ) => {
    if (!rect && pointerX == null) {
      clearEdgeAdvance();
      return;
    }
    // The pointer is the user's aim; the rect center is kept as a second
    // trigger for parity. Pointer position matters on full-width widgets
    // (4x2/4x4 on a 4-col surface): grabbed near the edge the drag heads
    // for, the finger reaches the screen edge while the rect center is
    // still hundreds of px inside - center-only made the page advance
    // unreachable for those grabs.
    const viewportWidth = window.innerWidth;
    const probes: number[] = [];
    if (pointerX != null) probes.push(pointerX);
    if (rect) probes.push((rect.left + rect.right) / 2);
    const inLeft = probes.some(x => x < EDGE_ADVANCE_PX);
    const inRight = probes.some(x => x > viewportWidth - EDGE_ADVANCE_PX);
    const desiredSide: 'left' | 'right' | null =
      inLeft && !inRight ? 'left' : inRight && !inLeft ? 'right' : null;
    if (desiredSide === edgeAdvanceRef.current.side) return;
    clearEdgeAdvance();
    edgeAdvanceRef.current.side = desiredSide;
    if (!desiredSide) return;
    edgeAdvanceRef.current.timer = window.setTimeout(() => {
      edgeAdvanceRef.current.timer = null;
      // Leave `side` latched: the next evaluate in this band short-circuits
      // via desiredSide === side. clearEdgeAdvance() unlatches when the cursor
      // leaves the band or the drag ends - else the pager advances one page
      // per dwell until lift-off. side stays latched on a no-op end-clamp so
      // the user can keep pressing without re-arming.
      setActivePageIndex(prev => {
        const count = pageCountRef.current;
        if (desiredSide === 'left') return Math.max(0, prev - 1);
        return Math.min(count - 1, prev + 1);
      });
    }, PANEL_EDGE_ADVANCE_DWELL_MS);
  }, [clearEdgeAdvance, setActivePageIndex, pageCountRef]);
  return { clearEdgeAdvance, evaluateEdgeAdvance };
}
