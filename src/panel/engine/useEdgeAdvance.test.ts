import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useEdgeAdvance, EDGE_ADVANCE_PX } from './useEdgeAdvance';
import { PANEL_EDGE_ADVANCE_DWELL_MS } from './dragConstants';

// jsdom window.innerWidth is 1024; bands are [0, 64) and (960, 1024].
const MID = { left: 400, right: 600 };

function setup(pageCount = 3) {
  const setActivePageIndex = vi.fn();
  const pageCountRef = { current: pageCount };
  const { result } = renderHook(() => useEdgeAdvance(setActivePageIndex, pageCountRef));
  const advancedTo = (prev: number): number => {
    const updater = setActivePageIndex.mock.calls.at(-1)?.[0] as (p: number) => number;
    return updater(prev);
  };
  return { setActivePageIndex, result, advancedTo };
}

describe('useEdgeAdvance', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('advances right after the dwell when the POINTER is in the band, rect center is not', () => {
    const { setActivePageIndex, result, advancedTo } = setup();
    act(() => {
      result.current.evaluateEdgeAdvance(MID, window.innerWidth - EDGE_ADVANCE_PX + 1);
    });
    expect(setActivePageIndex).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(PANEL_EDGE_ADVANCE_DWELL_MS); });
    expect(setActivePageIndex).toHaveBeenCalledTimes(1);
    expect(advancedTo(0)).toBe(1);
  });

  it('advances left when the pointer is in the left band', () => {
    const { setActivePageIndex, result, advancedTo } = setup();
    act(() => { result.current.evaluateEdgeAdvance(MID, EDGE_ADVANCE_PX - 1); });
    act(() => { vi.advanceTimersByTime(PANEL_EDGE_ADVANCE_DWELL_MS); });
    expect(setActivePageIndex).toHaveBeenCalledTimes(1);
    expect(advancedTo(2)).toBe(1);
    expect(advancedTo(0)).toBe(0);
  });

  it('still advances off the rect center alone (no pointer)', () => {
    const { setActivePageIndex, result, advancedTo } = setup();
    act(() => {
      result.current.evaluateEdgeAdvance({ left: window.innerWidth - 10, right: window.innerWidth + 90 });
    });
    act(() => { vi.advanceTimersByTime(PANEL_EDGE_ADVANCE_DWELL_MS); });
    expect(setActivePageIndex).toHaveBeenCalledTimes(1);
    expect(advancedTo(0)).toBe(1);
  });

  it('does nothing when neither pointer nor center is near an edge', () => {
    const { setActivePageIndex, result } = setup();
    act(() => { result.current.evaluateEdgeAdvance(MID, 500); });
    act(() => { vi.advanceTimersByTime(PANEL_EDGE_ADVANCE_DWELL_MS * 3); });
    expect(setActivePageIndex).not.toHaveBeenCalled();
  });

  it('clamps the advance to the last page', () => {
    const { setActivePageIndex, result, advancedTo } = setup(2);
    act(() => { result.current.evaluateEdgeAdvance(MID, window.innerWidth - 1); });
    act(() => { vi.advanceTimersByTime(PANEL_EDGE_ADVANCE_DWELL_MS); });
    expect(setActivePageIndex).toHaveBeenCalledTimes(1);
    expect(advancedTo(1)).toBe(1);
  });

  it('latches after firing: dwelling in the band advances only once', () => {
    const { setActivePageIndex, result } = setup();
    const pointer = window.innerWidth - 1;
    act(() => { result.current.evaluateEdgeAdvance(MID, pointer); });
    act(() => { vi.advanceTimersByTime(PANEL_EDGE_ADVANCE_DWELL_MS); });
    expect(setActivePageIndex).toHaveBeenCalledTimes(1);
    // Still in the band: no re-arm, no second advance.
    act(() => { result.current.evaluateEdgeAdvance(MID, pointer); });
    act(() => { vi.advanceTimersByTime(PANEL_EDGE_ADVANCE_DWELL_MS * 2); });
    expect(setActivePageIndex).toHaveBeenCalledTimes(1);
  });

  it('re-arms after leaving and re-entering the band', () => {
    const { setActivePageIndex, result } = setup();
    const pointer = window.innerWidth - 1;
    act(() => { result.current.evaluateEdgeAdvance(MID, pointer); });
    act(() => { vi.advanceTimersByTime(PANEL_EDGE_ADVANCE_DWELL_MS); });
    expect(setActivePageIndex).toHaveBeenCalledTimes(1);
    act(() => { result.current.evaluateEdgeAdvance(MID, 500); });
    act(() => { result.current.evaluateEdgeAdvance(MID, pointer); });
    act(() => { vi.advanceTimersByTime(PANEL_EDGE_ADVANCE_DWELL_MS); });
    expect(setActivePageIndex).toHaveBeenCalledTimes(2);
  });

  it('leaving the band before the dwell cancels the pending advance', () => {
    const { setActivePageIndex, result } = setup();
    act(() => { result.current.evaluateEdgeAdvance(MID, window.innerWidth - 1); });
    act(() => { vi.advanceTimersByTime(PANEL_EDGE_ADVANCE_DWELL_MS / 2); });
    act(() => { result.current.evaluateEdgeAdvance(MID, 500); });
    act(() => { vi.advanceTimersByTime(PANEL_EDGE_ADVANCE_DWELL_MS * 2); });
    expect(setActivePageIndex).not.toHaveBeenCalled();
  });
});
