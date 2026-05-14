// Dashboard-side API client for the Phase 0 widget admin surface. Calls
// hit the loopback qos-service endpoints under `/widgets-api/...`; the
// per-widget origin (`/widgets/<id>/...`) is loaded by the browser when it
// mounts the iframe and does not go through this module.

import { fetchService, resolveHttp } from '../api/service';
import type { WidgetInstalledListing, WidgetInstalledListingResponse } from './types';

/** Loopback URL the iframe `src` attribute should use to load a widget. */
export function widgetOriginUrl(widgetId: string, file = 'index.html'): string {
  return resolveHttp(`/widgets/${encodeURIComponent(widgetId)}/${file}`);
}

export async function listInstalledWidgets(): Promise<WidgetInstalledListing[]> {
  const r = await fetchService<WidgetInstalledListingResponse>('/widgets-api/installed');
  return r?.widgets ?? [];
}

export async function getInstalledWidget(id: string): Promise<WidgetInstalledListing | null> {
  return fetchService<WidgetInstalledListing>(`/widgets-api/installed/${encodeURIComponent(id)}`);
}
