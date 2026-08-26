import { EFFECTS, defaultStateFor, type EffectState, type EffectTemplateBundle } from '../../../types/lighting';

/**
 * Effects offered by the media immersive visualizer, in cycle order. Drawn
 * from the Animate audio category; the four fullscreen-first ones lead because
 * the bar/spoke effects above them were authored against an LED strip and read
 * coarser blown up to a whole panel.
 */
export const MEDIA_VISUALIZER_EFFECTS: readonly string[] = [
  'spectrumaurora', 'neonwaveform', 'liquidbeat', 'beatburst',
  'bassbloom', 'audiotunnel', 'spectrumradial', 'harmonicstar',
  'spectrumbars', 'scope', 'basspulse', 'beatstrobe', 'beatbuilder',
];

export const DEFAULT_MEDIA_VISUALIZER = MEDIA_VISUALIZER_EFFECTS[0];

/** A stored key that no longer exists (downgrade, renamed effect) falls back
 *  to the default rather than rendering nothing. */
export function normalizeVisualizerEffect(key: unknown): string {
  return typeof key === 'string' && MEDIA_VISUALIZER_EFFECTS.includes(key)
    ? key
    : DEFAULT_MEDIA_VISUALIZER;
}

export function nextVisualizerEffect(key: string): string {
  const i = MEDIA_VISUALIZER_EFFECTS.indexOf(normalizeVisualizerEffect(key));
  return MEDIA_VISUALIZER_EFFECTS[(i + 1) % MEDIA_VISUALIZER_EFFECTS.length];
}

/** Label key for the effect, so the visualizer names what it just cycled to. */
export function visualizerLabelKey(key: string): string {
  const normalized = normalizeVisualizerEffect(key);
  return EFFECTS.find(e => e.key === normalized)?.labelKey ?? '';
}

/**
 * Render state for a visualizer effect: the user's selected Animate preset slot
 * when it has hydrated, else the effect's base state. Params merge over the
 * base so a preset saved before a param existed still renders.
 */
export function visualizerState(
  effectKey: string,
  bundle: EffectTemplateBundle | undefined,
): EffectState {
  const effect = normalizeVisualizerEffect(effectKey);
  const base = defaultStateFor(effect);
  const slot = bundle?.slots?.[bundle.selected ?? 0];
  return slot
    ? { ...base, ...slot, params: { ...base.params, ...(slot.params ?? {}) } }
    : base;
}
