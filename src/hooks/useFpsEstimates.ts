import { useEffect, useMemo, useRef, useState } from 'react';
import { getFpsSignature, getFpsTable } from '../api/nexusApi';
import { buildFpsSignatureParams } from '../panel/widgets/frames/fpsSignatureParams';
import type { FpsSignatureParams, FpsTableGameItem } from '../types/fps-estimates';
import { useSystemSpecs } from './useSystemSpecs';

export type FpsEstimatesStatus = 'loading' | 'unresolved' | 'empty' | 'ready';

export interface UseFpsEstimatesResult {
  status: FpsEstimatesStatus;
  games: FpsTableGameItem[];
  gamesByKey: ReadonlyMap<string, FpsTableGameItem>;
  /** The rig's own resClass (e.g. "2560x1440"), for comparing against a game's resBasis. */
  resClass: string | null;
}

interface SessionTable {
  resClass: string;
  games: FpsTableGameItem[];
}

// Module-scoped like useSystemSpecs' own cache: the rig and its community
// table are both static for the life of the tab, so one fetch per session.
let sessionTable: SessionTable | null = null;
// Shared across concurrently mounted consumers (Steam + Frames can both be
// open at once) so a second mount awaits the first's request instead of
// firing its own against the throttled signature/table routes.
let pendingRequest: Promise<SessionTable | null> | null = null;

async function loadTable(params: FpsSignatureParams): Promise<SessionTable | null> {
  const sig = await getFpsSignature(params);
  if (!sig) return null;
  const data = await getFpsTable(sig.sigKey);
  if (!data) return null;
  return { resClass: sig.resolved.resClass, games: data.games };
}

function requestTable(params: FpsSignatureParams): Promise<SessionTable | null> {
  pendingRequest ??= loadTable(params).finally(() => { pendingRequest = null; });
  return pendingRequest;
}

/**
 * Derives the local rig's cloud FPS signature and fetches its community
 * estimate table once per session. Silent throughout: a rig that can't be
 * signed (no parseable display resolution) or a signature/table request that
 * fails never surfaces an error - status reports `unresolved`, never a
 * failed table mistaken for a genuine `empty` (zero games) result.
 */
export function useFpsEstimates(): UseFpsEstimatesResult {
  const { specs } = useSystemSpecs(true);
  const [table, setTable] = useState<SessionTable | null>(sessionTable);
  const [failed, setFailed] = useState(false);
  const mountedRef = useRef(true);
  const startedRef = useRef(false);

  const params = useMemo(() => (specs ? buildFpsSignatureParams(specs) : null), [specs]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (sessionTable || startedRef.current || !params) return;
    startedRef.current = true;
    void requestTable(params).then(result => {
      if (!mountedRef.current) return;
      if (!result) { setFailed(true); return; }
      sessionTable = result;
      setTable(result);
    });
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
