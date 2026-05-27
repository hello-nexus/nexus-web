// Lighting API wrapper — authenticated fetch/post to the local service.

import { fetchService, postService, deleteService, resolveAuthWs } from './service';

export async function lightingOutputUrl(): Promise<string> {
  return resolveAuthWs('/lighting/output');
}

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

export const startStatic = (r: number, g: number, b: number) =>
  postService('/lighting/static/headless-start', { color: { r, g, b, a: 1.0 } });

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

export interface StaticColorSettings { r: number; g: number; b: number; }

export const fetchStaticColor = () =>
  fetchService<StaticColorSettings>('/lighting/static/settings');

export const startAnimate = (
  effect: string,
  speed = 50,
  intensity = 1,
  hue = 0,
  colorize = 0,
  saturation = 1,
  contrast = 1,
  params?: Record<string, number>,
  // Pass false during live slider drag to skip the settings-disk write.
  // Default true keeps callers outside the drawer (mode switches, restart
  // replay) on the durable path.
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

// Post-process params persisted across sessions for Mirror + Media.
// Backend shared by both modes: the canvas post-process (hue shift, colorize,
// saturation, contrast) plus optional horizontal/vertical flip are applied
// after the capture / playback frame is produced and before it's blitted to
// the LED canvas. Flip is geometric and runs before the colour transform.
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
}

export const fetchScreenMonitors = () =>
  fetchService<ScreenSyncOptions>('/lighting/screen/monitors');

export const startGif = (path: string, speed = 50, mode = 'Loop') =>
  postService('/lighting/gif/headless-start', {
    paths: [path], speed, mode,
  });

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

// Clears every persisted device-frame layout so each card snaps back to its
// provider-computed default position/size/rotation on the next GetAll. The
// service broadcasts a lighting topic frame after the clear so connected
// clients refetch immediately. Used by the lighting settings modal's
// "reset all positions" affordance.
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
// seconds so the user can spot which physical strip is which. Overlays the
// active lighting effect - no pause, recovers cleanly when the window ends.
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

export interface LedMapResponse {
  id: string;
  ledCount: number;
  leds: LedMapEntry[];
  hasCustomOverrides: boolean;
  aspectRatio: number;
}

export const fetchLedMap = (id: string) =>
  fetchService<LedMapResponse>(`/devices/lighting-devices/${encodeURIComponent(id)}/led-map`);

export const fetchLedMapDefaults = (id: string) =>
  fetchService<LedMapResponse>(`/devices/lighting-devices/${encodeURIComponent(id)}/led-map?defaults=true`);

export const saveLedMap = (id: string, overrides: { ledIndex: number; u: number; v: number; disabled?: boolean }[], aspectRatio: number) =>
  postService(`/devices/lighting-devices/${encodeURIComponent(id)}/led-map`, { overrides, aspectRatio });

export const resetLedMap = (id: string) =>
  deleteService(`/devices/lighting-devices/${encodeURIComponent(id)}/led-map`);

export const highlightLeds = (id: string, indices: number[]) =>
  postService(`/devices/lighting-devices/${encodeURIComponent(id)}/led-highlight`, { indices });

export const testLedPattern = (id: string, pattern: string) =>
  postService(`/devices/lighting-devices/${encodeURIComponent(id)}/led-test-pattern`, { pattern });

export const clearLedEditor = (id: string) =>
  deleteService(`/devices/lighting-devices/${encodeURIComponent(id)}/led-editor`);
