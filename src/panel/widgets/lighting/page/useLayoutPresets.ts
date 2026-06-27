import { useCallback, useEffect, useState } from 'react';
import type { LightingDevice } from '../../../../api/lighting';
import {
  fetchLayoutPresets, createLayoutPreset, updateLayoutPreset,
  deleteLayoutPreset, setActiveLayoutPreset, activateLayoutPreset,
  type LayoutPreset, type DeviceLayoutDto,
} from '../../../../api/lighting';

export function devicesToLayouts(devices: LightingDevice[]): Record<string, DeviceLayoutDto> {
  const out: Record<string, DeviceLayoutDto> = {};
  for (const d of devices) {
    out[d.id] = { x: d.canvasX, y: d.canvasY, w: d.canvasW, h: d.canvasH, rotation: d.canvasRotation ?? 0 };
  }
  return out;
}

function isDirty(devices: LightingDevice[], preset: LayoutPreset | null): boolean {
  if (!preset) return false;
  const current = devicesToLayouts(devices);
  for (const [id, layout] of Object.entries(current)) {
    const saved = preset.layouts[id];
    if (!saved) return true;
    if (saved.x !== layout.x || saved.y !== layout.y || saved.w !== layout.w || saved.h !== layout.h || saved.rotation !== layout.rotation) return true;
  }
  for (const id of Object.keys(preset.layouts)) {
    if (!current[id]) return true;
  }
  return false;
}

export interface UseLayoutPresetsResult {
  presets: LayoutPreset[];
  activeId: string | null;
  activePreset: LayoutPreset | null;
  dirty: boolean;
  presetCount: number;
  loadPresets: () => Promise<void>;
  handleCreate: (name: string) => Promise<{ error: boolean; msg?: string }>;
  handleSave: () => Promise<void>;
  handleRename: (id: string, name: string) => Promise<void>;
  handleDelete: (id: string) => Promise<void>;
  handleLoad: (id: string) => Promise<void>;
  handleSetActive: (id: string | null) => Promise<void>;
}

export function useLayoutPresets(
  serviceOnline: boolean,
  devices: LightingDevice[],
): UseLayoutPresetsResult {
  const [presets, setPresets] = useState<LayoutPreset[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const activePreset = presets.find(p => p.id === activeId) ?? null;
  const dirty = isDirty(devices, activePreset);

  const loadPresets = useCallback(async () => {
    const data = await fetchLayoutPresets();
    if (!data) return;
    setPresets(data.presets ?? []);
    setActiveId(data.activeId);
  }, []);

  useEffect(() => {
    if (!serviceOnline) return;
    void loadPresets();
  }, [serviceOnline, loadPresets]);

  const handleCreate = useCallback(async (name: string): Promise<{ error: boolean; msg?: string }> => {
    const res = await createLayoutPreset(name);
    if (!res) return { error: true };
    await loadPresets();
    return { error: false };
  }, [loadPresets]);

  const handleSave = useCallback(async () => {
    if (!activeId) return;
    await updateLayoutPreset(activeId, { saveCurrent: true });
    await loadPresets();
  }, [activeId, loadPresets]);

  const handleRename = useCallback(async (id: string, name: string) => {
    await updateLayoutPreset(id, { name });
    await loadPresets();
  }, [loadPresets]);

  const handleDelete = useCallback(async (id: string) => {
    await deleteLayoutPreset(id);
    await loadPresets();
  }, [loadPresets]);

  const handleLoad = useCallback(async (id: string) => {
    await activateLayoutPreset(id);
    await loadPresets();
  }, [loadPresets]);

  const handleSetActive = useCallback(async (id: string | null) => {
    await setActiveLayoutPreset(id);
    await loadPresets();
  }, [loadPresets]);

  return {
    presets,
    activeId,
    activePreset,
    dirty,
    presetCount: presets.length,
    loadPresets,
    handleCreate,
    handleSave,
    handleRename,
    handleDelete,
    handleLoad,
    handleSetActive,
  };
}
