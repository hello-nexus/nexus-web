// Smart-lights API wrapper - discovery + pairing + removal of paired network
// lighting devices (Philips Hue, etc.). Per-device color/brightness/power lives
// on the existing /devices/lighting-devices/* routes (see api/lighting.ts); this
// client only covers the management surface. Uses the same authed service
// helpers as every other client.

import { fetchService, postService } from './service';

// A device already paired and exposed by the service.
export interface SmartLight {
  id: string;
  brand: string;
  name: string;
  host: string;
  online: boolean;
  enabled: boolean;
  ledCount: number;
}

export interface SmartLightsResponse {
  devices: SmartLight[];
  // Per-brand scan/probe/visibility toggle; a brand absent here is off.
  brandEnabled?: Record<string, boolean>;
}

// A candidate found during a discovery scan (not yet paired).
export interface DiscoveredSmartLight {
  brand: string;
  host: string;
  name: string;
  stableKey: string;
  alreadyPaired: boolean;
}

export interface DiscoverResponse {
  ok: boolean;
  error?: string;
  devices?: DiscoveredSmartLight[];
}

export interface PairResponse {
  ok: boolean;
  // Action-needed hints the page maps to instructions + retry:
  // 'link-button' (Hue bridge button), 'pairing-mode' (Nanoleaf pairing
  // window), 'lan-control' (Govee Home app LAN Control toggle).
  error?: string;
  added?: number;
  message?: string;
}

export interface RemoveResponse {
  error?: string;
  msg?: string;
}

export const fetchSmartLights = () =>
  fetchService<SmartLightsResponse>('/smart-lights/all');

export const discoverSmartLights = (brand: string) =>
  postService<DiscoverResponse>('/smart-lights/discover', { brand });

// Scan + reconcile a brand: discovers, prunes that brand's paired lights no
// longer present (the way to drop a removed light), and returns the discovery
// candidates for the pair UI. Pruned lights keep their LED mappings.
export const scanSmartLights = (brand: string) =>
  postService<DiscoverResponse>('/smart-lights/scan', { brand });

// Turn a whole brand on or off. Off brands are not scanned, not probed, and
// their lights leave the lighting canvas. Default off.
export const setBrandEnabled = (brand: string, enabled: boolean) =>
  postService<RemoveResponse>('/smart-lights/brand-enable', { brand, enabled });

export const pairSmartLight = (brand: string, host: string, stableKey: string, name: string) =>
  postService<PairResponse>('/smart-lights/pair', { brand, host, stableKey, name });

// Enable/disable a paired light without unpairing it (stays listed; leaves the
// lighting canvas/effects when disabled).
export const setSmartLightEnabled = (id: string, enabled: boolean) =>
  postService<RemoveResponse>('/smart-lights/enable', { id, enabled });
