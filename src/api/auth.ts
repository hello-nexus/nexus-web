// Auth token management. Calls GET /pair once to obtain the local service token,
// caches in localStorage, and exposes it for all API calls.
// Auto-re-pairs on 401 (handles service restarts that generate a new token).

import { isRemoteOrigin, resolveHttp } from './service';

const TOKEN_KEY = 'nexus_token';
const PHONE_TOKEN_KEY = 'nexus_phone_token';

let cached: string | null = null;
let pairingPromise: Promise<string> | null = null;

export async function getToken(): Promise<string> {
  if (cached) return cached;

  const stored = localStorage.getItem(TOKEN_KEY);
  if (stored) {
    cached = stored;
    return cached;
  }

  const phoneStored = localStorage.getItem(PHONE_TOKEN_KEY);
  if (phoneStored) {
    cached = phoneStored;
    localStorage.setItem(TOKEN_KEY, phoneStored);
    return cached;
  }

  return pair();
}

/** Called when a request gets 401 — clear stale token and re-pair. */
export async function handleUnauthorized(): Promise<string> {
  cached = null;
  localStorage.removeItem(TOKEN_KEY);
  const phoneStored = localStorage.getItem(PHONE_TOKEN_KEY);
  if (phoneStored) {
    cached = phoneStored;
    return cached;
  }
  return pair();
}

export function storePhoneToken(token: string): void {
  cached = token;
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(PHONE_TOKEN_KEY, token);
}

/**
 * Synchronous "do we already hold a session token?" check. True when a token is
 * cached in memory or persisted in localStorage. Used by the fetch layer to
 * decide, on a remote origin, whether the relay rid can be derived yet (no
 * token ⇒ nothing to tunnel with). Reads only — never triggers a pair.
 */
export function hasSessionToken(): boolean {
  if (cached) return true;
  if (typeof localStorage === 'undefined') return false;
  return Boolean(localStorage.getItem(TOKEN_KEY) || localStorage.getItem(PHONE_TOKEN_KEY));
}

async function pair(): Promise<string> {
  if (pairingPromise) return pairingPromise; // wait for in-progress pair
  pairingPromise = doPair();
  return pairingPromise;
}

async function doPair(): Promise<string> {
  // The local /pair mint is a LAN/desktop affordance against the service's own
  // origin. On a REMOTE origin (hellonexus.com) resolveHttp('/pair') points at
  // http://localhost — the phone, not the PC, and mixed-content-blocked. A
  // remote phone gets its token via the relay claim (storePhoneToken), never
  // here, so don't fire a doomed localhost request: report "no token".
  if (isRemoteOrigin) return '';
  try {
    const response = await fetch(resolveHttp('/pair'));
    if (response.ok) {
      const data = await response.json();
      cached = data.token;
      localStorage.setItem(TOKEN_KEY, cached!);
      return cached!;
    }
  } catch {
    // Service not reachable yet.
  } finally {
    pairingPromise = null;
  }
  return '';
}

export function clearToken(): void {
  cached = null;
  localStorage.removeItem(TOKEN_KEY);
}
