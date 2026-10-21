import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useFreeformResize } from './useFreeformResize';
import { freeformSnapSpans } from './freeformResize';
import type { PanelLayout, PanelWidget, PanelWidgetSize } from '../types';

const CAPACITY = { gridCols: 8, pageRows: 8 };
const SPANS = freeformSnapSpans(['2x2', '4x2', '4x4'], { cols: 8, rows: 8 });

const layout = (...widgets: PanelWidget[]): PanelLayout => ({ layoutSchemaVersion: 2, surface: 'y70', pages: [{ id: 'p1', widgets }] });
const tile = (id: string, size: PanelWidgetSize, col: number, row: number): PanelWidget => ({ id, type: 'whiteboard', size, col, row });

function setup(l: PanelLayout, maxPages = 1) {
  const onCommit = vi.fn();
  const onReject = vi.fn();
  const hook = renderHook(() => useFreeformResize({ widgetId: 'a', layout: l, capacity: CAPACITY, snapSpans: SPANS, maxPages, onCommit, onReject }));
  return { ...hook, onCommit, onReject };
}

function stepOnce(h: ReturnType<typeof setup>, cols: number, rows: number) {
  act(() => { h.result.current.begin(); });
  act(() => { h.result.current.step('br', cols, rows); });
  act(() => { h.result.current.end(); });
}

describe('useFreeformResize keyboard steps', () => {
  it.each([
    ['4x4', 1, 0, '6x4'],
    ['2x2', 1, 0, '4x2'],
    ['4x2', 0, 1, '4x4'],
  ] as const)('%s steps (%i, %i) to %s', (size, dc, dr, expected) => {
    const h = setup(layout(tile('a', size, 0, 0)));
    stepOnce(h, dc, dr);
    expect(h.onCommit).toHaveBeenCalledTimes(1);
    expect(h.onCommit.mock.calls[0][0].pages[0].widgets[0].size).toBe(expected);
  });
});

describe('useFreeformResize rejection feedback', () => {
  it('flashes once per rejected target and re-arms after an accepted one', () => {
    // One page and a full grid: growing the first tile has nowhere to push the others.
    const full = layout(tile('a', '4x4', 0, 0), tile('b', '4x4', 4, 0), tile('c', '4x4', 0, 4), tile('d', '4x4', 4, 4));
    const h = setup(full);
    act(() => { h.result.current.begin(); });
    for (let i = 0; i < 5; i++) act(() => { h.result.current.update('br', 0, 2 + i * 0.1); });
    expect(h.onReject).toHaveBeenCalledTimes(1);
    act(() => { h.result.current.update('br', 0, 0); });
    act(() => { h.result.current.update('br', 0, 2); });
    expect(h.onReject).toHaveBeenCalledTimes(2);
  });
});

describe('useFreeformResize move and cancel', () => {
  it('keeps the stored size when a tile rendered clamped on a narrow grid is moved', () => {
    const l = layout(tile('a', '8x4', 0, 0));
    const onCommit = vi.fn();
    const { result } = renderHook(() => useFreeformResize({
      widgetId: 'a', layout: l, capacity: { gridCols: 4, pageRows: 8 }, snapSpans: SPANS, maxPages: 1, onCommit, onReject: vi.fn(),
    }));
    act(() => { result.current.begin(); });
    act(() => { result.current.update('move', 0, 1); });
    act(() => { result.current.end(); });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit.mock.calls[0][0].pages[0].widgets[0]).toMatchObject({ size: '8x4', col: 0, row: 1 });
  });

  it('still writes the resized span for a corner drag', () => {
    const h = setup(layout(tile('a', '4x4', 0, 0)));
    act(() => { h.result.current.begin(); });
    act(() => { h.result.current.update('br', 2, 0); });
    act(() => { h.result.current.end(); });
    expect(h.onCommit.mock.calls[0][0].pages[0].widgets[0].size).toBe('6x4');
  });

  it('commits nothing when cancelled after the layout was replaced mid-drag', () => {
    const onCommit = vi.fn();
    let current = layout(tile('a', '4x4', 0, 0), tile('b', '4x2', 4, 0));
    const { result, rerender } = renderHook(() => useFreeformResize({
      widgetId: 'a', layout: current, capacity: CAPACITY, snapSpans: SPANS, maxPages: 1, onCommit, onReject: vi.fn(),
    }));
    act(() => { result.current.begin(); });
    act(() => { result.current.update('br', 2, 0); });
    expect(result.current.draft).not.toBeNull();
    current = layout(tile('a', '4x4', 0, 0));
    rerender();
    act(() => { result.current.cancel(); });
    act(() => { result.current.end(); });
    expect(onCommit).not.toHaveBeenCalled();
    expect(result.current.draft).toBeNull();
  });
});
