import { useLayoutEffect, type MutableRefObject } from 'react';
import type { PanelLayout } from '../types';

/** The layout a mutation should build on: the last one handed to setLayout, which a render has not caught up with yet. */
export function latestOr(ref: MutableRefObject<PanelLayout | null>, rendered: PanelLayout): PanelLayout {
  return ref.current ?? rendered;
}

/** Re-bases the ref on the committed layout before any child effect runs, so an edit queued before a render is not built on a stale copy. */
export function useSyncLatestLayout(ref: MutableRefObject<PanelLayout | null>, rendered: PanelLayout): void {
  useLayoutEffect(() => { ref.current = rendered; });
}

/** True while an edit session names a widget the layout no longer holds (a playlist stand-in is not in the layout by design). */
export function editTargetGone(editingId: string | null, present: boolean, isStandIn: boolean): boolean {
  return editingId !== null && !present && !isStandIn;
}
