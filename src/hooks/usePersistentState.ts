import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

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
