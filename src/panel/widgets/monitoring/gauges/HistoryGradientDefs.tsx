import { type GaugeGradient } from '../valueColor';

/**
 * Vertical gradient for the history charts, in the chart's own user space so it
 * lines up with the plotted samples rather than the svg box: `at` 0 is the
 * domain floor at the bottom, 1 the ceiling at the top. `padding` must match
 * the Sparkline's, which insets the plotted range at both ends.
 */
export function HistoryGradientDefs({ gradient, height, padding = 0 }: {
  gradient: GaugeGradient;
  height: number;
  padding?: number;
}) {
  const usable = Math.max(1, height - padding * 2);
  const y = (at: number) => height - padding - at * usable;
  return (
    <defs>
      <linearGradient
        id={gradient.id}
        gradientUnits="userSpaceOnUse"
        x1="0" x2="0"
        y1={y(0).toFixed(3)} y2={y(1).toFixed(3)}
      >
        {gradient.stops.map((stop, i) => (
          <stop key={i} offset={stop.at} stopColor={stop.color} />
        ))}
      </linearGradient>
    </defs>
  );
}
