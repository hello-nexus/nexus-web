// AuthBackend adapter for the public website (hellonexus.com): talks to
// api.hellonexus.com directly, no local Nexus service involved. The browser
// is the token holder here (unlike the in-app LocalServiceBackend, where
// nexus-service holds the tokens): the access token always lives in memory
// only (cleared on reload). On a hosted-web origin (isWebCookieMode - the
// hellonexus.com domain tree, plus its local dev-server equivalent) the
// refresh token lives in a HttpOnly cookie the server sets and reads - it
// never reaches JS, so localStorage stays untouched; every such request
// carries the X-Nexus-Auth: web header + credentials:'include'. Every other
// origin (the embedded desktop SPA, a paired-phone LAN host) keeps the
// refresh token in localStorage, the original body-token flow, byte for
// byte. Every authed call retries exactly once after a silent refresh on a
// 401. A device-grant recovery poll (grantId + deviceSecret, generated in the
// browser) mirrors nexus-service's CloudAccountService.StartRecoveryAsync,
// since the browser has to remember its own grant across page polls instead
// of a server process holding it.

import type {
  AccountDeviceItem, AuthAccount, AuthAvatar, AuthBackend, AuthDeleteResponse, AuthDeviceUpsertResponse, AuthEnvelope,
  AuthLoginResponse, AuthPasswordResponse, AuthRegisterResponse, AuthUsernameResponse,
} from './authBackend';

const DEFAULT_API = 'https://api.hellonexus.com';
const BASE = import.meta.env.VITE_API_URL ?? DEFAULT_API;

const REFRESH_STORAGE_KEY = 'nexus_direct_refresh_token';
const RECOVERY_GRANT_STORAGE_KEY = 'nexus_direct_recovery_grant';

const ACCESS_TOKEN_LIFETIME_MS = 15 * 60 * 1000;
const REFRESH_SKEW_MS = 45 * 1000;

// nexus-api's CORS allow-list (STATIC_ORIGINS in main.ts) is the actual
// security boundary; this only decides which client-side flow to use, so it
// mirrors that list's dev entry. hellonexus.com and every subdomain (incl.
// my.) opt in; anything else - the embedded desktop SPA on :9400/:9443, a
// paired-phone LAN host, an unlisted dev port - stays on the body-token flow.
const WEB_COOKIE_DEV_HOSTNAME = 'localhost';
const WEB_COOKIE_DEV_PORT = '5173';

/** True when this page should use the cross-origin cookie session instead of a body-carried refresh token. */
export function isWebCookieMode(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname.toLowerCase();
  if (host === 'hellonexus.com' || host.endsWith('.hellonexus.com')) return true;
  return host === WEB_COOKIE_DEV_HOSTNAME && window.location.port === WEB_COOKIE_DEV_PORT;
}

// The custom header forces a CORS preflight, so it is only ever attached in
// cookie mode - everywhere else the request stays a CORS-simple request.
function authHeaders(cookieMode: boolean, base: Record<string, string>): Record<string, string> {
  return cookieMode ? { ...base, 'X-Nexus-Auth': 'web' } : base;
}

function fetchCredentials(cookieMode: boolean): RequestCredentials | undefined {
  return cookieMode ? 'include' : undefined;
}

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
  // Web-flagged (cookie-mode) responses omit this - the session cookie
  // carries it instead.
  refreshToken?: string;
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

function clearStoredRecoveryGrant(): void {
  try {
    sessionStorage.removeItem(RECOVERY_GRANT_STORAGE_KEY);
  } catch {
    // storage unavailable - nothing durable to clear
  }
}

// The refresh token is written before the access token is cached: a crash
// between the two lines must never leave the session with neither a usable
// access token nor the (now server-rotated) refresh token. cookieMode gates
// the write explicitly - the token must never reach localStorage on a
// hosted-web origin, even if a future server response shape were to carry
// one unexpectedly.
function applySession(session: ApiAuthSession, cookieMode: boolean): void {
  if (!cookieMode && session.refreshToken) setStoredRefreshToken(session.refreshToken);
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

// Body flow (cookieMode false): needs a stored token, sends it in the body,
// gets a rotated one back - unchanged from before cookie mode existed.
// Cookie flow: the session cookie is HttpOnly, so JS can't check for one
// first - every call here doubles as the bootstrap-on-load probe. A stored
// legacy token (a pre-cookie-mode session's localStorage copy) rides the
// body of that SAME call for a one-time migration: the server validates it
// like a normal body refresh, sets the cookie on success, and the body is
// cleared below so every later cookie-mode call is a bare cookie bootstrap.
async function doRefresh(): Promise<string | null> {
  const cookieMode = isWebCookieMode();
  const legacy = getStoredRefreshToken();
  if (!cookieMode && !legacy) return null;
  try {
    const res = await fetch(`${BASE}/auth/refresh`, {
      method: 'POST',
      headers: authHeaders(cookieMode, { 'Content-Type': 'application/json' }),
      credentials: fetchCredentials(cookieMode),
      body: JSON.stringify(legacy ? { refreshToken: legacy } : {}),
    });
    if (!res.ok) {
      // A definitive rejection means the token (migration) or cookie
      // (bootstrap) this call carried is not a live session; a 5xx/network
      // blip is not, so a still-unmigrated legacy token survives for a
      // later retry.
      if (res.status === 401 || res.status === 403) clearSession();
      return null;
    }
    const session = await tryParseJson<ApiAuthSession>(res);
    if (!session) return null;
    applySession(session, cookieMode);
    if (cookieMode && legacy) clearStoredRefreshToken();
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

/** The last-known signed-in account (from login/refresh/recovery), or null. Read by the public pages' post-auth redirect without an extra round trip. */
export function getCachedAccount(): AuthAccount | null {
  return cachedAccount;
}

export const directApiBackend: AuthBackend = {
  login: async (identifier, password) => {
    const cookieMode = isWebCookieMode();
    let res: Response;
    try {
      res = await fetch(`${BASE}/auth/login`, {
        method: 'POST',
        headers: authHeaders(cookieMode, { 'Content-Type': 'application/json' }),
        credentials: fetchCredentials(cookieMode),
        body: JSON.stringify({ identifier, password }),
      });
    } catch {
      return { status: 0, body: null };
    }
    if (res.ok) {
      const session = await tryParseJson<ApiAuthSession>(res);
      if (!session) return { status: res.status, body: null };
      applySession(session, cookieMode);
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
    const cookieMode = isWebCookieMode();
    const stored = getStoredRefreshToken();
    try {
      const headers = authHeaders(cookieMode, { 'Content-Type': 'application/json' });
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
      await fetch(`${BASE}/auth/logout`, {
        method: 'POST',
        headers,
        credentials: fetchCredentials(cookieMode),
        // Cookie mode never sends a body token - the server reads (and
        // clears) the session cookie itself.
        body: JSON.stringify(!cookieMode && stored ? { refreshToken: stored } : {}),
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
    let code: string | undefined;
    try {
      const res = await fetch(`${BASE}/auth/recovery/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, grantId, deviceSecret, wantsCode: true }),
      });
      if (!res.ok) return null;
      // An api that predates the code omits it; the flow then runs without
      // one rather than blocking on a field that will never arrive.
      code = (await tryParseJson<{ code?: string }>(res))?.code;
    } catch {
      return null;
    }
    sessionStorage.setItem(RECOVERY_GRANT_STORAGE_KEY, JSON.stringify({ grantId, deviceSecret }));
    return { grantId, code };
  },

  recoveryCancel: () => clearStoredRecoveryGrant(),

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
    const cookieMode = isWebCookieMode();
    let res: Response;
    try {
      res = await fetch(`${BASE}/auth/recovery/poll`, {
        method: 'POST',
        headers: authHeaders(cookieMode, { 'Content-Type': 'application/json' }),
        credentials: fetchCredentials(cookieMode),
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
    // A cookie-mode (web-flagged) approval omits refreshToken - the cookie
    // carries it instead, same as login/refresh; the body flow still
    // requires one, so a malformed body-flow response doesn't report a
    // signed-in state with nothing durable behind it.
    if (data.status === 'approved' && data.accessToken && data.account && (cookieMode || data.refreshToken)) {
      applySession({ accessToken: data.accessToken, refreshToken: data.refreshToken, account: data.account }, cookieMode);
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

  listDevices: async () => {
    const res = await authedRequest('/account/devices', 'GET');
    if (!res?.ok) return null;
    return await tryParseJson<AccountDeviceItem[]>(res);
  },

  upsertDevice: async (installId, patch) => {
    const res = await authedRequest(`/account/devices/${encodeURIComponent(installId)}`, 'PUT', { json: patch });
    return toEnvelopeResult<AuthDeviceUpsertResponse>(res);
  },

  deleteDevice: async (installId) => {
    const res = await authedRequest(`/account/devices/${encodeURIComponent(installId)}`, 'DELETE');
    return Boolean(res?.ok);
  },
};
