// Process-icon API client - typed wrapper over the local service's
// GET /monitoring/process-icon?name=<processName>, returning image bytes
// (404 when the name doesn't resolve to a known icon). Keyed by the raw
// process name rather than a shortcut targetId: AppPicker's useAppIcon reads
// /shortcuts/icon, whose targetId is a deck-shortcut id a running process's
// name essentially never matches, so it never resolved a real icon for the
// monitoring process list. See hooks/useProcessIcon.ts for the caching hook
// built on top of this.

import { fetchServiceBlob } from './service';

export async function fetchProcessIcon(name: string): Promise<Blob | null> {
  return fetchServiceBlob(`/monitoring/process-icon?name=${encodeURIComponent(name)}`);
}
