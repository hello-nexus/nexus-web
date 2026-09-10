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

// Catalog id of the Lian Li L-Connect conflict; same file, and the app the
// service's DeviceControlPolicy maps every Lian Li handler to.
export const L_CONNECT_CONFLICT_ID = 'lian-li-l-connect';

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

/**
 * One thing still launching a conflicting app at boot - a Run-key entry or an
 * Automatic Windows service. Shape mirrors
 * `Models.Conflicts.ConflictAutostartEntry`; the registry path and service
 * name stay server-side, and the SPA only ever addresses an app by catalog id.
 */
export interface ConflictAutostartEntry {
  /** "runKeyMachine" | "runKeyUser" | "service" | "scheduledTask" */
  kind: string;
  entryName: string;
}

/**
 * Autostart state of one detected app. Only apps whose mechanism the service
 * has a verified recipe for are listed at all, so an app missing from the
 * response is one the UI must not offer the action for. An empty `entries`
 * means the app is listed but nothing currently starts it at boot.
 */
export interface ConflictAutostartStatus {
  id: string;
  entries: ConflictAutostartEntry[];
}

export interface GetConflictAutostartResponse {
  apps: ConflictAutostartStatus[];
}

export interface DisableConflictAutostartResponse {
  error: boolean;
  msg: string;
  disabled: number;
}

/** Null when the read failed; an empty array means no detected app supports the action. */
export async function fetchConflictAutostart(): Promise<ConflictAutostartStatus[] | null> {
  const result = await fetchService<GetConflictAutostartResponse>('/conflicts/autostart');
  return result ? result.apps ?? [] : null;
}

export function disableConflictAutostart(id: string): Promise<DisableConflictAutostartResponse | null> {
  return postService<DisableConflictAutostartResponse>('/conflicts/autostart/disable', { id });
}

/**
 * Windows' own Dynamic Lighting settings - the one conflicting "app" that
 * ships with the OS, driving the same HID LampArray devices as Nexus. Shape
 * mirrors `Models.Conflicts.WindowsDynamicLightingState`. `available` is false
 * off Windows and whenever the service could not read the console user's
 * Lighting key, in which case every other field is meaningless.
 */
export interface WindowsDynamicLightingState {
  available: boolean;
  enabled: boolean;
  foregroundAppControl: boolean;
  deviceCount: number;
  devicesEnabled: number;
}

/** A field left out is not written; the response is the state re-read afterwards. */
export interface SetWindowsDynamicLightingBody {
  enabled?: boolean;
  foregroundAppControl?: boolean;
  deviceLighting?: boolean;
}

/** Null when the read failed - distinct from an `available: false` state the service reported. */
export function fetchDynamicLighting(): Promise<WindowsDynamicLightingState | null> {
  return fetchService<WindowsDynamicLightingState>('/conflicts/dynamic-lighting');
}

export function setDynamicLighting(body: SetWindowsDynamicLightingBody): Promise<WindowsDynamicLightingState | null> {
  return postService<WindowsDynamicLightingState>('/conflicts/dynamic-lighting', body);
}
