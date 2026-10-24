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

const MAX_DIRECTIONS = 512;
const MAX_BINDINGS = 64;
const MAX_SLOT_KEYS = 16;
const MAX_TESTS = 16;
const MAX_MOVES = 64;
const MAX_KEY = 128;
const MAX_NAME = 64;

const isDirection = (v: unknown): v is FanDirection => v === 'intake' || v === 'exhaust';
const keyOk = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= MAX_KEY;

function directionsOf(raw: unknown): Record<string, FanDirection> {
  const out: Record<string, FanDirection> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (Object.keys(out).length >= MAX_DIRECTIONS) break;
    if (keyOk(k) && isDirection(v)) out[k] = v;
  }
  return out;
}

function testOf(raw: unknown): CoolingTest | null {
  const o = raw as Record<string, unknown> | null;
  if (!o || !keyOk(o.id) || typeof o.name !== 'string' || o.name.length > MAX_NAME) return null;
  const moves = Array.isArray(o.moves)
    ? o.moves.slice(0, MAX_MOVES).flatMap(m => {
      const mv = m as Record<string, unknown> | null;
      return mv && keyOk(mv.from) && keyOk(mv.to) ? [{ from: mv.from, to: mv.to }] : [];
    })
    : [];
  return { id: o.id, name: o.name, moves, directions: directionsOf(o.directions) };
}

/** A layout from untrusted JSON, held to the service's caps: anything malformed or over a cap is dropped, never thrown. */
export function normalizeCoolingLayout(raw: unknown): CoolingLayout {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const bindings: FanBinding[] = [];
  if (Array.isArray(r.bindings)) {
    for (const b of r.bindings.slice(0, MAX_BINDINGS)) {
      const o = b as Record<string, unknown> | null;
      if (o && keyOk(o.channelId) && Array.isArray(o.slotKeys)) {
        bindings.push({ channelId: o.channelId, slotKeys: o.slotKeys.filter(keyOk).slice(0, MAX_SLOT_KEYS) });
      }
    }
  }
  const tests = Array.isArray(r.tests) ? r.tests.slice(0, MAX_TESTS).map(testOf).filter((t): t is CoolingTest => t !== null) : [];
  return { directions: directionsOf(r.directions), bindings, tests };
}

/** `GET` body and the 409 body: `{ rev, layout }`. */
function recordOf(json: Record<string, unknown> | null): CoolingLayoutRecord | null {
  if (!json || typeof json.rev !== 'number' || !json.layout) return null;
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

/** 200 is `{ rev }` only, so the saved record is the layout sent; 409 is `{ rev, layout }`; 400 is `{ error, msg }`. */
export async function putCoolingLayout(baseRev: number, layout: CoolingLayout): Promise<CoolingLayoutWrite> {
  const { response, status } = await authFetchWithStatus('/cooling/layout', { method: 'PUT', body: { baseRev, layout } });
  if (!response) return { kind: 'unreachable' };
  const json = await readJson(response);
  if (status === 409) {
    const record = recordOf(json);
    return record ? { kind: 'conflict', record } : { kind: 'unreachable' };
  }
  if (response.ok && json && typeof json.rev === 'number') return { kind: 'saved', record: { rev: json.rev, layout } };
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
