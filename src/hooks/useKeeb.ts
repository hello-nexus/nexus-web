import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type KeebLayer,
  type KeebMacro,
  type KeebSettings,
  type KeyboardState,
  type MacroKey,
  type SetFirmwareLightingBody,
  type SetGameModeBody,
  type SetLayerKeyBody,
  type SetMacroResponse,
  type SetPassiveLightingBody,
  type SetRotaryWheelsBody,
  getKeebMacro,
  getKeebSettings,
  getKeebState,
  resetKeebLayer,
  setKeebFirmwareLighting,
  setKeebGameMode,
  setKeebLayerKey,
  setKeebMacro,
  setKeebPassiveLighting,
  setKeebRotary,
} from '../api/keeb';

/// State + setters for the keeb page.
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
  setKey: (body: SetLayerKeyBody) => Promise<boolean>;
  resetLayer: () => Promise<boolean>;
  loadMacro: (index: number) => Promise<KeebMacro | null>;
  saveMacro: (index: number, keys: MacroKey[]) => Promise<SetMacroResponse | null>;
  saveFirmwareLighting: (body: SetFirmwareLightingBody) => Promise<boolean>;
  savePassiveLighting: (body: SetPassiveLightingBody) => Promise<boolean>;
  saveGameMode: (body: SetGameModeBody) => Promise<boolean>;
  saveRotary: (body: SetRotaryWheelsBody) => Promise<boolean>;
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

/// The fetch layer blind-casts JSON, so a mixed-deploy window (old service,
/// new web) can deliver a state payload missing fields the type declares.
/// Anchor every server payload on EMPTY_STATE so render code never sees an
/// undefined grid.
function normalizeState(st: KeyboardState | null | undefined): KeyboardState {
  if (!st) return EMPTY_STATE;
  return { ...EMPTY_STATE, ...st, keys: st.keys ?? [] };
}

/// Apply a single SetLayerKeyBody to the keys grid by replacing one cell.
/// Returns a new state with deep-cloned `keys` so React sees the change.
function applyKeyOverride(prev: KeyboardState, body: SetLayerKeyBody): KeyboardState {
  const keys = (prev.keys ?? []).map(row => row.slice());
  while (keys.length <= body.x) keys.push([]);
  while (keys[body.x].length <= body.y) keys[body.x].push({ mode: '', function: '', input: null });
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
      if (st) setState(normalizeState(st));
      if (se) setSettings(se);
    } catch {
      // A poll tick that dies mid-flight (service restart) retries on the
      // next interval; surfacing it would spam the console every 1.5 s.
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

  /// Optimistic: the cell flips immediately, then the write runs. On ack the
  /// service returns the authoritative layer state, which replaces the
  /// optimistic one; on failure runWrite refetches and the cell reverts.
  /// The ack snapshot is adopted only when no OTHER write is still in flight
  /// (the counter includes this write) AND the user is still viewing the
  /// layer the write targeted - a snapshot from a previous layer would paint
  /// the wrong board under the active layer chip.
  const setKey = useCallback(async (body: SetLayerKeyBody) => {
    setState(prev => applyKeyOverride(prev, body));
    return runWrite(async () => {
      const r = await setKeebLayerKey(layer, body);
      if (r && pendingWritesRef.current === 1 && layerRef.current === layer) setState(normalizeState(r.state));
      return r !== null;
    });
  }, [layer, runWrite]);

  const resetLayer = useCallback(async () => {
    // Optimistically clear the layer's keys so the keyboard reverts to
    // defaults immediately.
    setState(prev => ({ ...prev, keys: [] }));
    return runWrite(async () => {
      const r = await resetKeebLayer(layer);
      if (r && pendingWritesRef.current === 1 && layerRef.current === layer) setState(normalizeState(r.state));
      return r !== null;
    });
  }, [layer, runWrite]);

  // Plain read - does not count as a write, so polling is not suppressed.
  const loadMacro = useCallback(async (index: number) => {
    return getKeebMacro(index);
  }, []);

  /// Counts as a pending write (the poll skips while it is in flight); a null
  /// ack schedules the standard resync. Returns the full save response so the
  /// caller can adopt the server copy and surface truncation / dropped keys /
  /// offline saves.
  const saveMacro = useCallback(async (index: number, keys: MacroKey[]) => {
    let saved: SetMacroResponse | null = null;
    await runWrite(async () => {
      saved = await setKeebMacro(index, keys);
      return saved !== null;
    });
    return saved;
  }, [runWrite]);

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

  return {
    state,
    settings,
    loading,
    layer,
    setLayer,
    setKey,
    resetLayer,
    loadMacro,
    saveMacro,
    saveFirmwareLighting,
    savePassiveLighting,
    saveGameMode,
    saveRotary,
  };
}
