import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribeBackgroundEffects, type BackgroundEffect, type RadialBloomEffect } from '../lib/backgroundEffects';
import styles from './BackgroundEffects.module.scss';

interface ActiveEffect {
  readonly id: number;
  readonly effect: BackgroundEffect;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

// Active radial-bloom look: 'a' = soft bloom wash, 'b' = shockwave ring,
// 'c' = softened bloom wash (lower peak, slower expand than A).
const RADIAL_VARIANT: 'a' | 'b' | 'c' = 'c';

function radialClass(inverse: boolean): string {
  if (RADIAL_VARIANT === 'a') return inverse ? styles.bloomInverse : styles.bloom;
  if (RADIAL_VARIANT === 'b') return inverse ? styles.ringImplode : styles.ringExpand;
  return inverse ? styles.bloomElegantInverse : styles.bloomElegant;
}

// Full-window layer behind the dashboard (sibling of <AppBackdrop>, same
// z-index:-1 inside .layout's isolated stacking context), rendering transient
// effects emitted on the backgroundEffects bus. position: fixed, so emitted
// viewport coordinates map straight to the layer's space. Each effect removes
// itself when its animation ends, so the DOM never accumulates.
export function BackgroundEffects() {
  const [active, setActive] = useState<readonly ActiveEffect[]>([]);
  const idRef = useRef(0);

  useEffect(() => subscribeBackgroundEffects(effect => {
    if (prefersReducedMotion()) return;
    idRef.current += 1;
    setActive(prev => [...prev, { id: idRef.current, effect }]);
  }), []);

  const remove = useCallback((id: number) => {
    setActive(prev => prev.filter(e => e.id !== id));
  }, []);

  // One renderer per effect kind. Today only radial-bloom exists; when a new
  // BackgroundEffect variant lands, switch on effect.kind here.
  return (
    <div className={styles.layer} aria-hidden="true">
      {active.map(({ id, effect }) => (
        <RadialBloom key={id} effect={effect} onDone={() => remove(id)} />
      ))}
    </div>
  );
}

function RadialBloom({ effect, onDone }: { effect: RadialBloomEffect; onDone: () => void }) {
  // Radius reaching the farthest viewport corner from the origin, so the bloom
  // covers the whole window at full scale regardless of which tab fired it.
  const reach = Math.hypot(
    Math.max(effect.x, window.innerWidth - effect.x),
    Math.max(effect.y, window.innerHeight - effect.y),
  );
  return (
    <span
      className={radialClass(effect.inverse ?? false)}
      style={{ left: effect.x, top: effect.y, width: reach * 2, height: reach * 2 }}
      onAnimationEnd={onDone}
    />
  );
}
