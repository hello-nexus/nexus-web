// Dashboard-side API client for the widget admin surface. Calls hit the
// loopback nexus-service endpoints under `/apps-api/...`. Widgets render
// in-page via the sandboxed SDK host (a Web Worker per widget); no iframe is involved.

import { fetchService } from '../api/service';
import type { AppInstalledListing, AppInstalledListingResponse } from './types';

export async function listInstalledApps(): Promise<AppInstalledListing[]> {
  const r = await fetchService<AppInstalledListingResponse>('/apps-api/installed');
  return r?.apps ?? [];
}

export async function getInstalledApp(id: string): Promise<AppInstalledListing | null> {
  return fetchService<AppInstalledListing>(`/apps-api/installed/${encodeURIComponent(id)}`);
}
