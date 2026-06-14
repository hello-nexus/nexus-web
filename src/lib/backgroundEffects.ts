// Module-level bus for one-shot, full-window background effects. Any code can
// emit; <BackgroundEffects> (mounted once behind the dashboard) renders them.
// Decoupled like controlSync — no provider, no prop drilling. Add a new effect
// by extending the BackgroundEffect union and handling its `kind` in
// <BackgroundEffects>.

// A radial accent bloom centered on (x, y) in viewport pixels. `inverse`
// collapses the bloom inward (the Off tabs) instead of blooming it outward.
export interface RadialBloomEffect {
  readonly kind: 'radial-bloom';
  readonly x: number;
  readonly y: number;
  readonly inverse?: boolean;
}

export type BackgroundEffect = RadialBloomEffect;

type Listener = (effect: BackgroundEffect) => void;
const listeners = new Set<Listener>();

export function emitBackgroundEffect(effect: BackgroundEffect): void {
  for (const listener of listeners) listener(effect);
}

export function subscribeBackgroundEffects(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

// Convenience: bloom from the center of an element (e.g. a pressed status tab),
// resolved to viewport pixels for the fixed-position effects layer.
export function emitRadialBloomFromElement(el: HTMLElement, inverse = false): void {
  const r = el.getBoundingClientRect();
  emitBackgroundEffect({
    kind: 'radial-bloom',
    x: r.left + r.width / 2,
    y: r.top + r.height / 2,
    inverse,
  });
}
