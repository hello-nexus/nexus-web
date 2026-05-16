// Thin client for the local Qos service (qos-service).
// Override host/port via Vite env vars VITE_SERVICE_HOST / VITE_SERVICE_PORT.
// All authenticated calls include the Bearer token obtained via /pair.

import { getToken, handleUnauthorized } from './auth';

const DEFAULT_SERVICE_PORT = '9400';
const DEFAULT_HTTPS_PORT = '9443';
const SERVICE_PORT = import.meta.env.VITE_SERVICE_PORT || DEFAULT_SERVICE_PORT;

const locationHost = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
const locationPort = typeof window !== 'undefined' ? window.location.port : '';
const locationProtocol = typeof window !== 'undefined' ? window.location.protocol : 'http:';
const isServedFromService = locationPort === DEFAULT_SERVICE_PORT || locationPort === DEFAULT_HTTPS_PORT;

// If the SPA is served from the service itself, keep the same origin/protocol.
// If served from Vite or nexusqos.com, fall back to the local HTTP service.
const SERVICE_PROTOCOL = import.meta.env.VITE_SERVICE_PROTOCOL
  || (isServedFromService ? locationProtocol : 'http:');
const SERVICE_HOST = import.meta.env.VITE_SERVICE_HOST
  || (isServedFromService ? locationHost : 'localhost');
const endpointPort = import.meta.env.VITE_SERVICE_PORT
  || (isServedFromService ? locationPort : SERVICE_PORT);
const endpoint = endpointPort ? `${SERVICE_HOST}:${endpointPort}` : SERVICE_HOST;

export function resolveHttp(path: string): string {
  return `${SERVICE_PROTOCOL}//${endpoint}${path}`;
}

export function resolveWs(path: string): string {
  return `${SERVICE_PROTOCOL === 'https:' ? 'wss' : 'ws'}://${endpoint}${path}`;
}

/** Resolve a WS URL with the auth token as a query parameter. */
export async function resolveAuthWs(path: string): Promise<string> {
  const token = await getToken();
  const sep = path.includes('?') ? '&' : '?';
  return `${SERVICE_PROTOCOL === 'https:' ? 'wss' : 'ws'}://${endpoint}${path}${sep}token=${encodeURIComponent(token)}`;
}

export interface PingResponse {
  service: string;
  version: string;
  initialized: boolean;
  platform?: 'macos' | 'windows' | 'linux' | '';
  machineName?: string;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
  cache?: RequestCache;
}

async function authFetch(path: string, opts: RequestOptions = {}): Promise<Response | null> {
  try {
    const token = await getToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

    const init: RequestInit = {
      method: opts.method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
      cache: opts.cache,
    };

    let response = await fetch(resolveHttp(path), init);

    if (response.status === 401) {
      const newToken = await handleUnauthorized();
      if (newToken) {
        headers['Authorization'] = `Bearer ${newToken}`;
        response = await fetch(resolveHttp(path), init);
      }
    }

    if (!response.ok) return null;
    return response;
  } catch {
    return null;
  }
}

export async function fetchService<T>(path: string): Promise<T | null> {
  const r = await authFetch(path, { cache: 'no-store' });
  return r ? (await r.json()) as T : null;
}

export async function postService<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T | null> {
  const r = await authFetch(path, { method: 'POST', body, signal });
  return r ? (await r.json()) as T : null;
}

export async function putService<T>(path: string, body: unknown): Promise<T | null> {
  const r = await authFetch(path, { method: 'PUT', body });
  return r ? (await r.json()) as T : null;
}

export async function deleteService<T>(path: string): Promise<T | null> {
  const r = await authFetch(path, { method: 'DELETE' });
  return r ? (await r.json()) as T : null;
}

export async function patchService<T>(path: string, body: unknown): Promise<T | null> {
  const r = await authFetch(path, { method: 'PATCH', body });
  return r ? (await r.json()) as T : null;
}

export async function postServiceForm<T>(path: string, form: FormData): Promise<T | null> {
  try {
    const token = await getToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    let response = await fetch(resolveHttp(path), { method: 'POST', headers, body: form });
    if (response.status === 401) {
      const newToken = await handleUnauthorized();
      if (newToken) {
        headers['Authorization'] = `Bearer ${newToken}`;
        response = await fetch(resolveHttp(path), { method: 'POST', headers, body: form });
      }
    }
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export async function fetchServiceBlob(path: string): Promise<Blob | null> {
  // No explicit cache directive: respect the server's Cache-Control header.
  // Effect thumbnails + app icons are static-per-key bytes; the routes that
  // care set Cache-Control accordingly. Forcing no-store here would void any
  // server cache hint and refetch on every mount.
  const r = await authFetch(path);
  return r ? await r.blob() : null;
}

/** Ping is public - no token needed. */
export async function pingService(): Promise<PingResponse | null> {
  try {
    const response = await fetch(resolveHttp('/ping'));
    if (!response.ok) return null;
    return (await response.json()) as PingResponse;
  } catch {
    return null;
  }
}
