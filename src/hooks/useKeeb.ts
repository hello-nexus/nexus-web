import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type KeebLayer,
  type KeebSettings,
  type KeyboardState,
  type SetFirmwareLightingBody,
  type SetGameModeBody,
  type SetLayerKeyBody,
  type SetPassiveLightingBody,
  type SetRotaryWheelsBody,
  getKeebLayer,
  getKeebSettings,
  getKeebState,
  resetKeebLayer,
  setKeebFirmwareLighting,
  setKeebGameMode,
  setKeebLayerKey,
  setKeebPassiveLighting,
  setKeebRotary,
  setKeebRotarySensitivity,
} from '../api/keeb';

/// State + setters used by the keeb modal. Polls /keeb/state every 5s while
/// `enabled`; per-action setters re-fetch immediately on success so the UI
/// reflects the post-write firmware state without waiting for the next poll.
///
/// When the WebSocket `keeb` topic lands (Phase 1d in the spec) this hook
/// switches to push-based updates with the same shape.
export interface UseKeebApi {
  state: KeyboardState;
  settings: KeebSettings | null;
  loading: boolean;
  layer: KeebLayer;
  setLayer: (layer: KeebLayer) => void;
  refresh: () => Promise<void>;
  setKey: (body: SetLayerKeyBody) => Promise<void>;
  resetLayer: () => Promise<void>;
  saveFirmwareLighting: (body: SetFirmwareLightingBody) => Promise<void>;
  savePassiveLighting: (body: SetPassiveLightingBody) => Promise<void>;
  saveGameMode: (body: SetGameModeBody) => Promise<void>;
  saveRotary: (body: SetRotaryWheelsBody) => Promise<void>;
  saveRotarySensitivity: (s: string) => Promise<void>;
}

const EMPTY_STATE: KeyboardState = {
  isConnected: false,
  profile: 0,
  layout: 'ANSI',
  layer: 0,
  keys: [],
};

const POLL_MS = 5000;

export function useKeeb(enabled: boolean): UseKeebApi {
  const [layer, setLayerState] = useState<KeebLayer>(0);
  const [state, setState] = useState<KeyboardState>(EMPTY_STATE);
  const [settings, setSettings] = useState<KeebSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const cancelledRef = useRef(false);

  const fetchAll = useCallback(async (forLayer: KeebLayer) => {
    setLoading(true);
    try {
      const [st, se] = await Promise.all([
        getKeebState(forLayer),
        getKeebSettings(),
      ]);
      if (cancelledRef.current) return;
      if (st) setState(st);
      if (se) setSettings(se);
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    cancelledRef.current = false;
    if (!enabled) return;
    void fetchAll(layer);
    const id = window.setInterval(() => { void fetchAll(layer); }, POLL_MS);
    return () => {
      cancelledRef.current = true;
      window.clearInterval(id);
    };
  }, [enabled, layer, fetchAll]);

  const setLayer = useCallback((next: KeebLayer) => {
    setLayerState(next);
  }, []);

  const refresh = useCallback(async () => {
    await fetchAll(layer);
  }, [fetchAll, layer]);

  const setKey = useCallback(async (body: SetLayerKeyBody) => {
    const next = await setKeebLayerKey(layer, body);
    if (next) setState(next);
  }, [layer]);

  const resetLayer = useCallback(async () => {
    const next = await resetKeebLayer(layer);
    if (next) setState(next);
  }, [layer]);

  const saveFirmwareLighting = useCallback(async (body: SetFirmwareLightingBody) => {
    await setKeebFirmwareLighting(body);
    const fresh = await getKeebSettings();
    if (fresh) setSettings(fresh);
  }, []);

  const savePassiveLighting = useCallback(async (body: SetPassiveLightingBody) => {
    await setKeebPassiveLighting(body);
    const fresh = await getKeebSettings();
    if (fresh) setSettings(fresh);
  }, []);

  const saveGameMode = useCallback(async (body: SetGameModeBody) => {
    await setKeebGameMode(body);
    const fresh = await getKeebSettings();
    if (fresh) setSettings(fresh);
  }, []);

  const saveRotary = useCallback(async (body: SetRotaryWheelsBody) => {
    await setKeebRotary(body);
  }, []);

  const saveRotarySensitivity = useCallback(async (s: string) => {
    await setKeebRotarySensitivity(s);
  }, []);

  return {
    state,
    settings,
    loading,
    layer,
    setLayer,
    refresh,
    setKey,
    resetLayer,
    saveFirmwareLighting,
    savePassiveLighting,
    saveGameMode,
    saveRotary,
    saveRotarySensitivity,
  };
}

// Re-export the layer fetch helper for callers that need a one-shot read
// (key assignment view uses this on tab switch).
export { getKeebLayer };
