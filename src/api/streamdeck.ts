// Client for the physical Stream Deck routes (mirrors nexus-service's
// StreamDeckRoutes.cs). Every route is .LocalhostOnly() - a desktop-only
// hardware configuration surface - so every call here fails closed on a
// remote/panel origin via the shared fetchService/putServiceBytes guards.
import { fetchService, postService, putService, putServiceBytes } from './service';
import type { DeckConfig } from '../panel/widgets/deck/types';

export type StreamDeckFormat = 'bmp' | 'jpeg';

export interface StreamDeckSummary {
  serial: string;
  model: string;
  name: string;
  connected: boolean;
  verified: boolean;
  rows: number;
  cols: number;
  keyCount: number;
  keyPixels: number;
  format: StreamDeckFormat;
  brightness: number;
  firmwareVersion?: string;
  warning?: string;
}

interface StreamDeckListResponse {
  decks: StreamDeckSummary[];
}

interface StreamDeckConfigResponse {
  config: DeckConfig;
}

interface StreamDeckImageResponse {
  hash: string;
}

// nexus-service's ApiResponse envelope: Ok() serializes { error: false,
// msg: "Ok" }; Fail() sets error: true. A write is acked only by a 2xx whose
// envelope doesn't carry error:true.
interface ApiResponseWrapper {
  error?: boolean;
  msg?: string;
}

function acked(r: ApiResponseWrapper | null): boolean {
  return r !== null && r.error !== true;
}

export async function getStreamDecks(): Promise<StreamDeckSummary[]> {
  const res = await fetchService<StreamDeckListResponse>('/streamdeck/decks');
  return res?.decks ?? [];
}

export async function updateStreamDeck(serial: string, patch: { name?: string; brightness?: number }): Promise<boolean> {
  return acked(await postService<ApiResponseWrapper>(`/streamdeck/decks/${encodeURIComponent(serial)}`, patch));
}

export async function getStreamDeckConfig(serial: string): Promise<DeckConfig | null> {
  const res = await fetchService<StreamDeckConfigResponse>(`/streamdeck/decks/${encodeURIComponent(serial)}/config`);
  return res?.config ?? null;
}

export async function setStreamDeckConfig(serial: string, config: DeckConfig): Promise<boolean> {
  const res = await putService<StreamDeckConfigResponse>(`/streamdeck/decks/${encodeURIComponent(serial)}/config`, { config });
  return res !== null;
}

/** slotPath is the dot-joined slot index chain from the deck's root ("3", "2.5"). */
export async function uploadStreamDeckKeyImage(
  serial: string,
  slotPath: string,
  state: 0 | 1,
  bytes: Uint8Array,
  format: StreamDeckFormat,
): Promise<string | null> {
  const contentType = format === 'bmp' ? 'image/bmp' : 'image/jpeg';
  const path = `/streamdeck/decks/${encodeURIComponent(serial)}/images/${slotPath}/${state}`;
  const res = await putServiceBytes(path, bytes, contentType);
  if (!res) return null;
  try {
    const json = (await res.json()) as StreamDeckImageResponse;
    return json.hash ?? null;
  } catch {
    return null;
  }
}

/** Dev-tools-only: push a test pattern to every key so a bench Stream Deck can be sanity-checked without editing a layout. */
export async function sendStreamDeckTestPattern(serial: string): Promise<boolean> {
  return acked(await postService<ApiResponseWrapper>(`/streamdeck/decks/${encodeURIComponent(serial)}/test-pattern`, {}));
}
