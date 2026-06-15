// Module-level bus; <BackgroundEffects> renders emitted effects.

// Radial accent bloom centered on (x, y) in viewport px; inverse collapses it inward.
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

// Emit a bloom from an element's center, in viewport px.
export function emitRadialBloomFromElement(el: HTMLElement, inverse = false): void {
  const r = el.getBoundingClientRect();
  emitBackgroundEffect({
    kind: 'radial-bloom',
    x: r.left + r.width / 2,
    y: r.top + r.height / 2,
    inverse,
  });
}
