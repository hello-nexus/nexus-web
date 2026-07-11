// Client for the physical Stream Deck routes (mirrors nexus-service's
// StreamDeckRoutes.cs). Every route is .LocalhostOnly() - a desktop-only
// hardware configuration surface - so every call here fails closed on a
// remote/panel origin via the shared fetchService/putServiceBytes guards.
import { fetchService, postService, putService, putServiceBytes, deleteService } from './service';
import type { DeckConfig } from '../panel/widgets/deck/types';
import type { DeckKeyTransform } from '../panel/widgets/deck/deckKeyTransform';

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
  /** User mounting rotation, degrees: 0, 90, 180, or 270. Always sent by the DTO; optional here only so older test fixtures need not set it. */
  orientation?: number;
  /** Seconds of no key input before the deck blanks; 0 disables sleep-after. Always sent by the DTO; optional here for the same reason. */
  sleepAfterSeconds?: number;
  firmwareVersion?: string;
  warning?: string;
  /** ConflictAppCatalog id to pass to POST /conflicts/kill when warning is set. */
  conflictAppId?: string;
  /** Server-authoritative; absent on a service build that predates this field (see resolveDeckKeyTransform). */
  transform?: DeckKeyTransform;
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

export async function updateStreamDeck(
  serial: string,
  patch: { name?: string; brightness?: number; orientation?: number; sleepAfterSeconds?: number },
): Promise<boolean> {
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

/** Mirror the editor's current page + folder onto the physical deck (desktop -> device nav). */
export async function setStreamDeckNav(serial: string, page: number, folderPath: readonly number[]): Promise<boolean> {
  return acked(await postService<ApiResponseWrapper>(`/streamdeck/decks/${encodeURIComponent(serial)}/nav`, { page, folderPath }));
}

export interface DeckPreset {
  id: string;
  name: string;
}

interface DeckPresetsResponse {
  presets: DeckPreset[];
  activeId: string | null;
}

export async function fetchDeckPresets(serial: string): Promise<DeckPresetsResponse | null> {
  return fetchService<DeckPresetsResponse>(`/streamdeck/decks/${encodeURIComponent(serial)}/presets`);
}

export async function createDeckPreset(serial: string, name: string): Promise<{ preset: DeckPreset; activeId: string | null } | null> {
  return postService(`/streamdeck/decks/${encodeURIComponent(serial)}/presets`, { name });
}

export async function updateDeckPreset(serial: string, id: string, patch: { name?: string; saveCurrent?: boolean }): Promise<boolean> {
  return acked(await putService<ApiResponseWrapper>(`/streamdeck/decks/${encodeURIComponent(serial)}/presets/${encodeURIComponent(id)}`, patch));
}

export async function deleteDeckPreset(serial: string, id: string): Promise<{ activeId: string | null } | null> {
  return deleteService(`/streamdeck/decks/${encodeURIComponent(serial)}/presets/${encodeURIComponent(id)}`);
}

/** Applies the preset's saved config + key images to the live deck and refreshes what's on-screen. */
export async function activateDeckPreset(serial: string, id: string): Promise<boolean> {
  return acked(await postService<ApiResponseWrapper>(`/streamdeck/decks/${encodeURIComponent(serial)}/presets/${encodeURIComponent(id)}/activate`, {}));
}

/** Sets the active-preset pointer only, without applying the preset's config. */
export async function setActiveDeckPreset(serial: string, id: string | null): Promise<boolean> {
  return acked(await putService<ApiResponseWrapper>(`/streamdeck/decks/${encodeURIComponent(serial)}/presets/active`, { id }));
}

export interface StreamDeckDevModel {
  productId: string;
  name: string;
  rows: number;
  cols: number;
  keyCount: number;
}

interface StreamDeckDevModelsResponse {
  models: StreamDeckDevModel[];
}

/** Dev-tools-only: every model the service can simulate, so a bench box with no hardware can design a layout for any deck size. */
export async function getStreamDeckDevModels(): Promise<StreamDeckDevModel[]> {
  const res = await fetchService<StreamDeckDevModelsResponse>('/streamdeck/dev/models');
  return res?.models ?? [];
}

/** Dev-tools-only: spin up a simulated deck of the given model; it then appears in getStreamDecks(). */
export async function simulateStreamDeck(productId: string): Promise<boolean> {
  return acked(await postService<ApiResponseWrapper>('/streamdeck/dev/simulate', { productId }));
}

/** Dev-tools-only: remove the simulated deck. */
export async function clearSimulatedStreamDeck(): Promise<boolean> {
  return acked(await deleteService<ApiResponseWrapper>('/streamdeck/dev/simulate'));
}
