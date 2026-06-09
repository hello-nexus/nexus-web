import { useCallback, useMemo, useRef } from 'react';
import { TEMPLATE_COUNT, type EffectState, type EffectTemplateBundle } from '../../../../types/lighting';
import { panelBackgroundState, panelBackgroundStateEquals } from '../../../panelBackground';
import type { AnimateController } from './types';

/**
 * Adapts the per-panel background fields (effect key + template index + custom
 * EffectState) into the shared AnimateController the EffectEditor's animate
 * bodies consume. Writes go through the panelTheme preview/commit callbacks —
 * the same per-device persistence path as every other background field.
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
  // The template selector shows the 4 default presets for the effect; the
  // active editable state is the panel's saved custom state.
  const bundle = useMemo<EffectTemplateBundle>(() => ({
    selected: template,
    slots: Array.from({ length: TEMPLATE_COUNT }, (_, i) => panelBackgroundState(effect, i)),
  }), [effect, template]);

  const templateDefault = useMemo(() => panelBackgroundState(effect, template), [effect, template]);
  const canReset = !panelBackgroundStateEquals(effectState, templateDefault);

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
  const handleReset = useCallback(() => { onCommit(panelBackgroundState(effect, template)); }, [effect, template, onCommit]);

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
