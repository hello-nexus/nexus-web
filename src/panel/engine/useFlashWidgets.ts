import { useCallback, useEffect, useRef, useState } from 'react';

// Widgets whose last action was rejected (e.g. resize didn't fit anywhere).
// Drives a brief shake/flash on the cell, auto-cleared by a timer. Plural
// keyset so simultaneous rejections each play.
const FLASH_DURATION_MS = 600;

export function useFlashWidgets() {
  const [flashedWidgets, setFlashedWidgets] = useState<ReadonlySet<string>>(() => new Set());
  const flashTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const triggerFlash = useCallback((widgetId: string) => {
    setFlashedWidgets(prev => {
      if (prev.has(widgetId)) return prev;
      const next = new Set(prev);
      next.add(widgetId);
      return next;
    });
    const existing = flashTimersRef.current.get(widgetId);
    if (existing) window.clearTimeout(existing);
    const handle = window.setTimeout(() => {
      flashTimersRef.current.delete(widgetId);
      setFlashedWidgets(prev => {
        if (!prev.has(widgetId)) return prev;
        const next = new Set(prev);
        next.delete(widgetId);
        return next;
      });
    }, FLASH_DURATION_MS);
    flashTimersRef.current.set(widgetId, handle);
  }, []);
  useEffect(() => () => {
    const timers = flashTimersRef.current;
    for (const handle of timers.values()) window.clearTimeout(handle);
    timers.clear();
  }, []);
  return { flashedWidgets, triggerFlash };
}
