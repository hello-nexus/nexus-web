import { useEffect, useRef } from 'react';
import type { SheetMode } from './editor/PanelEditorSheet';

export interface PairPromptSheetArgs {
  /** A pairing approval is waiting for a decision. */
  pending: boolean;
  sheetMode: SheetMode | null;
  openPairSheet: () => void;
  closeSheet: () => void;
}

/**
 * Opens the pairing slideout when a request arrives and closes it again when
 * the request goes away, but only when this hook opened it: a sheet the user
 * already had open is left alone, and simply returns to the QR view because
 * the prompt above it unmounts.
 */
export function usePairPromptSheet({ pending, sheetMode, openPairSheet, closeSheet }: PairPromptSheetArgs): void {
  const autoOpened = useRef(false);
  const wasPending = useRef(false);

  useEffect(() => {
    if (pending && !wasPending.current) {
      wasPending.current = true;
      autoOpened.current = sheetMode !== 'pairRemote';
      if (autoOpened.current) openPairSheet();
    } else if (!pending && wasPending.current) {
      wasPending.current = false;
      if (autoOpened.current && sheetMode === 'pairRemote') closeSheet();
      autoOpened.current = false;
    }
  }, [pending, sheetMode, openPairSheet, closeSheet]);
}
