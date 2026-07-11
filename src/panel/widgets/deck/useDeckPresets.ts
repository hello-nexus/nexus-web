import { useCallback, useEffect, useState } from 'react';
import {
  fetchDeckPresets, createDeckPreset, updateDeckPreset,
  deleteDeckPreset, activateDeckPreset,
  type DeckPreset,
} from '../../../api/streamdeck';

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
  };
}
