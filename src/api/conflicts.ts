import { fetchService, postService } from './service';

/**
 * Single competing third-party app currently running on the host. The service
 * publishes the full current list on the multiplex topic `conflicts` and via
 * GET /conflicts; the sidebar warning surfaces it and lets the user end the
 * offending process directly. Shape mirrors `Models.Conflicts.DetectedConflict`.
 */
export interface DetectedConflict {
  id: string;
  displayName: string;
  /** "lighting" | "cooling" | "peripherals" | "monitoring" */
  category: string;
  processName: string;
  pid: number;
}

// Catalog id of the HYTE Nexus 2 conflict; must match the Id in
// nexus-service's ConflictAppDefinitions.cs.
export const HYTE_NEXUS2_CONFLICT_ID = 'hyte-nexus-2';

export interface GetConflictsResponse {
  conflicts: DetectedConflict[];
}

/**
 * WebSocket push frame shape. Same payload as GET /conflicts. The watcher
 * only rebroadcasts when the set of detected ids changes, so receivers
 * should overwrite their cached list rather than diff.
 */
export interface ConflictsFrame {
  conflicts: DetectedConflict[];
}

export interface KillConflictResponse {
  error: boolean;
  msg: string;
  killed: boolean;
}

/** Null when the read failed; an empty array means the service reported none. */
export async function fetchConflicts(): Promise<DetectedConflict[] | null> {
  const result = await fetchService<GetConflictsResponse>('/conflicts');
  return result ? result.conflicts ?? [] : null;
}

export function killConflict(id: string): Promise<KillConflictResponse | null> {
  return postService<KillConflictResponse>('/conflicts/kill', { id });
}

/**
 * One entry of the service's static conflict catalog - every app Nexus knows
 * how to shut down, running or not. Shape mirrors
 * `Models.Conflicts.ConflictCatalogApp`; process names stay server-side.
 */
export interface ConflictCatalogApp {
  id: string;
  displayName: string;
  /** "lighting" | "cooling" | "peripherals" | "monitoring" */
  category: string;
}

export interface GetConflictCatalogResponse {
  apps: ConflictCatalogApp[];
}

/** Null when the read failed; an empty array means the service reported none. */
export async function fetchConflictCatalog(): Promise<ConflictCatalogApp[] | null> {
  const result = await fetchService<GetConflictCatalogResponse>('/conflicts/catalog');
  return result ? result.apps ?? [] : null;
}
