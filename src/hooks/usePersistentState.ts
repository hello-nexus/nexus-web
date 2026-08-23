import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';

// useState whose value is mirrored to localStorage under `key`, so it survives
// reloads and app restarts. Seeded from storage on mount; written back on every
// change. Best-effort: if localStorage is unavailable or the stored JSON is
// malformed, it falls back to a plain in-memory state seeded with `initial`.
export function usePersistentState<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw != null) return JSON.parse(raw) as T;
    } catch { /* unavailable or malformed → use initial */ }
    return initial;
  });

  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* persist best-effort */ }
  }, [key, value]);

  return [value, setValue];
}

// usePersistentState for a set of ids. A Set does not survive JSON, so the
// stored form is an array; callers still read and write a Set.
export function usePersistentIdSet(
  key: string,
): [Set<string>, Dispatch<SetStateAction<Set<string>>>] {
  const [list, setList] = usePersistentState<string[]>(key, []);
  const value = useMemo(() => new Set(list), [list]);
  const setValue = useCallback<Dispatch<SetStateAction<Set<string>>>>(next => {
    setList(prev => [...(typeof next === 'function' ? next(new Set(prev)) : next)]);
  }, [setList]);
  return [value, setValue];
}
