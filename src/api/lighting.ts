// Lighting API wrapper — authenticated fetch/post to the local service.

import { fetchService, postService, deleteService, resolveAuthWs } from './service';

export async function lightingOutputUrl(): Promise<string> {
  return resolveAuthWs('/lighting/output');
}

// --- Effect thumbnails ---

// Effect thumbnails are served with a 24h browser cache. This token cache-
// busts them: increment on any shader edit that alters how an effect looks,
// so every client refetches the new URL once then re-caches.
export const EFFECT_THUMB_VERSION = 2;

/** Path to an effect's preview thumbnail, cache-busted by EFFECT_THUMB_VERSION. */
export const effectThumbnailPath = (key: string) =>
  `/lighting/effects/${encodeURIComponent(key)}/thumbnail.bmp?v=${EFFECT_THUMB_VERSION}`;

// --- Shader source (for client-side WebGL rendering) ---

export interface ShaderSource { frag: string; }

const shaderCache = new Map<string, ShaderSource>();

export async function fetchShaderSource(name: string): Promise<ShaderSource | null> {
  const cached = shaderCache.get(name);
  if (cached) return cached;
  const src = await fetchService<ShaderSource>(`/lighting/shaders/${encodeURIComponent(name)}`);
  if (src) shaderCache.set(name, src);
  return src;
}

// --- Current state ---

export interface CurrentSyncResponse {
  sync: string;
}

export const fetchCurrentSync = () =>
  fetchService<CurrentSyncResponse>('/lighting/current');

// --- Effect activation ---

export interface AnimateEffectState {
  speed: number;
  intensity: number;
  hue: number;
  colorize: number;
  saturation: number;
  contrast: number;
  params: Record<string, number>;
}

export interface AnimateEffectTemplateBundle {
  selected: number;
  slots: AnimateEffectState[];
}

export interface AnimateSettings {
  effect: string;
  states: Record<string, AnimateEffectState>;
  templates?: Record<string, AnimateEffectTemplateBundle>;
}

export const fetchAnimateSettings = () =>
  fetchService<AnimateSettings>('/lighting/animate/settings');

export const saveAnimateTemplates = (templates: Record<string, AnimateEffectTemplateBundle>) =>
  postService('/lighting/animate/templates', { templates });

export const startAnimate = (
  effect: string,
  speed = 50,
  intensity = 1,
  hue = 0,
  colorize = 0,
  saturation = 1,
  contrast = 1,
  params?: Record<string, number>,
  // False during live slider drag to skip the settings-disk write; default
  // true for mode switches / restart replay.
  persist = true,
) =>
  postService('/lighting/animate/headless-start', {
    effect, speed, noise: 0, filter: 'none', intensity, scheme: [], hue, sat: 0,
    colorize, saturation, contrast,
    params: params ? Object.entries(params).map(([name, value]) => ({ name, value })) : [],
    persist,
  });

export const startScreenMirror = (saturation = 1, contrast = 1, monitor = '', hue = 0, colorize = 0) =>
  postService('/lighting/screen/headless-start', {
    monitor, effect: 'average', saturation, contrast, blur: 0, hue, colorize,
  });

// Post-process params persisted across sessions, shared by Mirror + Media:
// hue shift, colorize, saturation, contrast, plus optional H/V flip, applied
// after the capture/playback frame and before blit to the LED canvas. Flip
// is geometric and runs before the colour transform.
export interface PostProcessSettings {
  hue: number;
  colorize: number;
  saturation: number;
  contrast: number;
  flipX?: boolean;
  flipY?: boolean;
}

export const fetchScreenEffect = () =>
  fetchService<PostProcessSettings>('/lighting/screen/effect');

export const setScreenEffect = (v: PostProcessSettings, persist = true) =>
  postService('/lighting/screen/effect', {
    hue: v.hue,
    colorize: v.colorize,
    saturation: v.saturation,
    contrast: v.contrast,
    flipX: !!v.flipX,
    flipY: !!v.flipY,
    persist,
  });

export const fetchMediaEffect = () =>
  fetchService<PostProcessSettings>('/lighting/media/effect');

export const setMediaEffect = (v: PostProcessSettings, persist = true) =>
  postService('/lighting/media/effect', {
    hue: v.hue,
    colorize: v.colorize,
    saturation: v.saturation,
    contrast: v.contrast,
    flipX: !!v.flipX,
    flipY: !!v.flipY,
    persist,
  });

// --- Screen monitor enumeration ---

export interface ScreenMonitor {
  id: string;
  name: string;
}

export interface ScreenSyncOptions {
  effects: string[];
  monitors: ScreenMonitor[];
  // 'app' = pick a monitor from the list; 'system' = the OS picker chooses
  // (Linux/Wayland), so show a "Change screen" action instead of a dropdown.
  selectionMode?: 'app' | 'system';
}

export const fetchScreenMonitors = () =>
  fetchService<ScreenSyncOptions>('/lighting/screen/monitors');

// Re-open the OS screen picker to change the mirrored screen (Wayland).
export const reselectScreen = () =>
  postService('/lighting/screen/reselect', {});

export const stopLighting = () =>
  postService('/lighting/stop', {});

// --- Music reactive (audio capture -> shader audio uniforms) ---

export const fetchMusicReactive = () =>
  fetchService<{ enabled: boolean }>('/lighting/music-reactive');

export const setMusicReactive = (enabled: boolean) =>
  postService('/lighting/music-reactive', { enabled });

// --- Device list ---

export interface LightingDevice {
  id: string;
  name: string;
  type?: string;
  iconType?: string;
  ledsOn: boolean;
  brightness?: number;
  ledCount: number;
  /** Cross-install hardware fingerprint for community mapping lookup. Empty when the device cannot be fingerprinted; all community mapping UI hides itself then. */
  deviceKey?: string;
  canvasX: number;
  canvasY: number;
  canvasW: number;
  canvasH: number;
  canvasRotation: number;
  // Set only for motherboard zone cards - the service splits a motherboard
  // with >1 ARGB headers into one card per zone so the user can configure +
  // control each physical strip independently.
  parentDeviceId?: string;
  zoneIndex?: number;
  zoneType?: 'single' | 'linear' | 'matrix' | string;
  zoneResizable?: boolean;
}

export interface LightingDevicesResponse {
  isInit: boolean;
  devices: LightingDevice[];
}

export const fetchLightingDevices = () =>
  fetchService<LightingDevicesResponse>('/devices/lighting-devices/all');

export const saveDeviceLayout = (id: string, x: number, y: number, w: number, h: number, rotation: number = 0) =>
  postService('/devices/lighting-devices/layout', { id, x, y, w, h, rotation });

// Clears every persisted device-frame layout so each card snaps to its
// provider-computed default position/size/rotation on the next GetAll. The
// service broadcasts a lighting topic frame after the clear so clients
// refetch.
export const resetDeviceLayouts = () =>
  deleteService('/devices/lighting-devices/layouts');

export const setLightingDevicePower = (id: string, on: boolean) =>
  postService('/devices/lighting-devices/power', { id, on });

// Per-device brightness multiplier (0..100). Applied in the RGB bridge so the
// canvas preview stays at full brightness while the LED output dims.
export const setLightingDeviceBrightness = (id: string, brightness: number) =>
  postService('/devices/lighting-devices/brightness', { id, brightness });

// Master brightness multiplier (0..1). Multiplies every per-device value so
// the effective brightness for an LED is `global * device / 100`.
export const fetchGlobalBrightness = () =>
  fetchService<{ value: number }>('/lighting/global-brightness');

export const setGlobalBrightness = (value: number) =>
  postService('/lighting/global-brightness', { value });

// Resize a motherboard ARGB zone's LED count. Persisted + applied live via
// OpenRGB's RESIZEZONE opcode. Only valid for split zone ids ("openrgb-N-Z").
export const setZoneLedCount = (id: string, count: number) =>
  postService('/devices/lighting-devices/zone-size', { id, count });

// Pulse a device (or motherboard zone) with a distinctive color for a few
// seconds to spot which physical strip is which. Overlays the active effect
// without pausing it.
export const identifyLightingDevice = (id: string, durationMs: number = 2000) =>
  postService('/devices/lighting-devices/identify', { id, durationMs });

// Force OpenRGB subprocess restart → full device re-enumeration. Used when
// a device was plugged but the OpenRGB daemon didn't notice (plugin that only
// scans at startup, etc.). Normal hot-plug is handled automatically.
export const rescanLightingDevices = () =>
  postService('/devices/lighting-devices/rescan', {});

// --- LED map ---

export interface LedMapEntry {
  index: number;
  u: number;
  v: number;
  name: string;
  zoneType: string;
  isCustom: boolean;
  /** True when the LED is logically removed from the effect mapping. The service writes black for these LEDs; the editor parks them below the device frame so the user can drag them back in to re-enable. */
  disabled: boolean;
}

/** Inclusive LED index range. */
export interface LedGroupRange {
  start: number;
  end: number;
}

/** Named LED segment inside a device's map ("Fan 1"). */
export interface LedGroup {
  name: string;
  ranges: LedGroupRange[];
}

/** Local apply state for a community / file mapping on one device. */
export interface AppliedMappingSummary {
  /** Registry id when the mapping came from the community; null for file imports. */
  mappingId: string | null;
  name: string;
  /** "community" | "file" */
  source: string;
  contentHash: string;
  autoApplied: boolean;
  appliedAtMs: number;
}

export interface LedMapResponse {
  id: string;
  ledCount: number;
  leds: LedMapEntry[];
  hasCustomOverrides: boolean;
  aspectRatio: number;
  /** Named LED segments (resolved: user delta wins over the applied mapping's groups). */
  groups?: LedGroup[];
  /** Set when a community/file mapping is applied to this device. */
  applied?: AppliedMappingSummary | null;
  deviceKey?: string;
}

export const fetchLedMap = (id: string) =>
  fetchService<LedMapResponse>(`/devices/lighting-devices/${encodeURIComponent(id)}/led-map`);

export const fetchLedMapDefaults = (id: string) =>
  fetchService<LedMapResponse>(`/devices/lighting-devices/${encodeURIComponent(id)}/led-map?defaults=true`);

// Saves the user-delta layer only. Omitted groups leave the stored user
// groups untouched while a list (even empty) replaces them; a zero aspect
// ratio is ignored by the service while a positive one persists as a user
// delta. The editor sends groups / a ratio only when the user edited them
// this session so an applied community mapping never bakes into the delta.
export const saveLedMap = (
  id: string,
  overrides: { ledIndex: number; u: number; v: number; disabled?: boolean }[],
  aspectRatio: number,
  groups?: LedGroup[],
) =>
  postService(`/devices/lighting-devices/${encodeURIComponent(id)}/led-map`, {
    overrides,
    aspectRatio,
    ...(groups !== undefined ? { groups } : {}),
  });

export const resetLedMap = (id: string) =>
  deleteService(`/devices/lighting-devices/${encodeURIComponent(id)}/led-map`);

export const highlightLeds = (id: string, indices: number[]) =>
  postService(`/devices/lighting-devices/${encodeURIComponent(id)}/led-highlight`, { indices });

export const testLedPattern = (id: string, pattern: string) =>
  postService(`/devices/lighting-devices/${encodeURIComponent(id)}/led-test-pattern`, { pattern });

export const clearLedEditor = (id: string) =>
  deleteService(`/devices/lighting-devices/${encodeURIComponent(id)}/led-editor`);

// --- Community LED mappings ---

/** Base response envelope shared by the mapping mutation endpoints. */
export interface ApiEnvelope {
  error: boolean;
  msg: string;
}

export interface MappingArtifactLed {
  i: number;
  u: number;
  v: number;
}

export interface MappingArtifactZone {
  zoneIndex: number;
  /** Target LED count. Null = keep the device default. */
  ledCount?: number | null;
  aspectRatio?: number | null;
  leds: MappingArtifactLed[];
  disabled?: number[];
  groups?: LedGroup[];
}

/** The shareable unit: a device's full LED layout, names, and groups. */
export interface MappingArtifact {
  schemaVersion: number;
  name: string;
  description?: string;
  device: { key: string; match?: unknown };
  zones: MappingArtifactZone[];
}

export interface CommunityMapping {
  id: string;
  name: string;
  description?: string;
  deviceKey: string;
  contentHash: string;
  origin: 'community' | 'verified';
  autoApply: boolean;
  score: number;
  adopterCount: number;
  authorName?: string;
  payload?: MappingArtifact | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface DeviceMappingsResponse extends ApiEnvelope {
  deviceKey: string;
  /** True when the registry was unreachable and items come from the disk cache. */
  offline: boolean;
  items: CommunityMapping[];
  applied: AppliedMappingSummary | null;
  /** True when the user undid an auto-apply on this device. */
  autoApplyDeclined: boolean;
}

export interface PublishMappingResponse extends ApiEnvelope {
  mappingId?: string | null;
  /** True when the registry already had an identical artifact and returned the existing row. */
  alreadyExisted: boolean;
}

export interface ExportMappingResponse extends ApiEnvelope {
  artifact: MappingArtifact | null;
}

export interface MappingsAvailableResponse extends ApiEnvelope {
  /** Device id -> cached community mapping count (only nonzero entries). */
  counts: Record<string, number>;
}

// Must match the publish-failure msg in nexus-service MappingRoutes.cs; it is
// the only failure the UI maps to a friendlier localized explanation.
export const PUBLISH_NEEDS_ANONYMOUS_MSG = 'publish failed or anonymous data is disabled';

/** Multiplex topic announcing a silent auto-apply on a newly seen device. */
export const MAPPING_APPLIED_TOPIC = 'lighting/mapping-applied';

export interface MappingAppliedFrame {
  revision: number;
  deviceId: string;
  deviceName: string;
  mappingId: string;
  mappingName: string;
  adopterCount: number;
}

export const fetchDeviceMappings = (id: string, refresh = false) =>
  fetchService<DeviceMappingsResponse>(`/devices/lighting-devices/${encodeURIComponent(id)}/mappings?refresh=${refresh}`);

export const applyDeviceMapping = (id: string, mappingId: string) =>
  postService<ApiEnvelope>(`/devices/lighting-devices/${encodeURIComponent(id)}/mappings/apply`, { mappingId });

// reason feeds the registry quality loop: "undo" only from the auto-apply
// toast, "switched" when the user picks another mapping or goes back to the
// default from the list.
export const revertDeviceMapping = (id: string, reason: 'undo' | 'switched' | 'reset') =>
  deleteService<ApiEnvelope>(`/devices/lighting-devices/${encodeURIComponent(id)}/mapping?reason=${reason}`);

export const importDeviceMapping = (id: string, artifact: MappingArtifact) =>
  postService<ApiEnvelope>(`/devices/lighting-devices/${encodeURIComponent(id)}/mappings/import`, artifact);

export const exportDeviceMapping = (id: string) =>
  fetchService<ExportMappingResponse>(`/devices/lighting-devices/${encodeURIComponent(id)}/mapping/export`);

export const publishDeviceMapping = (id: string, body: { name: string; description?: string; authorName?: string }) =>
  postService<PublishMappingResponse>(`/devices/lighting-devices/${encodeURIComponent(id)}/mappings/publish`, body);

/** Cache-only count lookup for the device-card badges; never hits the network. */
export const fetchAvailableMappings = () =>
  fetchService<MappingsAvailableResponse>('/devices/lighting-devices/mappings/available');
