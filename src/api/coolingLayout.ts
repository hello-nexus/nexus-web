import { authFetchWithStatus } from './service';
import type { FanBinding } from '../lib/cooling/caseLayout';
import type { FanDirection } from '../lib/cooling/pressureModel';

/** Mirrors the service's cooling layout store (cooling-layout.json). */
export interface CoolingTest {
  id: string;
  name: string;
  moves: { from: string; to: string }[];
  directions: Record<string, FanDirection>;
}

export interface CoolingLayout {
  /** Only overrides of the default direction, by fan slot key. */
  directions: Record<string, FanDirection>;
  bindings: FanBinding[];
  tests: CoolingTest[];
}

export interface CoolingLayoutRecord {
  rev: number;
  layout: CoolingLayout;
}

export type CoolingLayoutWrite =
  | { kind: 'saved'; record: CoolingLayoutRecord }
  | { kind: 'conflict'; record: CoolingLayoutRecord }
  | { kind: 'invalid'; msg: string }
  | { kind: 'unreachable' };

/** The service topic that pings after every save; subscribers refetch. */
export const COOLING_LAYOUT_TOPIC = 'cooling/layout';

export const emptyCoolingLayout = (): CoolingLayout => ({ directions: {}, bindings: [], tests: [] });

const MAX_BINDINGS = 64;
const MAX_DIRECTIONS = 512;

const isDirection = (v: unknown): v is FanDirection => v === 'intake' || v === 'exhaust';

/** A layout from untrusted JSON: anything malformed is dropped, never thrown. */
export function normalizeCoolingLayout(raw: unknown): CoolingLayout {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const directions: Record<string, FanDirection> = {};
  if (r.directions && typeof r.directions === 'object') {
    for (const [k, v] of Object.entries(r.directions as Record<string, unknown>).slice(0, MAX_DIRECTIONS)) {
      if (isDirection(v)) directions[k] = v;
    }
  }
  const bindings: FanBinding[] = [];
  if (Array.isArray(r.bindings)) {
    for (const b of r.bindings.slice(0, MAX_BINDINGS)) {
      const o = b as Record<string, unknown> | null;
      if (o && typeof o.channelId === 'string' && Array.isArray(o.slotKeys)) {
        bindings.push({ channelId: o.channelId, slotKeys: o.slotKeys.filter((k): k is string => typeof k === 'string') });
      }
    }
  }
  const tests = Array.isArray(r.tests) ? (r.tests as CoolingTest[]) : [];
  return { directions, bindings, tests };
}

function recordOf(json: Record<string, unknown> | null): CoolingLayoutRecord | null {
  if (!json || typeof json.rev !== 'number') return null;
  return { rev: json.rev, layout: normalizeCoolingLayout(json.layout) };
}

async function readJson(response: Response): Promise<Record<string, unknown> | null> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Null when the service did not answer. */
export async function fetchCoolingLayout(): Promise<CoolingLayoutRecord | null> {
  const { response } = await authFetchWithStatus('/cooling/layout', { cache: 'no-store' });
  if (!response?.ok) return null;
  return recordOf(await readJson(response));
}

export async function putCoolingLayout(baseRev: number, layout: CoolingLayout): Promise<CoolingLayoutWrite> {
  const { response, status } = await authFetchWithStatus('/cooling/layout', { method: 'PUT', body: { baseRev, layout } });
  if (!response) return { kind: 'unreachable' };
  const json = await readJson(response);
  const record = recordOf(json);
  if (status === 409 && record) return { kind: 'conflict', record };
  if (response.ok && record) return { kind: 'saved', record };
  if (status === 400) return { kind: 'invalid', msg: typeof json?.msg === 'string' ? json.msg : '' };
  return { kind: 'unreachable' };
}

/**
 * Applies `edit` to `current` and saves it. On a 409 the edit is replayed once on the layout the service holds;
 * a second conflict returns that newer record unsaved.
 */
export async function saveCoolingLayout(
  current: CoolingLayoutRecord,
  edit: (layout: CoolingLayout) => CoolingLayout,
  put: typeof putCoolingLayout = putCoolingLayout,
): Promise<CoolingLayoutWrite> {
  let base = current;
  let last: CoolingLayoutWrite = { kind: 'unreachable' };
  for (let attempt = 0; attempt < 2; attempt++) {
    last = await put(base.rev, edit(base.layout));
    if (last.kind !== 'conflict') return last;
    base = last.record;
  }
  return last;
}
