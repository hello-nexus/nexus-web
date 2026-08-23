import { StrictMode } from 'react';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useWhiteboardBoard } from './useWhiteboardBoard';
import type { Stroke } from './whiteboardTypes';

function stroke(x: number): Stroke {
  return { tool: 'pen', color: '#fff', width: 4, points: [{ x, y: x }, { x: x + 1, y: x + 1 }] };
}

// Property mutation, not reassignment of an outer binding: the latter is
// blocked by react-hooks/globals.
const held: { api: ReturnType<typeof useWhiteboardBoard> | null } = { api: null };
const api = () => held.api!;

function Probe() {
  held.api = useWhiteboardBoard('strict-board');
  return <span data-testid="n">{held.api.board.strokes.length}</span>;
}

const count = () => Number(screen.getByTestId('n').textContent);

beforeEach(() => localStorage.clear());

// StrictMode re-invokes every setState updater. The app mounts under
// <StrictMode> (src/main.tsx), so an updater that also pushed history or
// scheduled a save ran twice per commit: one stroke produced two undo entries
// and redo never restored anything.
describe('useWhiteboardBoard under StrictMode', () => {
  it('records exactly one history entry per stroke', () => {
    render(<StrictMode><Probe /></StrictMode>);
    act(() => api().commitStroke(stroke(1)));
    expect(count()).toBe(1);

    act(() => api().undo());
    expect(count()).toBe(0);
    expect(api().canUndo).toBe(false);
  });

  it('round-trips undo then redo', () => {
    render(<StrictMode><Probe /></StrictMode>);
    act(() => api().commitStroke(stroke(1)));
    act(() => api().commitStroke(stroke(2)));
    expect(count()).toBe(2);

    act(() => api().undo());
    expect(count()).toBe(1);
    act(() => api().redo());
    expect(count()).toBe(2);
    expect(api().canRedo).toBe(false);
  });

  it('clear is undoable in one press', () => {
    render(<StrictMode><Probe /></StrictMode>);
    act(() => api().commitStroke(stroke(1)));
    act(() => api().clear());
    expect(count()).toBe(0);
    act(() => api().undo());
    expect(count()).toBe(1);
  });

  it('caps a pathologically long stroke so it cannot exceed the store cap alone', () => {
    render(<StrictMode><Probe /></StrictMode>);
    const huge: Stroke = { tool: 'pen', color: '#fff', width: 4,
      points: Array.from({ length: 40000 }, (_, i) => ({ x: i, y: i })) };
    act(() => api().commitStroke(huge));
    expect(api().board.strokes[0].points.length).toBeLessThanOrEqual(5000);
  });
});
