import { getToken, handleUnauthorized } from './auth';
import { fetchService, loopbackFetchInit, patchService, postService, resolveHttp } from './service';
import type { GameLeaderboardEntry, GameType } from '../types/games';

export interface CloudAvatar {
  large: string;
  small: string;
}

export interface CloudAccountSummary {
  accountId: string;
  email: string;
  username: string;
  avatar: CloudAvatar | null;
  isPrivate: boolean;
  emailVerified: boolean;
}

export interface GetAccountsResponse {
  accounts: CloudAccountSummary[];
  activeAccountId: string | null;
}

// Every /cloud/* body carries the standard { error, msg } envelope; msg holds a
// machine code (invalid_credentials, email_unverified, ...) on failure, not
// user-facing copy - callers map it through accountErrors.ts, never render it.
export interface CloudEnvelope {
  error?: boolean;
  msg?: string;
}

export type CloudLoginResponse = CloudEnvelope & Partial<CloudAccountSummary>;
export type CloudRegisterResponse = CloudEnvelope;
export type CloudPasswordResponse = CloudEnvelope;
export type CloudDeleteResponse = CloudEnvelope;

export interface CloudUsernameResponse extends CloudEnvelope {
  retryAt?: string;
}

export interface RecoveryStartResponse {
  grantId: string;
}

export type RecoveryStatusValue = 'idle' | 'pending' | 'approved' | 'expired';

export interface RecoveryStatusResponse {
  status: RecoveryStatusValue;
}

export interface CloudDeviceItem {
  installId: string;
  hostname: string;
  specs: Record<string, string>;
  manual: boolean;
  lastSeenAt: string;
}

export type CloudDeviceUpsertResponse = CloudEnvelope & Partial<CloudDeviceItem>;

export type SyncState = 'idle' | 'syncing' | 'dirty' | 'offline' | 'error';

export interface SyncConflict {
  profileId: string;
  name: string;
  localUpdatedAt: string;
  /** Machine holding the local copy, so the comparison names a computer instead of a GUID. */
  localHostname: string;
  cloudRevision: number;
  cloudUpdatedAt: string;
  cloudName: string;
  /** Machine that wrote the cloud copy; "" when it cannot be named, and the UI falls back to the id. */
  cloudHostname: string;
  updatedByInstallId: string;
}

// lastSyncedAt is "" (never populated by ISO string) rather than null - the
// service ships an empty string for a profile that has not synced yet.
export interface SyncProfileStatus {
  profileId: string;
  name: string;
  lastSyncedAt: string;
  revision: number;
}

export interface SyncStatus {
  state: SyncState;
  lastSyncAt: string | null;
  conflicts: SyncConflict[];
  profiles: SyncProfileStatus[];
}

export interface CloudFetchResult<T> {
  status: number;
  body: T | null;
}

// Status-preserving fetch for the handful of /cloud/* calls whose non-2xx body
// carries a machine error code the caller must branch on (login, register,
// username, password, delete). authFetch/postService collapse any non-2xx to
// null, discarding that body - unusable here. Mirrors panel.ts's
// *WithStatus helpers: same token-attach + 401-retry, but never collapses the
// response. No relay-tunnel handling - account management is desktop-only.
async function cloudFetch<T>(path: string, method: string, payload?: unknown): Promise<CloudFetchResult<T>> {
  try {
    let token = await getToken();
    const url = resolveHttp(path);
    const buildInit = (): RequestInit => {
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      if (payload !== undefined) headers['Content-Type'] = 'application/json';
      return {
        ...loopbackFetchInit,
        method,
        headers,
        body: payload !== undefined ? JSON.stringify(payload) : undefined,
      };
    };
    let res = await fetch(url, buildInit());
    if (res.status === 401) {
      const refreshed = await handleUnauthorized();
      if (refreshed) {
        token = refreshed;
        res = await fetch(url, buildInit());
      }
    }
    let body: T | null = null;
    try { body = (await res.json()) as T; } catch { body = null; }
    return { status: res.status, body };
  } catch {
    return { status: 0, body: null };
  }
}

export const fetchCloudAccounts = () =>
  fetchService<GetAccountsResponse>('/cloud/accounts');

export const cloudRegister = (email: string, password: string, username: string) =>
  cloudFetch<CloudRegisterResponse>('/cloud/register', 'POST', { email, password, username });

export const cloudLogin = (identifier: string, password: string) =>
  cloudFetch<CloudLoginResponse>('/cloud/login', 'POST', { identifier, password });

export const cloudLogout = (accountId: string) =>
  postService('/cloud/logout', { accountId });

export const startCloudRecovery = (email: string) =>
  postService<RecoveryStartResponse>('/cloud/recovery/start', { email });

export const fetchCloudRecoveryStatus = () =>
  fetchService<RecoveryStatusResponse>('/cloud/recovery/status');

export const changeCloudPassword = (currentPassword: string | undefined, newPassword: string) =>
  cloudFetch<CloudPasswordResponse>('/cloud/password', 'POST', { currentPassword, newPassword });

export const changeCloudUsername = (username: string) =>
  cloudFetch<CloudUsernameResponse>('/cloud/username', 'POST', { username });

export const setCloudAccountPrivate = (isPrivate: boolean) =>
  patchService('/cloud/account', { isPrivate });

export const deleteCloudAccount = (currentPassword?: string) =>
  cloudFetch<CloudDeleteResponse>('/cloud/account', 'DELETE', { currentPassword });

export const fetchCloudDevices = () =>
  fetchService<CloudDeviceItem[]>('/cloud/account/devices');

export const upsertCloudDevice = (installId: string, patch: { hostname: string; specs: Record<string, string>; manual?: boolean }) =>
  cloudFetch<CloudDeviceUpsertResponse>(`/cloud/account/devices/${encodeURIComponent(installId)}`, 'PUT', patch);

// The upstream DELETE responds 204 with no body; cloudFetch's json parse
// already swallows that (body -> null), so the caller only needs the status.
export const deleteCloudDevice = (installId: string) =>
  cloudFetch<CloudEnvelope>(`/cloud/account/devices/${encodeURIComponent(installId)}`, 'DELETE');

// Raw cropped image bytes as the body, mirroring profiles.ts's exportProfile/
// importProfileFile hand-rolled fetch (no relay tunneling - desktop-only).
export async function uploadCloudAvatar(blob: Blob): Promise<CloudAvatar | null> {
  try {
    const token = await getToken();
    const headers: Record<string, string> = { 'Content-Type': blob.type || 'image/png' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const resp = await fetch(resolveHttp('/cloud/avatar'), { ...loopbackFetchInit, method: 'POST', headers, body: blob });
    if (!resp.ok) return null;
    const data = (await resp.json()) as { avatar: CloudAvatar };
    return data.avatar ?? null;
  } catch {
    return null;
  }
}

export interface CloudBenchmarkSubmitBody {
  deviceId: string;
  cpuModel?: string;
  gpuModels?: string[];
  cpuScore: number;
  gpuScore: number;
  ramScore: number;
  storageScore: number;
  composite: number;
  rawMetrics: Record<string, unknown>;
  clientVersion?: string;
  cpuRaw?: number;
  cpuUnit?: string;
  gpuRaw?: number;
  gpuUnit?: string;
  ramRaw?: number;
  ramUnit?: string;
  storageRaw?: number;
  storageUnit?: string;
  scoringVersion?: string;
  ramModel?: string;
  storageModel?: string;
  os?: string;
  logicalCores?: number;
  benchTools?: Record<string, string>;
}

export interface CloudBenchmarkSubmitResponse {
  id: string;
  composite: number;
  percentile: number;
  totalSubmissions: number;
  rank: number;
}

// Forwards to api.hellonexus.com/benchmarks/submit with the active cloud
// account's bearer attached server-side (or anonymously when signed out),
// so a signed-in run links to the account without the browser ever holding
// a cloud token. Returns the upstream response verbatim; a forwarding or
// upstream failure collapses to null like every other postService call.
export const submitCloudBenchmark = (payload: CloudBenchmarkSubmitBody) =>
  postService<CloudBenchmarkSubmitResponse>('/cloud/benchmarks/submit', payload);

export interface CloudGameScoreSubmitBody {
  gameType: GameType;
  score: number;
  durationMs: number;
  // The nexus-api game_score entity's anonymous subject key (getDeviceId()'s
  // browser-local id) - named to match that column, NOT the same value as
  // CloudDeviceItem.installId above (the account's registered device id).
  installId: string;
}

export interface CloudGameScoreSubmitResponse {
  best: number;
  // null when the caller's row is per-source capped or beyond the rank scan
  // window server-side; the wire really sends null, not an omitted field.
  rank: number | null;
  total: number;
  entries: GameLeaderboardEntry[];
}

// Forwards to api.hellonexus.com/games/scores with the active cloud account's
// bearer attached server-side (or anonymously when signed out), mirroring
// submitCloudBenchmark. The top board comes back in the same response so a
// game-over screen needs one call.
export const submitGameScore = (payload: CloudGameScoreSubmitBody) =>
  postService<CloudGameScoreSubmitResponse>('/cloud/games/scores', payload);

export const fetchCloudSyncStatus = () =>
  fetchService<SyncStatus>('/cloud/sync/status');

export const syncCloudNow = () =>
  postService('/cloud/sync/now', {});

export const resolveCloudSyncConflict = (profileId: string, choice: 'local' | 'cloud') =>
  postService('/cloud/sync/resolve', { profileId, choice });

// ── cross-machine profile library ──────────────────────────────────────────
// Profiles are a per-machine backup, so nothing crosses between machines
// automatically. These three calls are the explicit path: list what every
// machine has, look inside one of its profiles, then overwrite the chosen
// categories of a local profile from it.

export interface CloudLibraryProfile {
  profileId: string;
  name: string;
  revision: number;
  sizeBytes: number;
  updatedAt: string;
}

export interface CloudLibraryMachine {
  installId: string;
  /** "" when the machine never registered a device record; the UI falls back to the id. */
  hostname: string;
  isThisMachine: boolean;
  lastSeenAt: string;
  profiles: CloudLibraryProfile[];
}

export interface CloudLibrary {
  machines: CloudLibraryMachine[];
}

export const fetchCloudLibrary = () =>
  fetchService<CloudLibrary>('/cloud/profiles/library');

/** Copies another machine's profile in as a NEW local profile; nothing existing is overwritten. */
export const importCloudProfile = (installId: string, profileId: string) =>
  postService<{ error?: boolean; msg?: string }>('/cloud/profiles/import', { installId, profileId });
