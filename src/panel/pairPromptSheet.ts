import { useEffect, useRef, useState } from 'react';
import type { SheetMode } from './editor/PanelEditorSheet';

export interface PairPromptSheetArgs {
  /** A pairing approval is waiting for a decision. */
  pending: boolean;
  sheetMode: SheetMode | null;
  openPairSheet: () => void;
  closeSheet: () => void;
}

/** Where the prompt shows: in the pairing slideout, or over another open sheet. */
export type PairPromptPlacement = 'sheet' | 'overlay';

/**
 * Opens the pairing slideout when a request arrives and closes it again when
 * the request goes away, but only when this hook opened it. A request that
 * lands while another sheet is open (a widget being edited) never replaces it:
 * the prompt is answered as an overlay above it, so the edit state survives.
 * A pairing sheet the user already had open keeps the prompt inline.
 */
export function usePairPromptSheet({ pending, sheetMode, openPairSheet, closeSheet }: PairPromptSheetArgs): PairPromptPlacement {
  const autoOpened = useRef(false);
  const wasPending = useRef(false);
  const [placement, setPlacement] = useState<PairPromptPlacement>('sheet');

  useEffect(() => {
    if (pending && !wasPending.current) {
      wasPending.current = true;
      const otherSheetOpen = sheetMode !== null && sheetMode !== 'pairRemote';
      autoOpened.current = sheetMode === null;
      setPlacement(otherSheetOpen ? 'overlay' : 'sheet');
      if (autoOpened.current) openPairSheet();
    } else if (!pending && wasPending.current) {
      wasPending.current = false;
      if (autoOpened.current && sheetMode === 'pairRemote') closeSheet();
      autoOpened.current = false;
      setPlacement('sheet');
    }
  }, [pending, sheetMode, openPairSheet, closeSheet]);

  return placement;
}
