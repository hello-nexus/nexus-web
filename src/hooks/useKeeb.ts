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
///
/// Every write resolves to whether the service acknowledged it. On failure the
/// optimistic state is reconciled back to server truth (an immediate refetch
/// once no writes remain in flight), so the UI never keeps showing a change
/// the keyboard never received.
export interface UseKeebApi {
  state: KeyboardState;
  settings: KeebSettings | null;
  loading: boolean;
  layer: KeebLayer;
  setLayer: (layer: KeebLayer) => void;
  refresh: () => Promise<void>;
  setKey: (body: SetLayerKeyBody) => Promise<boolean>;
  resetLayer: () => Promise<boolean>;
  saveFirmwareLighting: (body: SetFirmwareLightingBody) => Promise<boolean>;
  savePassiveLighting: (body: SetPassiveLightingBody) => Promise<boolean>;
  saveGameMode: (body: SetGameModeBody) => Promise<boolean>;
  saveRotary: (body: SetRotaryWheelsBody) => Promise<boolean>;
  saveRotarySensitivity: (s: string) => Promise<boolean>;
}

const EMPTY_STATE: KeyboardState = {
  isConnected: false,
  profile: 0,
  layout: 'ANSI',
  layer: 0,
  keys: [],
};

// Settings/state poll. The service serves these from persisted state (no HID
// round-trip), so this keeps the panel in step with device-initiated changes
// (e.g. the rotary middle button cycling the firmware effect, mirrored into
// settings) within ~1.5 s.
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
  // Set when a write fails so the next idle moment refetches server truth
  // instead of leaving the failed optimistic update on screen.
  const needsResyncRef = useRef(false);
  const layerRef = useRef<KeebLayer>(0);
  // Bumped every time a write settles. A poll that started before the write
  // completed carries pre-write data; discard its result rather than letting
  // it clobber the acked state.
  const writeGenerationRef = useRef(0);

  const fetchAll = useCallback(async (forLayer: KeebLayer) => {
    if (pendingWritesRef.current > 0) return;
    const generation = writeGenerationRef.current;
    setLoading(true);
    try {
      const [st, se] = await Promise.all([
        getKeebState(forLayer),
        getKeebSettings(),
      ]);
      if (cancelledRef.current) return;
      if (pendingWritesRef.current > 0) return;
      if (writeGenerationRef.current !== generation) return;
      if (st) setState(st);
      if (se) setSettings(se);
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
  }, []);

  /// Wrap a write: count it as in-flight, then reconcile. A false result means
  /// the service rejected or never received it - schedule a resync so the
  /// optimistic update is rolled back to server truth as soon as no other
  /// writes are pending.
  const runWrite = useCallback(async (write: () => Promise<boolean>): Promise<boolean> => {
    pendingWritesRef.current += 1;
    let ok = false;
    try {
      ok = await write();
    } finally {
      pendingWritesRef.current = Math.max(0, pendingWritesRef.current - 1);
      writeGenerationRef.current += 1;
      if (!ok) needsResyncRef.current = true;
      if (needsResyncRef.current && pendingWritesRef.current === 0 && !cancelledRef.current) {
        needsResyncRef.current = false;
        void fetchAll(layerRef.current);
      }
    }
    return ok;
  }, [fetchAll]);

  useEffect(() => {
    cancelledRef.current = false;
    layerRef.current = layer;
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

  /// Optimistic: the cell flips immediately, then the write runs. On ack the
  /// service returns the authoritative layer state, which replaces the
  /// optimistic one; on failure runWrite refetches and the cell reverts.
  /// The ack snapshot is adopted only when no OTHER write is still in flight
  /// (the counter includes this write) - a snapshot taken before a newer
  /// write would visually revert that write's optimistic cell.
  const setKey = useCallback(async (body: SetLayerKeyBody) => {
    setState(prev => applyKeyOverride(prev, body));
    return runWrite(async () => {
      const r = await setKeebLayerKey(layer, body);
      if (r && pendingWritesRef.current === 1) setState(r);
      return r !== null;
    });
  }, [layer, runWrite]);

  const resetLayer = useCallback(async () => {
    // Optimistically clear the layer's keys so the keyboard reverts to
    // defaults immediately.
    setState(prev => ({ ...prev, keys: [] }));
    return runWrite(async () => {
      const r = await resetKeebLayer(layer);
      if (r && pendingWritesRef.current === 1) setState(r);
      return r !== null;
    });
  }, [layer, runWrite]);

  const saveFirmwareLighting = useCallback(async (body: SetFirmwareLightingBody) => {
    setSettings(prev => prev ? { ...prev, ...body } : prev);
    return runWrite(() => setKeebFirmwareLighting(body));
  }, [runWrite]);

  const savePassiveLighting = useCallback(async (body: SetPassiveLightingBody) => {
    setSettings(prev => prev ? { ...prev, ...body } : prev);
    return runWrite(() => setKeebPassiveLighting(body));
  }, [runWrite]);

  const saveGameMode = useCallback(async (body: SetGameModeBody) => {
    setSettings(prev => prev ? {
      ...prev,
      altF4Disabled: body.altF4,
      altTabDisabled: body.altTab,
      shiftKeyDisabled: body.shiftTab,
      windowsKeyDisabled: body.windowsKey,
    } : prev);
    return runWrite(() => setKeebGameMode(body));
  }, [runWrite]);

  const saveRotary = useCallback(async (body: SetRotaryWheelsBody) => {
    return runWrite(() => setKeebRotary(body));
  }, [runWrite]);

  const saveRotarySensitivity = useCallback(async (s: string) => {
    return runWrite(() => setKeebRotarySensitivity(s));
  }, [runWrite]);

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
