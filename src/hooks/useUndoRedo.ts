import { useCallback, useEffect, useRef, useState } from 'react';
import { isApplePlatform } from '../lib/platform';

const isMac = isApplePlatform();

export interface UndoRedoStore<T> {
  read: () => { undo: T[]; redo: T[] } | null;
  write: (stacks: { undo: T[]; redo: T[] }) => void;
}

export interface UseUndoRedoOptions<T = unknown> {
  maxDepth?: number;
  enabled?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  store?: UndoRedoStore<T>;
}

export interface UseUndoRedoResult<T> {
  push: (snapshot: T) => void;
  undo: (current: T) => T | null;
  redo: (current: T) => T | null;
  canUndo: boolean;
  canRedo: boolean;
  reset: () => void;
}

export function useUndoRedo<T>(opts: UseUndoRedoOptions<T> = {}): UseUndoRedoResult<T> {
  const { maxDepth = 50, enabled = true, onUndo, onRedo } = opts;
  const [stacks, setStacks] = useState<{ undo: T[]; redo: T[] }>(() => opts.store?.read() ?? { undo: [], redo: [] });
  const stacksRef = useRef(stacks);
  stacksRef.current = stacks;
  const onUndoRef = useRef(onUndo);
  onUndoRef.current = onUndo;
  const onRedoRef = useRef(onRedo);
  onRedoRef.current = onRedo;
  const storeRef = useRef(opts.store);
  storeRef.current = opts.store;
  useEffect(() => { storeRef.current?.write(stacks); }, [stacks]);

  const push = useCallback((snapshot: T) => {
    setStacks(prev => {
      const next = [...prev.undo, snapshot];
      if (next.length > maxDepth) next.shift();
      return { undo: next, redo: [] };
    });
  }, [maxDepth]);

  const undo = useCallback((current: T): T | null => {
    const s = stacksRef.current;
    if (s.undo.length === 0) return null;
    const restored = s.undo[s.undo.length - 1];
    setStacks({ undo: s.undo.slice(0, -1), redo: [...s.redo, current] });
    return restored;
  }, []);

  const redo = useCallback((current: T): T | null => {
    const s = stacksRef.current;
    if (s.redo.length === 0) return null;
    const restored = s.redo[s.redo.length - 1];
    setStacks({ undo: [...s.undo, current], redo: s.redo.slice(0, -1) });
    return restored;
  }, []);

  const reset = useCallback(() => {
    setStacks({ undo: [], redo: [] });
  }, []);

  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!enabledRef.current) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (!mod || e.code !== 'KeyZ') return;
      e.preventDefault();
      if (e.shiftKey) {
        onRedoRef.current?.();
      } else {
        onUndoRef.current?.();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []); // intentionally empty - all state read via refs

  return {
    push,
    undo,
    redo,
    canUndo: stacks.undo.length > 0,
    canRedo: stacks.redo.length > 0,
    reset,
  };
}
