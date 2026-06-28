import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useUndoRedo } from './useUndoRedo';

describe('useUndoRedo', () => {
  it('starts with empty stacks', () => {
    const { result } = renderHook(() => useUndoRedo<number>());
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it('push makes canUndo true and clears redo', () => {
    const { result } = renderHook(() => useUndoRedo<number>());
    act(() => { result.current.push(1); });
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
  });

  it('undo returns the pushed snapshot and enables redo', () => {
    const { result } = renderHook(() => useUndoRedo<number>());
    act(() => { result.current.push(10); });
    let restored: number | null = null;
    act(() => { restored = result.current.undo(99); });
    expect(restored).toBe(10);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);
  });

  it('redo returns the undone state and enables undo again', () => {
    const { result } = renderHook(() => useUndoRedo<number>());
    act(() => { result.current.push(10); });
    act(() => { result.current.undo(99); });
    let restored: number | null = null;
    act(() => { restored = result.current.redo(10); });
    expect(restored).toBe(99);
    expect(result.current.canRedo).toBe(false);
    expect(result.current.canUndo).toBe(true);
  });

  it('push clears the redo stack', () => {
    const { result } = renderHook(() => useUndoRedo<number>());
    act(() => { result.current.push(1); });
    act(() => { result.current.undo(2); });
    expect(result.current.canRedo).toBe(true);
    act(() => { result.current.push(3); });
    expect(result.current.canRedo).toBe(false);
  });

  it('caps the undo stack at maxDepth', () => {
    const { result } = renderHook(() => useUndoRedo<number>({ maxDepth: 3 }));
    act(() => {
      result.current.push(1);
      result.current.push(2);
      result.current.push(3);
      result.current.push(4);
    });
    // Stack should hold at most 3 entries; oldest (1) is dropped
    let v1: number | null = null;
    act(() => { v1 = result.current.undo(99); });
    let v2: number | null = null;
    act(() => { v2 = result.current.undo(99); });
    let v3: number | null = null;
    act(() => { v3 = result.current.undo(99); });
    expect(result.current.canUndo).toBe(false);
    expect([v1, v2, v3]).toEqual([4, 3, 2]);
  });

  it('reset clears both stacks', () => {
    const { result } = renderHook(() => useUndoRedo<number>());
    act(() => { result.current.push(1); result.current.push(2); });
    act(() => { result.current.undo(99); });
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(true);
    act(() => { result.current.reset(); });
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it('undo on empty stack returns null', () => {
    const { result } = renderHook(() => useUndoRedo<number>());
    let v: number | null = null;
    act(() => { v = result.current.undo(5); });
    expect(v).toBeNull();
  });

  it('redo on empty stack returns null', () => {
    const { result } = renderHook(() => useUndoRedo<number>());
    let v: number | null = null;
    act(() => { v = result.current.redo(5); });
    expect(v).toBeNull();
  });

  it('external store: second mount reads history from first mount', () => {
    let stored: { undo: number[]; redo: number[] } | null = null;
    const store = {
      read: () => stored,
      write: (s: { undo: number[]; redo: number[] }) => { stored = s; },
    };

    const { result: r1 } = renderHook(() => useUndoRedo<number>({ store }));
    act(() => { r1.current.push(10); r1.current.push(20); });

    // Simulate remount: second hook instance reads the store populated by r1.
    const { result: r2 } = renderHook(() => useUndoRedo<number>({ store }));
    expect(r2.current.canUndo).toBe(true);
    let restored: number | null = null;
    act(() => { restored = r2.current.undo(99); });
    expect(restored).toBe(20);
  });

  it('without store the hook still works', () => {
    const { result } = renderHook(() => useUndoRedo<number>());
    act(() => { result.current.push(5); });
    expect(result.current.canUndo).toBe(true);
    let v: number | null = null;
    act(() => { v = result.current.undo(0); });
    expect(v).toBe(5);
  });
});
