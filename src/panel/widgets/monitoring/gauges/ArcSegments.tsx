import { useMemo } from 'react';
import { gaugeGradientColorAt } from '../../../theme/gaugeGradient';
import type { GaugeGradient } from '../valueColor';

// SVG has no angular gradient, so a graded arc is drawn as short solid segments
// along the sweep and revealed by one dasharray mask. Only the mask changes per
// reading; the coloured geometry is static for a given ramp.
const SEGMENTS = 40;
// Segments overlap by this fraction of their length so no seam shows between
// two adjacent solid strokes.
const OVERLAP = 0.6;
// Extra mask width over the coloured band; see the mask path below.
const MASK_BLEED = 4;

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
    return `M ${point(fromDeg)} A ${g.radius} ${g.radius} 0 0 1 ${point(mid)} A ${g.radius} ${g.radius} 0 0 1 ${point(fromDeg + 360)}`;
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
  // A closed ring has no gap: whatever sits before the start is the hot end,
  // so nothing may poke past 12 o'clock in either direction. The mask starts
  // one cap radius in (its round cap then lands exactly on the start) and the
  // band's segments take butt caps; an open arc keeps round ends like its
  // ungraded stroke.
  const full = geometry.sweepDeg >= 360;
  const capLength = full ? (geometry.strokeWidth + MASK_BLEED) / 2 : 0;
  const capDeg = (capLength / (2 * Math.PI * geometry.radius)) * 360;
  const maskStart = geometry.startDeg + capDeg;
  const dash = Math.max(0, reveal - 2 * capLength);

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

  return (
    <>
      <mask id={maskId} maskUnits="userSpaceOnUse">
        <path
          d={arcPath(geometry, maskStart, maskStart + geometry.sweepDeg)}
          // No class: a stroke rule on it would paint the mask in the accent,
          // and a mask is read as luminance - the band would show at the
          // accent's brightness instead of fully.
          fill="none"
          stroke="#fff"
          // Wider than the band it reveals: at equal widths the mask's own
          // antialiased edge multiplies the segments', thinning the stroke.
          strokeWidth={geometry.strokeWidth + MASK_BLEED}
          strokeLinecap="round"
          strokeDasharray={`${dash.toFixed(3)} ${arcLength.toFixed(3)}`}
        />
      </mask>
      <g mask={`url(#${maskId})`}>
        {segments.map((seg, i) => (
          <path
            key={i}
            d={seg.d}
            fill="none"
            stroke={seg.color}
            strokeWidth={geometry.strokeWidth}
            strokeLinecap={full ? 'butt' : 'round'}
          />
        ))}
      </g>
    </>
  );
}
