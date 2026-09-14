import { useEffect, useMemo, useState } from 'react';
import { getFpsSignature, getFpsTable } from '../api/nexusApi';
import { buildFpsSignatureParams } from '../panel/widgets/frames/fpsSignatureParams';
import type { FpsSignatureParams, FpsTableGameItem } from '../types/fps-estimates';
import { useSystemSpecs } from './useSystemSpecs';

export type FpsEstimatesStatus = 'loading' | 'unresolved' | 'empty' | 'ready';

export interface UseFpsEstimatesResult {
  status: FpsEstimatesStatus;
  games: FpsTableGameItem[];
  gamesByKey: ReadonlyMap<string, FpsTableGameItem>;
  /** The resClass the table was fetched for (e.g. "2560x1440"), for comparing against a game's resBasis. */
  resClass: string | null;
}

interface SessionTable {
  resClass: string;
  games: FpsTableGameItem[];
}

// Module-scoped like useSystemSpecs' own cache: the rig is static for the
// life of the tab and a table only changes on the cloud's daily aggregation,
// so one fetch per resolution per session.
const sessionTables = new Map<string, SessionTable>();
// Shared across concurrently mounted consumers (Steam + Frames can both be
// open at once) so a second mount awaits the first's request instead of
// firing its own against the throttled signature/table routes.
const pendingRequests = new Map<string, Promise<SessionTable | null>>();

async function loadTable(params: FpsSignatureParams): Promise<SessionTable | null> {
  const sig = await getFpsSignature(params);
  if (!sig) return null;
  const data = await getFpsTable(sig.sigKey);
  if (!data) return null;
  return { resClass: sig.resolved.resClass, games: data.games };
}

function requestTable(params: FpsSignatureParams): Promise<SessionTable | null> {
  let pending = pendingRequests.get(params.res);
  if (!pending) {
    pending = loadTable(params).finally(() => { pendingRequests.delete(params.res); });
    pendingRequests.set(params.res, pending);
  }
  return pending;
}

/**
 * Derives the local rig's cloud FPS signature and fetches its community
 * estimate table once per session. `res` asks for a resolution other than the
 * rig's own display (the Frames Discover chips); omitted, the display's
 * resolution is used. Silent throughout: a rig that can't be signed (no
 * parseable display resolution and no override) or a signature/table request
 * that fails never surfaces an error - status reports `unresolved`, never a
 * failed table mistaken for a genuine `empty` (zero games) result.
 */
export function useFpsEstimates(res?: string): UseFpsEstimatesResult {
  const { specs } = useSystemSpecs(true);
  const params = useMemo(() => (specs ? buildFpsSignatureParams(specs, res) : null), [specs, res]);
  const [table, setTable] = useState<SessionTable | null>(() => (params ? sessionTables.get(params.res) ?? null : null));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!params) return;
    const cached = sessionTables.get(params.res);
    setFailed(false);
    if (cached) { setTable(cached); return; }
    let cancelled = false;
    setTable(null);
    void requestTable(params).then(result => {
      if (cancelled) return;
      if (!result) { setFailed(true); return; }
      sessionTables.set(params.res, result);
      setTable(result);
    });
    return () => { cancelled = true; };
  }, [params]);

  const gamesByKey = useMemo(
    () => new Map((table?.games ?? []).map(g => [g.gameKey, g])),
    [table],
  );

  // Unresolved covers every case the caller renders identically (nothing):
  // the rig itself couldn't be signed (no parseable display resolution), or
  // the signature/table request failed outright. Both are distinct from
  // `specs === null` (still loading) and from a resolved table with zero
  // games (`empty`).
  const unresolved = (specs !== null && params === null) || failed;
  const status: FpsEstimatesStatus = table
    ? (table.games.length > 0 ? 'ready' : 'empty')
    : unresolved ? 'unresolved'
    : 'loading';

  return { status, games: table?.games ?? [], gamesByKey, resClass: table?.resClass ?? null };
}
