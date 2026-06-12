import { useCallback, useEffect, useState } from 'react';
import { fetchAnimateSettings, fetchCurrentSync } from '../api/lighting';
import { useTopicCallback } from './useMultiplexSocket';
import { EFFECTS, type EffectTemplateBundle } from '../types/lighting';
import { buildAllDefaultTemplates, mergeTemplates } from '../types/lightingTemplates';

export interface AnimateTemplatesState {
  /** The universal preset bundles (4 slots per effect), merged over defaults. */
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
    templates: buildAllDefaultTemplates(),
    rgbActiveEffect: '',
  }));

  const hydrate = useCallback(async () => {
    if (!enabled) return;
    const [sync, settings] = await Promise.all([fetchCurrentSync(), fetchAnimateSettings()]);
    const next = buildAllDefaultTemplates();
    if (settings?.templates) {
      for (const e of EFFECTS) next[e.key] = mergeTemplates(e.key, settings.templates[e.key]);
    }
    const rawSync = sync?.sync || 'none';
    const rgbActiveEffect = EFFECTS.some(e => e.key === rawSync) ? rawSync : '';
    setState({ templates: next, rgbActiveEffect });
  }, [enabled]);

  useEffect(() => { hydrate(); }, [hydrate]);
  useTopicCallback('lighting', enabled, hydrate);

  return state;
}
