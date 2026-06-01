// Client side of the widget-action dispatch channel. Manifest meters declare
// `onChange` / `onCommit`; interactive meters call dispatchWidgetAction, which
// POSTs to /widgets-api/dispatch. The host validates against the manifest's
// capabilities.dispatch allowlist and routes to a server-registered handler
// (displays.setBrightness, lighting.setMode, etc.)
//
// Throttling: drag events fire many times/sec. The throttle key is
// `widgetId|action` so two sliders don't starve each other. Latest value wins.

import { resolveHttp } from '../../api/service';
import { getToken, handleUnauthorized } from '../../api/auth';
import { evaluateBinding, type BindingContext } from './bindings';

export interface WidgetAction {
  action: string;
  args?: Record<string, unknown>;
}

interface ThrottleSlot {
  inFlight: boolean;
  pending?: { action: string; args: Record<string, unknown> };
}
const throttleSlots = new Map<string, ThrottleSlot>();
const THROTTLE_KEY = (widgetId: string, action: string) => `${widgetId}|${action}`;

export async function dispatchWidgetAction(
  widgetId: string,
  spec: WidgetAction,
  ctx: { data: Record<string, unknown>; settings: Record<string, unknown> },
): Promise<void> {
  if (!spec?.action || typeof spec.action !== 'string') return;
  const resolvedArgs: Record<string, unknown> = {};
  if (spec.args) {
    const bindingCtx = ctx as unknown as BindingContext;
    for (const [k, v] of Object.entries(spec.args)) {
      resolvedArgs[k] = typeof v === 'string' ? evaluateBinding(v, bindingCtx) : v;
    }
  }
  const key = THROTTLE_KEY(widgetId, spec.action);
  const slot = throttleSlots.get(key) ?? { inFlight: false };
  throttleSlots.set(key, slot);
  if (slot.inFlight) {
    // Queue only the latest value; drop in-between ticks.
    slot.pending = { action: spec.action, args: resolvedArgs };
    return;
  }
  slot.inFlight = true;
  try {
    await postDispatch(widgetId, spec.action, resolvedArgs);
    // Drain the most recent pending if one queued mid-flight.
    while (slot.pending) {
      const next = slot.pending;
      slot.pending = undefined;
      await postDispatch(widgetId, next.action, next.args);
    }
  } finally {
    slot.inFlight = false;
  }
}

async function postDispatch(widgetId: string, action: string, args: Record<string, unknown>): Promise<void> {
  const body = JSON.stringify({ widgetId, action, args });
  const doPost = async (token: string | null) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(resolveHttp('/widgets-api/dispatch'), { method: 'POST', headers, body });
  };
  let res = await doPost(await getToken());
  if (res.status === 401) {
    const refreshed = await handleUnauthorized();
    if (refreshed) res = await doPost(refreshed);
  }
  if (!res.ok) {
    // Soft fail: keep the optimistic state; the next data tick reconciles if
    // the server rejected.
     
    console.warn(`[widget:${widgetId}] dispatch '${action}' failed: ${res.status}`);
  }
}
