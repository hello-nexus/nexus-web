// Panel mount for a sandboxed SDK widget. Sibling to DeclarativeWidget: it spawns
// the worker, wires per-instance local-state persistence + settings/size push, and
// renders the worker's remote tree as real @hellonexus/ui components. A pure
// flex-fill container, like DeclarativeWidget, since the panel cell sizes it.

import { useEffect, useRef, useState } from 'react';
import { RemoteTree } from './RemoteTree';
import { spawnSandboxedWidget, type SandboxContext, type SandboxHandle } from './host';

export interface SandboxedWidgetProps {
  /** Absolute URL to the built worker bundle (served per code-session in prod). */
  entryUrl: string;
  widgetId: string;
  instanceId: string;
  settings?: Record<string, unknown>;
  /** Host dispatch for gated control/host actions. */
  onDispatch?: (action: string, args?: Record<string, unknown>) => void | Promise<void>;
}

const localKey = (widgetId: string, instanceId: string) => `nexus.sdk.local.${widgetId}.${instanceId}`;

function readLocal(widgetId: string, instanceId: string): Record<string, unknown> {
  try { return JSON.parse(localStorage.getItem(localKey(widgetId, instanceId)) ?? '{}') as Record<string, unknown>; }
  catch { return {}; }
}

export function SandboxedWidget({ entryUrl, widgetId, instanceId, settings, onDispatch }: SandboxedWidgetProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [handle, setHandle] = useState<SandboxHandle | null>(null);
  const settingsKey = JSON.stringify(settings ?? {});

  useEffect(() => {
    const el = wrapRef.current;
    const size = el
      ? { width: Math.round(el.clientWidth), height: Math.round(el.clientHeight) }
      : { width: 0, height: 0 };

    const context: SandboxContext = {
      instanceId,
      widgetId,
      size,
      settings: settings ?? {},
      local: readLocal(widgetId, instanceId),
      api: {
        persistLocal: (next) => {
          try { localStorage.setItem(localKey(widgetId, instanceId), JSON.stringify(next)); }
          catch { /* quota / private mode */ }
        },
        dispatch: (action, args) => onDispatch?.(action, args),
      },
    };

    const spawned = spawnSandboxedWidget(entryUrl, context);
    setHandle(spawned);
    return () => { spawned.dispose(); setHandle(null); };
    // settings/dispatch are pushed via update; re-spawn only on identity change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryUrl, widgetId, instanceId]);

  useEffect(() => {
    handle?.update({ settings: settings ?? {} });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsKey, handle]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined' || !handle) return;
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) handle.update({ size: { width: Math.round(rect.width), height: Math.round(rect.height) } });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [handle]);

  return (
    <div ref={wrapRef} style={{ width: '100%', height: '100%', display: 'flex', minWidth: 0, minHeight: 0 }}>
      {handle ? <RemoteTree receiver={handle.receiver} /> : null}
    </div>
  );
}
