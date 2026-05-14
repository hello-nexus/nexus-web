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

export async function fetchConflicts(): Promise<DetectedConflict[]> {
  const result = await fetchService<GetConflictsResponse>('/conflicts');
  return result?.conflicts ?? [];
}

export function killConflict(id: string): Promise<KillConflictResponse | null> {
  return postService<KillConflictResponse>('/conflicts/kill', { id });
}
