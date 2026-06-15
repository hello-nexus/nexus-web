import { useEffect, useRef, useState } from 'react';

// Flags a freshly-added widget so its cell plays the panel-launch entrance
// animation once. Driven by diffing the live widget-id set: a single new id
// between renders is a user add (appendWidget inserts exactly one), so it
// animates. A bulk change (initial load, profile restore, surface reflow)
// brings many ids at once and is skipped; those are covered by the panel's
// connection/home intro, not a per-cell pop. The first population seeds the
// baseline without animating anything.
// Matches the .cellEntrance keyframe duration in PanelApp.module.scss.
const ENTRANCE_DURATION_MS = 1040;

export function useAddedWidgetEntrance(widgetIds: readonly string[]): ReadonlySet<string> {
  const [entrance, setEntrance] = useState<ReadonlySet<string>>(() => new Set());
  // null until the first id set lands, so initial widgets seed the baseline
  // instead of all animating as "added".
  const seenRef = useRef<Set<string> | null>(null);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const current = new Set(widgetIds);
    const seen = seenRef.current;
    seenRef.current = current;
    if (seen === null) return;
    const added = widgetIds.filter(id => !seen.has(id));
    // Only a single-widget add animates; a bulk delta is a load/reflow.
    if (added.length !== 1) return;
    const id = added[0];
    setEntrance(prev => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    const existing = timersRef.current.get(id);
    if (existing) clearTimeout(existing);
    const handle = setTimeout(() => {
      timersRef.current.delete(id);
      setEntrance(prev => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, ENTRANCE_DURATION_MS);
    timersRef.current.set(id, handle);
  }, [widgetIds]);

  useEffect(() => () => {
    const timers = timersRef.current;
    for (const handle of timers.values()) clearTimeout(handle);
    timers.clear();
  }, []);

  return entrance;
}
