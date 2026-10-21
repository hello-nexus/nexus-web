import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useFreeformResize } from './useFreeformResize';
import { freeformSnapSpans } from './freeformResize';
import { snapDropCell } from './grid';
import { previewDrag } from './panelLayoutOps';
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
    // A full page: no move can displace the others without pushing one off the page.
    const full = layout(tile('a', '4x4', 0, 0), tile('b', '4x4', 4, 0), tile('c', '4x4', 0, 4), tile('d', '4x4', 4, 4));
    const h = setup(full);
    act(() => { h.result.current.begin(); });
    for (let i = 0; i < 5; i++) act(() => { h.result.current.update('move', 1 + i * 0.01, 0); });
    expect(h.onReject).toHaveBeenCalledTimes(1);
    act(() => { h.result.current.update('move', 0, 0); });
    act(() => { h.result.current.update('move', 1, 0); });
    expect(h.onReject).toHaveBeenCalledTimes(2);
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
    // Rows are limited: 6x4 pushes b below, 6x8 would not leave b anywhere.
    const l = layout(tile('a', '4x4', 0, 0), tile('b', '4x4', 4, 0), tile('c', '4x2', 0, 4), tile('d', '4x2', 0, 6));
    const h = setup(l);
    act(() => { h.result.current.begin(); });
    act(() => { h.result.current.update('br', 0, 4); });
    const draft = h.result.current.draft;
    if (draft) expect(draft.pages).toHaveLength(1);
    act(() => { h.result.current.end(); });
    for (const call of h.onCommit.mock.calls) expect((call[0] as PanelLayout).pages).toHaveLength(1);
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
  it('keeps the stored size when a tile rendered clamped on a narrow grid is moved', () => {
    const l = layout(tile('a', '8x4', 0, 0));
    const onCommit = vi.fn();
    const { result } = renderHook(() => useFreeformResize({
      widgetId: 'a', layout: l, capacity: { gridCols: 4, pageRows: 8 }, snapSpans: SPANS, onCommit, onReject: vi.fn(),
    }));
    act(() => { result.current.begin(); });
    act(() => { result.current.update('move', 0, 2); });
    act(() => { result.current.end(); });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit.mock.calls[0][0].pages[0].widgets[0]).toMatchObject({ size: '8x4', col: 0, row: 2 });
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

  it('moves a stored 4x8 rendered on a 4 row grid one cell and keeps its size', () => {
    const l = layout(tile('a', '4x8', 0, 0));
    const onCommit = vi.fn();
    const onReject = vi.fn();
    const { result } = renderHook(() => useFreeformResize({
      widgetId: 'a', layout: l, capacity: { gridCols: 8, pageRows: 4 }, snapSpans: SPANS, onCommit, onReject,
    }));
    act(() => { result.current.begin(); });
    act(() => { result.current.update('move', 2, 0); });
    act(() => { result.current.end(); });
    expect(onReject).not.toHaveBeenCalled();
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit.mock.calls[0][0].pages[0].widgets[0]).toMatchObject({ size: '4x8', col: 2, row: 0 });
  });
});

describe('useFreeformResize moves land like the regular drag', () => {
  const place = (size: PanelWidgetSize, col: number, row: number, dc: number, dr: number, others: PanelWidget[] = []) => {
    const l = layout(tile('a', size, col, row), ...others);
    const h = setup(l);
    act(() => { h.result.current.begin(); });
    act(() => { h.result.current.update('move', dc, dr); });
    act(() => { h.result.current.end(); });
    return { l, h };
  };
  const at = (call: unknown) => {
    const w = (call as PanelLayout).pages[0].widgets.find(x => x.id === 'a')!;
    return { col: w.col, row: w.row };
  };

  it('snaps a 4x4 and a 2x2 move to two cells', () => {
    expect(at(place('4x4', 0, 0, 1, 1).h.onCommit.mock.calls[0][0])).toEqual({ col: 2, row: 2 });
    expect(at(place('2x2', 0, 0, 1, 1).h.onCommit.mock.calls[0][0])).toEqual({ col: 2, row: 2 });
  });

  it('moves a 4x1 one row and two columns at a time', () => {
    expect(at(place('4x1', 0, 0, 0, 1).h.onCommit.mock.calls[0][0])).toEqual({ col: 0, row: 1 });
    expect(at(place('4x1', 0, 0, 1, 0).h.onCommit.mock.calls[0][0])).toEqual({ col: 2, row: 0 });
  });

  it('gives the same target as the regular drag for the same pointer delta, pushed neighbours included', () => {
    const others = [tile('b', '2x2', 2, 0)];
    const { l, h } = place('4x4', 0, 0, 1.3, 0.6, others);
    const drop = snapDropCell(0 + 1.3, 0 + 0.6, { cols: 4, rows: 4 }, { cols: CAPACITY.gridCols, rows: CAPACITY.pageRows });
    const dragged = previewDrag(l, 'a', 'p1', drop.col, drop.row, CAPACITY)!;
    expect(h.onCommit.mock.calls[0][0]).toEqual(dragged);
  });

  it('refuses a move the regular drag refuses', () => {
    const full = [tile('b', '4x4', 4, 0), tile('c', '4x4', 0, 4), tile('d', '4x4', 4, 4)];
    const l = layout(tile('a', '4x4', 0, 0), ...full);
    const h = setup(l);
    act(() => { h.result.current.begin(); });
    act(() => { h.result.current.update('move', 2, 0); });
    act(() => { h.result.current.end(); });
    expect(previewDrag(l, 'a', 'p1', 2, 0, CAPACITY)).toBeNull();
    expect(h.onCommit).not.toHaveBeenCalled();
    expect(h.onReject).toHaveBeenCalledTimes(1);
  });
});
