// HYTE Q-series (Q60 / Q80) cooler-controller API — the firmware options on
// the Q60 device page's settings tab. Pump speed itself is driven through the
// cooling fan-channel path; these cover the hub-wide firmware settings.

import { fetchService, putService } from './service';

// Hub control mode (matches QSeriesCoolerProtocol.ControlMode* on the service).
export const QSERIES_MODE_SOFTWARE = 1;
export const QSERIES_MODE_MOTHERBOARD = 2;
export const QSERIES_MODE_FIRMWARE = 3;

export type QSeriesControlMode =
  | typeof QSERIES_MODE_SOFTWARE
  | typeof QSERIES_MODE_MOTHERBOARD
  | typeof QSERIES_MODE_FIRMWARE;

export interface QSeriesCoolerState {
  connected: boolean;
  deviceId: string;
  productName: string;
  variant: string;
  firmwareVersion: string;
  pumpRpm: number;
  pump2Rpm: number;
  hasPump2: boolean;
  controlMode: number;
  turboOn: boolean;
}

export const getQSeriesState = (): Promise<QSeriesCoolerState | null> =>
  fetchService<QSeriesCoolerState>('/devices/qseries');

export const setQSeriesControlMode = (mode: QSeriesControlMode): Promise<unknown | null> =>
  putService('/devices/qseries/control-mode', { mode });

export const setQSeriesTurbo = (on: boolean): Promise<unknown | null> =>
  putService('/devices/qseries/turbo', { on });
