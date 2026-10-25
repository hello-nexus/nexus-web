import { useEffect, useRef, useState } from 'react';
import { fetchLightingScene, fetchSceneModel } from '../api/lightingScene';

export interface CaseModelState {
  /** Build's exported case model, null while none is held. */
  bytes: ArrayBuffer | null;
  /** True once the service has answered about the model, with one or without. */
  settled: boolean;
}

/**
 * The case model the service holds, the one the lighting scene draws. The scene is read again when `rev` (the shared setup's
 * revision) changes, and the model is fetched only when the scene's model revision changes.
 */
export function useCaseModel(active: boolean, rev: number | null): CaseModelState {
  const [state, setState] = useState<CaseModelState>({ bytes: null, settled: false });
  const held = useRef<string | null>(null);
  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;
    void (async () => {
      const scene = await fetchLightingScene();
      if (cancelled) return;
      const modelRev = scene?.modelRev ?? null;
      if (!modelRev) { held.current = null; setState({ bytes: null, settled: true }); return; }
      if (held.current === modelRev) return;
      const bytes = await fetchSceneModel();
      if (cancelled) return;
      held.current = bytes ? modelRev : null;
      setState({ bytes, settled: true });
    })();
    return () => { cancelled = true; };
  }, [active, rev]);
  return state;
}
