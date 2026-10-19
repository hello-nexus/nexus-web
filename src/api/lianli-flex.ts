import {
  authFetchWithStatus,
  deleteService,
  fetchService,
  postService,
  postServiceFormResult,
  putService,
} from './service';
import type {
  LianLiChainLightingApi,
  LianLiFansState,
  LianLiScreenApi,
  LianLiScreenSource,
  LianLiScreenSettingsPatch,
  LianLiWirelessLighting,
  LianLiWirelessLightingEffect,
  LianLiWirelessMediaItem,
  LianLiWirelessMediaKind,
  LianLiWirelessScreen,
  LianLiWirelessScreenContentExtra,
  LianLiWirelessScreenContentType,
} from './lianli-wireless';
import { lianLiMediaThumbUrl } from './lianli-wireless';

const BASE = '/devices/lianli-flex';

/** Prefix of the Flex fan channels in the generic cooling list. */
export const LIANLI_FLEX_CHANNEL_PREFIX = 'lianli-flex:';

interface OkResponse {
  error?: boolean;
  msg?: string;
}

function isOk(r: OkResponse | null): boolean {
  return !!r && r.error !== true;
}

export function getLianLiFlexState(): Promise<LianLiFansState | null> {
  return fetchService<LianLiFansState>(`${BASE}/state`);
}

export const lianLiFlexLightingApi: LianLiChainLightingApi = {
  get: () => fetchService<LianLiWirelessLighting>(`${BASE}/lighting`),
  set: async (mac, patch) => isOk(await putService<OkResponse>(`${BASE}/lighting/${encodeURIComponent(mac)}`, patch)),
  reset: async mac => isOk(await postService<OkResponse>(`${BASE}/reset-lighting`, { mac })),
};

export async function restartLianLiFlexLcd(mac: string): Promise<boolean> {
  return isOk(await postService<OkResponse>(`${BASE}/restart-lcd`, { mac }));
}

export async function identifyLianLiFlexFan(mac: string): Promise<boolean> {
  return isOk(await postService<OkResponse>(`${BASE}/identify`, { mac }));
}

async function getScreens(): Promise<LianLiWirelessScreen[] | null> {
  const r = await fetchService<{ screens: LianLiWirelessScreen[] }>(`${BASE}/screens`);
  return r?.screens ?? null;
}

async function setScreenSettings(serial: string, settings: LianLiScreenSettingsPatch): Promise<boolean> {
  const { brightness, rotation, nexusPanel, sleepWhenLocked } = settings;
  if (brightness === undefined && rotation === undefined && nexusPanel === undefined && sleepWhenLocked === undefined) return true;
  return isOk(await postService<OkResponse>(`${BASE}/screen/settings`, {
    serial,
    ...(brightness !== undefined ? { brightness } : {}),
    ...(rotation !== undefined ? { rotation } : {}),
    ...(nexusPanel !== undefined ? { nexusPanel } : {}),
    ...(sleepWhenLocked !== undefined ? { sleepWhenLocked } : {}),
  }));
}

async function setScreenOrder(serials: string[]): Promise<boolean> {
  return isOk(await postService<OkResponse>(`${BASE}/screens/order`, { serials }));
}

async function setScreenContent(
  serial: string,
  contentType: LianLiWirelessScreenContentType,
  mediaId?: string,
  extra?: LianLiWirelessScreenContentExtra,
): Promise<boolean> {
  return isOk(await postService<OkResponse>(`${BASE}/screen/content`, {
    serial,
    contentType,
    ...(mediaId ? { mediaId } : {}),
    ...(extra ?? {}),
  }));
}

export const lianLiFlexScreenApi: LianLiScreenApi = {
  getScreens,
  setSettings: setScreenSettings,
  setOrder: setScreenOrder,
  setContent: setScreenContent,
};

// ---- Fan profiles ----

export type LianLiFlexProfileKey = 'quiet' | 'stdsp' | 'highsp' | 'fullsp' | 'custom1' | 'custom2' | 'custom3' | 'custom4' | 'fixed';
export type LianLiFlexFanSource = 'cpu' | 'gpu' | 'water';

export const LIANLI_FLEX_PROFILES: readonly LianLiFlexProfileKey[] =
  ['quiet', 'stdsp', 'highsp', 'fullsp', 'custom1', 'custom2', 'custom3', 'custom4', 'fixed'];

export interface LianLiFlexFanProfile {
  mac: string;
  /** Empty when no profile is set: the fan's speed is set by hand. */
  profile: LianLiFlexProfileKey | '';
  /** The fan follows the motherboard fan header. */
  mbSync: boolean;
  source: LianLiFlexFanSource;
  sourceAvailable: { cpu: boolean; gpu: boolean; water: boolean };
  fanSize: 120 | 140;
  startStop: boolean;
  fixedPercent: number;
  points: { temp: number; rpm: number }[];
  curveId: string;
  rpm: number;
  dutyPercent: number;
}

export type LianLiFlexFanProfilePatch = Partial<Omit<LianLiFlexFanProfile, 'mac' | 'sourceAvailable' | 'curveId' | 'rpm' | 'dutyPercent'>>;

export function getLianLiFlexFanProfile(mac: string): Promise<LianLiFlexFanProfile | null> {
  return fetchService<LianLiFlexFanProfile>(`${BASE}/fan/${encodeURIComponent(mac)}`);
}

export async function setLianLiFlexFanProfile(mac: string, patch: LianLiFlexFanProfilePatch): Promise<boolean> {
  return isOk(await putService<OkResponse>(`${BASE}/fan/${encodeURIComponent(mac)}`, patch));
}

export async function restoreLianLiFlexFanDefault(mac: string): Promise<boolean> {
  return isOk(await postService<OkResponse>(`${BASE}/fan/${encodeURIComponent(mac)}/default`, {}));
}

/** Every unit follows the motherboard header (on), or gets its profile back (off). */
export async function setLianLiFlexFanSync(enabled: boolean): Promise<boolean> {
  return isOk(await putService<OkResponse>(`${BASE}/fan-sync`, { enabled }));
}

// ---- Sync lighting ----

export interface LianLiFlexSyncMember {
  mac: string;
  family: string;
  label: string;
  sortIndex: number;
  /** 0 or 1: which way this fan's slice of the shared animation runs. */
  sliceDirection: number;
}

export interface LianLiFlexSync {
  enabled: boolean;
  mode: string;
  speed: number;
  direction: number;
  brightness: number;
  colors: string[];
  modes: LianLiWirelessLightingEffect[];
  members: LianLiFlexSyncMember[];
}

export type LianLiFlexSyncPatch = Partial<Pick<LianLiFlexSync, 'enabled' | 'mode' | 'speed' | 'direction' | 'brightness' | 'colors'>>
  & { members?: { mac: string; sliceDirection: number }[] };

export function getLianLiFlexSync(): Promise<LianLiFlexSync | null> {
  return fetchService<LianLiFlexSync>(`${BASE}/sync`);
}

export async function setLianLiFlexSync(patch: LianLiFlexSyncPatch): Promise<boolean> {
  return isOk(await putService<OkResponse>(`${BASE}/sync`, patch));
}

// ---- Thermal alert ----

export interface LianLiFlexThermalSource {
  enabled: boolean;
  /** Degrees Celsius, 1..110. */
  threshold: number;
  color: string;
}

export interface LianLiFlexThermalAlert {
  enabled: boolean;
  cpu: LianLiFlexThermalSource;
  gpu: LianLiFlexThermalSource;
  unit: 'c' | 'f';
  /** Unit MACs; empty means every unit. */
  members: string[];
  active: { source: 'cpu' | 'gpu' | null; since: number | null };
}

export type LianLiFlexThermalAlertPatch = Partial<Pick<LianLiFlexThermalAlert, 'enabled' | 'members'>>
  & { cpu?: Partial<LianLiFlexThermalSource>; gpu?: Partial<LianLiFlexThermalSource> };

export function getLianLiFlexThermalAlert(): Promise<LianLiFlexThermalAlert | null> {
  return fetchService<LianLiFlexThermalAlert>(`${BASE}/thermal-alert`);
}

export async function setLianLiFlexThermalAlert(patch: LianLiFlexThermalAlertPatch): Promise<boolean> {
  return isOk(await putService<OkResponse>(`${BASE}/thermal-alert`, patch));
}

// ---- Apply to all ----

export type LianLiFlexApplyWhat = 'lighting' | 'fan';
export const APPLY_LIGHTING: LianLiFlexApplyWhat = 'lighting';
export const APPLY_FAN: LianLiFlexApplyWhat = 'fan';

export interface LianLiFlexApplyAllResult {
  ok: boolean;
  applied: string[];
  skipped: string[];
}

export async function applyLianLiFlexToAll(
  mac: string,
  what: LianLiFlexApplyWhat[],
  scope: 'family' | 'all',
): Promise<LianLiFlexApplyAllResult> {
  const r = await postService<OkResponse & { applied?: string[]; skipped?: string[] }>(`${BASE}/apply-all`, { mac, what, scope });
  return { ok: isOk(r), applied: r?.applied ?? [], skipped: r?.skipped ?? [] };
}

// ---- Screens ----

export async function syncLianLiFlexScreens(serial: string): Promise<boolean> {
  return isOk(await postService<OkResponse>(`${BASE}/screens/sync`, { serial }));
}

export interface LianLiFlexCaptureRequest {
  /** Absent or 0: one still. 1..30: a clip of that many seconds. */
  durationSeconds?: number;
  /** Display and square to capture; absent means the main display's largest centered square. */
  screenSource?: LianLiScreenSource;
}

/** Captures the display into the shared media library; null when the service refuses or has no capture. */
export async function captureLianLiFlexMedia(req: LianLiFlexCaptureRequest): Promise<LianLiWirelessMediaItem | null> {
  const r = await postService<OkResponse & { mediaId?: string; name?: string; kind?: LianLiWirelessMediaKind }>(`${BASE}/media/capture`, req);
  if (!r || r.error || !r.mediaId) return null;
  return { id: r.mediaId, name: r.name ?? '', kind: r.kind ?? 'image', thumb: lianLiMediaThumbUrl(r.mediaId) };
}

// ---- Templates ----

export interface LianLiFlexTemplate {
  id: string;
  name: string;
  family: string;
  createdUnixMs: number;
}

export async function getLianLiFlexTemplates(): Promise<LianLiFlexTemplate[] | null> {
  const r = await fetchService<{ templates: LianLiFlexTemplate[] }>(`${BASE}/templates`);
  return r?.templates ?? null;
}

export async function saveLianLiFlexTemplate(name: string, serial: string): Promise<boolean> {
  return isOk(await postService<OkResponse>(`${BASE}/templates`, { name, serial }));
}

export async function applyLianLiFlexTemplate(id: string, serials: string[]): Promise<boolean> {
  return isOk(await postService<OkResponse>(`${BASE}/templates/${encodeURIComponent(id)}/apply`, { serials }));
}

export async function deleteLianLiFlexTemplate(id: string): Promise<boolean> {
  return isOk(await deleteService<OkResponse>(`${BASE}/templates/${encodeURIComponent(id)}`));
}

/** The template and its media as a ZIP, or null when the download failed. */
export async function exportLianLiFlexTemplate(id: string): Promise<Blob | null> {
  const { response } = await authFetchWithStatus(`${BASE}/templates/${encodeURIComponent(id)}/export`);
  if (!response?.ok) return null;
  return response.blob();
}

/** File types of other apps' themes; they are not templates and never reach the service. */
const FOREIGN_TEMPLATE_EXTENSIONS = ['.template', '.theme', '.modular'];

export function isForeignTemplateFile(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return FOREIGN_TEMPLATE_EXTENSIONS.some(ext => lower.endsWith(ext));
}

export type LianLiFlexImportResult = { ok: true } | { ok: false; msg: string };

export async function importLianLiFlexTemplate(file: File): Promise<LianLiFlexImportResult> {
  const form = new FormData();
  form.append('file', file, file.name);
  const r = await postServiceFormResult<OkResponse & { error: boolean; msg: string }>(`${BASE}/templates/import`, form);
  if (!r) return { ok: false, msg: '' };
  return r.error ? { ok: false, msg: r.msg ?? '' } : { ok: true };
}
