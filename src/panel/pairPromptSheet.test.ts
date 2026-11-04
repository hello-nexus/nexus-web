import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { usePairPromptSheet } from './pairPromptSheet';
import type { SheetMode } from './editor/PanelEditorSheet';

function setup(initial: { pending: boolean; sheetMode: SheetMode | null }) {
  const openPairSheet = vi.fn();
  const closeSheet = vi.fn();
  const hook = renderHook(
    (props: { pending: boolean; sheetMode: SheetMode | null }) =>
      usePairPromptSheet({ ...props, openPairSheet, closeSheet }),
    { initialProps: initial },
  );
  return { ...hook, openPairSheet, closeSheet };
}

describe('usePairPromptSheet', () => {
  it('opens the pairing sheet when a request arrives and closes it when it goes away', () => {
    const { rerender, openPairSheet, closeSheet } = setup({ pending: false, sheetMode: null });
    rerender({ pending: true, sheetMode: null });
    expect(openPairSheet).toHaveBeenCalledTimes(1);
    rerender({ pending: true, sheetMode: 'pairRemote' });
    rerender({ pending: false, sheetMode: 'pairRemote' });
    expect(closeSheet).toHaveBeenCalledTimes(1);
  });

  it('leaves a sheet the user already opened in place', () => {
    const { rerender, openPairSheet, closeSheet } = setup({ pending: false, sheetMode: 'pairRemote' });
    rerender({ pending: true, sheetMode: 'pairRemote' });
    rerender({ pending: false, sheetMode: 'pairRemote' });
    expect(openPairSheet).not.toHaveBeenCalled();
    expect(closeSheet).not.toHaveBeenCalled();
  });

  it('does not close a different sheet the user moved to meanwhile', () => {
    const { rerender, closeSheet } = setup({ pending: false, sheetMode: null });
    rerender({ pending: true, sheetMode: null });
    rerender({ pending: true, sheetMode: 'catalog' });
    rerender({ pending: false, sheetMode: 'catalog' });
    expect(closeSheet).not.toHaveBeenCalled();
  });
});
