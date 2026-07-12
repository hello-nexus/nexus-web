import { useCallback, useEffect, useRef } from 'react';
import { createUuid } from '../../../lib/uuid';
import type { PanelConfigValue, PanelWidget } from '../../types';
import {
  AUTO_SAVE_DEBOUNCE_MS, DECK_WIDGET_PRESET_CAP, deckWidgetPresetsPatch, readDeckConfig, readDeckWidgetPresets,
} from './deckLayout';
import type { DeckWidgetPreset } from './types';

export interface UseDeckWidgetPresetsResult {
  presets: DeckWidgetPreset[];
  activeId: string | null;
  presetCount: number;
  handleCreate: (name: string) => Promise<{ error: boolean; msg?: string }>;
  handleRename: (id: string, name: string) => void;
  handleDelete: (id: string) => void;
  handleLoad: (id: string) => void;
}

/**
 * Widget-local deck presets: snapshots of the widget's own DeckConfig, stored
 * beside `deck` on the same widget.config (see deckWidgetPresetsPatch) - no
 * service routes, no cross-device sharing. Mirrors useDeckPresets.ts's
 * create/rename/delete/load + debounced trailing auto-save idiom, but reads
 * and writes the widget prop directly (synchronously) instead of a
 * per-serial service resource.
 */
export function useDeckWidgetPresets(
  widget: PanelWidget,
  onUpdate: (patch: Record<string, PanelConfigValue>) => void,
): UseDeckWidgetPresetsResult {
  const { presets, activeId } = readDeckWidgetPresets(widget);

  // Read at call/fire time rather than closing over the render's `widget` /
  // `onUpdate`, so a still-pending auto-save (or a handler invoked from a
  // stale render) always acts on the latest committed config.
  const widgetRef = useRef(widget);
  widgetRef.current = widget;
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  const handleCreate = useCallback(async (name: string): Promise<{ error: boolean; msg?: string }> => {
    const current = readDeckWidgetPresets(widgetRef.current);
    if (current.presets.length >= DECK_WIDGET_PRESET_CAP) return { error: true };
    const preset: DeckWidgetPreset = { id: createUuid(), name, deck: readDeckConfig(widgetRef.current) };
    onUpdateRef.current(deckWidgetPresetsPatch([...current.presets, preset], preset.id));
    return { error: false };
  }, []);

  const handleRename = useCallback((id: string, name: string) => {
    const current = readDeckWidgetPresets(widgetRef.current);
    const next = current.presets.map(p => (p.id === id ? { ...p, name } : p));
    onUpdateRef.current(deckWidgetPresetsPatch(next, current.activeId));
  }, []);

  const handleDelete = useCallback((id: string) => {
    const current = readDeckWidgetPresets(widgetRef.current);
    const next = current.presets.filter(p => p.id !== id);
    onUpdateRef.current(deckWidgetPresetsPatch(next, current.activeId === id ? null : current.activeId));
  }, []);

  const handleLoad = useCallback((id: string) => {
    const current = readDeckWidgetPresets(widgetRef.current);
    const preset = current.presets.find(p => p.id === id);
    if (!preset) return;
    onUpdateRef.current({
      deck: preset.deck as unknown as PanelConfigValue,
      ...deckWidgetPresetsPatch(current.presets, id),
    });
  }, []);

  // Trailing-debounced auto-save of the active preset's snapshot. Every
  // committed deck edit - both the inspector fields (routed through
  // DeckSettings' target) and the live tile's own drag-reorder (routed
  // straight to the panel's onUpdate, bypassing DeckSettings) - lands as a
  // new `widget.config.deck` reference, so watching that single value covers
  // both edit paths without threading a commit callback through either.
  const pendingRef = useRef<{ timer: ReturnType<typeof setTimeout>; run: () => void } | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (!mountedRef.current) { mountedRef.current = true; return; }
    if (pendingRef.current) clearTimeout(pendingRef.current.timer);
    const run = () => {
      pendingRef.current = null;
      const current = readDeckWidgetPresets(widgetRef.current);
      if (!current.activeId) return;
      const deck = readDeckConfig(widgetRef.current);
      const next = current.presets.map(p => (p.id === current.activeId ? { ...p, deck } : p));
      onUpdateRef.current(deckWidgetPresetsPatch(next, current.activeId));
    };
    pendingRef.current = { timer: setTimeout(run, AUTO_SAVE_DEBOUNCE_MS), run };
  }, [widget.config?.deck]);

  // Flush rather than drop a still-pending auto-save on unmount, mirroring
  // useDeckPresets.ts's own flush-on-unmount.
  useEffect(() => () => {
    const pending = pendingRef.current;
    if (!pending) return;
    clearTimeout(pending.timer);
    pending.run();
  }, []);

  return { presets, activeId, presetCount: presets.length, handleCreate, handleRename, handleDelete, handleLoad };
}
