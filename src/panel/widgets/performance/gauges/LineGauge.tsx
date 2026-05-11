import { Sparkline } from '../../../../components/Sparkline/Sparkline';
import { PERF_HISTORY_SAMPLES } from '../../common/useHistory';
import { splitFormatted } from './format';
import type { GaugeProps } from './types';
import styles from './SparklineGauge.module.scss';

export function LineGauge({ formatted, label, history, historyDomain }: GaugeProps) {
  const parts = splitFormatted(formatted);
  return (
    <div className={styles.sparkline}>
      <div className={styles.chart}>
        <Sparkline
          values={history}
          domain={historyDomain}
          color="var(--panel-accent)"
          sampleCount={PERF_HISTORY_SAMPLES}
          showFill={false}
          strokeWidth={2.4}
          width={160}
          height={36}
        />
      </div>
      <div className={styles.info}>
        <span className={styles.value}>
          {parts.value}
          {parts.unit && <span className="panel-gauge-unit">{parts.unit}</span>}
        </span>
        <span className={styles.label}>{label}</span>
      </div>
    </div>
  );
}
