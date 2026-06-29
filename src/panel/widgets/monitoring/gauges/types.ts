/** Monitoring gauge line weight in px. Mirror of --gauge-line-thickness (variables.scss). */
export const GAUGE_LINE_THICKNESS = 3.2;

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
  | 'battery';
