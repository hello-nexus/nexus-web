import { useMemo } from 'react';
import { gaugeGradientColorAt } from '../../../theme/gaugeGradient';
import type { GaugeGradient } from '../valueColor';
import { gradedRingClosure } from './gradedRingClosure';

// SVG has no angular gradient, so a graded arc is drawn as short solid segments
// along the sweep and revealed by one dasharray mask. Only the mask changes per
// reading; the coloured geometry is static for a given ramp.
const SEGMENTS = 40;
// Segments overlap by this fraction of their length so no seam shows between
// two adjacent solid strokes.
const OVERLAP = 0.6;
// Extra segment width over the mask: the mask's antialiased edge then falls
// outside the band, which would otherwise thin the stroke.
const SEGMENT_BLEED = 4;
// Patch reach past the cap radius behind the start, and ahead of it, in degrees.
const SEAM_BACK_MARGIN_DEG = 1.5;
const SEAM_FORWARD_DEG = 4;

export interface ArcGeometry {
  /** Centre of the arc's circle, in viewBox units. */
  cx: number;
  cy: number;
  radius: number;
  /** Degrees, clockwise, 0 = 3 o'clock. */
  startDeg: number;
  sweepDeg: number;
  strokeWidth: number;
}

function arcPath(g: ArcGeometry, fromDeg: number, toDeg: number): string {
  const point = (deg: number) => {
    const rad = (deg * Math.PI) / 180;
    return `${(g.cx + g.radius * Math.cos(rad)).toFixed(3)} ${(g.cy + g.radius * Math.sin(rad)).toFixed(3)}`;
  };
  // A full circle needs two half arcs: an arc from a point back to itself is
  // degenerate and draws nothing.
  if (toDeg - fromDeg >= 360) {
    const mid = fromDeg + 180;
    return `M ${point(fromDeg)} A ${g.radius} ${g.radius} 0 0 1 ${point(mid)} A ${g.radius} ${g.radius} 0 0 1 ${point(fromDeg + 360)} Z`;
  }
  const large = Math.abs(toDeg - fromDeg) > 180 ? 1 : 0;
  return `M ${point(fromDeg)} A ${g.radius} ${g.radius} 0 ${large} 1 ${point(toDeg)}`;
}

/**
 * The coloured arc, masked to `fillPercent`. Render inside the gauge's own
 * <svg>; `gradient.id` scopes the mask id to this slot.
 */
export function ArcSegments({ geometry, gradient, fillPercent }: {
  geometry: ArcGeometry;
  gradient: GaugeGradient;
  fillPercent: number;
}) {
  const maskId = `${gradient.id}-arc`;
  const sweepEnd = geometry.startDeg + geometry.sweepDeg;
  const arcLength = (geometry.sweepDeg / 360) * 2 * Math.PI * geometry.radius;
  const reveal = (Math.max(0, Math.min(100, fillPercent)) / 100) * arcLength;
  // The mask is the ungraded stroke: same start, same dash, round caps. A
  // closed ring's start cap reaches behind the start, where the hot end color
  // would show, so a first-color patch covers that half cap until the caps meet.
  const full = geometry.sweepDeg >= 360;
  const { complete, closing } = gradedRingClosure(reveal, arcLength, geometry.strokeWidth);
  const seamDeg = (geometry.strokeWidth / 2 / geometry.radius) * (180 / Math.PI);

  const segments = useMemo(() => {
    const step = geometry.sweepDeg / SEGMENTS;
    return Array.from({ length: SEGMENTS }, (_, i) => {
      const from = geometry.startDeg + i * step;
      const mid = (i + 0.5) / SEGMENTS;
      return {
        d: arcPath(geometry, from, Math.min(sweepEnd, from + step * (1 + OVERLAP))),
        color: gaugeGradientColorAt(gradient.stops, mid),
      };
    });
  }, [geometry, gradient, sweepEnd]);

  const first = segments[0].color;
  const last = segments[SEGMENTS - 1].color;
  const band = geometry.strokeWidth + SEGMENT_BLEED;

  return (
    <>
      <mask id={maskId} maskUnits="userSpaceOnUse">
        <path
          d={arcPath(geometry, geometry.startDeg, sweepEnd)}
          // No class: a stroke rule on it would paint the mask in the accent,
          // and a mask is read as luminance - the band would show at the
          // accent's brightness instead of fully.
          fill="none"
          stroke="#fff"
          strokeWidth={geometry.strokeWidth}
          strokeLinecap={full && complete ? 'butt' : 'round'}
          strokeDasharray={full && complete ? undefined : `${reveal.toFixed(3)} ${arcLength.toFixed(3)}`}
        />
      </mask>
      <g mask={`url(#${maskId})`}>
        {full && closing && (
          // The last and first segment meet end to end at the start, so their
          // antialiased edges leave a hairline of background. One stroke of the
          // end color under the seam covers it.
          <path
            data-seam=""
            d={arcPath(geometry, sweepEnd - seamDeg - SEAM_BACK_MARGIN_DEG, sweepEnd + SEAM_FORWARD_DEG)}
            fill="none"
            stroke={last}
            strokeWidth={band}
          />
        )}
        {segments.map((seg, i) => (
          <path
            key={i}
            d={seg.d}
            fill="none"
            stroke={seg.color}
            strokeWidth={band}
            strokeLinecap={full ? 'butt' : 'round'}
          />
        ))}
        {full && !closing && (
          <path
            data-start-cap=""
            d={arcPath(geometry, sweepEnd - seamDeg - SEAM_BACK_MARGIN_DEG, sweepEnd + SEAM_FORWARD_DEG)}
            fill="none"
            stroke={first}
            strokeWidth={band}
          />
        )}
      </g>
    </>
  );
}
