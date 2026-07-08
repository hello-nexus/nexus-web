// Lighting API wrapper - authenticated fetch/post to the local service.

import { fetchService, postService, deleteService, putService, resolveAuthWs } from './service';

export async function lightingOutputUrl(): Promise<string> {
  return resolveAuthWs('/lighting/output');
}

// --- Effect thumbnails ---

// Presets are universal, so a thumbnail is identified by (effect, slot). The
// service renders + caches per slot; the client busts the browser cache with a
// content hash of the slot's saved look (`version`), so a stale URL is never
// pinned. EFFECT_THUMB_VERSION is the global kill-switch (bump on a shader or
// render-path change to invalidate every thumbnail at once).
export const EFFECT_THUMB_VERSION = 4;

/**
 * Path to a preset slot's universal thumbnail. `version` is a content hash of
 * the slot's saved look (see slotThumbSignature) - the URL changes, and the
 * browser refetches, only when that slot's look changes.
 */
export const effectThumbnailPath = (key: string, slot: number, version: string) =>
  `/lighting/effects/${encodeURIComponent(key)}/thumbnail.bmp?slot=${slot}&v=${EFFECT_THUMB_VERSION}.${version}`;

// --- Shader source (for client-side WebGL rendering) ---

export interface ShaderSource { frag: string; }

const shaderCache = new Map<string, ShaderSource>();

/**
 * Seeds the shader cache with locally bundled GLSL so useShaderRenderer works
 * without a reachable service. The marketing site primes its committed copy of
 * the composed plasma shader this way; fetchShaderSource then never hits the
 * network for that effect.
 */
export function primeShaderSource(name: string, frag: string): void {
  shaderCache.set(name, { frag });
}

export async function fetchShaderSource(name: string): Promise<ShaderSource | null> {
  const cached = shaderCache.get(name);
  if (cached) return cached;
  const src = await fetchService<ShaderSource>(`/lighting/shaders/${encodeURIComponent(name)}`);
  if (src) shaderCache.set(name, src);
  return src;
}

// --- Service status ---

export interface LightingStatusResponse {
  gpuAvailable: boolean;
}

export const fetchLightingStatus = () =>
  fetchService<LightingStatusResponse>('/lighting/status');

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
  reactive?: boolean;
  reactivity?: number;
  intensity?: number;
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
    reactive: !!v.reactive,
    reactivity: v.reactivity ?? 0.5,
    intensity: v.intensity ?? 0.5,
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

// --- Render GPU (which card runs the lighting shaders) ---
// Machine-specific (the GPU model name), so it lives in the service config, not
// the cloud-synced UI prefs. Restart-to-apply: setRenderGpu persists + writes
// the OS preference; restartService applies it.
export interface RenderGpuState { value: string; }

export const fetchRenderGpu = () =>
  fetchService<RenderGpuState>('/lighting/render-gpu');

export const setRenderGpu = (value: string) =>
  postService('/lighting/render-gpu', { value });

export const restartService = () =>
  postService('/service/restart', {});

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
  /** Current hue, 0..1. Set only for color-capable smart lights. */
  hue?: number;
  /** Current saturation, 0..1. Set only for color-capable smart lights. */
  saturation?: number;
  ledCount: number;
  /** LEDs not disabled by the user map. Undefined on older services; the UI falls back to ledCount then. */
  enabledLedCount?: number;
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
  /** Enumeration-unit device id that owns this card's zone; routing target for the device-scoped LED map editor. Equals `id` for single-zone standalone devices. */
  deviceId?: string;
  /** False for smart lights / 1-LED devices; the editor hides all zone management then. */
  zoneCustomizable?: boolean;
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

export interface DeviceLayoutDto {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
}

export interface LayoutPreset {
  id: string;
  name: string;
  layouts: Record<string, DeviceLayoutDto>;
}

export interface LayoutPresetsResponse {
  presets: LayoutPreset[];
  activeId: string | null;
}

export const fetchLayoutPresets = () =>
  fetchService<LayoutPresetsResponse>('/devices/lighting-devices/layout-presets');

export const createLayoutPreset = (name: string) =>
  postService<{ preset: LayoutPreset; activeId: string | null }>('/devices/lighting-devices/layout-presets', { name });

export const updateLayoutPreset = (id: string, body: { name?: string; saveCurrent?: boolean }) =>
  putService('/devices/lighting-devices/layout-presets/' + encodeURIComponent(id), body);

export const deleteLayoutPreset = (id: string) =>
  deleteService<{ activeId: string | null }>('/devices/lighting-devices/layout-presets/' + encodeURIComponent(id));

export const setActiveLayoutPreset = (id: string | null) =>
  putService('/devices/lighting-devices/layout-presets/active', { id });

export const activateLayoutPreset = (id: string) =>
  postService('/devices/lighting-devices/layout-presets/' + encodeURIComponent(id) + '/activate', {});

export const applyDeviceLayouts = (layouts: Record<string, DeviceLayoutDto>) =>
  postService('/devices/lighting-devices/layouts', { layouts });

export const setLightingDevicePower = (id: string, on: boolean) =>
  postService('/devices/lighting-devices/power', { id, on });

// Per-device brightness multiplier (0..100). Applied in the RGB bridge so the
// canvas preview stays at full brightness while the LED output dims.
export const setLightingDeviceBrightness = (id: string, brightness: number) =>
  postService('/devices/lighting-devices/brightness', { id, brightness });

// Per-device color for color-capable smart lights. Hue + saturation are floats
// in 0..1; both are sent on every call so the service has the full HS pair.
export const setLightingDeviceColor = (id: string, hue: number, saturation: number) =>
  postService('/devices/lighting-devices/color', { id, hue, saturation });

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

export const highlightLeds = (id: string, indices: number[]) =>
  postService(`/devices/lighting-devices/${encodeURIComponent(id)}/led-highlight`, { indices });

export const testLedPattern = (id: string, pattern: string) =>
  postService(`/devices/lighting-devices/${encodeURIComponent(id)}/led-test-pattern`, { pattern });

export const clearLedEditor = (id: string) =>
  deleteService(`/devices/lighting-devices/${encodeURIComponent(id)}/led-editor`);

export const postLedPreviewLayout = (id: string, ledCount: number, leds: { index: number; u: number; v: number; disabled: boolean }[]) =>
  postService(`/devices/lighting-devices/${encodeURIComponent(id)}/led-preview-layout`, { ledCount, leds });

// --- Device structure & zones (device-scoped LED map editor) ---

/** One zone slice, local to a segment: a contiguous run of that segment's LEDs. */
export interface ZoneSlice {
  segment: number;
  start: number;
  count: number;
}

/** Hardware-reported subdivision of a device's LED space. */
export interface DeviceSegment {
  index: number;
  name: string;
  ledCount: number;
  /** True when the protocol lets the user re-wire the LED count (motherboard ARGB headers); such segments are partition walls. */
  resizable: boolean;
  zoneType: string;
}

/** User-defined run of the device's LED space; maps 1:1 to a lighting card. */
export interface DeviceZone {
  /** Card id of this zone (legacy card ids for default partitions, `{deviceId}:z{ordinal}` for custom ones). */
  id: string;
  name: string;
  slices: ZoneSlice[];
}

export interface HubComposition {
  hubId: string;
  hubKind: 'lianli' | 'smarthub';
  portCount: number;
  hasRingsAxis: boolean;
  hasPortToggle: boolean;
  hasMirror: boolean;
  mirror: boolean;
  combineRings: boolean;
  activePorts: boolean[];
}

export interface HubCompositionPatch {
  mirror?: boolean;
  combineRings?: boolean;
  ports?: boolean[];
}

export interface DeviceStructureResponse {
  id: string;
  name: string;
  deviceKey: string;
  segments: DeviceSegment[];
  zones: DeviceZone[];
  isDefaultPartition: boolean;
  hubComposition?: HubComposition;
}

/** Zone definition as posted back to the service (ids are service-assigned). */
export interface DeviceZoneDef {
  name: string;
  slices: ZoneSlice[];
}

export const fetchDeviceStructure = (deviceId: string) =>
  fetchService<DeviceStructureResponse>(`/devices/lighting-devices/${encodeURIComponent(deviceId)}/structure`);

export const setHubComposition = (hubKind: 'lianli' | 'smarthub', patch: HubCompositionPatch) =>
  putService<ApiEnvelope>(`/devices/${encodeURIComponent(hubKind)}/composition`, patch);

// Replaces the device's partition with the posted zone list. The service
// validates full segment cover, rebuilds cards/frames, drops stale per-zone
// state, and broadcasts a lighting refresh.
export const saveDeviceZones = (deviceId: string, zones: DeviceZoneDef[]) =>
  postService<ApiEnvelope>(`/devices/lighting-devices/${encodeURIComponent(deviceId)}/zones`, { zones });

export const resetDeviceZones = (deviceId: string) =>
  deleteService<ApiEnvelope>(`/devices/lighting-devices/${encodeURIComponent(deviceId)}/zones`);

// --- Device-scoped LED map ---

export interface DeviceMapLed {
  /** Segment-local LED index (the override key). */
  index: number;
  u: number;
  v: number;
  disabled: boolean;
  /** Id of the zone this LED currently belongs to. */
  zoneId: string;
  /** True when a stored user override owns this LED's position / disabled state. */
  isCustom: boolean;
}

export interface DeviceMapSegment {
  index: number;
  name: string;
  resizable: boolean;
  ledCount: number;
  leds: DeviceMapLed[];
}

export interface DeviceMapResponse {
  id: string;
  segments: DeviceMapSegment[];
  aspectRatio: number;
}

/** Segment-local LED override as posted to the device-scoped map endpoint. */
export interface DeviceMapOverride {
  segment: number;
  ledIndex: number;
  u: number;
  v: number;
  disabled: boolean;
}

export const fetchDeviceMap = (deviceId: string) =>
  fetchService<DeviceMapResponse>(`/devices/lighting-devices/${encodeURIComponent(deviceId)}/device-map`);

// Factory view of the device map: same shape as the normal GET, but with
// user overrides, the stored aspect ratio, and applied community mappings
// dropped. The partition and wired LED counts are kept.
export const fetchDeviceMapDefaults = (deviceId: string) =>
  fetchService<DeviceMapResponse>(`/devices/lighting-devices/${encodeURIComponent(deviceId)}/device-map?defaults=true`);

// Factory reset: clears the device's stored LED overrides and aspect ratio
// server-side and refreshes the engine.
export const resetDeviceMap = (deviceId: string) =>
  deleteService<ApiEnvelope>(`/devices/lighting-devices/${encodeURIComponent(deviceId)}/device-map`);

// Saves the user-delta layer only: touched LEDs as segment-local overrides,
// plus the aspect ratio when the user adjusted it this session (zero is
// ignored by the service so a mapping-supplied ratio never bakes into the
// user delta).
export const saveDeviceMap = (deviceId: string, overrides: DeviceMapOverride[], aspectRatio: number) =>
  postService<ApiEnvelope>(`/devices/lighting-devices/${encodeURIComponent(deviceId)}/device-map`, {
    overrides,
    aspectRatio,
  });

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

// Publish carries no user-authored text: the service derives the public name
// from the device itself, so there is nothing to sanitize.
export const publishDeviceMapping = (id: string) =>
  postService<PublishMappingResponse>(`/devices/lighting-devices/${encodeURIComponent(id)}/mappings/publish`, {});

/** Cache-only count lookup for the device-card badges; never hits the network. */
export const fetchAvailableMappings = () =>
  fetchService<MappingsAvailableResponse>('/devices/lighting-devices/mappings/available');

// --- Game Sync ---

export interface GameSyncDevice {
  name: string;
  archetype: string;
  ledCount: number;
}

export interface GameSyncStateResponse {
  active: boolean;
  devices: GameSyncDevice[];
  lastFrameAt?: number | null;
  activeApp?: string | null;
}

export const startGameSync = () =>
  postService('/lighting/game-sync/start', {});

export const fetchGameSyncState = () =>
  fetchService<GameSyncStateResponse>('/lighting/game-sync/state');

export interface GameSyncGame {
  name: string;
  store: string;
  emitsChroma: boolean;
  /** Steam appid; empty string for non-Steam games. */
  appId: string;
  /** True when the game emits GSI frames (e.g. CS2 appid 730). */
  emitsGsi: boolean;
  scannedFiles: number;
  skippedFiles: number;
}

export type SteamArtworkKind = 'header' | 'capsule_231x87';

/**
 * Cloudflare Steam CDN artwork URL. Returns null for non-numeric or empty appIds
 * (non-Steam games have appId="" and must fall through to the icon placeholder).
 */
export function steamArtworkUrl(appId: string, kind: SteamArtworkKind): string | null {
  if (!appId || !/^\d+$/.test(appId)) return null;
  const file = kind === 'header' ? 'header.jpg' : 'capsule_231x87.jpg';
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/${file}`;
}

export interface GameSyncGamesResponse {
  scanning: boolean;
  scannedAt: number | null;
  games: GameSyncGame[];
}

export const fetchGameSyncGames = (refresh = false) =>
  fetchService<GameSyncGamesResponse>(`/lighting/game-sync/games${refresh ? '?refresh=true' : ''}`);

export const triggerGameSyncScan = () =>
  postService('/lighting/game-sync/games/scan', {});

/**
 * GSI title -> Steam appId aliases. GSI reports a display name that may differ
 * from the Steam library entry (e.g. CS2 GSI sends "Counter-Strike 2" but the
 * Steam library entry is "Counter-Strike Global Offensive", appId 730).
 */
const GSI_APPID_ALIASES: Record<string, string> = {
  'counter-strike 2': '730',
  'cs2': '730',
};

/**
 * Resolves an activeApp name to a detected game, tolerating known GSI title
 * mismatches. Match order: (1) exact case-insensitive, (2) substring, (3)
 * GSI alias table mapped to appId.
 */
export function resolveActiveGame(activeApp: string, games: GameSyncGame[]): GameSyncGame | null {
  if (!activeApp) return null;
  const needle = activeApp.toLowerCase().trim();

  // 1. Exact match.
  const exact = games.find(g => g.name.toLowerCase().trim() === needle);
  if (exact) return exact;

  // 2. Substring match (either name contains the other).
  const sub = games.find(g => {
    const hay = g.name.toLowerCase().trim();
    return hay.includes(needle) || needle.includes(hay);
  });
  if (sub) return sub;

  // 3. Known alias -> appId, then match by appId.
  const aliasAppId = GSI_APPID_ALIASES[needle];
  if (aliasAppId) {
    const byId = games.find(g => g.appId === aliasAppId);
    if (byId) return byId;
    // appId known but game not in library yet: synthesize a stub so artwork
    // can still render when the game isn't in the detected list.
    return { name: activeApp, store: 'Steam', emitsChroma: false, emitsGsi: true, appId: aliasAppId, scannedFiles: 0, skippedFiles: 0 };
  }

  return null;
}
