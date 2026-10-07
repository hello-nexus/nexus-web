// Dev-tools simulated events: UI-only states the service overlays so alerts and screens can be exercised.
// The routes exist in dev-tools service builds only.

import { deleteService, fetchService, postService } from './service';

export type DevSimCategory = 'guard' | 'health' | 'incident' | 'device';

export interface DevSimCatalogEntry {
  id: string;
  /** Kept as a string so a category this build does not know still lists. */
  category: DevSimCategory | (string & {});
  /** The service's English label; the web localizes by id and falls back to this. */
  label: string;
}

export interface DevSimActiveEntry {
  id: string;
  startedAtUtcMs: number;
}

export interface DevSimEvents {
  catalog: DevSimCatalogEntry[];
  active: DevSimActiveEntry[];
}

interface DevSimAck {
  error?: boolean;
  msg?: string;
}

export const fetchDevSimEvents = () => fetchService<DevSimEvents>('/dev/sim/events');

export const startDevSim = (id: string) =>
  postService<DevSimAck>(`/dev/sim/events/${encodeURIComponent(id)}`, {});

export const stopDevSim = (id: string) =>
  deleteService<DevSimAck>(`/dev/sim/events/${encodeURIComponent(id)}`);

export const clearDevSims = () => postService<DevSimAck>('/dev/sim/clear', {});
