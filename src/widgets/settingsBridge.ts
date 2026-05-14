// Host-side settings facade for the widget bridge. Talks to
// `/widgets-api/installed/{id}/settings` and broadcasts changes to
// subscribers (the Tier 2 worker host and the in-host settings form).

import { fetchService, resolveHttp } from '../api/service';
import { getToken, handleUnauthorized } from '../api/auth';

export interface WidgetSettingsDocument {
  widgetId: string;
  values: Record<string, unknown>;
}

export interface WidgetSettingsPatch {
  set?: Record<string, unknown>;
  reset?: string[];
}

export type WidgetSettingsListener = (values: Record<string, unknown>) => void;

/**
 * Lazy-loaded, cached settings document with a subscriber list. One instance
 * per widget surfaced by the dashboard. The Tier 2 worker host (read via
 * `qos.settings.get()`) and the in-host React settings form (read + patch)
 * both talk to this.
 */
export class WidgetSettingsBridge {
  private readonly widgetId: string;
  private values: Record<string, unknown> = {};
  private loaded = false;
  private readonly listeners = new Set<WidgetSettingsListener>();

  constructor(widgetId: string) { this.widgetId = widgetId; }

  /** Returns the cached values. Triggers a load on first call. */
  get(): Record<string, unknown> {
    if (!this.loaded) {
      // Fire-and-forget initial load; subscribers receive a `changed` event
      // when it lands. Synchronous callers see `{}` until then.
      void this.load();
    }
    return this.values;
  }

  async load(): Promise<Record<string, unknown>> {
    const doc = await fetchService<WidgetSettingsDocument>(
      `/widgets-api/installed/${encodeURIComponent(this.widgetId)}/settings`,
    );
    if (doc?.values) {
      this.values = doc.values;
      this.loaded = true;
      this.fire();
    }
    return this.values;
  }

  async patch(patch: WidgetSettingsPatch): Promise<Record<string, unknown>> {
    const token = await getToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    let res = await fetch(resolveHttp(`/widgets-api/installed/${encodeURIComponent(this.widgetId)}/settings`), {
      method: 'PATCH', headers, body: JSON.stringify(patch),
    });
    if (res.status === 401) {
      const next = await handleUnauthorized();
      if (next) {
        headers['Authorization'] = `Bearer ${next}`;
        res = await fetch(resolveHttp(`/widgets-api/installed/${encodeURIComponent(this.widgetId)}/settings`), {
          method: 'PATCH', headers, body: JSON.stringify(patch),
        });
      }
    }
    if (!res.ok) return this.values;
    const doc = (await res.json()) as WidgetSettingsDocument;
    this.values = doc.values ?? {};
    this.loaded = true;
    this.fire();
    return this.values;
  }

  onChange(listener: WidgetSettingsListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private fire(): void {
    for (const l of this.listeners) {
      try { l(this.values); } catch { /* listener bug, swallow */ }
    }
  }
}
