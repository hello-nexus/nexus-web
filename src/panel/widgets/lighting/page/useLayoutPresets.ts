import { useCallback, useEffect, useState } from 'react';
import type { LightingDevice } from '../../../../api/lighting';
import {
  fetchLayoutPresets, createLayoutPreset, updateLayoutPreset,
  deleteLayoutPreset, activateLayoutPreset,
  type LayoutPreset, type DeviceLayoutDto,
} from '../../../../api/lighting';

export function devicesToLayouts(devices: LightingDevice[]): Record<string, DeviceLayoutDto> {
  const out: Record<string, DeviceLayoutDto> = {};
  for (const d of devices) {
    out[d.id] = { x: d.canvasX, y: d.canvasY, w: d.canvasW, h: d.canvasH, rotation: d.canvasRotation ?? 0 };
  }
  return out;
}

export function devicesToPower(devices: LightingDevice[]): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const d of devices) {
    out[d.id] = d.ledsOn;
  }
  return out;
}

export interface UseLayoutPresetsResult {
  presets: LayoutPreset[];
  activeId: string | null;
  activePreset: LayoutPreset | null;
  presetCount: number;
  loadPresets: () => Promise<void>;
  handleCreate: (name: string) => Promise<{ error: boolean; msg?: string }>;
  handleRename: (id: string, name: string) => Promise<void>;
  handleDelete: (id: string) => Promise<void>;
  handleLoad: (id: string) => Promise<void>;
}

export function useLayoutPresets(serviceOnline: boolean): UseLayoutPresetsResult {
  const [presets, setPresets] = useState<LayoutPreset[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const activePreset = presets.find(p => p.id === activeId) ?? null;

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

  return {
    presets,
    activeId,
    activePreset,
    presetCount: presets.length,
    loadPresets,
    handleCreate,
    handleRename,
    handleDelete,
    handleLoad,
  };
}
