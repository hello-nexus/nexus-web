import { useLayoutEffect, useRef, useState } from 'react';
import { GaugeValue } from './GaugeValue';
import { GAUGE_FIGURE_OUTER } from './types';
import type { GaugeProps } from './types';
import { gaugeGradientCss } from '../../../theme/gaugeGradient';
import styles from './WaterLevelGauge.module.scss';

// The vessel is a fraction of the stage's short side, matching the shared
// figure edge every other full-circle design draws to (GAUGE_FIGURE_OUTER).
const FIGURE_FRACTION = GAUGE_FIGURE_OUTER / 50;

export function WaterLevelGauge({ value, formatted, label, gradient }: GaugeProps) {
  const fillPercent = Math.max(0, Math.min(100, value));
  const stageRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(0);

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w <= 0 || h <= 0) return;
      setSize(Math.max(0, Math.min(w, h) * FIGURE_FRACTION));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className={styles.water}>
      <div className={styles.stage} ref={stageRef}>
        <div className={styles.container} style={{ width: size, height: size }}>
          <div
            className={styles.fill}
            // The water keeps the scss's translucency with the alpha baked
            // into the gradient's stops instead of color-mix.
            style={gradient
              ? { height: '100%', background: gaugeGradientCss(gradient.stops, 0, 0.4), clipPath: `inset(${(100 - fillPercent).toFixed(2)}% 0 0 0)` }
              : { height: `${fillPercent}%` }}
          />
        </div>
      </div>
      <div className={styles.overlay}>
        <GaugeValue formatted={formatted} className={styles.value} />
        {label && <span className={styles.label}>{label}</span>}
      </div>
    </div>
  );
}
