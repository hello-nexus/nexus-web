import { Sparkline } from '../../../../components/common/Sparkline/Sparkline';
import { PERF_HISTORY_SAMPLES } from '../../common/panelHistoryConfig';
import { GAUGE_LINE_THICKNESS } from './types';
import { GaugeValue } from './GaugeValue';
import type { GaugeProps } from './types';
import styles from './BackdropGauge.module.scss';

export function BackdropGauge({ formatted, label, history, historyDomain }: GaugeProps) {
  return (
    <div className={styles.backdrop}>
      <div className={styles.chart}>
        <Sparkline
          values={history}
          domain={historyDomain}
          color="var(--panel-accent-shadow)"
          strokeWidth={0}
          fillOpacity={1}
          // Same inner y-padding the Filled Line graph uses, so the trace keeps
          // top/bottom margins and never runs into the tile edges.
          padding={GAUGE_LINE_THICKNESS}
          sampleCount={PERF_HISTORY_SAMPLES}
          width={160}
          height={36}
        />
      </div>
      <div className={styles.overlay}>
        <GaugeValue formatted={formatted} className={styles.value} />
        {label && <span className={styles.label}>{label}</span>}
      </div>
    </div>
  );
}

export default BackdropGauge;
