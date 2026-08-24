import { useCallback, useEffect, useRef, useState } from 'react';
import type { LightingDevice } from '../../../../api/lighting';
import {
  fetchLayoutPresets, createLayoutPreset, updateLayoutPreset,
  deleteLayoutPreset, activateLayoutPreset, setLayoutPresetApps,
  type LayoutPreset, type DeviceLayoutDto, type PresetApp, type PresetAppConflict,
} from '../../../../api/lighting';
import { useTopicCallback } from '../../../../hooks/useMultiplexSocket';

// Trailing window for the lighting-topic refetch. Long enough that a slider
// drag collapses to one GET, short enough that a preset the service activated
// shows up as a prompt UI change.
const PresetRefetchDebounceMs = 400;

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
  /** Null on success, or the conflict the server refused the save with. */
  handleSetApps: (id: string, apps: PresetApp[]) => Promise<PresetAppConflict | null>;
}

export function useLayoutPresets(serviceOnline: boolean, activeProfileId?: string): UseLayoutPresetsResult {
  const [presets, setPresets] = useState<LayoutPreset[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  // Concurrent GETs are routine now that a topic frame can trigger one, so a
  // response that resolves after a newer request must not overwrite it.
  const loadGenRef = useRef(0);
  const refetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activePreset = presets.find(p => p.id === activeId) ?? null;

  const loadPresets = useCallback(async () => {
    const gen = ++loadGenRef.current;
    const data = await fetchLayoutPresets();
    if (!data || gen !== loadGenRef.current) return;
    setPresets(data.presets ?? []);
    setActiveId(data.activeId);
  }, []);

  // Layout presets are profile-scoped server-side; activeProfileId triggers a
  // re-fetch on profile switch.
  useEffect(() => {
    if (!serviceOnline) return;
    void loadPresets();
  }, [serviceOnline, activeProfileId, loadPresets]);

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

  const handleSetApps = useCallback(async (id: string, apps: PresetApp[]) => {
    const result = await setLayoutPresetApps(id, apps);
    await loadPresets();
    return result.ok ? null : (result.conflict ?? null);
  }, [loadPresets]);

  // AppPresetSwitcher activates a preset server-side when a bound app takes
  // focus, so the active id can change with no local action. Every /lighting/*
  // mutation publishes on this topic - a shader-slider drag alone reaches ~30
  // frames/s - so the refetch is trailing-debounced rather than per-frame.
  useTopicCallback('lighting', serviceOnline, () => {
    if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
    refetchTimerRef.current = setTimeout(() => { void loadPresets(); }, PresetRefetchDebounceMs);
  });

  useEffect(() => () => {
    if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
  }, []);

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
    handleSetApps,
  };
}
