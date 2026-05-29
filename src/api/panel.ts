import { getToken, handleUnauthorized } from './auth';
import { deleteService, fetchService, postService, resolveHttp } from './service';
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
  dock?: boolean;
  orientation?: string;
  cssWidth?: number;
  cssHeight?: number;
  dpr?: number;
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
  backgroundOpacity?: number;
  widgetOpacity?: number;
  widgetLabels?: boolean;
  themeSyncWithDesktop?: boolean;
  accentSyncWithDesktop?: boolean;
  firstSeenAt: number;
  lastSeenAt: number;
  capabilities?: PanelDeviceCapabilitiesDto;
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
  backgroundOpacity?: number;
  widgetOpacity?: number;
  widgetLabels?: boolean;
  themeSyncWithDesktop?: boolean;
  accentSyncWithDesktop?: boolean;
  capabilities?: PanelDeviceCapabilitiesDto;
}

export const allocatePanelDevice = (capabilities?: PanelDeviceCapabilitiesDto, displayName?: string) =>
  postService<PanelDeviceRecord>('/panel/devices', { displayName, capabilities });

export type PanelAllocResult =
  | { ok: true; record: PanelDeviceRecord }
  | { ok: false; status: number };

// Alloc variant that surfaces the HTTP status. Lets the panel entrypoint show
// a "pair this phone" message on 401/403 and "service unreachable" on others,
// instead of dead-ending with a generic "could not register" toast.
export async function allocatePanelDeviceWithStatus(
  capabilities?: PanelDeviceCapabilitiesDto,
  displayName?: string,
): Promise<PanelAllocResult> {
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

export type PanelDeviceFetchResult =
  | { found: true; record: PanelDeviceRecord }
  | { found: false; status: number };

// Status-aware variants so usePanelLayout can distinguish a 404 ("device
// record was wiped, e.g. after a profile switch") from a network failure.
// The non-status variants conflate both as `null` and trigger an infinite
// auto-persist loop when the kiosk holds an id the server no longer knows.
export async function fetchPanelDeviceWithStatus(id: string): Promise<PanelDeviceFetchResult> {
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
  | { ok: false; status: number };

export async function patchPanelDeviceWithStatus(id: string, patch: PanelDevicePatch): Promise<PanelDevicePatchResult> {
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
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, record: (await res.json()) as PanelDeviceRecord };
  } catch {
    return { ok: false, status: 0 };
  }
}

export const removePanelDevice = (id: string) =>
  deleteService<{ error?: boolean; msg?: string }>(`/panel/devices/${encodeURIComponent(id)}`);

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

// Manual pair-code flow (BT-SSP Numeric Comparison). Additive to the QR
// flow; the dashboard generates a 6-digit code that the user types into
// a phone (no camera needed). The phone POSTs the typed code and gets
// back a SAS; the user visually compares SAS on both screens and both
// sides press Allow / Confirm before a session token is issued.

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

export async function claimPanelPhonePairing(pairToken: string): Promise<PanelPhoneClaimResponse | null> {
  try {
    const res = await fetch(resolveHttp('/panel/phone/claim'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pairToken }),
    });
    if (!res.ok) {
      try { return (await res.json()) as PanelPhoneClaimResponse; }
      catch { return null; }
    }
    return (await res.json()) as PanelPhoneClaimResponse;
  } catch {
    return null;
  }
}
