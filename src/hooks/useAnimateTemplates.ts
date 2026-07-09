import { useCallback, useEffect, useState } from 'react';
import { fetchAnimateDefaults, fetchAnimateSettings, fetchCurrentSync } from '../api/lighting';
import { useTopicCallback } from './useMultiplexSocket';
import { EFFECTS, type EffectTemplateBundle } from '../types/lighting';
import { mergeTemplates } from '../types/lightingTemplates';

export interface AnimateTemplatesState {
  /** The universal preset bundles (4 slots per effect), merged over the
   *  service's canonical defaults. Empty until the first hydrate resolves. */
  templates: Record<string, EffectTemplateBundle>;
  /** The effect currently driving the LEDs in animate mode, or '' when off / screen / media. */
  rgbActiveEffect: string;
}

/**
 * The global, universal animate presets plus which effect is live on the RGB
 * hardware. Hydrates from the service and follows the `lighting` broadcast, so
 * every surface that reads it (panel wallpaper, background editor, the bulb)
 * stays in sync with edits made anywhere.
 */
export function useAnimateTemplates(enabled = true): AnimateTemplatesState {
  const [state, setState] = useState<AnimateTemplatesState>(() => ({
    templates: {},
    rgbActiveEffect: '',
  }));

  const hydrate = useCallback(async () => {
    if (!enabled) return;
    const [sync, settings, defaults] = await Promise.all([
      fetchCurrentSync(),
      fetchAnimateSettings(),
      fetchAnimateDefaults(),
    ]);
    const next: Record<string, EffectTemplateBundle> = {};
    for (const e of EFFECTS) next[e.key] = mergeTemplates(e.key, settings?.templates?.[e.key], defaults);
    const rawSync = sync?.sync || 'none';
    const rgbActiveEffect = EFFECTS.some(e => e.key === rawSync) ? rawSync : '';
    setState({ templates: next, rgbActiveEffect });
  }, [enabled]);

  useEffect(() => { hydrate(); }, [hydrate]);
  useTopicCallback('lighting', enabled, hydrate);

  return state;
}
