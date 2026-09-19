import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  getDeckInstance, updateDeckInstance, getDeckPresets, getDeckPreset,
  createDeckPreset, updateDeckPreset, deleteDeckPreset,
  type DeckInstance, type DeckInstanceMode, type DeckPresetFull, type DeckPresetSummary,
} from '../../../api/deck';
import { useMultiplex, useTopicCallback } from '../../../hooks/useMultiplexSocket';
import { useUndoRedo } from '../../../hooks/useUndoRedo';
import { makePresetDeckTarget, type DeckTarget } from './deckTarget';
import { AUTO_SAVE_DEBOUNCE_MS, emptyDeck, normalizeDeckConfig } from './deckLayout';
import type { DeckConfig } from './types';

const MAX_UNDO_DEPTH = 50;

// The service is being fixed to always create a preset with one empty page,
// but a zero-page one is still possible to receive (an old/foreign record) -
// fitToGridWithOrigins maps `pages: []` to an all-`auto` fitted page, which
// makePresetDeckTarget's updateSlot/swapSlots silently refuse to write
// through. Normalizing to at least one real (possibly empty) page here keeps
// every preset the target sees editable.
function normalizePresetDeck(full: DeckPresetFull): DeckPresetFull {
  return { ...full, deck: normalizeDeckConfig(full.deck) };
}

export interface UseDeckInstanceResult {
  instance: DeckInstance | null;
  /** The active preset's full record (summary fields + live deck). */
  preset: DeckPresetFull | null;
  /** Host-wide preset list, for the toolbar. */
  presets: DeckPresetSummary[];
  /** Editing target bound to the active preset's authored grid, or null before it loads. */
  target: DeckTarget | null;
  loaded: boolean;
  error: boolean;
  retry: () => void;
  setMode: (mode: DeckInstanceMode) => void;
  activate: (presetId: string) => Promise<void>;
  /**
   * `activatePreset` defaults to this hook's own `activate`; a host whose
   * own `onLoad` also resets page/folder/selection (StreamDeckDevicePage)
   * passes that instead, so a preset created from the toolbar resets the
   * same way loading one does.
   */
  createPreset: (name: string, activatePreset?: (id: string) => void | Promise<void>) => Promise<{ error: boolean; msg?: string }>;
  renamePreset: (id: string, name: string) => Promise<void>;
  deletePreset: (id: string) => Promise<void>;
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  reset: () => void;
  /**
   * Closes an in-progress undo-history burst so the NEXT commit starts a
   * fresh entry instead of coalescing into one anchored on an unrelated
   * field's pre-edit deck. Callers with their own notion of a distinct
   * editing context (a tab switch) call this when leaving it.
   */
  endEditBurst: () => void;
}

interface SharedDeckInstance {
  instanceId: string;
  value: UseDeckInstanceResult;
}

// A widget's inline settings sheet mounts the widget's own preview tile
// (draggable in edit mode) beside DeckSettings, both bound to the same
// `widget:<id>` instance - two independent useDeckInstance calls would each
// hold their own preset copy and their own debounced auto-save, so a
// drag-reorder on the tile and an edit in the inspector within the same
// debounce window can silently overwrite one another. A provider higher in
// that tree lets both consumers share one instance instead.
const DeckInstanceContext = createContext<SharedDeckInstance | null>(null);
export const DeckInstanceProvider = DeckInstanceContext.Provider;

/**
 * Owns one deck instance's mode + active preset (full config) + the
 * host-wide preset list, kept live over the `deck` multiplex topic with a
 * GET fallback on mount/reconnect. Shared by StreamDeckDevicePage and
 * DeckWidget/DeckSettings - a physical and a widget instance are otherwise
 * identical consumers of this hook, differing only in `kind` (folder
 * Back-key reservation) and `instanceGrid` (seeds a freshly created preset's
 * authored size).
 *
 * `editing` gates the undo/redo keyboard shortcut (Cmd/Ctrl+Z): only the
 * host actually presenting the editor (StreamDeckDevicePage, DeckSettings)
 * should own that global listener, not a widget tile just rendering its
 * fitted view.
 *
 * When a `DeckInstanceProvider` ancestor holds a value for this same
 * `instanceId`, that shared instance is returned directly and this call's
 * own fetch/subscribe/auto-save never runs.
 */
export function useDeckInstance(
  instanceId: string | null,
  kind: 'physical' | 'widget',
  instanceGrid: { cols: number; rows: number },
  editing = false,
): UseDeckInstanceResult {
  const shared = useContext(DeckInstanceContext);
  const usesShared = !!shared && !!instanceId && shared.instanceId === instanceId;
  const own = useOwnDeckInstance(usesShared ? null : instanceId, kind, instanceGrid, editing);
  return usesShared ? shared!.value : own;
}

function useOwnDeckInstance(
  instanceId: string | null,
  kind: 'physical' | 'widget',
  instanceGrid: { cols: number; rows: number },
  editing: boolean,
): UseDeckInstanceResult {
  const [instance, setInstance] = useState<DeckInstance | null>(null);
  const [preset, setPreset] = useState<DeckPresetFull | null>(null);
  const [presets, setPresets] = useState<DeckPresetSummary[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [retryToken, setRetryToken] = useState(0);

  const instanceIdRef = useRef(instanceId);
  instanceIdRef.current = instanceId;
  // Which preset id `preset` belongs to, so a stale in-flight GET/PUT for a
  // preset the instance has since switched away from can't overwrite the
  // newly active one.
  const presetIdRef = useRef<string | null>(null);
  const presetRef = useRef(preset);
  presetRef.current = preset;
  const instanceGridRef = useRef(instanceGrid);
  instanceGridRef.current = instanceGrid;

  const loadAll = useCallback(async () => {
    if (!instanceId) return;
    // Only a widget instance's first-ever GET needs its grid (a fresh
    // instance joins the first preset sized to it); a physical instance
    // already carries its grid on the deck's own preset once one exists.
    const grid = kind === 'widget' ? instanceGridRef.current : undefined;
    const [inst, list] = await Promise.all([getDeckInstance(instanceId, grid), getDeckPresets()]);
    if (instanceIdRef.current !== instanceId) return;
    if (!inst) { setLoadError(true); return; }
    setInstance(inst);
    setPresets(list);
    const full = await getDeckPreset(inst.activePresetId);
    if (instanceIdRef.current !== instanceId) return;
    if (!full) { setLoadError(true); return; }
    presetIdRef.current = full.id;
    setPreset(normalizePresetDeck(full));
    setLoadError(false);
  }, [instanceId, kind]);

  useEffect(() => {
    setInstance(null);
    setPreset(null);
    setPresets([]);
    setLoadError(false);
    presetIdRef.current = null;
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instanceId, retryToken]);

  const retry = useCallback(() => setRetryToken(t => t + 1), []);

  // Refetch on reconnect: a dropped socket may have missed 'deck' frames
  // while it was down.
  const mux = useMultiplex();
  const connected = mux?.connected ?? false;
  const wasConnectedRef = useRef(connected);
  useEffect(() => {
    if (connected && !wasConnectedRef.current) void loadAll();
    wasConnectedRef.current = connected;
  }, [connected, loadAll]);

  // Debounced auto-save: schedulePut always sends the LATEST snapshot for a
  // preset id, superseding any still-pending one. `generation` guards a
  // response landing after a newer edit has already been scheduled (and
  // possibly already resolved).
  const pendingPutRef = useRef<{ timer: ReturnType<typeof setTimeout>; run: () => void } | null>(null);
  const generationRef = useRef(0);

  const flushPending = useCallback(() => {
    const pending = pendingPutRef.current;
    if (!pending) return;
    clearTimeout(pending.timer);
    pendingPutRef.current = null;
    pending.run();
  }, []);
  useEffect(() => flushPending, [flushPending]);

  const schedulePut = useCallback((presetId: string, deck: DeckConfig) => {
    if (pendingPutRef.current) clearTimeout(pendingPutRef.current.timer);
    const generation = ++generationRef.current;
    const run = () => {
      pendingPutRef.current = null;
      void updateDeckPreset(presetId, { deck }).then(full => {
        if (generationRef.current !== generation || presetIdRef.current !== presetId) return;
        if (full) setPreset(normalizePresetDeck(full));
      });
    };
    pendingPutRef.current = { timer: setTimeout(run, AUTO_SAVE_DEBOUNCE_MS), run };
  }, []);

  const applyDeck = useCallback((next: DeckConfig) => {
    const current = presetRef.current;
    if (!current) return;
    setPreset({ ...current, deck: next });
    schedulePut(current.id, next);
  }, [schedulePut]);

  // A rapid run of commits (typing a label keystroke by keystroke, dragging)
  // collapses into one undo entry: the first commit of a burst pushes its
  // pre-edit deck immediately, and the timer staying set through the
  // auto-save window marks every later commit in the run as a continuation.
  const burstTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeBurst = useCallback(() => {
    if (burstTimerRef.current) { clearTimeout(burstTimerRef.current); burstTimerRef.current = null; }
  }, []);
  useEffect(() => closeBurst, [closeBurst]);

  const undoRef = useRef<() => void>(() => {});
  const redoRef = useRef<() => void>(() => {});
  const undoRedo = useUndoRedo<DeckConfig>({
    maxDepth: MAX_UNDO_DEPTH,
    enabled: editing,
    onUndo: () => undoRef.current(),
    onRedo: () => redoRef.current(),
  });

  const commitDeck = useCallback((next: DeckConfig) => {
    const current = presetRef.current;
    if (!current) return;
    if (!burstTimerRef.current) undoRedo.push(current.deck);
    else clearTimeout(burstTimerRef.current);
    burstTimerRef.current = setTimeout(() => { burstTimerRef.current = null; }, AUTO_SAVE_DEBOUNCE_MS);
    applyDeck(next);
  }, [undoRedo, applyDeck]);

  const undo = useCallback(() => {
    const current = presetRef.current;
    if (!current) return;
    closeBurst();
    const restored = undoRedo.undo(current.deck);
    if (restored) applyDeck(restored);
  }, [undoRedo, closeBurst, applyDeck]);
  undoRef.current = undo;

  const redo = useCallback(() => {
    const current = presetRef.current;
    if (!current) return;
    closeBurst();
    const restored = undoRedo.redo(current.deck);
    if (restored) applyDeck(restored);
  }, [undoRedo, closeBurst, applyDeck]);
  redoRef.current = redo;

  const reset = useCallback(() => {
    const current = presetRef.current;
    if (!current) return;
    closeBurst();
    undoRedo.push(current.deck);
    applyDeck(emptyDeck());
  }, [undoRedo, closeBurst, applyDeck]);

  const target = useMemo<DeckTarget | null>(() => {
    if (!preset) return null;
    return makePresetDeckTarget(preset, instanceGrid, kind, commitDeck);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, kind, commitDeck, instanceGrid.cols, instanceGrid.rows]);

  const setMode = useCallback((mode: DeckInstanceMode) => {
    if (!instanceId) return;
    setInstance(prev => (prev ? { ...prev, mode } : prev));
    void updateDeckInstance(instanceId, { mode });
  }, [instanceId]);

  const activate = useCallback(async (presetId: string) => {
    if (!instanceId) return;
    closeBurst();
    undoRedo.reset();
    const updated = await updateDeckInstance(instanceId, { activePresetId: presetId });
    if (instanceIdRef.current !== instanceId) return;
    if (updated) setInstance(updated);
    const full = await getDeckPreset(presetId);
    if (instanceIdRef.current !== instanceId || !full) return;
    presetIdRef.current = full.id;
    setPreset(normalizePresetDeck(full));
  }, [instanceId, closeBurst, undoRedo]);

  const createPreset = useCallback(async (
    name: string,
    activatePreset: (id: string) => void | Promise<void> = activate,
  ): Promise<{ error: boolean; msg?: string }> => {
    const created = await createDeckPreset({ name, cols: instanceGrid.cols, rows: instanceGrid.rows });
    if (!created) return { error: true };
    setPresets(prev => [...prev, {
      id: created.id, name: created.name, cols: created.cols, rows: created.rows,
      apps: created.apps, templateId: created.templateId, pageCount: created.pageCount,
    }]);
    await activatePreset(created.id);
    return { error: false };
  }, [instanceGrid.cols, instanceGrid.rows, activate]);

  const renamePreset = useCallback(async (id: string, name: string) => {
    const updated = await updateDeckPreset(id, { name });
    if (!updated) return;
    setPresets(prev => prev.map(p => (p.id === id ? { ...p, name: updated.name } : p)));
    setPreset(prev => (prev && prev.id === id ? { ...prev, name: updated.name } : prev));
  }, []);

  const deletePreset = useCallback(async (id: string) => {
    const ok = await deleteDeckPreset(id);
    if (!ok) return;
    setPresets(prev => prev.filter(p => p.id !== id));
    if (presetIdRef.current === id) {
      closeBurst();
      undoRedo.reset();
      await loadAll();
    }
  }, [closeBurst, undoRedo, loadAll]);

  useTopicCallback('deck', !!instanceId, useCallback((data: unknown) => {
    const frame = data as {
      kind?: string; presetId?: string; summary?: DeckPresetSummary; deck?: DeckConfig;
      instanceId?: string; instance?: DeckInstance;
    };
    if (frame.kind === 'presets') {
      void getDeckPresets().then(list => { if (instanceIdRef.current === instanceId) setPresets(list); });
      return;
    }
    if (frame.kind === 'preset' && frame.presetId && frame.summary && frame.deck) {
      const summary = frame.summary;
      const deck = frame.deck;
      setPresets(prev => prev.map(p => (p.id === frame.presetId ? summary : p)));
      // A pending local edit will overwrite this shortly anyway - skip the
      // echo so a slower topic frame can't stomp a newer unsaved keystroke.
      if (presetIdRef.current === frame.presetId && !pendingPutRef.current) {
        setPreset(normalizePresetDeck({ ...summary, deck }));
      }
      return;
    }
    if (frame.kind === 'active' && frame.instanceId === instanceId && frame.instance) {
      const nextInstance = frame.instance;
      setInstance(nextInstance);
      if (nextInstance.activePresetId !== presetIdRef.current) {
        closeBurst();
        undoRedo.reset();
        void getDeckPreset(nextInstance.activePresetId).then(full => {
          if (instanceIdRef.current !== instanceId || !full) return;
          presetIdRef.current = full.id;
          setPreset(normalizePresetDeck(full));
        });
      }
    }
  }, [instanceId, closeBurst, undoRedo]));

  return {
    instance,
    preset,
    presets,
    target,
    loaded: preset !== null || loadError,
    error: loadError,
    retry,
    setMode,
    activate,
    createPreset,
    renamePreset,
    deletePreset,
    canUndo: undoRedo.canUndo,
    canRedo: undoRedo.canRedo,
    undo,
    redo,
    reset,
    endEditBurst: closeBurst,
  };
}
