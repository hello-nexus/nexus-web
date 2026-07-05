import { Sparkline } from '../../../../components/common/Sparkline/Sparkline';
import { PERF_HISTORY_SAMPLES } from '../../common/panelHistoryConfig';
import { splitFormatted } from './format';
import type { GaugeProps } from './types';
import styles from './BackdropGauge.module.scss';

export function BackdropGauge({ formatted, label, history, historyDomain }: GaugeProps) {
  const parts = splitFormatted(formatted);
  return (
    <div className={styles.backdrop}>
      <div className={styles.chart}>
        <Sparkline
          values={history}
          domain={historyDomain}
          color="var(--panel-accent-shadow)"
          strokeWidth={0}
          fillOpacity={1}
          sampleCount={PERF_HISTORY_SAMPLES}
          width={160}
          height={56}
        />
      </div>
      <div className={styles.overlay}>
        <span className={styles.value}>
          {parts.value}
          {parts.unit && <span className="panel-gauge-unit">{parts.unit}</span>}
        </span>
        <span className={styles.label}>{label}</span>
      </div>
    </div>
  );
}

export default BackdropGauge;
