import { getToken, handleUnauthorized } from './auth';
import { fetchService, patchService, postService, resolveHttp } from './service';

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

export type SyncState = 'idle' | 'syncing' | 'dirty' | 'offline' | 'error';

export interface SyncConflict {
  profileId: string;
  name: string;
  localUpdatedAt: string;
  cloudRevision: number;
  cloudUpdatedAt: string;
  cloudName: string;
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

// Raw cropped image bytes as the body, mirroring profiles.ts's exportProfile/
// importProfileFile hand-rolled fetch (no relay tunneling - desktop-only).
export async function uploadCloudAvatar(blob: Blob): Promise<CloudAvatar | null> {
  try {
    const token = await getToken();
    const headers: Record<string, string> = { 'Content-Type': blob.type || 'image/png' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const resp = await fetch(resolveHttp('/cloud/avatar'), { method: 'POST', headers, body: blob });
    if (!resp.ok) return null;
    const data = (await resp.json()) as { avatar: CloudAvatar };
    return data.avatar ?? null;
  } catch {
    return null;
  }
}

export const fetchCloudSyncStatus = () =>
  fetchService<SyncStatus>('/cloud/sync/status');

export const syncCloudNow = () =>
  postService('/cloud/sync/now', {});

export const resolveCloudSyncConflict = (profileId: string, choice: 'local' | 'cloud') =>
  postService('/cloud/sync/resolve', { profileId, choice });
