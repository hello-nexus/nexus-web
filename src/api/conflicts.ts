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

/** How a conflicting app is launched at login, when one resolved to its executable. */
export interface ConflictAutostartEntry {
  /** "runKeyUser" | "runKeyMachine" | "runKeyMachine32" | "service" */
  kind: string;
  /** Run value name or service name, shown so the user sees what is removed. */
  entryName: string;
}

export interface ConflictAutostartStatus {
  id: string;
  /** Every entry launching this app; an app can hold several at once. */
  entries: ConflictAutostartEntry[];
}

export interface GetConflictAutostartResponse {
  apps: ConflictAutostartStatus[];
}

export interface DisableConflictAutostartResponse {
  error: boolean;
  msg: string;
  /** How many entries the service removed and verified gone. */
  removed: number;
}

/**
 * Read-only: which autostart entries launch each detected conflict. Separate
 * from fetchConflicts so nothing is discovered until a user opens the modal.
 * An app with no resolvable entry comes back with an empty list and must not
 * be offered the control.
 */
export async function fetchConflictAutostart(): Promise<ConflictAutostartStatus[]> {
  const result = await fetchService<GetConflictAutostartResponse>('/conflicts/autostart');
  return result?.apps ?? [];
}

/** Removes every autostart entry for one app. Only ever called from an explicit click. */
export function disableConflictAutostart(id: string): Promise<DisableConflictAutostartResponse | null> {
  return postService<DisableConflictAutostartResponse>('/conflicts/autostart/disable', { id });
}
