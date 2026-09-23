import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribeBackgroundEffects, type BackgroundEffect, type RadialBloomEffect } from '../lib/backgroundEffects';
import styles from './BackgroundEffects.module.scss';

interface ActiveEffect {
  readonly id: number;
  readonly effect: BackgroundEffect;
}

// Mounted once behind the dashboard; entries self-remove on animationend.
export function BackgroundEffects() {
  const [active, setActive] = useState<readonly ActiveEffect[]>([]);
  const idRef = useRef(0);

  useEffect(() => subscribeBackgroundEffects(effect => {
    idRef.current += 1;
    setActive(prev => [...prev, { id: idRef.current, effect }]);
  }), []);

  const remove = useCallback((id: number) => {
    setActive(prev => prev.filter(e => e.id !== id));
  }, []);

  return (
    <div className={styles.layer} aria-hidden="true">
      {active.map(({ id, effect }) => (
        <RadialBloom key={id} effect={effect} onDone={() => remove(id)} />
      ))}
    </div>
  );
}

function RadialBloom({ effect, onDone }: { effect: RadialBloomEffect; onDone: () => void }) {
  // Distance to the farthest viewport corner, so the bloom covers the window.
  const reach = Math.hypot(
    Math.max(effect.x, window.innerWidth - effect.x),
    Math.max(effect.y, window.innerHeight - effect.y),
  );
  return (
    <span
      className={effect.inverse ? styles.bloomInverse : styles.bloom}
      style={{ left: effect.x, top: effect.y, width: reach * 2, height: reach * 2 }}
      onAnimationEnd={onDone}
    />
  );
}
