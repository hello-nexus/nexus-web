// Dashboard-side API client for the widget admin surface. Calls hit the
// loopback nexus-service endpoints under `/widgets-api/...`. Widgets render
// in-page via DeclarativeWidget (Tier 1) or a Web Worker (Tier 2); no
// iframe is involved.

import { fetchService } from '../api/service';
import type { WidgetInstalledListing, WidgetInstalledListingResponse } from './types';

export async function listInstalledWidgets(): Promise<WidgetInstalledListing[]> {
  const r = await fetchService<WidgetInstalledListingResponse>('/widgets-api/installed');
  return r?.widgets ?? [];
}

export async function getInstalledWidget(id: string): Promise<WidgetInstalledListing | null> {
  return fetchService<WidgetInstalledListing>(`/widgets-api/installed/${encodeURIComponent(id)}`);
}
