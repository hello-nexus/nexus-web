import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchDeckPresets, createDeckPreset, updateDeckPreset,
  deleteDeckPreset, activateDeckPreset,
  type DeckPreset,
} from '../../../api/streamdeck';
import { AUTO_SAVE_DEBOUNCE_MS } from './deckLayout';

// Re-exported so StreamDeckDevicePage's undo-history burst coalescing uses
// the same window as this hook's own saveCurrent debounce below.
export { AUTO_SAVE_DEBOUNCE_MS };

export interface UseDeckPresetsResult {
  presets: DeckPreset[];
  activeId: string | null;
  presetCount: number;
  /** True once a GET has confirmed the service exposes the preset routes for
   *  this serial. False (toolbar hidden) while the routes 404 on an older
   *  service build, the fetch is blocked on a remote origin, or serial is
   *  not yet known. */
  available: boolean;
  loadPresets: () => Promise<void>;
  handleCreate: (name: string) => Promise<{ error: boolean; msg?: string }>;
  handleRename: (id: string, name: string) => Promise<void>;
  handleDelete: (id: string) => Promise<void>;
  handleLoad: (id: string) => Promise<void>;
  /** Debounced saveCurrent into the active preset; a no-op when no preset is
   *  active. Called on every committed deck-config edit (including undo/
   *  redo/reset) so an active preset auto-saves with no manual save step. */
  scheduleAutoSave: () => void;
}

export function useDeckPresets(serial: string | null): UseDeckPresetsResult {
  const [presets, setPresets] = useState<DeckPreset[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [available, setAvailable] = useState(false);

  const loadPresets = useCallback(async () => {
    if (!serial) { setPresets([]); setActiveId(null); setAvailable(false); return; }
    const data = await fetchDeckPresets(serial);
    if (!data) { setAvailable(false); return; }
    setPresets(data.presets ?? []);
    setActiveId(data.activeId);
    setAvailable(true);
  }, [serial]);

  useEffect(() => {
    setPresets([]);
    setActiveId(null);
    setAvailable(false);
    void loadPresets();
  }, [serial, loadPresets]);

  const handleCreate = useCallback(async (name: string): Promise<{ error: boolean; msg?: string }> => {
    if (!serial) return { error: true };
    const res = await createDeckPreset(serial, name);
    if (!res) return { error: true };
    await loadPresets();
    return { error: false };
  }, [serial, loadPresets]);

  const handleRename = useCallback(async (id: string, name: string) => {
    if (!serial) return;
    await updateDeckPreset(serial, id, { name });
    await loadPresets();
  }, [serial, loadPresets]);

  const handleDelete = useCallback(async (id: string) => {
    if (!serial) return;
    await deleteDeckPreset(serial, id);
    await loadPresets();
  }, [serial, loadPresets]);

  const handleLoad = useCallback(async (id: string) => {
    if (!serial) return;
    await activateDeckPreset(serial, id);
    await loadPresets();
  }, [serial, loadPresets]);

  const serialRef = useRef(serial);
  serialRef.current = serial;
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;
  const pendingAutoSaveRef = useRef<{ timer: ReturnType<typeof setTimeout>; run: () => void } | null>(null);

  const scheduleAutoSave = useCallback(() => {
    const s = serialRef.current;
    const id = activeIdRef.current;
    if (!s || !id) return;
    if (pendingAutoSaveRef.current) clearTimeout(pendingAutoSaveRef.current.timer);
    const run = () => {
      pendingAutoSaveRef.current = null;
      void updateDeckPreset(s, id, { saveCurrent: true });
    };
    pendingAutoSaveRef.current = { timer: setTimeout(run, AUTO_SAVE_DEBOUNCE_MS), run };
  }, []);

  // Flush rather than drop a still-pending auto-save on unmount (navigating
  // away within the debounce window), mirroring usePhysicalDeckTarget.ts's
  // own config-sync flush-on-unmount.
  useEffect(() => () => {
    const pending = pendingAutoSaveRef.current;
    if (!pending) return;
    clearTimeout(pending.timer);
    pending.run();
  }, []);

  return {
    presets,
    activeId,
    presetCount: presets.length,
    available,
    loadPresets,
    handleCreate,
    handleRename,
    handleDelete,
    handleLoad,
    scheduleAutoSave,
  };
}
