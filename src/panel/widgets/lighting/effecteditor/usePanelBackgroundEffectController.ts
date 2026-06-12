import { useCallback, useMemo, useRef } from 'react';
import { TEMPLATE_COUNT, type EffectState, type EffectTemplateBundle } from '../../../../types/lighting';
import { buildDefaultTemplates, slotMatchesDefault } from '../../../../types/lightingTemplates';
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
  effectState,
  onSelectEffect,
  onTemplateSelect,
  onPreview,
  onCommit,
}: {
  effect: string;
  template: number;
  effectState: EffectState;
  onSelectEffect: (key: string) => void;
  onTemplateSelect: (idx: number) => void;
  onPreview: (state: EffectState) => void;
  onCommit: (state: EffectState) => void;
}): AnimateController {
  const { templates: globalTemplates } = useAnimateTemplates();

  // The 4 universal slots for this effect (the real saved presets), so the
  // preset buttons render the actual shared thumbnails.
  const bundle = useMemo<EffectTemplateBundle>(() => {
    const g = globalTemplates[effect];
    return { selected: template, slots: g ? g.slots : buildDefaultTemplates(effect).slots };
  }, [globalTemplates, effect, template]);

  const idx = Math.min(Math.max(template, 0), TEMPLATE_COUNT - 1);
  const canReset = !slotMatchesDefault(effect, idx, effectState);

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
  const handleReset = useCallback(() => { onCommit(buildDefaultTemplates(effect).slots[idx]); }, [effect, idx, onCommit]);

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
  };
}
