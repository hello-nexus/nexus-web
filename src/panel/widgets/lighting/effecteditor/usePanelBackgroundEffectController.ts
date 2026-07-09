import { useCallback, useMemo, useRef } from 'react';
import { TEMPLATE_COUNT, type EffectState, type EffectTemplateBundle } from '../../../../types/lighting';
import { defaultTemplatesFor, slotMatchesDefault, slotThumbSignature } from '../../../../types/lightingTemplates';
import { cachedAnimateDefaults } from '../../../../api/lighting';
import { useAnimateTemplates } from '../../../../hooks/useAnimateTemplates';
import type { AnimateController } from './types';

/**
 * Adapts the per-panel background (effect key + template index + live state)
 * into the shared AnimateController. Presets are universal: the row shows the
 * global slots for the effect, and edits flow through the panelTheme callbacks,
 * which write the global Templates (so the background and the LEDs stay in sync).
 */
export function usePanelBackgroundEffectController({
  effect,
  template,
  templatesByEffect,
  effectState,
  onSelectEffect,
  onTemplateSelect,
  onPreview,
  onCommit,
}: {
  effect: string;
  template: number;
  /** This panel's preset selection per shader (effect key → preset index). */
  templatesByEffect: Record<string, number>;
  effectState: EffectState;
  onSelectEffect: (key: string) => void;
  onTemplateSelect: (idx: number) => void;
  onPreview: (state: EffectState) => void;
  onCommit: (state: EffectState) => void;
}): AnimateController {
  const { templates: globalTemplates, rgbActiveEffect } = useAnimateTemplates();

  // The 4 universal slots for this effect (the real saved presets), so the
  // preset buttons render the actual shared thumbnails.
  const bundle = useMemo<EffectTemplateBundle>(() => {
    const g = globalTemplates[effect];
    return { selected: template, slots: g ? g.slots : defaultTemplatesFor(effect, cachedAnimateDefaults()).slots };
  }, [globalTemplates, effect, template]);

  const idx = Math.min(Math.max(template, 0), TEMPLATE_COUNT - 1);
  const canReset = !slotMatchesDefault(effect, idx, effectState, cachedAnimateDefaults());

  const stateRef = useRef(effectState);
  stateRef.current = effectState;

  const onChange = useCallback((patch: Partial<EffectState>, commit?: boolean) => {
    const next: EffectState = {
      ...stateRef.current,
      ...patch,
      params: { ...stateRef.current.params, ...(patch.params ?? {}) },
    };
    stateRef.current = next;
    if (commit) onCommit(next);
    else onPreview(next);
  }, [onCommit, onPreview]);

  const handleCommit = useCallback(() => { onCommit(stateRef.current); }, [onCommit]);
  const handleReset = useCallback(() => {
    onCommit(defaultTemplatesFor(effect, cachedAnimateDefaults()).slots[idx]);
  }, [effect, idx, onCommit]);

  return {
    effect,
    state: effectState,
    bundle,
    canReset,
    onSelectEffect,
    onTemplateSelect,
    onChange,
    onCommit: handleCommit,
    onReset: handleReset,
    // Each shader's cell shows THIS panel's remembered preset for that shader
    // (per-panel, per-shader selection; default 0). Switching shaders keeps it.
    slotFor: (key: string) => Math.min(Math.max(templatesByEffect[key] ?? 0, 0), TEMPLATE_COUNT - 1),
    versionFor: (key: string) => {
      const b = globalTemplates[key];
      if (!b || b.slots.length === 0) return '0';
      const s = Math.min(Math.max(templatesByEffect[key] ?? 0, 0), b.slots.length - 1);
      return slotThumbSignature(b.slots[s]);
    },
    // Bulb: which effect/slot is live on the RGB. The preset-row bulb only shows
    // when the background effect is the one currently driving the LEDs.
    rgbActiveEffect,
    rgbActiveSlot: effect === rgbActiveEffect ? (globalTemplates[rgbActiveEffect]?.selected ?? 0) : null,
  };
}
