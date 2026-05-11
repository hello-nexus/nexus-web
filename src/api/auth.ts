// Auth token management. Calls GET /pair once to obtain the local service token,
// caches in localStorage, and exposes it for all API calls.
// Auto-re-pairs on 401 (handles service restarts that generate a new token).

import { resolveHttp } from './service';

const TOKEN_KEY = 'qos_token';
const PHONE_TOKEN_KEY = 'qos_phone_token';

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

async function pair(): Promise<string> {
  if (pairingPromise) return pairingPromise; // wait for in-progress pair
  pairingPromise = doPair();
  return pairingPromise;
}

async function doPair(): Promise<string> {
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
