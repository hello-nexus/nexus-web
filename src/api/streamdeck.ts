// Client for the physical Stream Deck HID/device routes (mirrors
// nexus-service's StreamDeckRoutes.cs). Layout config/presets/key-image
// routes moved to api/deck.ts (host-wide presets, one system for physical
// decks and the Deck widget). Every route here is .LocalhostOnly() - a
// desktop-only hardware configuration surface - so every call here fails
// closed on a remote/panel origin via the shared fetchService guard.
import { fetchService, postService, deleteService } from './service';
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
  /** This deck's deck-instance id (`streamdeck:<serial>`), for useDeckInstance. */
  instanceId: string;
  /** User mounting rotation, degrees: 0, 90, 180, or 270. Always sent by the DTO; optional here only so older test fixtures need not set it. */
  orientation?: number;
  /** Seconds of no key input before the deck blanks; 0 disables sleep-after. Always sent by the DTO; optional here for the same reason. */
  sleepAfterSeconds?: number;
  /** Blank while the desktop session is locked (service default on). Always sent by the DTO; optional here for the same reason. */
  sleepWhenLocked?: boolean;
  firmwareVersion?: string;
  warning?: string;
  /** ConflictAppCatalog id to pass to POST /conflicts/kill when warning is set. */
  conflictAppId?: string;
  /**
   * The physical deck's live page/folder, same semantics as the 'nav'
   * multiplex frame (see StreamDeckDevicePage's topic subscription). Seeds
   * the device page's initial view so it opens on what the hardware is
   * actually showing instead of always page 0; absent on a service build
   * that predates this field, in which case the editor falls back to page 0.
   */
  currentPage?: number;
  /** Paired with currentPage; absent has the same page-0-root meaning as an empty array. */
  folderPath?: number[];
}

interface StreamDeckListResponse {
  decks: StreamDeckSummary[];
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
  patch: { name?: string; brightness?: number; orientation?: number; sleepAfterSeconds?: number; sleepWhenLocked?: boolean },
): Promise<boolean> {
  return acked(await postService<ApiResponseWrapper>(`/streamdeck/decks/${encodeURIComponent(serial)}`, patch));
}

/** Dev-tools-only: push a test pattern to every key so a bench Stream Deck can be sanity-checked without editing a layout. */
export async function sendStreamDeckTestPattern(serial: string): Promise<boolean> {
  return acked(await postService<ApiResponseWrapper>(`/streamdeck/decks/${encodeURIComponent(serial)}/test-pattern`, {}));
}

/** Mirror the editor's current page + folder onto the physical deck (desktop -> device nav). */
export async function setStreamDeckNav(serial: string, page: number, folderPath: readonly number[]): Promise<boolean> {
  return acked(await postService<ApiResponseWrapper>(`/streamdeck/decks/${encodeURIComponent(serial)}/nav`, { page, folderPath }));
}

/** A blank-key hold-to-edit intent (see StreamDeckConnectionWorker); page/folderPath/keyIndex address the held key in the editor. */
export interface PendingDeckEdit {
  serial: string;
  page: number;
  folderPath: number[];
  keyIndex: number;
  /** One-shot id (epoch ms); the client dedupes the live frame against this boot fetch on it. */
  token: number;
}

interface PendingDeckEditResponse {
  edit: PendingDeckEdit | null;
}

/**
 * The blank-key hold-to-edit intent the service is holding (within its
 * PendingEditTtl) for a freshly-opened dashboard to consume, or null when
 * nothing is pending. Mirrors the live 'editRequest' multiplex frame's payload.
 */
export async function getPendingDeckEdit(): Promise<PendingDeckEdit | null> {
  const res = await fetchService<PendingDeckEditResponse>('/streamdeck/pending-edit');
  return res?.edit ?? null;
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

export interface ElgatoProfileSummary {
  id: string;
  name: string;
  model: string;
  modelLabel: string;
  pageCount: number;
  keyCount: number;
}

export type ElgatoProfilesStatus = 'ok' | 'notFound' | 'unsupportedVersion';

export interface ElgatoProfilesResponse {
  status: ElgatoProfilesStatus;
  profiles: ElgatoProfileSummary[];
}

/** Lists profiles from the local Elgato Stream Deck install, or a status explaining why none are available. */
export async function fetchElgatoProfiles(): Promise<ElgatoProfilesResponse | null> {
  return fetchService<ElgatoProfilesResponse>('/streamdeck/elgato/profiles');
}

export type ElgatoUnmappedReason =
  | 'plugin' | 'unsupported' | 'hotkey' | 'open' | 'website' | 'text' | 'media'
  | 'multiStep' | 'encoder' | 'pageLimit' | 'hotkeyExtraSlots' | 'textEnterIgnored'
  | 'monitoringSensor' | 'audioPath';

export interface ElgatoUnmappedKey {
  page: number;
  position: string;
  name: string;
  reason: ElgatoUnmappedReason;
  detail?: string;
}

export interface ElgatoImportReport {
  totalKeys: number;
  mappedKeys: number;
  unmapped: ElgatoUnmappedKey[];
}

export interface ElgatoImportResult {
  config: DeckConfig;
  report: ElgatoImportReport;
}

/** Translates one Elgato profile into a DeckConfig + a mapped/unmapped report. Null on a 404 (unknown id) or transport failure. */
export async function importElgatoProfile(id: string): Promise<ElgatoImportResult | null> {
  return postService<ElgatoImportResult>(`/streamdeck/elgato/profiles/${encodeURIComponent(id)}/import`, {});
}
