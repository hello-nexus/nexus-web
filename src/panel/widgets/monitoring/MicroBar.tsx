import type { CSSProperties } from 'react';
import { Sparkline } from '../../../components/common/Sparkline/Sparkline';
import { PERF_HISTORY_SAMPLES } from '../common/panelHistoryConfig';
import { GaugeValue } from './gauges/GaugeValue';
import { GaugeTrack } from './gauges/GaugeTrack';
import type { GaugeGradient } from './valueColor';
import { GAUGE_LINE_THICKNESS } from './gauges/types';
import type { GaugeDesignKey } from './gauges/types';
import styles from './MicroBar.module.scss';

interface MicroBarProps {
  label: string;
  formatted: string;
  fillPercent: number;
  // One of the Micro design keys (see MICRO_DESIGN_KEYS): 'bar' (fill track),
  // 'fill' (value fill behind the caption), 'backdrop' (dim history graph).
  design?: GaugeDesignKey;
  // Only read by the 'backdrop' design (the dim filled history trace).
  history?: number[];
  historyDomain?: [number, number];
  /** The panel gradient painted into the row's figure; null keeps the accent. */
  gradient?: GaugeGradient | null;
  /** --panel-accent* overrides when the row is value-coloured (see valueColor.ts). */
  style?: CSSProperties;
}

export function MicroBar({ label, formatted, fillPercent, design = 'bar', history, historyDomain, gradient, style }: MicroBarProps) {
  const head = (
    <div className={styles.head}>
      {label && <span className={styles.label}>{label}</span>}
      <GaugeValue formatted={formatted} className={styles.value} />
    </div>
  );

  if (design === 'fill') {
    const clamped = Math.max(0, Math.min(100, fillPercent));
    return (
      <div className={styles.rowFill} style={style}>
        <div className={styles.fillBar} style={{ width: `${clamped}%` }} />
        {head}
      </div>
    );
  }

  if (design === 'backdrop') {
    return (
      <div className={styles.rowGraph} style={style}>
        <div className={styles.graphChart}>
          <Sparkline
            values={history ?? []}
            domain={historyDomain ?? [0, 100]}
            color="var(--panel-accent-shadow)"
            strokeWidth={0}
            fillOpacity={1}
            padding={GAUGE_LINE_THICKNESS}
            sampleCount={PERF_HISTORY_SAMPLES}
            width={160}
            height={36}
          />
        </div>
        {head}
      </div>
    );
  }

  return (
    <div className={styles.row} style={style}>
      {head}
      <GaugeTrack fillPercent={fillPercent} gradient={gradient} />
    </div>
  );
}
