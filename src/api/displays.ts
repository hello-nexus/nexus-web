import { authFetchWithStatus, deleteService, fetchService, postService } from './service';
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
  /** False when the user turned brightness control off for this display; Nexus then sends it no DDC/CI at all. */
  ddcEnabled: boolean;
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
  /** False when the user turned brightness control off for this display. */
  ddcEnabled: boolean;
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

/**
 * Turn DDC/CI brightness control on or off for one display. Off means the
 * service sends that monitor nothing at all, capability probe included - the
 * escape hatch for a panel whose firmware hangs on a DDC transaction.
 */
export async function setDisplayDdc(id: string, enabled: boolean): Promise<{ enabled: boolean } | null> {
  return postService<{ enabled: boolean }>(`/displays/${encodeURIComponent(id)}/ddc`, { enabled });
}

export async function fetchDisplayBrightness(id: string): Promise<DisplayBrightnessResponse | null> {
  return fetchService<DisplayBrightnessResponse>(`/displays/${encodeURIComponent(id)}/brightness`);
}

export async function setDisplayBrightness(id: string, brightness: number): Promise<DisplayBrightnessResponse | null> {
  return postService<DisplayBrightnessResponse>(`/displays/${encodeURIComponent(id)}/brightness`, { brightness });
}

// Corsair Xeneon Edge native display settings (brightness/backlight/contrast/
// RGB), read/written over its vendor HID channel. Replaces the generic DDC
// brightness path above for this curated panel family - see
// DisplayBrightnessController.IsXeneonEdge on the service. Every field is
// nullable to mirror the wire DTO: a GET returns all six on a successful
// read; a POST body carries only the fields being changed.
export interface XeneonEdgeSettings {
  brightness: number | null;
  backlight: number | null;
  contrast: number | null;
  red: number | null;
  green: number | null;
  blue: number | null;
}

export async function fetchXeneonEdgeSettings(id: string): Promise<XeneonEdgeSettings | null> {
  return fetchService<XeneonEdgeSettings>(`/displays/${encodeURIComponent(id)}/xeneon-settings`);
}

export async function setXeneonEdgeSettings(
  id: string,
  patch: Partial<XeneonEdgeSettings>,
): Promise<XeneonEdgeSettings | null> {
  return postService<XeneonEdgeSettings>(`/displays/${encodeURIComponent(id)}/xeneon-settings`, patch);
}

export interface TouchMappingRepairResponse {
  status: 'repaired' | 'alreadyCorrect' | 'noPanel' | 'noDigitizer' | 'noHelper' | 'failed';
  detail?: string;
}

export async function repairTouchMapping(): Promise<TouchMappingRepairResponse | null> {
  return postService<TouchMappingRepairResponse>('/displays/touch-mapping/repair', {});
}

// The wizard endpoint replies 202 with no body (the wizard runs on the host,
// not over this request), so it is checked by status rather than parsed as
// JSON like the other mutators here.
export async function launchTouchSetupWizard(): Promise<boolean> {
  const { status } = await authFetchWithStatus('/displays/touch-mapping/setup-wizard', { method: 'POST', body: {} });
  return status === 202;
}
