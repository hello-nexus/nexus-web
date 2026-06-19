import { useCallback, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { PANEL_EDGE_ADVANCE_DWELL_MS } from './dragConstants';

// Auto-advance the pager when the dragged widget dwells near the left/right
// edge (~600ms in the edge zone). Re-arming requires leaving and re-entering
// the zone, so parking near an edge doesn't churn pages.
const EDGE_ADVANCE_PX = 64;

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
  const evaluateEdgeAdvance = useCallback((rect: { left: number; right: number } | null) => {
    if (!rect) {
      clearEdgeAdvance();
      return;
    }
    const centerX = (rect.left + rect.right) / 2;
    const viewportWidth = window.innerWidth;
    const inLeft = centerX < EDGE_ADVANCE_PX;
    const inRight = centerX > viewportWidth - EDGE_ADVANCE_PX;
    const desiredSide: 'left' | 'right' | null = inLeft ? 'left' : inRight ? 'right' : null;
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
