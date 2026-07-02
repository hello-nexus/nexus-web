// AuthBackend adapter for the public website (hellonexus.com): talks to
// api.hellonexus.com directly, no local Nexus service involved. The browser
// is the token holder here (unlike the in-app LocalServiceBackend, where
// nexus-service holds the tokens): the access token lives in memory only
// (cleared on reload), the refresh token lives in localStorage. Every authed
// call retries exactly once after a silent refresh on a 401. A device-grant
// recovery poll (grantId + deviceSecret, generated in the browser) mirrors
// nexus-service's CloudAccountService.StartRecoveryAsync, since the browser
// has to remember its own grant across page polls instead of a server
// process holding it.

import type {
  AuthAccount, AuthAvatar, AuthBackend, AuthDeleteResponse, AuthEnvelope,
  AuthLoginResponse, AuthPasswordResponse, AuthRegisterResponse, AuthUsernameResponse,
} from './authBackend';

const DEFAULT_API = 'http://localhost:3000';
const BASE = import.meta.env.VITE_API_URL ?? DEFAULT_API;

const REFRESH_STORAGE_KEY = 'nexus_direct_refresh_token';
const RECOVERY_GRANT_STORAGE_KEY = 'nexus_direct_recovery_grant';

const ACCESS_TOKEN_LIFETIME_MS = 15 * 60 * 1000;
const REFRESH_SKEW_MS = 45 * 1000;

interface ApiPublicAccount {
  id: string;
  email: string;
  emailVerified: boolean;
  username: string;
  isPrivate: boolean;
  avatar: AuthAvatar | null;
  createdAt: string;
}

interface ApiAuthSession {
  accessToken: string;
  refreshToken: string;
  account: ApiPublicAccount;
}

interface ApiErrorBody {
  code?: string;
  message?: string | string[];
  retryAt?: string;
}

let accessToken: string | null = null;
let accessTokenExpiresAt = 0;
let cachedAccount: AuthAccount | null = null;
let refreshInFlight: Promise<string | null> | null = null;

function mapAccount(pub: ApiPublicAccount): AuthAccount {
  return {
    accountId: pub.id,
    email: pub.email,
    username: pub.username,
    avatar: pub.avatar,
    isPrivate: pub.isPrivate,
    emailVerified: pub.emailVerified,
  };
}

// Safari private-mode / a full storage quota can make localStorage throw on
// write; that must never surface as an unhandled rejection out of login()/
// refresh()/deleteAccount() and strand a caller's loading state - the
// in-memory session still works for the rest of this page load either way.
function getStoredRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_STORAGE_KEY);
  } catch {
    return null;
  }
}

function setStoredRefreshToken(token: string): void {
  try {
    localStorage.setItem(REFRESH_STORAGE_KEY, token);
  } catch {
    // storage unavailable - the in-memory access token still works for this page load
  }
}

function clearStoredRefreshToken(): void {
  try {
    localStorage.removeItem(REFRESH_STORAGE_KEY);
  } catch {
    // storage unavailable - nothing durable to clear
  }
}

// The refresh token is written before the access token is cached: a crash
// between the two lines must never leave the session with neither a usable
// access token nor the (now server-rotated) refresh token.
function applySession(session: ApiAuthSession): void {
  setStoredRefreshToken(session.refreshToken);
  accessToken = session.accessToken;
  accessTokenExpiresAt = Date.now() + ACCESS_TOKEN_LIFETIME_MS;
  cachedAccount = mapAccount(session.account);
}

function clearSession(): void {
  clearStoredRefreshToken();
  accessToken = null;
  accessTokenExpiresAt = 0;
  cachedAccount = null;
}

async function tryParseJson<T>(res: Response): Promise<T | null> {
  try {
    return await res.json() as T;
  } catch {
    return null;
  }
}

// Mirrors nexus-service's CloudApiClient.ReadErrorAsync -> CloudRoutes'
// CloudApiFailure: prefer the machine code, fall back to the raw message
// (NestJS ships a plain string for some 401/403s, no code), then a generic
// fallback. Keeps accountErrors.ts's msg-keyed mapping working unmodified
// against either backend.
async function buildErrorBody<T extends AuthEnvelope>(res: Response): Promise<T> {
  const parsed = await tryParseJson<ApiErrorBody>(res);
  const message = Array.isArray(parsed?.message) ? parsed.message[0] : parsed?.message;
  const envelope = { error: true, msg: parsed?.code ?? message ?? 'request_failed' } as T;
  if (parsed?.retryAt) (envelope as AuthUsernameResponse).retryAt = parsed.retryAt;
  return envelope;
}

// Byte length is chosen so the base64 encoding needs no padding characters.
function generateDeviceSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_');
}

async function getAccessToken(): Promise<string | null> {
  if (accessToken && Date.now() < accessTokenExpiresAt - REFRESH_SKEW_MS) return accessToken;
  return refreshAccessToken();
}

function refreshAccessToken(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = doRefresh().finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
}

async function doRefresh(): Promise<string | null> {
  const stored = getStoredRefreshToken();
  if (!stored) return null;
  try {
    const res = await fetch(`${BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: stored }),
    });
    if (!res.ok) {
      // A definitive rejection (reuse-detected or expired) means this refresh
      // token is dead server-side; a 5xx/network blip is not - keep the
      // stored token so a later retry can still use it.
      if (res.status === 401 || res.status === 403) clearSession();
      return null;
    }
    const session = await tryParseJson<ApiAuthSession>(res);
    if (!session) return null;
    applySession(session);
    return accessToken;
  } catch {
    return null;
  }
}

type AuthedBody = { json: unknown } | { form: FormData } | undefined;

async function authedRequest(path: string, method: string, body?: AuthedBody): Promise<Response | null> {
  const attempt = async (token: string): Promise<Response> => {
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    let payload: BodyInit | undefined;
    if (body && 'json' in body) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body.json);
    } else if (body && 'form' in body) {
      payload = body.form;
    }
    return fetch(`${BASE}${path}`, { method, headers, body: payload });
  };
  try {
    const token = await getAccessToken();
    if (!token) return null;
    let res = await attempt(token);
    if (res.status === 401) {
      const refreshed = await refreshAccessToken();
      if (refreshed) res = await attempt(refreshed);
    }
    return res;
  } catch {
    return null;
  }
}

async function toEnvelopeResult<T extends AuthEnvelope>(res: Response | null): Promise<{ status: number; body: T | null }> {
  if (!res) return { status: 0, body: null };
  if (res.ok) {
    const body = await tryParseJson<T>(res);
    return { status: res.status, body: body ?? ({ error: false } as T) };
  }
  return { status: res.status, body: await buildErrorBody<T>(res) };
}

export const directApiBackend: AuthBackend = {
  login: async (identifier, password) => {
    let res: Response;
    try {
      res = await fetch(`${BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password }),
      });
    } catch {
      return { status: 0, body: null };
    }
    if (res.ok) {
      const session = await tryParseJson<ApiAuthSession>(res);
      if (!session) return { status: res.status, body: null };
      applySession(session);
      return { status: res.status, body: { error: false, ...mapAccount(session.account) } };
    }
    return { status: res.status, body: await buildErrorBody<AuthLoginResponse>(res) };
  },

  register: async (email, password, username) => {
    let res: Response;
    try {
      res = await fetch(`${BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, username }),
      });
    } catch {
      return { status: 0, body: null };
    }
    if (res.ok) return { status: res.status, body: { error: false } };
    return { status: res.status, body: await buildErrorBody<AuthRegisterResponse>(res) };
  },

  logout: async () => {
    const stored = getStoredRefreshToken();
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
      await fetch(`${BASE}/auth/logout`, {
        method: 'POST',
        headers,
        body: JSON.stringify(stored ? { refreshToken: stored } : {}),
      });
    } catch {
      // best-effort: the local session clears below regardless
    }
    clearSession();
  },

  getAccount: async () => {
    const res = await authedRequest('/account/me', 'GET');
    if (!res?.ok) return null;
    const account = await tryParseJson<ApiPublicAccount>(res);
    if (!account) return null;
    cachedAccount = mapAccount(account);
    return cachedAccount;
  },

  recoveryStart: async (email) => {
    const grantId = crypto.randomUUID();
    const deviceSecret = generateDeviceSecret();
    try {
      const res = await fetch(`${BASE}/auth/recovery/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, grantId, deviceSecret }),
      });
      if (!res.ok) return null;
    } catch {
      return null;
    }
    sessionStorage.setItem(RECOVERY_GRANT_STORAGE_KEY, JSON.stringify({ grantId, deviceSecret }));
    return { grantId };
  },

  recoveryStatus: async () => {
    const stored = sessionStorage.getItem(RECOVERY_GRANT_STORAGE_KEY);
    if (!stored) return null;
    let grant: { grantId: string; deviceSecret: string };
    try {
      grant = JSON.parse(stored) as { grantId: string; deviceSecret: string };
    } catch {
      sessionStorage.removeItem(RECOVERY_GRANT_STORAGE_KEY);
      return null;
    }
    let res: Response;
    try {
      res = await fetch(`${BASE}/auth/recovery/poll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(grant),
      });
    } catch {
      return null;
    }
    if (!res.ok) {
      sessionStorage.removeItem(RECOVERY_GRANT_STORAGE_KEY);
      return { status: 'expired' };
    }
    const data = await tryParseJson<{
      status: 'pending' | 'expired' | 'approved';
      accessToken?: string;
      refreshToken?: string;
      account?: ApiPublicAccount;
    }>(res);
    if (!data) return null;
    if (data.status === 'approved' && data.accessToken && data.refreshToken && data.account) {
      applySession({ accessToken: data.accessToken, refreshToken: data.refreshToken, account: data.account });
      sessionStorage.removeItem(RECOVERY_GRANT_STORAGE_KEY);
      return { status: 'approved' };
    }
    if (data.status === 'expired') sessionStorage.removeItem(RECOVERY_GRANT_STORAGE_KEY);
    return { status: data.status };
  },

  changePassword: async (currentPassword, newPassword) => {
    const res = await authedRequest('/account/password', 'POST', { json: { currentPassword, newPassword } });
    return toEnvelopeResult<AuthPasswordResponse>(res);
  },

  changeUsername: async (username) => {
    const res = await authedRequest('/account/username', 'POST', { json: { username } });
    if (res?.ok) {
      const account = await tryParseJson<ApiPublicAccount>(res);
      if (account) cachedAccount = mapAccount(account);
    }
    return toEnvelopeResult<AuthUsernameResponse>(res);
  },

  setPrivate: async (isPrivate) => {
    const res = await authedRequest('/account', 'PATCH', { json: { isPrivate } });
    if (res?.ok) {
      const account = await tryParseJson<ApiPublicAccount>(res);
      if (account) cachedAccount = mapAccount(account);
    }
    return Boolean(res?.ok);
  },

  deleteAccount: async (currentPassword) => {
    const res = await authedRequest('/account', 'DELETE', { json: { currentPassword } });
    const result = await toEnvelopeResult<AuthDeleteResponse>(res);
    if (result.status >= 200 && result.status < 300) clearSession();
    return result;
  },

  uploadAvatar: async (blob) => {
    const form = new FormData();
    form.append('file', blob, 'avatar.png');
    const res = await authedRequest('/account/avatar', 'POST', { form });
    if (!res?.ok) return null;
    const avatar = await tryParseJson<AuthAvatar>(res);
    if (avatar && cachedAccount) cachedAccount = { ...cachedAccount, avatar };
    return avatar;
  },
};
