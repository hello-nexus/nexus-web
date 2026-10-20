import { useMemo } from 'react';
import { gaugeGradientColorAt } from '../../../theme/gaugeGradient';
import { GaugeValue } from './GaugeValue';
import type { GaugeProps } from './types';
import { PATH_LENGTH, RING_STROKE, SQUARE_PATH, SQUARE_PERIMETER, progressDash } from './squareRingGeometry';
import styles from './CaterpillarGauge.module.scss';

// A graded stroke is drawn as solid dashes of the same path and revealed by a
// dash mask, like the graded Ring.
const SEGMENTS = 40;
const OVERLAP = 0.6;
const MASK_BLEED = 4;
// The mask starts one cap radius in so its round cap lands on the start and
// nothing pokes backward past it.
const CAP_PERCENT = (((RING_STROKE + MASK_BLEED) / 2) / SQUARE_PERIMETER) * PATH_LENGTH;

export function SquareRingGauge({ value, formatted, label, gradient }: GaugeProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const segments = useMemo(() => {
    if (!gradient) return [];
    const step = PATH_LENGTH / SEGMENTS;
    return Array.from({ length: SEGMENTS }, (_, i) => ({
      start: i * step,
      length: Math.min(step * (1 + OVERLAP), PATH_LENGTH - i * step),
      color: gaugeGradientColorAt(gradient.stops, (i + 0.5) / SEGMENTS),
    }));
  }, [gradient]);
  const maskId = gradient ? `${gradient.id}-square` : undefined;

  return (
    <div className={styles.caterpillar}>
      <svg className={styles.svg} viewBox="0 0 100 100">
        <path d={SQUARE_PATH} pathLength={PATH_LENGTH} className={styles.trackRing} />
        {gradient ? (
          <>
            <mask id={maskId} maskUnits="userSpaceOnUse">
              <path
                d={SQUARE_PATH}
                pathLength={PATH_LENGTH}
                fill="none"
                stroke="#fff"
                strokeWidth={RING_STROKE + MASK_BLEED}
                strokeLinecap="round"
                strokeDasharray={`${Math.max(0, clamped - 2 * CAP_PERCENT)} ${PATH_LENGTH}`}
                strokeDashoffset={-CAP_PERCENT}
              />
            </mask>
            <g mask={`url(#${maskId})`}>
              {segments.map((seg, i) => (
                <path
                  key={i}
                  d={SQUARE_PATH}
                  pathLength={PATH_LENGTH}
                  fill="none"
                  stroke={seg.color}
                  strokeWidth={RING_STROKE}
                  strokeDasharray={`${seg.length} ${PATH_LENGTH}`}
                  strokeDashoffset={-seg.start}
                />
              ))}
            </g>
          </>
        ) : (
          <path
            d={SQUARE_PATH}
            pathLength={PATH_LENGTH}
            className={styles.fillRing}
            strokeDasharray={progressDash(clamped)}
          />
        )}
      </svg>
      <div className={styles.center}>
        <GaugeValue formatted={formatted} className={styles.value} />
        {label && <span className={styles.label}>{label}</span>}
      </div>
    </div>
  );
}
