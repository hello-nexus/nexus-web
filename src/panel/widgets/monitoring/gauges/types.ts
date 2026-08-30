/** Monitoring gauge line weight in px. Mirror of --gauge-line-thickness (variables.scss). */
export const GAUGE_LINE_THICKNESS = 3.2;

/**
 * Where a full-circle gauge's outermost stroke ends, in its 100-unit viewBox:
 * 96% of the 50-unit half-width. Every design in FRAME_FILLING_DESIGNS draws to
 * exactly this edge so one multiplier (--gauge-figure-scale) grows them all by
 * the same amount against a round frame. Subtract half the stroke width when
 * deriving a centre-line radius from it.
 */
export const GAUGE_FIGURE_OUTER = 48;

export interface GaugeProps {
  value: number;
  rawValue: number;
  formatted: string;
  label: string;
  history: number[];
  maxValue: number;
  /** Relative-stretched [min, max] for line-graph gauges. Other shapes ignore. */
  historyDomain: [number, number];
}

export type GaugeDesignKey =
  | 'sparkline'
  | 'line'
  | 'text'
  | 'waterLevel'
  | 'caterpillar'
  | 'bar'
  | 'microbars'
  | 'hbar'
  | 'dotgrid'
  | 'halfgauge'
  | 'numberfill'
  | 'thermo'
  | 'arc270'
  | 'wedge'
  | 'battery'
  | 'segments'
  | 'mirrorwave'
  | 'heatmap'
  | 'dial'
  | 'tickring'
  | 'backdrop'
  | 'fill';
