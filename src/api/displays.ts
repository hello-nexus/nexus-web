import { deleteService, fetchService, postService } from './service';
import type { PanelDeviceRecord } from './panel';

export interface DisplayCapabilities {
  brightness: boolean;
  contrast: boolean;
  colorTempPresets: string[];
  inputSources: string[];
  volume: boolean;
}

export interface DisplayBrightnessControl {
  supported: boolean;
  min: number;
  max: number;
  current: number | null;
  controlPath: 'unsupported' | 'ddc-ci' | 'windows-internal' | 'linux-backlight' | 'macos-internal' | string;
  writeMode: 'unsupported' | 'immediate' | 'coalesced' | 'commit-only' | string;
  writeCooldownMs: number;
  verifyAfterWrite: boolean;
  unsupportedReason: string;
}

export interface Display {
  id: string;
  name: string;
  manufacturer: string;
  model: string;
  isInternal: boolean;
  isDdcCapable: boolean;
  capabilities: DisplayCapabilities;
  brightnessControl: DisplayBrightnessControl;
}

export interface DisplayListResponse {
  displays: Display[];
  hint: string;
}

export interface DisplayBrightnessResponse {
  id: string;
  brightness: number;
  requestedBrightness: number;
  appliedBrightness: number;
  status: 'applied' | 'unsupported' | 'failed' | string;
  error: string;
}

export interface DisplayBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DisplaySize {
  width: number;
  height: number;
}

export interface TopologyDisplay {
  id: string;
  /** OS display number (Windows settings numbering); 0 = unknown. */
  number: number;
  name: string;
  manufacturer: string;
  model: string;
  /** Virtual-desktop bounds; null when the platform reports no positions (Linux). */
  bounds: DisplayBounds | null;
  resolution: DisplaySize;
  scaleFactor: number | null;
  dpi: number | null;
  isPrimary: boolean;
  isInternal: boolean;
  /** An integrated touch digitizer targets this monitor. */
  isTouch: boolean;
  /** Current OS rotation ('Landscape' | 'Portrait' | ...); '' when unknown. */
  orientation: string;
  /** The Y70's own monitor: auto-managed, never promotable here. */
  isY70: boolean;
  hostingSupported: boolean;
  assignedPanelDeviceId: string | null;
  assignedPanelName: string | null;
}

export interface DisplayTopology {
  hostingSupported: boolean;
  /** Promoted-monitor rotation availability on the host OS (Windows only). */
  rotationSupported: boolean;
  /** "Keep panel clear of other windows" availability on the host OS (Windows only). */
  reserveSupported: boolean;
  positionsAvailable: boolean;
  revision: number;
  displays: TopologyDisplay[];
  hint: string;
}

export async function fetchDisplays(): Promise<DisplayListResponse | null> {
  return fetchService<DisplayListResponse>('/displays');
}

export async function fetchDisplayTopology(): Promise<DisplayTopology | null> {
  return fetchService<DisplayTopology>('/displays/topology');
}

export async function promoteDisplayToPanel(id: string): Promise<PanelDeviceRecord | null> {
  return postService<PanelDeviceRecord>(`/displays/${encodeURIComponent(id)}/panel`, {});
}

export async function demoteDisplayPanel(id: string): Promise<{ error?: boolean } | null> {
  return deleteService<{ error?: boolean }>(`/displays/${encodeURIComponent(id)}/panel`);
}

export async function rotateDisplay(id: string, orientation: string): Promise<{ error?: boolean } | null> {
  return postService<{ error?: boolean }>(`/displays/${encodeURIComponent(id)}/rotation`, { orientation });
}

export async function fetchDisplayBrightness(id: string): Promise<DisplayBrightnessResponse | null> {
  return fetchService<DisplayBrightnessResponse>(`/displays/${encodeURIComponent(id)}/brightness`);
}

export async function setDisplayBrightness(id: string, brightness: number): Promise<DisplayBrightnessResponse | null> {
  return postService<DisplayBrightnessResponse>(`/displays/${encodeURIComponent(id)}/brightness`, { brightness });
}
