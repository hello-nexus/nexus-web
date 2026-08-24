// Thin client for the local Nexus service (nexus-service).
// Override host/port via Vite env vars VITE_SERVICE_HOST / VITE_SERVICE_PORT.
// All authenticated calls include the Bearer token obtained via /pair.

import { getToken, getTokenSync, handleUnauthorized, hasSessionToken } from './auth';
import { relayFetch, type RelayHttpMethod } from './relayHttp';
import type { RelayResponse } from './httpTunnelFraming';

const DEFAULT_SERVICE_PORT = '9400';
const DEFAULT_HTTPS_PORT = '9443';
const SERVICE_PORT = import.meta.env.VITE_SERVICE_PORT || DEFAULT_SERVICE_PORT;

// Cloud relay fallback endpoint. The relay is a WSS gateway INSIDE nexus-api
// (Railway, api.hellonexus.com) at path /relay - an opaque byte-forwarder used
// only when the LAN /ws path fails. It lives at the api origin, NOT the local
// service: unlike resolveWs() this never points at the LAN host. Overridable
// via VITE_RELAY_URL for local/dev relay testing. Keep in sync with the
// host-side RELAY_URL constant in nexus-service.
const DEFAULT_RELAY_URL = 'wss://api.hellonexus.com/relay';
const RELAY_URL = import.meta.env.VITE_RELAY_URL || DEFAULT_RELAY_URL;

// Regional relay directory. The host stamps the pair QR with `r=<tag>` for the
// latency-nearest relay it registered on; the phone follows to that same relay
// so host + phone share one rendezvous instance. Built-in map - the web is
// always served fresh from hellonexus.com, so adding a region is one entry + a
// redeploy, no client-side directory fetch. Unknown / absent tag ⇒ the legacy
// default (kept in sync with RELAY_REGIONS in nexus-api relays.config.ts).
const RELAY_REGIONS: Record<string, string> = {
  us: 'wss://relay-us.hellonexus.com/relay',
  ap: 'wss://relay-ap.hellonexus.com/relay',
};
const RELAY_REGION_KEY = 'nexus.relayRegion';

/**
 * Persist the relay region from the pair QR's `r` tag so both the pairing claim
 * and every later runtime reconnect target the same regional relay. A known tag
 * is stored; an unknown / empty tag clears it (fall back to the legacy default
 * rather than mispair on a relay this build doesn't know).
 */
export function setRelayRegion(tag: string | null | undefined): void {
  if (typeof localStorage === 'undefined') return;
  // Best-effort: a present-but-throwing store (Safari Private Mode, quota,
  // hardened browsers) must NOT break pairing - it just costs the region hint
  // (the relay falls back to the legacy default), so swallow any throw.
  try {
    if (tag && RELAY_REGIONS[tag]) localStorage.setItem(RELAY_REGION_KEY, tag);
    else localStorage.removeItem(RELAY_REGION_KEY);
  } catch {
    /* storage unavailable */
  }
}

const locationHost = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
const locationPort = typeof window !== 'undefined' ? window.location.port : '';
const locationProtocol = typeof window !== 'undefined' ? window.location.protocol : 'http:';
const isServedFromService = locationPort === DEFAULT_SERVICE_PORT || locationPort === DEFAULT_HTTPS_PORT;

// True when the SPA is loaded from a REMOTE origin (hellonexus.com, a Vite dev
// server, anything that is NOT the local service on :9400/:9443). On such an
// origin there is NO localhost PC to reach: resolveHttp() would point at
// http://localhost (wrong host - that's the phone, not the PC - and
// mixed-content-blocked on an https page), so REST + /ws MUST go over the cloud
// relay from the very first call. Deterministic from the origin, computed once.
export const isRemoteOrigin = !isServedFromService;

// True when the panel is served from a REMOTE host: a paired phone reaching the
// PC over LAN (<pc-ip>:9400/9443) or over the relay (hellonexus.com), versus a
// LOCAL hardwired surface (a Y70/Q60 kiosk or the embedded dashboard, which load
// from localhost). Gates the "Connected to <PC>" + lock indicator - a hardwired
// display already knows what it's plugged into, so it's hidden there.
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '']);
export const isRemotePaired = !LOCAL_HOSTS.has(locationHost);

// LAN sealed transport (Phase 2). A phone reaching the PC over the LAN is served
// from the service (so isRemoteOrigin is false) but from a real host IP
// (isRemotePaired) - its session token currently crosses the LAN as a bearer
// header AND a ?token= on the /ws URL. When the flag is on, route the panel's
// runtime + REST over the sealed /secure-tunnel (the same E2E relay crypto, no
// cloud hop) so the token never leaves the device. Gated for staged rollout:
// OFF keeps the unchanged plain-LAN path (isTunnelActive collapses to
// isRelayActive, resolveTunnelWs to resolveRelayWs, trySealed is never reached),
// so default behavior is provably identical. The cloud-relay path (remote
// origin) is a separate transport and unaffected either way.
const LAN_SEALED_FLAG_KEY = 'nexus.lanSealed';
function lanSealedFlagOn(): boolean {
  if (import.meta.env.VITE_LAN_SEALED === '1') return true;
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(LAN_SEALED_FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * True when this surface should use the sealed LAN tunnel: a phone served from
 * the local service (not a remote origin) but reaching it over a real host IP
 * (isRemotePaired, i.e. not a localhost kiosk), with the flag enabled. A token
 * still has to exist before anything actually tunnels - that gate lives in
 * effectiveTransport.
 */
export function isLanSealedEligible(): boolean {
  return !isRemoteOrigin && isRemotePaired && lanSealedFlagOn();
}

// If the SPA is served from the service itself, keep the same origin/protocol.
// If served from Vite or hellonexus.com, fall back to the local HTTP service.
const SERVICE_PROTOCOL = import.meta.env.VITE_SERVICE_PROTOCOL
  || (isServedFromService ? locationProtocol : 'http:');
const SERVICE_HOST = import.meta.env.VITE_SERVICE_HOST
  || (isServedFromService ? locationHost : 'localhost');
const endpointPort = import.meta.env.VITE_SERVICE_PORT
  || (isServedFromService ? locationPort : SERVICE_PORT);
const endpoint = endpointPort ? `${SERVICE_HOST}:${endpointPort}` : SERVICE_HOST;

// Chromium Local Network Access (Chrome 138+ / Edge 150): a fetch from a
// public https origin to http://127.0.0.1 must declare its target address
// space, or the request is blocked as mixed content before the permission
// prompt can even show. Spread into every fetch that targets the loopback
// service from a remote origin (my.hellonexus.com's detected-desktop probe).
// Guards: the resolved host must actually be loopback (a VITE_SERVICE_HOST
// LAN override would mismatch the declared space and hard-fail the fetch),
// and the Request probe drops the member on engines whose IDL rejects the
// 'loopback' value instead of ignoring unknown dictionary members.
export const loopbackFetchInit: RequestInit = (() => {
  const loopbackHost = SERVICE_HOST === 'localhost' || SERVICE_HOST === '127.0.0.1' || SERVICE_HOST === '::1';
  if (!isRemoteOrigin || !loopbackHost) return {};
  const init = { targetAddressSpace: 'loopback' } as RequestInit;
  try {
    new Request('https://probe.invalid/', init);
    return init;
  } catch {
    return {};
  }
})();

export function resolveHttp(path: string): string {
  return `${SERVICE_PROTOCOL}//${endpoint}${path}`;
}

// <img>/<video> element loads can't send a Bearer header, so authenticated
// asset URLs carry the session token as a query param (the server's
// ExtractBearerOrQueryToken accepts ?token=), same as the WS URL.
export function tokenParam(): string {
  const t = getTokenSync();
  return t ? `token=${encodeURIComponent(t)}` : '';
}

export function resolveWs(path: string): string {
  return `${SERVICE_PROTOCOL === 'https:' ? 'wss' : 'ws'}://${endpoint}${path}`;
}

/**
 * Resolve the cloud relay WSS URL: the regional relay this device paired
 * through (persisted from the QR's `r` tag), else the legacy default.
 */
export function resolveRelayWs(): string {
  try {
    if (typeof localStorage !== 'undefined') {
      const tag = localStorage.getItem(RELAY_REGION_KEY);
      if (tag && RELAY_REGIONS[tag]) return RELAY_REGIONS[tag];
    }
  } catch {
    /* storage unavailable → legacy default */
  }
  return RELAY_URL;
}

/** Resolve the LAN sealed-tunnel WS URL: the same host/port the LAN /ws uses, path /secure-tunnel. */
export function resolveLanSealedWs(): string {
  return resolveWs('/secure-tunnel');
}

// Which transport the panel's live multiplex connection runs over. Set by
// useMultiplexSocket (its only writer) whenever the active transport changes:
// 'lan' for the direct /ws socket, 'relay' for the cloud RelayChannel fallback,
// 'lan-sealed' for the local sealed /secure-tunnel, 'direct' for the WebRTC
// data-channel hole-punch upgrade (hot-swapped in from an open relay
// connection), null while disconnected. The fetch layer reads it to decide
// whether REST calls go directly to the local service (LAN) or tunnel over a
// sealed channel. A module-level signal keeps the fetch helpers' signatures
// unchanged - callers stay oblivious to which transport is live.
export type ActiveTransport = 'lan' | 'relay' | 'lan-sealed' | 'direct';
let activeTransport: ActiveTransport | null = null;

// The live WebRTC "http" data-channel tunnel, published by useMultiplexSocket
// only while activeTransport === 'direct'. A structural type (not an import
// from rtcDirect.ts) avoids a service.ts <-> rtcDirect.ts import cycle -
// rtcDirect.ts already imports authFetchWithStatus from here to POST the SDP
// offer over the tunnel-aware path.
interface DirectHttpTunnelLike {
  request(method: RelayHttpMethod, path: string, body: string | null, contentType: string | null): Promise<RelayResponse>;
}
let activeHttpTunnel: DirectHttpTunnelLike | null = null;

/** Publish (or clear) the live direct-transport HTTP tunnel. Called only by useMultiplexSocket. */
export function setActiveHttpTunnel(tunnel: DirectHttpTunnelLike | null): void {
  activeHttpTunnel = tunnel;
}

// Desktop-on-hellonexus override. The remote-origin model otherwise assumes
// "no local PC to reach" (phone → relay / fail-closed). But a DESKTOP browser on
// hellonexus.com whose own machine runs Nexus must drive localhost directly, not
// the relay. The public dashboard route sets this once a local service is
// detected; the phone panel never sets it, so /panel/* stays relay-only and
// unchanged. When true, remote origin behaves like a local (LAN) origin.
let forceLanMode = false;

/** Treat localhost as reachable on a remote origin (the detected-desktop case). */
export function setForceLanMode(on: boolean): void {
  forceLanMode = on;
}

/** Read by auth.ts so /pair mints the loopback token on a remote origin too. */
export function isForceLanMode(): boolean {
  return forceLanMode;
}

/**
 * Publish the live multiplex transport so the REST fetch layer can route
 * accordingly. Called only by useMultiplexSocket as the connection opens /
 * closes. Off-LAN (transport === 'relay') REST calls tunnel over the relay;
 * otherwise they hit the local service directly (the unchanged LAN path).
 */
export function setActiveTransport(transport: ActiveTransport | null): void {
  activeTransport = transport;
}

/**
 * The transport the fetch layer should route over RIGHT NOW.
 *
 * Normally this is just `activeTransport` (set by useMultiplexSocket as the
 * live connection opens/closes). But on a REMOTE origin there is no localhost
 * PC to reach, so before the multiplex socket has even opened - i.e. for the
 * panel's very first REST calls (device alloc/patch, ping) - we must ALREADY be
 * on the relay, or those early fetches hit http://localhost (wrong + mixed-
 * content-blocked) and surface a bogus "could not reach the service".
 *
 * So when served remotely and a session token exists (the rid can be derived),
 * default to 'relay' until useMultiplexSocket explicitly publishes a transport.
 * Gating on the token avoids dialing the relay before pairing has stored one.
 * On a local (service-served) origin this returns `activeTransport` unchanged,
 * so the LAN-first-with-relay-fallback behavior is untouched.
 */
function effectiveTransport(): ActiveTransport | null {
  if (activeTransport !== null) return activeTransport;
  // forceLanMode (detected local desktop) keeps the LAN path even with a token.
  if (isRemoteOrigin && !forceLanMode && hasSessionToken()) return 'relay';
  // Eager LAN-sealed: a flag-on LAN phone with a token routes its early REST
  // (device alloc/ping) over the sealed tunnel before the multiplex socket
  // publishes a transport, mirroring the eager-relay case above. Without a token
  // there's no rid to derive, so fall through to the unchanged direct LAN path.
  if (isLanSealedEligible() && hasSessionToken()) return 'lan-sealed';
  return null;
}

/**
 * Whether REST/WS should tunnel over the cloud relay right now: either the live
 * multiplex transport is the relay, or we're on a remote origin with a token
 * and the multiplex socket hasn't opened yet (eager relay). Read by the fetch
 * helpers and by useMultiplexSocket to skip the doomed localhost /ws attempt.
 */
export function isRelayActive(): boolean {
  return effectiveTransport() === 'relay';
}

/**
 * Whether the live/eager transport is the LAN sealed tunnel - the runtime path
 * opens a RelayChannel to /secure-tunnel instead of the plain /ws. Read by
 * useMultiplexSocket to choose the sealed channel over the token-in-URL socket.
 */
export function isLanSealedActive(): boolean {
  return effectiveTransport() === 'lan-sealed';
}

/**
 * Whether the live transport is the WebRTC direct data-channel upgrade. Read
 * by the tunnel dispatch below to route REST through activeHttpTunnel instead
 * of relayFetch; there is no eager-direct case (unlike relay/lan-sealed) since
 * direct only ever becomes active via an explicit hot-swap off an already-open
 * relay connection.
 */
export function isDirectActive(): boolean {
  return effectiveTransport() === 'direct';
}

/**
 * Whether REST should tunnel over a sealed channel right now - the cloud relay
 * (off-LAN), the local sealed tunnel (flag-on LAN phone), or the WebRTC direct
 * upgrade. All three seal the same way and dispatch through the same
 * relayAuthFetch/relayRequestWithStatus path; only the underlying transport
 * differs. With the lan-sealed flag off and no direct upgrade this is exactly
 * isRelayActive(), so the REST routing is unchanged from the relay-only
 * behavior.
 */
export function isTunnelActive(): boolean {
  const t = effectiveTransport();
  return t === 'relay' || t === 'lan-sealed' || t === 'direct';
}

// The RTC data channel caps a sealed frame at 256KB; the host replies this
// status (never an oversized frame) when a response would exceed that cap.
// The relay WS leg has no such cap, so a GET that hits it is retried there.
const DIRECT_RESPONSE_TOO_LARGE = 413;

/**
 * Dispatch one sealed HTTP-tunnel request over whichever transport is live:
 * the WebRTC direct data channel when up, else the relay/lan-sealed WS tunnel.
 * A direct drop clears activeHttpTunnel (useMultiplexSocket), so the very next
 * call here transparently falls back to relayFetch - no special-casing needed
 * at the call sites. A GET that the direct channel rejects as too large (a
 * thumbnail/media byte response, typically) is retried once over the relay
 * tunnel instead of surfacing a hard failure - safe only for GET, since a
 * mutating method may have already taken effect server-side before replying.
 */
async function tunnelRequest(method: RelayHttpMethod, path: string, body: string | null, contentType: string | null): Promise<RelayResponse> {
  if (isDirectActive() && activeHttpTunnel) {
    const res = await activeHttpTunnel.request(method, path, body, contentType);
    if (res.status !== DIRECT_RESPONSE_TOO_LARGE || method !== 'GET') return res;
  }
  const token = await getToken();
  return relayFetch(token, resolveTunnelWs(), method, path, body, contentType);
}

/** The WS URL the REST/runtime tunnel should target: the LAN sealed tunnel when lan-sealed is active, else the cloud relay. */
function resolveTunnelWs(): string {
  return effectiveTransport() === 'lan-sealed' ? resolveLanSealedWs() : resolveRelayWs();
}

/**
 * A direct window.fetch(resolveHttp(...)) here would target http://localhost -
 * which on a REMOTE origin is the wrong host (the phone, not the PC) AND
 * mixed-content-blocked on an https page. So when we're on a remote origin but
 * no sealed tunnel (relay, lan-sealed, or the WebRTC direct upgrade) is usable
 * yet - no session token to derive the rid, e.g. the pre-pairing /r/pair boot -
 * the direct fetch must NOT fire: fail closed instead. On a local
 * (service-served) origin this is always false, so the LAN fetch path is
 * untouched. Every actual caller already checks isTunnelActive() first and
 * short-circuits before reaching this function when a tunnel is live; this
 * check stays isTunnelActive()-based (not isRelayActive()) so it can't
 * silently block a caller that skips that check in the future.
 *
 * An EXPLICIT 'lan' transport is the one exception: useMultiplexSocket only
 * publishes 'lan' after a direct /ws socket actually OPENED, which on a remote
 * origin can't happen - so a published 'lan' means localhost actually is
 * reachable (a service-served origin), and the direct fetch is allowed.
 */
function blockedLocalhostFetch(): boolean {
  if (forceLanMode) return false; // detected local desktop: localhost is the PC
  return isRemoteOrigin && activeTransport !== 'lan' && !isTunnelActive();
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
  // object is synthesized so fetchService/.json() etc. work unchanged. Also
  // covers the eager case (remote origin + token, multiplex not yet open) and
  // the LAN sealed tunnel (flag-on LAN phone) - both tunnel via relayAuthFetch.
  if (isTunnelActive()) {
    return relayAuthFetch(path, opts);
  }

  // Remote origin without a usable relay yet ⇒ never hit http://localhost.
  if (blockedLocalhostFetch()) return null;

  try {
    const token = await getToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

    const init: RequestInit = {
      ...loopbackFetchInit,
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

// Run an authFetch-equivalent request over the live tunnel (direct data
// channel, else relay/lan-sealed WS). The PC dispatches it authorized as this
// session's phone session (no bearer needed). Returns the same Response|null
// contract as the LAN path: null on a non-2xx status or any transport
// failure, so every existing caller behaves identically off-LAN.
async function relayAuthFetch(path: string, opts: RequestOptions): Promise<Response | null> {
  try {
    const method = (opts.method ?? 'GET') as RelayHttpMethod;
    const hasBody = opts.body !== undefined;
    const body = hasBody ? JSON.stringify(opts.body) : null;
    const contentType = hasBody ? 'application/json' : null;
    const res = await tunnelRequest(method, path, body, contentType);
    if (res.status < 200 || res.status >= 300) return null;
    return toResponse(res.status, res.body, res.contentType, res.base64);
  } catch {
    return null;
  }
}

// Build a real Response from a relay tunnel result so callers can use
// .json()/.blob()/.text() exactly as they would for a window.fetch response.
// A binary response (thumbnails, icons) arrives base64-encoded so its bytes
// survive the tunnel's UTF-8 JSON channel; decode it back to the exact bytes
// before constructing the Response so .blob() yields a valid image.
function toResponse(status: number, body: string, contentType: string | null, base64: boolean): Response {
  const headers: Record<string, string> = {};
  if (contentType) headers['Content-Type'] = contentType;
  if (base64) return new Response(base64ToBytes(body), { status, headers });
  return new Response(body, { status, headers });
}

// Returns a plain ArrayBuffer (not a typed-array view) so the value is an
// unambiguous BodyInit for new Response() under the DOM lib's typings.
function base64ToBytes(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const buffer = new ArrayBuffer(binary.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);
  return buffer;
}

/**
 * Status-preserving tunnel request for the few callers that bypass authFetch
 * to read the raw HTTP status (the panel.ts *WithStatus helpers + form
 * upload). Unlike relayAuthFetch this does NOT collapse a non-2xx to null - it
 * returns the real Response (and a status of 0 on a transport failure) so
 * those callers branch on 401/403/404 over the tunnel exactly as they do on
 * the LAN. Used only when isTunnelActive(); the LAN path is the unchanged
 * window.fetch below.
 */
export async function relayRequestWithStatus(
  method: RelayHttpMethod,
  path: string,
  body?: unknown,
): Promise<{ response: Response | null; status: number }> {
  try {
    const hasBody = body !== undefined;
    const payload = hasBody ? JSON.stringify(body) : null;
    const contentType = hasBody ? 'application/json' : null;
    const res = await tunnelRequest(method, path, payload, contentType);
    return { response: toResponse(res.status, res.body, res.contentType, res.base64), status: res.status };
  } catch {
    return { response: null, status: 0 };
  }
}

/**
 * Status-preserving authFetch: the same transport routing (cloud relay / LAN
 * sealed tunnel / direct LAN) and 401-retry as authFetch, but never collapses
 * a non-2xx response to null - callers branch on the real status/body (e.g. a
 * machine error code in a 409). status 0 means a transport failure (network
 * error, or blockedLocalhostFetch on a remote origin with no tunnel yet).
 */
export async function authFetchWithStatus(path: string, opts: RequestOptions = {}): Promise<{ response: Response | null; status: number }> {
  if (isTunnelActive()) {
    const method = (opts.method ?? 'GET') as RelayHttpMethod;
    return relayRequestWithStatus(method, path, opts.body);
  }

  if (blockedLocalhostFetch()) return { response: null, status: 0 };

  try {
    const token = await getToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

    const init: RequestInit = {
      ...loopbackFetchInit,
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

    return { response, status: response.status };
  } catch {
    return { response: null, status: 0 };
  }
}

export async function fetchService<T>(path: string): Promise<T | null> {
  const r = await authFetch(path, { cache: 'no-store' });
  return r ? (await r.json()) as T : null;
}

/**
 * The host's OS accent as #RRGGBB, or null when unavailable. Used by
 * SystemAccentSync where there's no native shell to push it (Linux dashboard /
 * plain browser); the service reads it from the XDG desktop portal. Windows and
 * macOS app shells push the accent directly and return empty here.
 */
export async function fetchSystemAccent(): Promise<string | null> {
  const res = await fetchService<{ accent?: string }>('/system/accent');
  const hex = res?.accent;
  return hex && /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : null;
}

export async function postService<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T | null> {
  const r = await authFetch(path, { method: 'POST', body, signal });
  return r ? (await r.json()) as T : null;
}

interface SystemPickPathResponse {
  path: string | null;
  error?: boolean;
  msg?: string;
}

/**
 * Opens the native OS file/folder dialog on the host PC (the same
 * Session-0-safe picker the gallery's pickGalleryPaths uses) and resolves
 * with the chosen absolute path. Null covers both a user cancel and a failed
 * request - callers leave whatever they were editing untouched either way.
 */
export async function pickSystemPath(folder: boolean): Promise<string | null> {
  const res = await postService<SystemPickPathResponse>('/system/pick-path', { folder });
  return res?.path ?? null;
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
  // Form uploads can't be JSON-tunneled (the relay HTTP frame carries a string
  // body, not multipart). On a remote origin there's no localhost to reach, so
  // rather than fire a doomed mixed-content request, fail closed like a
  // non-2xx. (Media import is a LAN/desktop affordance; off-LAN it's a no-op.)
  if (isTunnelActive() || blockedLocalhostFetch()) return null;
  try {
    const token = await getToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    let response = await fetch(resolveHttp(path), { ...loopbackFetchInit, method: 'POST', headers, body: form });
    if (response.status === 401) {
      const newToken = await handleUnauthorized();
      if (newToken) {
        headers['Authorization'] = `Bearer ${newToken}`;
        response = await fetch(resolveHttp(path), { ...loopbackFetchInit, method: 'POST', headers, body: form });
      }
    }
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

/**
 * PUT raw bytes (not JSON) with the standard auth + 401-retry handling. Used
 * by uploads that carry an opaque binary payload (e.g. a rendered Stream Deck
 * key bitmap) rather than a JSON body. Same fail-closed-off-LAN behavior as
 * postServiceForm: a binary body can't be JSON-tunneled over the relay, and
 * this is a LocalhostOnly desktop affordance in every current caller anyway.
 */
export async function putServiceBytes(path: string, bytes: Uint8Array, contentType: string): Promise<Response | null> {
  if (isTunnelActive() || blockedLocalhostFetch()) return null;
  try {
    const token = await getToken();
    const headers: Record<string, string> = { 'Content-Type': contentType };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    let response = await fetch(resolveHttp(path), { ...loopbackFetchInit, method: 'PUT', headers, body });
    if (response.status === 401) {
      const newToken = await handleUnauthorized();
      if (newToken) {
        headers['Authorization'] = `Bearer ${newToken}`;
        response = await fetch(resolveHttp(path), { ...loopbackFetchInit, method: 'PUT', headers, body });
      }
    }
    if (!response.ok) return null;
    return response;
  } catch {
    return null;
  }
}

export async function fetchServiceBlob(path: string): Promise<Blob | null> {
  // No explicit cache directive: respect the server's Cache-Control header.
  // Effect thumbnails + app icons are static-per-key bytes; the routes that
  // care set Cache-Control accordingly. Forcing no-store here would void any
  // server cache hint and refetch on every mount.
  // An error status must yield null, not a blob of the JSON error body -
  // callers feed this straight into URL.createObjectURL for <img> sources.
  const r = await authFetch(path);
  if (!r || !r.ok) return null;
  try {
    return await r.blob();
  } catch {
    // Connection drop mid-body rejects .blob().
    return null;
  }
}

/** Like fetchServiceBlob, but also exposes the response headers - callers
 *  that need a server-supplied detail (e.g. Content-Disposition on a file
 *  download) use this instead. */
export async function fetchServiceBlobWithHeaders(path: string): Promise<{ blob: Blob; headers: Headers } | null> {
  const r = await authFetch(path);
  if (!r || !r.ok) return null;
  try {
    return { blob: await r.blob(), headers: r.headers };
  } catch {
    return null;
  }
}

/** Ping is public - no token needed. Tunnels over the relay when off-LAN so a
 * remote-origin panel never fires an http://localhost ping (wrong host +
 * mixed-content-blocked); the host answers it over the rid_http channel. */
export async function pingService(): Promise<PingResponse | null> {
  if (isTunnelActive()) {
    const { response } = await relayRequestWithStatus('GET', '/ping');
    if (!response || !response.ok) return null;
    return (await response.json()) as PingResponse;
  }
  if (blockedLocalhostFetch()) return null;
  // Hard timeout: an https→localhost request can STALL indefinitely on a
  // browser's local-network (PNA) preflight when the service lacks the
  // Allow-Private-Network header. Without this bound the status hook sits in
  // 'checking' forever and the page spins. Abort at 3s ⇒ treated as offline.
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(resolveHttp('/ping'), { ...loopbackFetchInit, signal: controller.signal });
    clearTimeout(timer);
    if (!response.ok) return null;
    return (await response.json()) as PingResponse;
  } catch {
    return null;
  }
}
