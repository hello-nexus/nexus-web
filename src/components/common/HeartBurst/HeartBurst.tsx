import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import styles from './HeartBurst.module.scss';

interface Heart {
  readonly id: number;
  readonly style: CSSProperties;
}

const HEART_COUNT = 16;

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

function randomHeartStyle(): CSSProperties {
  const dx = (Math.random() - 0.5) * 140; // px, final horizontal drift
  const dy = -(90 + Math.random() * 90); // px, always upward
  const rot = (Math.random() - 0.5) * 70; // deg
  const scale = 0.7 + Math.random() * 0.7;
  const delay = Math.random() * 180; // ms, stagger so the burst doesn't fire in lockstep
  const duration = 1000 + Math.random() * 400; // ms
  return {
    '--heart-dx': `${dx}px`,
    '--heart-dy': `${dy}px`,
    '--heart-rot': `${rot}deg`,
    '--heart-scale': scale,
    animationDelay: `${delay}ms`,
    animationDuration: `${duration}ms`,
  } as CSSProperties;
}

/**
 * A burst of small red hearts that rise and drift apart like released
 * balloons, then unmount. Fires only on a rising edge of `burstKey` (never on
 * mount, since the initial value never counts as a rise) - pair with
 * `useHeartBurstTrigger` to derive that key from an off-to-on toggle flip.
 * Pure CSS transform/opacity keyframes; each heart self-removes on its own
 * animationend, mirroring BackgroundEffects' particle lifecycle.
 *
 * The hearts render in a `document.body` portal on the `--z-particles` layer:
 * they rise well above their toggle row, so an in-place render gets clipped by
 * any scrolling ancestor (the settings `.tabContent`) and covered by sibling
 * stacking contexts. The in-place element is a zero-size anchor whose viewport
 * position is captured per burst; hearts hold that origin for their ~1.4s life
 * rather than tracking scroll, same tradeoff as the portaled tooltips.
 *
 * `originTop` positions the anchor within the `position: relative` wrapper the
 * consumer places it in; each mount point tunes it to its own row's icon size,
 * so it isn't shared CSS across mount points.
 */
export function HeartBurst({ burstKey, originTop = 0 }: { burstKey: number; originTop?: number }) {
  const [hearts, setHearts] = useState<readonly Heart[]>([]);
  const idRef = useRef(0);
  const prevKeyRef = useRef(burstKey);
  const anchorRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const rose = burstKey > 0 && burstKey !== prevKeyRef.current;
    prevKeyRef.current = burstKey;
    if (!rose || prefersReducedMotion()) return;
    const origin = anchorRef.current?.getBoundingClientRect();
    if (!origin) return;
    const next: Heart[] = Array.from({ length: HEART_COUNT }, () => {
      idRef.current += 1;
      return {
        id: idRef.current,
        style: { ...randomHeartStyle(), left: origin.left, top: origin.top },
      };
    });
    setHearts(prev => [...prev, ...next]);
  }, [burstKey]);

  const remove = useCallback((id: number) => {
    setHearts(prev => prev.filter(h => h.id !== id));
  }, []);

  return (
    <>
      <span ref={anchorRef} className={styles.anchor} style={{ top: originTop }} aria-hidden="true" />
      {hearts.length > 0 && createPortal(
        <div className={styles.overlay} aria-hidden="true">
          {hearts.map(h => (
            <HeartGlyph key={h.id} style={h.style} onDone={() => remove(h.id)} />
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}

function HeartGlyph({ style, onDone }: { style: CSSProperties; onDone: () => void }) {
  return (
    <svg
      className={styles.heart}
      style={style}
      onAnimationEnd={onDone}
      viewBox="0 0 24 24"
      fill="currentColor"
      focusable="false"
    >
      <path d="M12 21s-6.7-4.35-9.3-8.1C1.1 10.86 1.4 8 3.6 6.4c2-1.45 4.6-1 6 .95l2.4 3.15 2.4-3.15c1.4-1.95 4-2.4 6-.95 2.2 1.6 2.5 4.46.9 6.5C18.7 16.65 12 21 12 21z" />
    </svg>
  );
}

/**
 * Derives a HeartBurst `burstKey` from `active`'s transitions: increments
 * only on a false-to-true edge, never on the hook's own mount. `active` may
 * start `null` while its real value is still loading (e.g. PrivacyTab hydrates
 * the toggle from the server) - the first non-null value is always taken as
 * the baseline, never as a transition, so a toggle that loads already-on
 * never fires a burst on page load. Multiple mount points (welcome screen,
 * Settings) each get an independent instance.
 */
export function useHeartBurstTrigger(active: boolean | null): number {
  const [burstKey, setBurstKey] = useState(0);
  const prevActiveRef = useRef(active);

  useEffect(() => {
    const prev = prevActiveRef.current;
    prevActiveRef.current = active;
    if (prev === null || active === null) return;
    if (!prev && active) {
      setBurstKey(k => k + 1);
    }
  }, [active]);

  return burstKey;
}
