// Dashboard-side API client for the widget admin surface. Calls hit the
// loopback nexus-service endpoints under `/apps-api/...`. Widgets render
// in-page via the sandboxed SDK host (a Web Worker per widget); no iframe is involved.

import { fetchService } from '../api/service';
import type { AppInstalledListing, AppInstalledListingResponse } from './types';

export async function listInstalledApps(): Promise<AppInstalledListing[]> {
  const r = await fetchService<AppInstalledListingResponse>('/apps-api/installed');
  // fetchService returns null on a failed request; that is not an empty list.
  if (!r) throw new Error('installed apps request failed');
  return r.apps ?? [];
}
