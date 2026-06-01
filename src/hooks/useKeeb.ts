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

/// State + setters for the keeb modal.
///
/// Writes apply OPTIMISTICALLY: local state updates before the POST so the UI
/// reflects the click instantly, even though the HID round-trip on the service
/// can take several seconds. The POST then fires async; a background poll
/// reconciles whenever there are no writes in flight.
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

// Settings/state poll. The service serves these from persisted state (no HID
// round-trip), so a tight interval is cheap — it keeps the panel in step with
// device-initiated changes (e.g. the rotary middle button cycling the firmware
// effect, which the service mirrors into settings) within ~1.5 s.
const POLL_MS = 1500;

/// Apply a single SetLayerKeyBody to the keys grid by replacing one cell.
/// Returns a new state with deep-cloned `keys` so React sees the change.
function applyKeyOverride(prev: KeyboardState, body: SetLayerKeyBody): KeyboardState {
  const keys = prev.keys.map(row => row.slice());
  while (keys.length <= body.x) keys.push([]);
  while (keys[body.x].length <= body.y) keys[body.x].push({ mode: 'StandardKey', function: '', input: null });
  keys[body.x][body.y] = { mode: body.mode, function: body.func, input: body.input ?? null };
  return { ...prev, keys };
}

export function useKeeb(enabled: boolean): UseKeebApi {
  const [layer, setLayerState] = useState<KeebLayer>(0);
  const [state, setState] = useState<KeyboardState>(EMPTY_STATE);
  const [settings, setSettings] = useState<KeebSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const cancelledRef = useRef(false);
  // Pending-writes counter. While > 0 the background poll skips state
  // refresh so a stale firmware read doesn't clobber an optimistic update.
  const pendingWritesRef = useRef(0);

  const fetchAll = useCallback(async (forLayer: KeebLayer) => {
    if (pendingWritesRef.current > 0) return;
    setLoading(true);
    try {
      const [st, se] = await Promise.all([
        getKeebState(forLayer),
        getKeebSettings(),
      ]);
      if (cancelledRef.current) return;
      if (pendingWritesRef.current > 0) return;
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

  /// Optimistic + fire-and-forget. The cell flips immediately; the HID
  /// write happens in the background. While the write is in flight the
  /// background poll is suppressed so a stale read can't clobber the
  /// optimistic state.
  const setKey = useCallback(async (body: SetLayerKeyBody) => {
    setState(prev => applyKeyOverride(prev, body));
    pendingWritesRef.current += 1;
    try { await setKeebLayerKey(layer, body); }
    finally { pendingWritesRef.current = Math.max(0, pendingWritesRef.current - 1); }
  }, [layer]);

  const resetLayer = useCallback(async () => {
    // Optimistically clear the layer's keys so the keyboard reverts to
    // defaults immediately. The poll will reconcile when the firmware
    // ack lands.
    setState(prev => ({ ...prev, keys: [] }));
    pendingWritesRef.current += 1;
    try { await resetKeebLayer(layer); }
    finally { pendingWritesRef.current = Math.max(0, pendingWritesRef.current - 1); }
  }, [layer]);

  const saveFirmwareLighting = useCallback(async (body: SetFirmwareLightingBody) => {
    setSettings(prev => prev ? { ...prev, ...body } : prev);
    pendingWritesRef.current += 1;
    try { await setKeebFirmwareLighting(body); }
    finally { pendingWritesRef.current = Math.max(0, pendingWritesRef.current - 1); }
  }, []);

  const savePassiveLighting = useCallback(async (body: SetPassiveLightingBody) => {
    setSettings(prev => prev ? { ...prev, ...body } : prev);
    pendingWritesRef.current += 1;
    try { await setKeebPassiveLighting(body); }
    finally { pendingWritesRef.current = Math.max(0, pendingWritesRef.current - 1); }
  }, []);

  const saveGameMode = useCallback(async (body: SetGameModeBody) => {
    setSettings(prev => prev ? {
      ...prev,
      altF4Disabled: body.altF4,
      altTabDisabled: body.altTab,
      shiftKeyDisabled: body.shiftTab,
      windowsKeyDisabled: body.windowsKey,
    } : prev);
    pendingWritesRef.current += 1;
    try { await setKeebGameMode(body); }
    finally { pendingWritesRef.current = Math.max(0, pendingWritesRef.current - 1); }
  }, []);

  const saveRotary = useCallback(async (body: SetRotaryWheelsBody) => {
    pendingWritesRef.current += 1;
    try { await setKeebRotary(body); }
    finally { pendingWritesRef.current = Math.max(0, pendingWritesRef.current - 1); }
  }, []);

  const saveRotarySensitivity = useCallback(async (s: string) => {
    pendingWritesRef.current += 1;
    try { await setKeebRotarySensitivity(s); }
    finally { pendingWritesRef.current = Math.max(0, pendingWritesRef.current - 1); }
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
