import { authFetchWithStatus } from './service';
import type { SceneObject } from './lightingScene';

/**
 * The PC setup Build and Lighting share. Mirrors nexus-service Lighting/Scene/PcSetupModels.cs. Millimetres, x and z
 * are the footprint centre, yaw is degrees counter-clockwise seen from above (the same as SceneObject).
 */
export interface PcSetupPlace {
  x: number;
  z: number;
  yaw: number;
  curved?: boolean;
  main?: boolean;
  /** Opaque to the service. */
  keptSize?: unknown;
}

export interface PcSetupItem {
  id: string;
  kind: string;
  catalog?: { category: string; partId: string; title: string; specs?: unknown };
  custom?: {
    name: string;
    widthMm?: number;
    depthMm?: number;
    price?: number;
    shape?: 'straight' | 'l';
    returnWidthMm?: number;
    returnDepthMm?: number;
    returnSide?: 'left' | 'right';
  };
  owned: boolean;
  detected?: { key: string; hidden?: boolean };
  replaces?: string;
  place?: PcSetupPlace;
}

export interface PcSetup {
  version: number;
  case: { place?: PcSetupPlace };
  /** Opaque to the service. */
  parts?: unknown;
  items: PcSetupItem[];
  resolved: { objects: SceneObject[]; caseLayout?: unknown };
}

export interface PcSetupRecord {
  rev: number;
  setup: PcSetup;
}

/** An item id, or `case`, and its new footprint centre and yaw. */
export interface PcSetupPlacement {
  id: string;
  x: number;
  z: number;
  yaw: number;
}

export type PcSetupWrite =
  | { kind: 'saved'; rev: number }
  | { kind: 'conflict'; record: PcSetupRecord }
  | { kind: 'invalid'; code: string; msg: string }
  | { kind: 'unreachable' };

/** What a profile or cloud import did with the PC setup it carried; the `skipped_` outcomes left this PC's setup untouched. */
export type PcSetupImportOutcome = 'applied' | 'applied_unknown_machine' | 'skipped_other_machine' | 'skipped_new_profile';

export const setupSkipped = (outcome: string | null | undefined): boolean => typeof outcome === 'string' && outcome.startsWith('skipped_');

/** The service topic that pings `{ rev }` after every save; subscribers refetch. */
export const PC_SETUP_TOPIC = 'system/setup';

async function readJson(response: Response): Promise<Record<string, unknown> | null> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function write(path: string, method: 'PUT' | 'PATCH', body: unknown): Promise<PcSetupWrite> {
  const { response, status } = await authFetchWithStatus(path, { method, body });
  if (!response) return { kind: 'unreachable' };
  const json = await readJson(response);
  if (status === 409 && json && typeof json.rev === 'number' && json.setup) {
    return { kind: 'conflict', record: { rev: json.rev, setup: json.setup as PcSetup } };
  }
  if (response.ok && json && typeof json.rev === 'number') return { kind: 'saved', rev: json.rev };
  if (status === 400 && json) {
    return { kind: 'invalid', code: typeof json.code === 'string' ? json.code : 'invalid', msg: typeof json.msg === 'string' ? json.msg : '' };
  }
  return { kind: 'unreachable' };
}

/** Rev 0 with an empty setup when nothing is saved; null when the service did not answer. */
export async function fetchPcSetup(): Promise<PcSetupRecord | null> {
  const { response } = await authFetchWithStatus('/system/setup', { cache: 'no-store' });
  if (!response?.ok) return null;
  const json = await readJson(response);
  return json && typeof json.rev === 'number' && json.setup ? { rev: json.rev, setup: json.setup as PcSetup } : null;
}

/** Build's whole-record write. */
export const putPcSetup = (baseRev: number, setup: PcSetup) => write('/system/setup', 'PUT', { baseRev, setup });

/** Lighting's write: moves and turns existing items; the service updates the matching resolved objects itself. */
export const patchPcSetupPlacements = (baseRev: number, places: PcSetupPlacement[]) =>
  write('/system/setup/placements', 'PATCH', { baseRev, places });
