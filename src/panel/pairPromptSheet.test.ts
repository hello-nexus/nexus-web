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

  it('shows the prompt over a sheet that is already open instead of replacing it', () => {
    const { result, rerender, openPairSheet, closeSheet } = setup({ pending: false, sheetMode: 'settings' });
    expect(result.current).toBe('sheet');
    rerender({ pending: true, sheetMode: 'settings' });
    expect(result.current).toBe('overlay');
    expect(openPairSheet).not.toHaveBeenCalled();
    rerender({ pending: false, sheetMode: 'settings' });
    expect(result.current).toBe('sheet');
    expect(closeSheet).not.toHaveBeenCalled();
  });

  it('keeps the prompt inline in the pairing sheet', () => {
    const { result, rerender } = setup({ pending: false, sheetMode: 'pairRemote' });
    rerender({ pending: true, sheetMode: 'pairRemote' });
    expect(result.current).toBe('sheet');
  });
});
