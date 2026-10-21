import { useMemo } from 'react';
import { gaugeGradientColorAt } from '../../../theme/gaugeGradient';
import { useElementSize } from '../../common/useElementSize';
import { GaugeValue } from './GaugeValue';
import type { GaugeProps } from './types';
import { gradedRingClosure } from './gradedRingClosure';
import { PATH_LENGTH, RING_STROKE, progressDash, squareRingShape, startSeamPath } from './squareRingGeometry';
import styles from './CaterpillarGauge.module.scss';

// A graded stroke is drawn as solid dashes of the same path and revealed by a
// dash mask, like the graded Ring.
const SEGMENTS = 40;
const OVERLAP = 0.6;
const SEGMENT_BLEED = 4;
// Patch reach past the cap radius behind the start, and ahead of it, in viewBox units.
const START_PATCH_MARGIN = 1;
const START_PATCH_FORWARD = 3;

export function SquareRingGauge({ value, formatted, label, gradient }: GaugeProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const { ref, size } = useElementSize();
  const { width, height, path, perimeter } = useMemo(
    () => squareRingShape(size?.width, size?.height),
    [size?.width, size?.height],
  );
  // The mask is the ungraded stroke: same start, same dash, round caps. Its
  // start cap reaches behind the start, where the hot end color would show, so
  // a first-color patch covers that half cap until the two caps meet.
  const capUnits = RING_STROKE / 2;
  // The patch never reaches back past the end cap's tip, or the tip shows the
  // first color instead of the hot one.
  const tipToStart = ((PATH_LENGTH - clamped) / PATH_LENGTH) * perimeter - capUnits;
  const patchBack = Math.min(capUnits + START_PATCH_MARGIN, tipToStart);
  const { complete, closing } = gradedRingClosure(clamped, PATH_LENGTH, (RING_STROKE / perimeter) * PATH_LENGTH);
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
    <div ref={ref} className={styles.caterpillar}>
      <svg className={styles.svg} viewBox={`0 0 ${width} ${height}`}>
        <path d={path} pathLength={PATH_LENGTH} className={styles.trackRing} />
        {gradient ? (
          <>
            <mask id={maskId} maskUnits="userSpaceOnUse">
              <path
                d={path}
                pathLength={PATH_LENGTH}
                fill="none"
                stroke="#fff"
                strokeWidth={RING_STROKE}
                strokeLinecap={complete ? 'butt' : 'round'}
                strokeDasharray={complete ? undefined : progressDash(clamped)}
              />
            </mask>
            <g mask={`url(#${maskId})`}>
              {closing && (
                // The last and first segment meet end to end at the start, so
                // their antialiased edges leave a hairline of background. A
                // closed stroke of the end color underneath covers it.
                <path
                  data-seam=""
                  d={path}
                  pathLength={PATH_LENGTH}
                  fill="none"
                  stroke={segments[SEGMENTS - 1].color}
                  strokeWidth={RING_STROKE + SEGMENT_BLEED}
                />
              )}
              {segments.map((seg, i) => (
                <path
                  key={i}
                  d={path}
                  pathLength={PATH_LENGTH}
                  fill="none"
                  stroke={seg.color}
                  strokeWidth={RING_STROKE + SEGMENT_BLEED}
                  strokeDasharray={`${seg.length} ${PATH_LENGTH}`}
                  strokeDashoffset={-seg.start}
                />
              ))}
              {!closing && (
                <path
                  data-start-cap=""
                  d={startSeamPath(width, patchBack, START_PATCH_FORWARD)}
                  fill="none"
                  stroke={segments[0].color}
                  strokeWidth={RING_STROKE + SEGMENT_BLEED}
                />
              )}
            </g>
          </>
        ) : (
          <path
            d={path}
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
