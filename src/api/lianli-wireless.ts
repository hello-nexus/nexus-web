import { fetchService, postService, postServiceForm, putService, deleteService, resolveHttp } from './service';
import { getTokenSync } from './auth';
import { serializeCrop, type NormalizedCrop } from '../components/common/MediaCropper/mediaCrop';

export interface LianLiWirelessFan {
  mac: string;
  /** Bound master MAC, or empty when unbound. */
  masterMac: string;
  boundToUs: boolean;
  channel: number;
  /** rx_type slot (1..14); 0 or 0xFE means unbound. */
  slot: number;
  devType: number;
  /** Fan subtype: 24 SLV3-LCD, 20-23 SLV3-LED, 36-39 SL-Infinity. */
  fanType: number;
  fanCount: number;
  rpm: number[];
  pwm: number[];
  /** Chain RF firmware version; 0 or absent when not reported. */
  firmwareVersion?: number;
  /** The chain's ARGB sync cable to a motherboard header is plugged in. */
  argbCableConnected?: boolean;
  /** The chain is playing its motherboard ARGB input. */
  playingMotherboardArgb?: boolean;
  /** The chain's PWM cable to a motherboard fan header is plugged in. */
  pwmCableConnected?: boolean;
  /** A HydroShift II that is also on USB, whose screen has its own panel page. */
  usbConnected?: boolean;
}

/** Why the link is down, for the device page. Absent on a service older than the field. */
export type LianLiWirelessLinkStatus =
  | 'ok'
  | 'unknown'
  | 'none'
  | 'txMissing'
  | 'rxMissing'
  | 'busy'
  | 'openFailed'
  | 'noResponse';

export interface LianLiWirelessState {
  isConnected: boolean;
  linkStatus?: LianLiWirelessLinkStatus;
  masterMac: string;
  channel: number;
  txFirmwareVersion: number;
  fans: LianLiWirelessFan[];
}

export function getLianLiWirelessState(): Promise<LianLiWirelessState | null> {
  return fetchService<LianLiWirelessState>('/devices/lianli-wireless/state');
}

interface OkResponse {
  error?: boolean;
  msg?: string;
}

function isOk(r: OkResponse | null): boolean {
  return !!r && r.error !== true;
}

export async function bindLianLiWirelessFan(mac: string): Promise<boolean> {
  return isOk(await postService<OkResponse>('/devices/lianli-wireless/bind', { mac }));
}

export async function unbindLianLiWirelessFan(mac: string): Promise<boolean> {
  return isOk(await postService<OkResponse>('/devices/lianli-wireless/unbind', { mac }));
}

export async function identifyLianLiWirelessFan(mac: string): Promise<boolean> {
  return isOk(await postService<OkResponse>('/devices/lianli-wireless/identify', { mac }));
}

export interface LianLiWirelessLightingEffect {
  key: string;
  hasSpeed: boolean;
  hasDirection: boolean;
  colorsMin: number;
  colorsMax: number;
  /** Has a variant that runs across every fan of the chain. Absent on an older service. */
  mergeable?: boolean;
}

export interface LianLiWirelessLane {
  mode: string;
  direction: number;
  /** "#RRGGBB" */
  color: string;
}

/** A bound wireless chain that can play an uploaded animation: a Strimer cable or a fan chain. */
export interface LianLiWirelessChainLighting {
  mac: string;
  kind: 'strimer' | 'fans';
  devType: number;
  /** Strimer model name; empty for a fan chain, which is named from fanType. */
  model: string;
  fanType: number;
  fanCount: number;
  lanes: number;
  ledsPerLane: number;
  /** Animations this chain plays on its own, in display order. */
  modes: LianLiWirelessLightingEffect[];
  supportsPerLane: boolean;
  /** 'custom' streams the Lighting page's effects; 'perLane' plays one effect per lane; otherwise an effect key. */
  mode: string;
  /** The animation the device plays when the Lighting page is not driving it. */
  effectMode?: string;
  /** 0 slowest .. 4 fastest */
  speed: number;
  direction: number;
  /** 0 off .. 4 full */
  brightness: number;
  colors: string[];
  /** A mergeable effect runs across every fan of the chain. Absent on an older service. */
  merge?: boolean;
  laneSettings: LianLiWirelessLane[];
  /** Saved choice to play the motherboard ARGB header; null when never chosen, absent on an older service. */
  motherboardArgb?: boolean | null;
  /** The chain reports its ARGB sync cable plugged in. */
  argbCableConnected?: boolean;
  /** The chain reports it is playing its motherboard input. */
  playingMotherboardArgb?: boolean;
}

export interface LianLiWirelessLighting {
  laneModes: string[];
  chains: LianLiWirelessChainLighting[];
}

export type LianLiWirelessChainPatch = Partial<Pick<LianLiWirelessChainLighting,
  'mode' | 'effectMode' | 'speed' | 'direction' | 'brightness' | 'colors' | 'merge' | 'laneSettings' | 'motherboardArgb'>>;

export function getLianLiWirelessLighting(): Promise<LianLiWirelessLighting | null> {
  return fetchService<LianLiWirelessLighting>('/devices/lianli-wireless/lighting');
}

export async function setLianLiWirelessChainLighting(mac: string, patch: LianLiWirelessChainPatch): Promise<boolean> {
  return isOk(await putService<OkResponse>(`/devices/lianli-wireless/lighting/${encodeURIComponent(mac)}`, patch));
}

/** What a HydroShift II's screen shows while Nexus drives its pump. */
export interface LianLiAioScreen {
  /** Backlight, percent. */
  brightness: number;
  theme: number;
  /** Built-in themes the AIO offers, numbered from 0. */
  themeCount: number;
  labelColor: string;
  valueColor: string;
  unitColor: string;
  showCpuTemp: boolean;
  showCpuLoad: boolean;
  showGpuTemp: boolean;
  showGpuLoad: boolean;
  showFanSpeed: boolean;
  /** Seconds each shown reading stays up before the screen moves to the next. */
  loopInterval: number;
  /** Nexus widgets own the glass (USB stream); off shows the AIO's own theme and readings. */
  nexusWidgets: boolean;
}

export type LianLiAioScreenPatch = Partial<Omit<LianLiAioScreen, 'themeCount'>>;

export function getLianLiAioScreen(mac: string): Promise<LianLiAioScreen | null> {
  return fetchService<LianLiAioScreen>(`/devices/lianli-wireless/aio-screen/${encodeURIComponent(mac)}`);
}

export async function setLianLiAioScreen(mac: string, patch: LianLiAioScreenPatch): Promise<boolean> {
  return isOk(await putService<OkResponse>(`/devices/lianli-wireless/aio-screen/${encodeURIComponent(mac)}`, patch));
}

export type LianLiWirelessScreenContentType =
  | 'off' | 'image' | 'gif' | 'video' | 'sensor' | 'clock' | 'animation';

export type LianLiWirelessSensorSource =
  'cpuLoad' | 'cpuTemp' | 'gpuLoad' | 'gpuTemp' | 'memoryUsage' | 'vramUsage' | 'fanRpm';
export type LianLiWirelessSensorStyle = 'ring' | 'bar';
export type LianLiWirelessClockFace = 'digital' | 'digitalMinimal' | 'analogClassic' | 'analogMinimal';
export type LianLiWirelessAnimationId = 'pulse' | 'spectrum' | 'spin';
export type LianLiWirelessTempUnit = 'c' | 'f';

export interface LianLiWirelessScreen {
  serial: string;
  position: number;
  /** User-chosen list position (0-based); -1 or absent when not set. The service already sorts by it. */
  order?: number;
  width: number;
  height: number;
  brightness: number;
  /** Quarter-turns clockwise: 0, 1, 2 or 3 (0/90/180/270 degrees). */
  rotation: number;
  contentType: LianLiWirelessScreenContentType;
  mediaId?: string;
  /** Set when contentType is "sensor". */
  sensorSource?: LianLiWirelessSensorSource;
  /** Set when contentType is "sensor". */
  sensorStyle?: LianLiWirelessSensorStyle;
  /** Set when contentType is "clock". */
  clockFace?: LianLiWirelessClockFace;
  /** Set when contentType is "animation". */
  animationId?: LianLiWirelessAnimationId;
  /** Accent hex color "#RRGGBB": gauge fill, clock hands/digits, animation primary color. */
  colorA?: string;
  /** Secondary hex color "#RRGGBB": gauge/clock text color, animation secondary color. */
  colorB?: string;
  /** Display unit for a temperature sensor source. */
  tempUnit?: LianLiWirelessTempUnit;
}

export interface LianLiWirelessScreenContentExtra {
  sensorSource?: LianLiWirelessSensorSource;
  sensorStyle?: LianLiWirelessSensorStyle;
  clockFace?: LianLiWirelessClockFace;
  animationId?: LianLiWirelessAnimationId;
  colorA?: string;
  colorB?: string;
  tempUnit?: LianLiWirelessTempUnit;
}

export async function getLianLiWirelessScreens(): Promise<LianLiWirelessScreen[] | null> {
  const r = await fetchService<{ screens: LianLiWirelessScreen[] }>('/devices/lianli-wireless/screens');
  return r?.screens ?? null;
}

export async function setLianLiWirelessScreenSettings(
  serial: string,
  settings: { brightness?: number; rotation?: number },
): Promise<boolean> {
  return isOk(await postService<OkResponse>('/devices/lianli-wireless/screen/settings', { serial, ...settings }));
}

/** Persists the screen list order (serials in the wanted order) so tile numbering matches the physical fans. */
export async function setLianLiWirelessScreenOrder(serials: string[]): Promise<boolean> {
  return isOk(await postService<OkResponse>('/devices/lianli-wireless/screens/order', { serials }));
}

export async function setLianLiWirelessScreenContent(
  serial: string,
  contentType: LianLiWirelessScreenContentType,
  mediaId?: string,
  extra?: LianLiWirelessScreenContentExtra,
): Promise<boolean> {
  return isOk(await postService<OkResponse>('/devices/lianli-wireless/screen/content', {
    serial,
    contentType,
    ...(mediaId ? { mediaId } : {}),
    ...(extra ?? {}),
  }));
}

export type LianLiWirelessMediaKind = 'image' | 'gif' | 'video';

export interface LianLiWirelessMediaItem {
  id: string;
  name: string;
  kind: LianLiWirelessMediaKind;
  /** Absolute, token-carrying first-frame URL for an <img> src (see below). */
  thumb: string;
}

// <img> loads can't send a Bearer header, so the authenticated thumbnail URL
// carries the session token as a query param (server's ExtractBearerOrQueryToken
// accepts ?token=), same scheme as tryxMediaFileUrl.
function mediaThumbUrl(id: string): string {
  const base = resolveHttp(`/devices/lianli-wireless/media/${encodeURIComponent(id)}/thumb`);
  const t = getTokenSync();
  return t ? `${base}?token=${encodeURIComponent(t)}` : base;
}

interface MediaListItem {
  id: string;
  name: string;
  kind: LianLiWirelessMediaKind;
}

export async function getLianLiWirelessMedia(): Promise<LianLiWirelessMediaItem[]> {
  const r = await fetchService<{ items: MediaListItem[] }>('/devices/lianli-wireless/media');
  return (r?.items ?? []).map(it => ({ ...it, thumb: mediaThumbUrl(it.id) }));
}

// LCD screens are a fixed 400x400 square; every upload is cropped to that
// aspect before it reaches the service, mirroring uploadTryxMedia's
// crop-before-upload flow (src/api/tryx.ts).
export const LIANLI_WIRELESS_MEDIA_WIDTH = 400;
export const LIANLI_WIRELESS_MEDIA_HEIGHT = 400;

interface MediaImportResponse extends OkResponse {
  mediaId?: string;
  name?: string;
  kind?: LianLiWirelessMediaKind;
}

export async function importLianLiWirelessMedia(
  file: File,
  crop: NormalizedCrop,
): Promise<LianLiWirelessMediaItem | null> {
  const form = new FormData();
  form.append('file', file, file.name);
  form.append('crop', serializeCrop(crop));
  form.append('targetWidth', String(LIANLI_WIRELESS_MEDIA_WIDTH));
  form.append('targetHeight', String(LIANLI_WIRELESS_MEDIA_HEIGHT));
  const r = await postServiceForm<MediaImportResponse>('/devices/lianli-wireless/media/import', form);
  if (!r || r.error || !r.mediaId) return null;
  return { id: r.mediaId, name: r.name ?? file.name, kind: r.kind ?? 'image', thumb: mediaThumbUrl(r.mediaId) };
}

export async function deleteLianLiWirelessMedia(id: string): Promise<boolean> {
  return isOk(await deleteService<OkResponse>(`/devices/lianli-wireless/media/${encodeURIComponent(id)}`));
}
