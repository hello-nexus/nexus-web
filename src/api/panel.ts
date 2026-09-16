import { getToken, handleUnauthorized } from './auth';
import { deleteService, fetchService, isTunnelActive, isRemoteOrigin, postService, relayRequestWithStatus, RELAY_BOOT_TIMEOUT_MS, resolveHttp } from './service';
import { deriveDeviceLabel } from '../lib/platform';
import type { PanelLayout, PanelSurface } from '../panel/types';

export interface PanelStatus {
  msg: string;
  kioskRunning: boolean;
  phoneConnected: boolean;
  phoneSubscribers: number;
}

// Per-device record: identity (deviceId), persisted layout, optional
// per-device theme overrides, last-reported capabilities. Mirrors
// nexus-service Models/Panel/PanelDeviceDto.cs.
export interface PanelDeviceCapabilitiesDto {
  surface?: PanelSurface;
  grid?: string;
  touch?: boolean;
  orientation?: string;
  cssWidth?: number;
  cssHeight?: number;
  dpr?: number;
  // Physical density (native px/inch) of a curated known display (service
  // KnownPanelDisplays, e.g. the Xeneon Edge). Absent for generic monitors;
  // grid math falls back to DEFAULT_SURFACE_DPI.
  dpi?: number;
  // Curated display family id (e.g. 'xeneon-edge') driving sidebar branding.
  family?: string;
  // The panel's backlight is host-settable, so the settings tab offers the
  // brightness control. Absent on every surface that cannot dim.
  supportsBrightness?: boolean;
}

export interface PanelDeviceRecord {
  id: string;
  displayName: string;
  layout?: PanelLayout;
  themeMode?: string;
  accentColor?: string;
  backgroundColor?: string;
  backgroundColorLight?: string;
  backgroundMode?: string;
  backgroundEffect?: string;
  backgroundTemplate?: number;
  // Per-shader preset selection for THIS panel (effect key → preset index).
  // The panel remembers its preset choice for every shader; contents stay
  // central. Absent shaders default to preset 0.
  backgroundTemplates?: Record<string, number>;
  backgroundOpacity?: number;
  // 'theme' | 'wallpaper' | 'desktop'. Absent/null resolves per capability:
  // wallpaper-capable panels default to wallpaper, everything else to the
  // theme backdrop (resolvePanelBackdrop).
  backdrop?: string | null;
  backgroundMediaId?: string | null;
  backgroundMediaType?: 'static' | 'animated' | null;
  backgroundMediaAlpha?: boolean | null;
  // Cycle the whole background-media library; backgroundMediaId is then the
  // slide the cycle starts from. Absent/null = single background.
  backgroundMediaSlideshow?: boolean | null;
  // Seconds per slide. Absent/null defaults to DEFAULT_PANEL_SLIDESHOW_INTERVAL.
  backgroundMediaInterval?: number | null;
  backgroundMediaShuffle?: boolean | null;
  // Absent/null defaults to on (a video slide plays whole before the next).
  backgroundMediaFinishVideos?: boolean | null;
  // Grid + in-order slideshow order by asset id; unlisted ids follow, oldest first.
  backgroundMediaOrder?: string[] | null;
  // Frost strength, percent 0-100. Absent/null defaults to
  // DEFAULT_PANEL_BACKGROUND_FROST (normalizePanelBackgroundFrost).
  backgroundFrostLevel?: number | null;
  widgetOpacity?: number;
  widgetLabels?: boolean;
  widgetPadding?: number;
  themeSyncWithDesktop?: boolean;
  accentSyncWithDesktop?: boolean;
  firstSeenAt: number;
  lastSeenAt: number;
  capabilities?: PanelDeviceCapabilitiesDto;
  // Stable display id when this record was created by promoting an OS
  // monitor (POST /displays/{id}/panel). Absent on self-registered panels.
  displayId?: string;
  // Per-panel "keep panel clear of other windows" (display-bound records).
  reserveMonitor?: boolean;
  // Display-bound panels with a physical orientation sensor (e.g. the Xeneon
  // Edge): true = the sensor drives display rotation, false = the user's
  // orientation picker applies instead. Absent/null = on.
  autoOrient?: boolean;
  // Pushed-frame cooler LCDs: how the glass is mounted. Applied to the bytes in
  // the service transport, so everything else renders upright. Absent/null = off.
  flip180?: boolean;
  mirror?: boolean;
  // Cooler LCDs whose panel takes a brightness command: backlight percent
  // 0-100. Absent/null = the panel's default; the hardware reset writes null.
  lcdBrightness?: number | null;
  // Display-bound panels: false = turned off (record + config kept; no
  // kiosk). Absent/null = on.
  enabled?: boolean | null;
  // Response-only: false when the bound monitor is currently unplugged,
  // undefined/null when topology is unknown (treat as attached).
  displayAttached?: boolean | null;
  // Response-only: true while a streamed-panel session drives this record (the
  // Kraken LCD, a D213 board). Such a panel has neither a curated device nor a
  // display behind it, so nothing else marks it as present.
  streamed?: boolean | null;
}

export interface PanelDevicePatch {
  displayName?: string;
  layout?: PanelLayout;
  themeMode?: string | null;
  accentColor?: string | null;
  backgroundColor?: string | null;
  backgroundColorLight?: string | null;
  backgroundMode?: string | null;
  backgroundEffect?: string | null;
  backgroundTemplate?: number;
  // Full per-shader preset map (client sends the whole map).
  backgroundTemplates?: Record<string, number>;
  backgroundOpacity?: number;
  backdrop?: string;
  backgroundMediaId?: string | null;
  // '' clears the reference server-side (NullIfEmpty); a JSON null is ignored by the patch-merge.
  backgroundMediaType?: 'static' | 'animated' | '' | null;
  backgroundMediaAlpha?: boolean | null;
  backgroundMediaSlideshow?: boolean;
  backgroundMediaInterval?: number;
  backgroundMediaShuffle?: boolean;
  backgroundMediaFinishVideos?: boolean;
  // Full list (the client sends the whole order).
  backgroundMediaOrder?: string[];
  backgroundFrostLevel?: number;
  widgetOpacity?: number;
  widgetLabels?: boolean;
  widgetPadding?: number;
  themeSyncWithDesktop?: boolean;
  accentSyncWithDesktop?: boolean;
  // Display-bound records only; ignored for other panels.
  reserveMonitor?: boolean;
  // Display-bound records with a physical orientation sensor only; ignored
  // for other panels.
  autoOrient?: boolean;
  // Pushed-frame cooler LCDs only; ignored for other panels.
  flip180?: boolean;
  mirror?: boolean;
  // Dimmable cooler LCDs only; ignored for other panels.
  lcdBrightness?: number;
  capabilities?: PanelDeviceCapabilitiesDto;
}

export const allocatePanelDevice = (capabilities?: PanelDeviceCapabilitiesDto, displayName?: string) =>
  postService<PanelDeviceRecord>('/panel/devices', { displayName, capabilities });

export type PanelAllocResult =
  | { ok: true; record: PanelDeviceRecord }
  | { ok: false; status: number };

// Alloc variant that surfaces the HTTP status, so the panel entrypoint shows
// "pair this phone" on 401/403 and "service unreachable" on others.
export async function allocatePanelDeviceWithStatus(
  capabilities?: PanelDeviceCapabilitiesDto,
  displayName?: string,
): Promise<PanelAllocResult> {
  // Off-LAN (remote origin / relay transport) there's no localhost PC to POST
  // to - tunnel the alloc over the relay so the panel registers without a
  // doomed mixed-content http://localhost call. Same status contract.
  if (isTunnelActive()) {
    const { response, status } = await relayRequestWithStatus(
      'POST', '/panel/devices', { displayName, capabilities }, { timeoutMs: RELAY_BOOT_TIMEOUT_MS });
    if (!response || !response.ok) return { ok: false, status };
    return { ok: true, record: (await response.json()) as PanelDeviceRecord };
  }
  // Remote origin without a usable relay yet ⇒ never hit http://localhost.
  if (isRemoteOrigin) return { ok: false, status: 0 };
  try {
    const token = await getToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(resolveHttp('/panel/devices'), {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({ displayName, capabilities }),
    });
    if (!res.ok) return { ok: false, status: res.status };
    const record = (await res.json()) as PanelDeviceRecord;
    return { ok: true, record };
  } catch {
    return { ok: false, status: 0 };
  }
}

export const fetchPanelDevice = (id: string) =>
  fetchService<PanelDeviceRecord>(`/panel/devices/${encodeURIComponent(id)}`);

export const fetchPanelDevices = () =>
  fetchService<{ devices: PanelDeviceRecord[] }>('/panel/devices');

export const patchPanelDevice = (id: string, patch: PanelDevicePatch) =>
  postService<PanelDeviceRecord>(`/panel/devices/${encodeURIComponent(id)}`, patch);

// Personalization reset: clears the record's layout/theme/widget state
// (defaults reseed on the next read) and deletes its uploaded media.
export const resetPanelDevice = (id: string) =>
  postService<PanelDeviceRecord>(`/panel/devices/${encodeURIComponent(id)}/reset`, {});

// Hardware-settings reset: restores the Settings-tab defaults and applies
// them to the hardware (brightness/orientation/screen, Xeneon DDC picture
// values, monitor behavior). Personalization is untouched.
export const resetPanelDeviceHardware = (id: string) =>
  postService<PanelDeviceRecord>(`/panel/devices/${encodeURIComponent(id)}/reset-hardware`, {});

/**
 * Factory reset (Q-series only): restores the panel's personalization AND its
 * hardware settings, then uninstalls and reinstalls the panel software. Returns
 * once the work is QUEUED - the reinstall runs on the shared flash status.
 */
export const factoryResetPanelDevice = (id: string): Promise<unknown | null> =>
  postService(`/panel/devices/${encodeURIComponent(id)}/factory-reset`, {});

export type PanelDeviceFetchResult =
  | { found: true; record: PanelDeviceRecord }
  | { found: false; status: number };

// Status-aware variants so usePanelLayout can distinguish a 404 ("device
// record was wiped, e.g. after a profile switch") from a network failure.
// The non-status variants conflate both as `null` and trigger an infinite
// auto-persist loop when the kiosk holds an id the server no longer knows.
export async function fetchPanelDeviceWithStatus(id: string): Promise<PanelDeviceFetchResult> {
  if (isTunnelActive()) {
    // Bounded: the panel's loading gate is up until this settles, and an
    // unreachable PC leaves the tunnel request pending indefinitely. On
    // timeout the caller gets status 0 and stops auto-persisting, so the
    // default layout it is still holding cannot overwrite the stored one.
    const { response, status } = await relayRequestWithStatus(
      'GET', `/panel/devices/${encodeURIComponent(id)}`, undefined, { timeoutMs: RELAY_BOOT_TIMEOUT_MS });
    if (response && response.ok) return { found: true, record: (await response.json()) as PanelDeviceRecord };
    return { found: false, status };
  }
  if (isRemoteOrigin) return { found: false, status: 0 };
  try {
    let token = await getToken();
    const url = resolveHttp(`/panel/devices/${encodeURIComponent(id)}`);
    const buildInit = (): RequestInit => {
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      return { headers, credentials: 'include', cache: 'no-store' };
    };
    let res = await fetch(url, buildInit());
    if (res.status === 401) {
      const refreshed = await handleUnauthorized();
      if (refreshed) {
        token = refreshed;
        res = await fetch(url, buildInit());
      }
    }
    if (res.status === 404) return { found: false, status: 404 };
    if (!res.ok) return { found: false, status: res.status };
    return { found: true, record: (await res.json()) as PanelDeviceRecord };
  } catch {
    return { found: false, status: 0 };
  }
}

export type PanelDevicePatchResult =
  | { ok: true; record: PanelDeviceRecord }
  | { ok: false; status: number; msg?: string };

// Reads the ApiResponse.Fail body's `msg` off a failed response, so a caller
// can distinguish which 403 (or other error) this was. Never throws - an
// empty or non-JSON body just yields no msg.
async function readErrorMsg(response: Response | null): Promise<string | undefined> {
  if (!response) return undefined;
  try {
    return ((await response.json()) as { msg?: string })?.msg;
  } catch {
    return undefined;
  }
}

export async function patchPanelDeviceWithStatus(id: string, patch: PanelDevicePatch): Promise<PanelDevicePatchResult> {
  if (isTunnelActive()) {
    const { response, status } = await relayRequestWithStatus(
      'POST', `/panel/devices/${encodeURIComponent(id)}`, patch, { timeoutMs: RELAY_BOOT_TIMEOUT_MS });
    if (!response || !response.ok) return { ok: false, status, msg: await readErrorMsg(response) };
    return { ok: true, record: (await response.json()) as PanelDeviceRecord };
  }
  if (isRemoteOrigin) return { ok: false, status: 0 };
  try {
    let token = await getToken();
    const url = resolveHttp(`/panel/devices/${encodeURIComponent(id)}`);
    const buildInit = (): RequestInit => {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      return { method: 'POST', headers, credentials: 'include', body: JSON.stringify(patch) };
    };
    let res = await fetch(url, buildInit());
    if (res.status === 401) {
      const refreshed = await handleUnauthorized();
      if (refreshed) {
        token = refreshed;
        res = await fetch(url, buildInit());
      }
    }
    if (!res.ok) return { ok: false, status: res.status, msg: await readErrorMsg(res) };
    return { ok: true, record: (await res.json()) as PanelDeviceRecord };
  } catch {
    return { ok: false, status: 0 };
  }
}

export interface PanelPhonePairQr {
  url: string;
  qrDataUrl: string;
  machineName?: string;
  ttlSeconds: number;
  expiresAt: number;
}

export interface PanelPhoneClaimResponse {
  paired: boolean;
  token: string;
  machineName?: string;
  error: string;
}

export interface PanelPhoneSession {
  id: string;
  name: string;
  deviceType: string;
  userAgent: string;
  remoteAddress: string;
  createdAt: number;
  lastSeenAt: number;
  expiresAt: number;
  recentlyActive: boolean;
  // How this session's live connection (if any) reached the host: 'relay' when
  // it came in over the cloud relay, 'lan' for a direct LAN connection,
  // 'direct' for the WebRTC data-channel P2P upgrade off a relay session,
  // null when the session is not currently connected. Surfaced by the
  // service's GET /panel/phone/sessions so the dashboard can flag
  // relay-connected / direct-connected devices.
  connectedVia: 'relay' | 'lan' | 'direct' | null;
}

export interface PanelPhoneSessionsResponse {
  connectedCount: number;
  authorizedCount: number;
  sessionIdleMs: number;
  now: number;
  sessions: PanelPhoneSession[];
}

export const fetchPanelStatus = () =>
  fetchService<PanelStatus>('/panel/status');

export const fetchPanelPhonePairQr = () =>
  fetchService<PanelPhonePairQr>('/panel/phone/pair-qr');

export const fetchPanelPhoneSessions = () =>
  fetchService<PanelPhoneSessionsResponse>('/panel/phone/sessions');

/**
 * Decide whether a NEW device just paired, given the previous and next sets of
 * authorized session ids. Fires only on a real growth (an id present in
 * `next` that was not in `prev`) - never on the first observation (prev null),
 * never on a pure revoke/decrease, and never when the membership is unchanged.
 * The pair QR/code are single-use tokens, so a new authorization means the
 * on-screen token has been consumed and must be re-minted.
 */
export function hasNewPairedSession(prev: ReadonlySet<string> | null, next: ReadonlySet<string>): boolean {
  if (prev === null) return false;
  for (const id of next) {
    if (!prev.has(id)) return true;
  }
  return false;
}

export const revokePanelPhoneSession = (id: string) =>
  deleteService<{ error?: boolean; msg?: string }>(`/panel/phone/sessions/${encodeURIComponent(id)}`);

export const revokeAllPanelPhoneSessions = () =>
  deleteService<{ error?: boolean; msg?: string }>('/panel/phone/sessions');

export const renamePanelPhoneSession = (id: string, name: string) =>
  postService<{ error?: boolean; msg?: string }>(`/panel/phone/sessions/${encodeURIComponent(id)}/name`, { name });

export interface RemoteControlState {
  enabled: boolean;
}

// Pair Remote killswitch. When `enabled` is false, the service rejects every
// phone-session-authenticated request with 403 RemoteDisabled and force-closes
// active phone-session WebSockets. Paired devices stay in the sessions list
// and reconnect automatically when re-enabled.
export const fetchPanelRemoteControlState = () =>
  fetchService<RemoteControlState>('/panel/phone/remote-control');

export const setPanelRemoteControlEnabled = (enabled: boolean) =>
  postService<RemoteControlState>('/panel/phone/remote-control', { enabled });

export interface RelayState {
  enabled: boolean;
}

// Cloud relay fallback toggle. When enabled (and remote control is on) the host
// holds an outbound relay socket per phone session so panels can connect when
// the LAN /ws path is unreachable (hotel / client-isolated Wi-Fi). Default OFF
// (cost + privacy); meaningless without remote control, so the UI disables it
// when the killswitch is off.
export const fetchPanelRelay = () =>
  fetchService<RelayState>('/panel/phone/relay');

export const setPanelRelay = (enabled: boolean) =>
  postService<RelayState>('/panel/phone/relay', { enabled });

// Wi-Fi (mDNS) discoverability preference. AirDrop-style three-state. QR + manual
// pair-code flows are unaffected; this only gates the iOS app's "find device on
// Wi-Fi" capability.
export interface PairBroadcastState {
  mode: 'never' | 'always' | 'until';
  untilUnixSeconds: number;
}

export const fetchPanelPairBroadcast = () =>
  fetchService<PairBroadcastState>('/panel/phone/pair-broadcast');

export const setPanelPairBroadcast = (mode: PairBroadcastState['mode'], untilUnixSeconds = 0) =>
  postService<PairBroadcastState>('/panel/phone/pair-broadcast', { mode, untilUnixSeconds });

export interface PanelHostNameResponse {
  machineName: string;
}

/**
 * Set the user-overridden display name for the host PC. Empty / whitespace
 * clears the override so the next read falls back to Environment.MachineName.
 * Returns the resolved name (post-normalization, post-fallback).
 */
export const setPanelHostName = (name: string) =>
  postService<PanelHostNameResponse>('/panel/host-name', { name });

// Manual pair-code flow (BT-SSP Numeric Comparison), alongside the QR flow.
// The dashboard generates a 6-digit code the user types into a phone (no
// camera). The phone POSTs the code and gets a SAS; both sides visually
// compare the SAS and press Allow / Confirm before a session token issues.

export interface PanelPhonePairCodeStart {
  host: string;
  port: number;
  code: string;
  ttlSeconds: number;
  expiresAt: number;
}

export type PanelPhonePairCodeHostDecisionStatus =
  | 'waiting-phone'
  | 'waiting-host'
  | 'approved'
  | 'denied'
  | 'expired'
  | 'unknown';

export interface PanelPhonePairCodeHostDecisionResponse {
  status: PanelPhonePairCodeHostDecisionStatus;
}

export const startPanelPhonePairCode = () =>
  postService<PanelPhonePairCodeStart>('/panel/phone/pair-code/start', {});

export const decidePanelPhonePairCode = (requestId: string, approved: boolean) =>
  postService<PanelPhonePairCodeHostDecisionResponse>(
    '/panel/phone/pair-code/host-decision',
    { requestId, approved },
  );

export type PanelPhonePairCodeFrameKind = 'request' | 'cancelled';
export type PanelPhonePairCodeCancelReason =
  | 'expired'
  | 'phone-denied'
  | 'host-denied'
  | 'host-started-new-code';

export interface PanelPhonePairCodeRequestFrame {
  kind: PanelPhonePairCodeFrameKind;
  requestId: string;
  sas: string;
  deviceLabel: string;
  remoteAddress: string;
  userAgent: string;
  expiresAt: number;
  reason: PanelPhonePairCodeCancelReason | '';
}

/** Bound on the QR claim; an aborted claim surfaces as the pair-expired gate. */
const CLAIM_TIMEOUT_MS = 8000;

export async function claimPanelPhonePairing(pairToken: string, deviceId: string): Promise<PanelPhoneClaimResponse | null> {
  // resolveHttp points at http://localhost on a remote origin. The remote pair
  // flow claims over the relay (pairOverInternet) and lands on /panel/phone
  // WITHOUT a ?pair= token, so this localhost claim only ever runs on the
  // service-served origin; fail closed off-origin rather than fire it.
  if (isRemoteOrigin) return null;
  try {
    // `deviceId` is the stable per-device id (carried from the LAN-direct
    // redirect's ?deviceId=, else this origin's own id) so the service dedups a
    // re-pair of the same device instead of minting a duplicate session.
    // Hard timeout, same reasoning as pingService's: an https->localhost
    // request can stall indefinitely on a browser's private-network preflight.
    // The pair gate cannot offer Retry during the claim (its effect is not
    // cancellable), so this bound is the only thing that ends a stalled claim.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CLAIM_TIMEOUT_MS);
    const res = await fetch(resolveHttp('/panel/phone/claim'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pairToken, deviceId, deviceName: deriveDeviceLabel() }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
    if (!res.ok) {
      try { return (await res.json()) as PanelPhoneClaimResponse; }
      catch { return null; }
    }
    return (await res.json()) as PanelPhoneClaimResponse;
  } catch {
    return null;
  }
}

/**
 * LAN claim against the PC's plain-HTTP listener taken straight from the QR
 * (`host`:`httpPort`), NOT resolveHttp() - which on hellonexus.com points at
 * localhost. Used as the fast-path probe in the internet-pairing flow: when
 * the phone shares the LAN with the PC this succeeds in a few ms; off-LAN it
 * times out via `signal` and the caller falls through to the relay claim.
 */
export async function claimPanelPhonePairingLan(
  host: string,
  httpPort: string,
  pairToken: string,
  signal?: AbortSignal,
): Promise<PanelPhoneClaimResponse | null> {
  try {
    const res = await fetch(`http://${host}:${httpPort}/panel/phone/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pairToken, deviceName: deriveDeviceLabel() }),
      signal,
    });
    if (!res.ok) {
      try { return (await res.json()) as PanelPhoneClaimResponse; }
      catch { return null; }
    }
    return (await res.json()) as PanelPhoneClaimResponse;
  } catch {
    // Aborted (timeout) or unreachable host both land here ⇒ LAN unavailable.
    return null;
  }
}
