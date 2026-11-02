import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { getPanelFpsCap, pageFrameCap, setPanelFpsCap } from '../../lib/framePacer';
import { usePanelFpsCap } from './usePanelFpsCap';

describe('usePanelFpsCap', () => {
  afterEach(() => setPanelFpsCap(null));

  it('hands the record cap to the page pacer, follows changes and clears on unmount', () => {
    const { rerender, unmount } = renderHook(({ cap }) => usePanelFpsCap(cap), { initialProps: { cap: 15 as number | null | undefined } });
    expect(getPanelFpsCap()).toBe(15);
    expect(pageFrameCap('')).toBe(15);

    rerender({ cap: 5 });
    expect(getPanelFpsCap()).toBe(5);

    rerender({ cap: null });
    expect(getPanelFpsCap()).toBeNull();

    rerender({ cap: 10 });
    unmount();
    expect(getPanelFpsCap()).toBeNull();
  });
});
