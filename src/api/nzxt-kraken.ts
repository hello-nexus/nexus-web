import { fetchService, putService, postServiceBytes } from './service';

export interface KrakenChannel {
  id: string;
  accessoryName: string;
  ledCount: number;
}

export interface KrakenState {
  isConnected: boolean;
  firmwareVersion: string;
  liquidTempC: number;
  pumpRpm: number;
  pumpDuty: number;
  fanRpm: number;
  fanDuty: number;
  hasLcd: boolean;
  lcdWidth: number;
  lcdHeight: number;
  lcdBrightness: number;
  lcdOrientation: number;
  lcdMode: 'liquid' | 'image' | 'off';
  channels: KrakenChannel[];
}

export interface KrakenLcdPatch {
  brightness?: number;
  orientation?: number;
  mode?: KrakenState['lcdMode'];
}

export function getKrakenState(): Promise<KrakenState | null> {
  return fetchService<KrakenState>('/devices/nzxt-kraken/state');
}

export function setKrakenLcd(patch: KrakenLcdPatch): Promise<unknown | null> {
  return putService('/devices/nzxt-kraken/lcd', patch);
}

/** Uploads one full-panel RGBA frame; the service rejects any other length. */
export async function uploadKrakenLcdImage(rgba: Uint8Array): Promise<boolean> {
  const r = await postServiceBytes('/devices/nzxt-kraken/lcd/image', rgba, 'application/octet-stream');
  return r !== null;
}

/**
 * Draws an image cover-cropped to the panel and returns it as RGBA. The alpha byte is
 * forced to 0: the cooler mangles colours when it is anything else.
 */
export async function encodeKrakenFrame(
  source: CanvasImageSource,
  width: number,
  height: number,
  sourceWidth: number,
  sourceHeight: number,
): Promise<Uint8Array> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context unavailable');

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);

  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const drawW = sourceWidth * scale;
  const drawH = sourceHeight * scale;
  ctx.drawImage(source, (width - drawW) / 2, (height - drawH) / 2, drawW, drawH);

  const { data } = ctx.getImageData(0, 0, width, height);
  const out = new Uint8Array(width * height * 4);
  out.set(data);
  for (let i = 3; i < out.length; i += 4) out[i] = 0;
  return out;
}
