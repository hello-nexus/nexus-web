import { useLayoutEffect, useRef, useState } from 'react';
import { GaugeValue } from './GaugeValue';
import type { GaugeProps } from './types';
import styles from './WaterLevelGauge.module.scss';

// Ring inset from the stage edge, matching the pre-measure CSS geometry.
const INSET = 12;

export function WaterLevelGauge({ value, formatted, label }: GaugeProps) {
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
      setSize(Math.max(0, Math.min(w, h) - INSET));
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
            style={{ height: `${fillPercent}%` }}
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
