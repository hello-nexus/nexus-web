// Thin client for the local Nexus service (nexus-service).
// Override host/port via Vite env vars VITE_SERVICE_HOST / VITE_SERVICE_PORT.
// All authenticated calls include the Bearer token obtained via /pair.

import { getToken, handleUnauthorized } from './auth';
import { relayFetch, type RelayHttpMethod } from './relayHttp';

const DEFAULT_SERVICE_PORT = '9400';
const DEFAULT_HTTPS_PORT = '9443';
const SERVICE_PORT = import.meta.env.VITE_SERVICE_PORT || DEFAULT_SERVICE_PORT;

// Cloud relay fallback endpoint. The relay is a WSS gateway INSIDE nexus-api
// (Railway, api.hellonexus.com) at path /relay — an opaque byte-forwarder used
// only when the LAN /ws path fails. It lives at the api origin, NOT the local
// service: unlike resolveWs() this never points at the LAN host. Overridable
// via VITE_RELAY_URL for local/dev relay testing. Keep in sync with the
// host-side RELAY_URL constant in nexus-service.
const DEFAULT_RELAY_URL = 'wss://api.hellonexus.com/relay';
const RELAY_URL = import.meta.env.VITE_RELAY_URL || DEFAULT_RELAY_URL;

const locationHost = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
const locationPort = typeof window !== 'undefined' ? window.location.port : '';
const locationProtocol = typeof window !== 'undefined' ? window.location.protocol : 'http:';
const isServedFromService = locationPort === DEFAULT_SERVICE_PORT || locationPort === DEFAULT_HTTPS_PORT;

// If the SPA is served from the service itself, keep the same origin/protocol.
// If served from Vite or hellonexus.com, fall back to the local HTTP service.
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

/** Resolve the cloud relay WSS URL (api origin, path /relay). */
export function resolveRelayWs(): string {
  return RELAY_URL;
}

// Which transport the panel's live multiplex connection runs over. Set by
// useMultiplexSocket (its only writer) whenever the active transport changes:
// 'lan' for the direct /ws socket, 'relay' for the cloud RelayChannel fallback,
// null while disconnected. The fetch layer reads it to decide whether REST
// calls go directly to the local service (LAN) or tunnel over the relay. A
// module-level signal keeps the fetch helpers' signatures unchanged — callers
// stay oblivious to which transport is live.
let activeTransport: 'lan' | 'relay' | null = null;

/**
 * Publish the live multiplex transport so the REST fetch layer can route
 * accordingly. Called only by useMultiplexSocket as the connection opens /
 * closes. Off-LAN (transport === 'relay') REST calls tunnel over the relay;
 * otherwise they hit the local service directly (the unchanged LAN path).
 */
export function setActiveTransport(transport: 'lan' | 'relay' | null): void {
  activeTransport = transport;
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
  // Off-LAN: the panel is connected via the cloud relay, so the local service
  // HTTP endpoint is unreachable. Tunnel the call over the relay HTTP channel
  // instead. The tunnel is already authenticated as this phone session
  // server-side, so no bearer is sent. Transparent to callers: a Response-like
  // object is synthesized so fetchService/.json() etc. work unchanged.
  if (activeTransport === 'relay') {
    return relayAuthFetch(path, opts);
  }

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

// Run an authFetch-equivalent request over the relay HTTP tunnel. The PC
// dispatches it authorized as this relay session's phone session (no bearer
// needed). Returns the same Response|null contract as the LAN path: null on a
// non-2xx status or any transport failure, so every existing caller behaves
// identically off-LAN.
async function relayAuthFetch(path: string, opts: RequestOptions): Promise<Response | null> {
  try {
    const token = await getToken();
    const method = (opts.method ?? 'GET') as RelayHttpMethod;
    const hasBody = opts.body !== undefined;
    const body = hasBody ? JSON.stringify(opts.body) : null;
    const contentType = hasBody ? 'application/json' : null;
    const res = await relayFetch(token, resolveRelayWs(), method, path, body, contentType);
    if (res.status < 200 || res.status >= 300) return null;
    return toResponse(res.status, res.body, res.contentType);
  } catch {
    return null;
  }
}

// Build a real Response from a relay tunnel result so callers can use
// .json()/.blob()/.text() exactly as they would for a window.fetch response.
function toResponse(status: number, body: string, contentType: string | null): Response {
  const headers: Record<string, string> = {};
  if (contentType) headers['Content-Type'] = contentType;
  return new Response(body, { status, headers });
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
