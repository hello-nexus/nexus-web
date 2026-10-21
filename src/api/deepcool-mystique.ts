import { fetchService, putService } from './service';

export type MystiqueMode = 'monitor' | 'media' | 'recording';

export type MystiqueReadout = 'temperature' | 'frequency' | 'time' | 'pump' | 'fan' | 'fanPump';

export interface MystiqueSensorPick {
  category: string;
  sensor: string;
}

export interface MystiqueSensorState extends MystiqueSensorPick {
  /** The sensor the readout reads; an unpicked one reports the header the service guessed. */
  resolvedCategory: string;
  resolvedSensor: string;
}

export interface MystiqueState {
  isConnected: boolean;
  /** False until a mode is set from Nexus; the screen's own mode is unknown until then. */
  modeChosen: boolean;
  mode: MystiqueMode;
  readout: MystiqueReadout;
  recordFrequency: boolean;
  recordTemperature: boolean;
  /** 0-100. */
  brightness: number;
  gyroscope: boolean;
  rgbSync: boolean;
  cpuFan: MystiqueSensorState;
  pump: MystiqueSensorState;
}

export interface MystiqueSettingsPatch {
  mode?: MystiqueMode;
  readout?: MystiqueReadout;
  recordFrequency?: boolean;
  recordTemperature?: boolean;
  brightness?: number;
  gyroscope?: boolean;
  rgbSync?: boolean;
  cpuFan?: MystiqueSensorPick;
  pump?: MystiqueSensorPick;
}

const BASE = '/devices/deepcool-mystique';

export async function getMystiqueState(): Promise<MystiqueState | null> {
  const body = await fetchService<MystiqueState>(`${BASE}/state`);
  return body && body.cpuFan && body.pump ? body : null;
}

/** Resolves true when the service accepted the change. */
export async function setMystiqueSettings(patch: MystiqueSettingsPatch): Promise<boolean> {
  const res = await putService<{ error: boolean; msg: string }>(`${BASE}/settings`, patch);
  return res !== null && !res.error;
}
