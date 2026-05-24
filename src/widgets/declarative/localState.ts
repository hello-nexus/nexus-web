// Per-instance widget-local state. Persists to localStorage keyed by
// (widgetId + instanceId) so the stopwatch's elapsed counter, the
// timer's selected duration, a TODO list's items, etc. survive a tab
// reload but stay scoped to that widget on this device.
//
// The renderer exposes the bag as `local.*` in binding expressions and
// pipes it through RenderContext. Buttons mutate via the `localUpdate`
// shape on their onClick spec — special tokens in arg values
// resolve at click time:
//   "$now"         → Date.now() (ms timestamp)
//   "{local.x}"    → current local value (regular binding)
//   "{settings.x}" → current setting (regular binding)

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { evaluateBinding, type BindingContext } from './bindings';

const KEY_PREFIX = 'nexus.widget.local.v1.';
const KEY = (widgetId: string, instanceId: string) => `${KEY_PREFIX}${widgetId}::${instanceId}`;

export type WidgetLocalState = Record<string, unknown>;

interface UseWidgetLocalStateOpts {
  widgetId: string;
  instanceId: string;
  defaults?: WidgetLocalState;
}

export function useWidgetLocalState({
  widgetId, instanceId, defaults,
}: UseWidgetLocalStateOpts): [WidgetLocalState, (patch: WidgetLocalState) => void] {
  const storageKey = useMemo(() => KEY(widgetId, instanceId), [widgetId, instanceId]);
  const defaultsKey = useMemo(() => JSON.stringify(defaults ?? {}), [defaults]);
  const [state, setStateInternal] = useState<WidgetLocalState>(() => {
    const initial = (defaults ?? {}) as WidgetLocalState;
    if (typeof localStorage === 'undefined') return initial;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return initial;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return { ...initial, ...(parsed as WidgetLocalState) };
      }
      return initial;
    } catch {
      return initial;
    }
  });
  // Keep defaults reactive: if the manifest's default bag changes, merge
  // in the new keys without overwriting user-mutated values.
  useEffect(() => {
    setStateInternal((prev) => ({ ...(defaults ?? {}), ...prev }));
  }, [defaultsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = useCallback((patch: WidgetLocalState) => {
    setStateInternal((prev) => {
      const next = { ...prev, ...patch };
      try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* quota or disabled */ }
      return next;
    });
  }, [storageKey]);

  return [state, update];
}

/**
 * Resolve a localUpdate argument bag at click-time. Each value gets:
 *   - "$now" literal → Date.now()
 *   - "{expression}" template → evaluated against {settings, local, data}
 *   - any other value → passed through unchanged
 */
export function resolveLocalUpdateArgs(
  args: Record<string, unknown>,
  ctx: BindingContext,
): WidgetLocalState {
  const out: WidgetLocalState = {};
  for (const [k, v] of Object.entries(args)) {
    if (v === '$now') {
      out[k] = Date.now();
    } else if (typeof v === 'string') {
      out[k] = evaluateBinding(v, ctx);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/** Hook variant that returns a stable update callback fitting the
 *  Button meter's needs. */
export function useLocalUpdate(
  update: (patch: WidgetLocalState) => void,
): (args: Record<string, unknown>, ctx: BindingContext) => void {
  const ref = useRef(update);
  ref.current = update;
  return useCallback((args, ctx) => {
    ref.current(resolveLocalUpdateArgs(args, ctx));
  }, []);
}
