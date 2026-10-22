import { serializeCrop, type NormalizedCrop } from '../components/common/MediaCropper/mediaCrop';
import { fetchService, postServiceFormResult, putService, resolveHttp, tokenParam } from './service';

export type MystiqueMode = 'monitor' | 'media' | 'recording';

export type MystiqueReadout = 'temperature' | 'frequency' | 'time' | 'pump' | 'fan' | 'fanPump';

export type MystiqueStyle = 'normal' | 'ring' | 'stopwatch';

export type MystiqueAuxArea = 'voltage' | 'systemMonitor' | 'coreData';

export type MystiqueAnimation = 'split' | 'scroll' | 'fade';

export type MystiqueMediaSource = 'images' | 'gif';

export type MystiqueMediaKind = 'picture' | 'gif';

/** Pixel size of the screen, portrait. */
export const MYSTIQUE_WIDTH = 480;
export const MYSTIQUE_HEIGHT = 640;

/** The screen has held this many pictures at once; the service refuses more. */
export const MYSTIQUE_MAX_PICTURES = 2;

export interface MystiqueMediaItem {
  kind: MystiqueMediaKind;
  /** The id the screen stores the item under. */
  id: string;
  name: string;
}

export interface MystiqueSensorPick {
  category: string;
  sensor: string;
}

export interface MystiqueSensorState extends MystiqueSensorPick {
  /** The sensor the readout reads; an unpicked one reports what the automatic choice resolves to, empty when nothing does. */
  resolvedCategory: string;
  resolvedSensor: string;
}

export interface MystiqueState {
  isConnected: boolean;
  /** False until a mode is set from Nexus; the screen's own mode is unknown until then. */
  modeChosen: boolean;
  /** False until the user changes it; the value shown is then a placeholder, not what the screen holds. */
  readoutChosen: boolean;
  /** Switch time and animation share one command; false until the first change writes both. */
  mediaChosen: boolean;
  sourceChosen: boolean;
  recordingChosen: boolean;
  /** Brightness, rotation and RGB sync share one command; false until the first change writes the values shown. */
  deviceChosen: boolean;
  mode: MystiqueMode;
  readout: MystiqueReadout;
  readoutStyle: MystiqueStyle;
  auxArea: MystiqueAuxArea;
  /** Seconds each picture shows, one of the screen's switch times. */
  switchSeconds: number;
  animation: MystiqueAnimation;
  mediaSource: MystiqueMediaSource;
  edgePicking: boolean;
  /** What this PC has put on the screen; the screen cannot be read back. */
  media: MystiqueMediaItem[];
  recordFrequency: boolean;
  recordTemperature: boolean;
  /** 0-100. */
  brightness: number;
  gyroscope: boolean;
  rgbSync: boolean;
  cpuTemperature: MystiqueSensorState;
  cpuFrequency: MystiqueSensorState;
  cpuUsage: MystiqueSensorState;
  ramUsage: MystiqueSensorState;
  cpuFan: MystiqueSensorState;
  pump: MystiqueSensorState;
}

export interface MystiqueSettingsPatch {
  mode?: MystiqueMode;
  readout?: MystiqueReadout;
  style?: MystiqueStyle;
  auxArea?: MystiqueAuxArea;
  switchSeconds?: number;
  animation?: MystiqueAnimation;
  mediaSource?: MystiqueMediaSource;
  edgePicking?: boolean;
  recordFrequency?: boolean;
  recordTemperature?: boolean;
  brightness?: number;
  gyroscope?: boolean;
  rgbSync?: boolean;
  cpuTemperature?: MystiqueSensorPick;
  cpuFrequency?: MystiqueSensorPick;
  cpuUsage?: MystiqueSensorPick;
  ramUsage?: MystiqueSensorPick;
  cpuFan?: MystiqueSensorPick;
  pump?: MystiqueSensorPick;
}

const BASE = '/devices/deepcool-mystique';

export async function getMystiqueState(): Promise<MystiqueState | null> {
  const body = await fetchService<MystiqueState>(`${BASE}/state`);
  return body && body.cpuFan && body.pump && body.cpuTemperature && body.cpuFrequency && body.cpuUsage && body.ramUsage && body.media ? body : null;
}

/** Resolves true when the service accepted the change. */
export async function setMystiqueSettings(patch: MystiqueSettingsPatch): Promise<boolean> {
  const res = await putService<{ error: boolean; msg: string }>(`${BASE}/settings`, patch);
  return res !== null && !res.error;
}

/** Encodes the file for the screen and sends it; `replace` is the id of the picture it takes the place of. Null on a transport failure. */
export async function uploadMystiqueMedia(
  file: File,
  kind: MystiqueMediaKind,
  crop: NormalizedCrop,
  replace?: string,
): Promise<{ ok: boolean; msg: string } | null> {
  const form = new FormData();
  form.append('file', file, file.name);
  form.append('kind', kind);
  form.append('crop', serializeCrop(crop));
  if (replace) form.append('replace', replace);
  const res = await postServiceFormResult<{ error: boolean; msg: string; id?: string }>(`${BASE}/media`, form);
  if (res === null) return null;
  return { ok: !res.error, msg: res.msg };
}

/** Thumbnail of an uploaded item; `version` changes the URL after an upload replaces the item. */
export function mystiqueThumbUrl(id: string, version: number): string {
  const base = resolveHttp(`${BASE}/media/${encodeURIComponent(id)}/thumb?v=${version}`);
  const tok = tokenParam();
  return tok ? `${base}&${tok}` : base;
}
