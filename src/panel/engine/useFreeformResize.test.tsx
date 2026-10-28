import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useFreeformResize } from './useFreeformResize';
import { freeformSnapSpans } from './freeformResize';
import type { PanelLayout, PanelWidget, PanelWidgetSize } from '../types';

const CAPACITY = { gridCols: 8, pageRows: 8 };
const SPANS = freeformSnapSpans(['2x2', '4x2', '4x4'], { cols: 8, rows: 8 });

const layout = (...widgets: PanelWidget[]): PanelLayout => ({ layoutSchemaVersion: 2, surface: 'y70', pages: [{ id: 'p1', widgets }] });
const tile = (id: string, size: PanelWidgetSize, col: number, row: number): PanelWidget => ({ id, type: 'whiteboard', size, col, row });

function setup(l: PanelLayout) {
  const onCommit = vi.fn();
  const onReject = vi.fn();
  const hook = renderHook(() => useFreeformResize({ widgetId: 'a', layout: l, capacity: CAPACITY, snapSpans: SPANS, onCommit, onReject }));
  return { ...hook, onCommit, onReject };
}

function stepOnce(h: ReturnType<typeof setup>, cols: number, rows: number) {
  act(() => { h.result.current.begin(); });
  act(() => { h.result.current.step('br', cols, rows); });
  act(() => { h.result.current.end(); });
}

describe('useFreeformResize keyboard steps', () => {
  it.each([
    ['4x4', 1, 0, '5x4'],
    ['2x2', 1, 0, '4x2'],
    ['4x2', 0, 1, '4x4'],
  ] as const)('%s steps (%i, %i) to %s', (size, dc, dr, expected) => {
    const h = setup(layout(tile('a', size, 0, 0)));
    stepOnce(h, dc, dr);
    expect(h.onCommit).toHaveBeenCalledTimes(1);
    expect(h.onCommit.mock.calls[0][0].pages[0].widgets[0].size).toBe(expected);
  });
});

describe('useFreeformResize never leaves the page', () => {
  const page = (l: PanelLayout, i: number) => l.pages[i].widgets.map(w => `${w.id}:${w.size}@${w.col},${w.row}`);

  it('stops a drag at the start span when a full page blocks growth, with nothing on another page', () => {
    const full = layout(tile('a', '4x4', 0, 0), tile('b', '4x4', 4, 0), tile('c', '4x4', 0, 4), tile('d', '4x4', 4, 4));
    const h = setup(full);
    act(() => { h.result.current.begin(); });
    act(() => { h.result.current.update('br', 4, 4); });
    expect(h.result.current.draft).toBeNull();
    act(() => { h.result.current.end(); });
    expect(h.onCommit).not.toHaveBeenCalled();
  });

  it('pushes into free cells on the same page when there is room', () => {
    const roomy = layout(tile('a', '4x4', 0, 0), tile('b', '4x2', 4, 0));
    const h = setup(roomy);
    act(() => { h.result.current.begin(); });
    act(() => { h.result.current.update('br', 2, 0); });
    act(() => { h.result.current.end(); });
    const next = h.onCommit.mock.calls[0][0] as PanelLayout;
    expect(next.pages).toHaveLength(1);
    expect(page(next, 0)).toContain('a:6x4@0,0');
    expect(next.pages[0].widgets.find(w => w.id === 'b')!.row).toBeGreaterThanOrEqual(4);
  });

  it('stops at the largest span that still fits when the next one would push a widget off the page', () => {
    // 4x8 would leave no room for the three 4x2s, 4x6 only needs the free rows under the tile.
    const l = layout(
      tile('a', '4x4', 0, 0), tile('b', '4x4', 4, 0),
      tile('e', '4x2', 4, 4), tile('c', '4x2', 0, 6), tile('d', '4x2', 4, 6),
    );
    const h = setup(l);
    act(() => { h.result.current.begin(); });
    act(() => { h.result.current.update('br', 0, 8); });
    act(() => { h.result.current.end(); });
    const next = h.onCommit.mock.calls[0][0] as PanelLayout;
    expect(next.pages).toHaveLength(1);
    expect(page(next, 0).sort()).toEqual(['a:4x6@0,0', 'b:4x4@4,0', 'c:4x2@0,6', 'd:4x2@4,6', 'e:4x2@4,4']);
  });

  it('a keyboard step follows the same rule', () => {
    const full = layout(tile('a', '4x4', 0, 0), tile('b', '4x4', 4, 0), tile('c', '4x4', 0, 4), tile('d', '4x4', 4, 4));
    const h = setup(full);
    stepOnce(h, 1, 0);
    stepOnce(h, 0, 1);
    expect(h.onCommit).not.toHaveBeenCalled();
  });
});

describe('useFreeformResize move and cancel', () => {
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
      widgetId: 'a', layout: current, capacity: CAPACITY, snapSpans: SPANS, onCommit, onReject: vi.fn(),
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

describe('useFreeformResize stale gestures and clamped moves', () => {
  it('commits nothing when the layout changed mid-drag and the gesture then ends', () => {
    const onCommit = vi.fn();
    const onReject = vi.fn();
    let current = layout(tile('a', '4x4', 0, 0), tile('b', '4x2', 4, 0));
    const { result, rerender } = renderHook(() => useFreeformResize({
      widgetId: 'a', layout: current, capacity: CAPACITY, snapSpans: SPANS, onCommit, onReject,
    }));
    act(() => { result.current.begin(); });
    act(() => { result.current.update('br', 2, 0); });
    current = layout(tile('a', '4x4', 0, 0));
    rerender();
    act(() => { result.current.end(); });
    expect(onCommit).not.toHaveBeenCalled();
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it('still commits when the layout is replaced by a same-content object mid-drag', () => {
    const onCommit = vi.fn();
    let current = layout(tile('a', '4x4', 0, 0));
    const { result, rerender } = renderHook(() => useFreeformResize({
      widgetId: 'a', layout: current, capacity: CAPACITY, snapSpans: SPANS, onCommit, onReject: vi.fn(),
    }));
    act(() => { result.current.begin(); });
    act(() => { result.current.update('br', 2, 0); });
    current = layout(tile('a', '4x4', 0, 0));
    rerender();
    act(() => { result.current.end(); });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit.mock.calls[0][0].pages[0].widgets[0].size).toBe('6x4');
  });

  it('commits nothing when the grid changed mid-drag', () => {
    const onCommit = vi.fn();
    const l = layout(tile('a', '4x4', 0, 0));
    let capacity = CAPACITY;
    const { result, rerender } = renderHook(() => useFreeformResize({
      widgetId: 'a', layout: l, capacity, snapSpans: SPANS, onCommit, onReject: vi.fn(),
    }));
    act(() => { result.current.begin(); });
    act(() => { result.current.update('br', 2, 0); });
    capacity = { gridCols: 4, pageRows: 8 };
    rerender();
    act(() => { result.current.end(); });
    expect(onCommit).not.toHaveBeenCalled();
  });

});
