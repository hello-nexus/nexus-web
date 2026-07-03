import { Sparkline } from '../../../../components/common/Sparkline/Sparkline';
import { PERF_HISTORY_SAMPLES } from '../../common/panelHistoryConfig';
import { splitFormatted } from './format';
import { GAUGE_LINE_THICKNESS } from './types';
import type { GaugeProps } from './types';
import styles from './SparklineGauge.module.scss';

export function SparklineGauge({ formatted, label, history, historyDomain }: GaugeProps) {
  const parts = splitFormatted(formatted);
  return (
    <div className={styles.sparkline}>
      <div className={styles.chart}>
        <Sparkline
          values={history}
          domain={historyDomain}
          color="var(--panel-accent-glow)"
          // eslint-disable-next-line i18next/no-literal-string -- CSS color variable
          strokeColor="var(--panel-accent)"
          strokeWidth={GAUGE_LINE_THICKNESS}
          // Lift the line off the clip edge so the non-scaling stroke isn't
          // cropped by .chart's overflow:hidden at domain min/max. padding is in
          // viewBox units, so a full stroke gives generous headroom around the
          // nominal 36px render height and more on taller tiles.
          padding={GAUGE_LINE_THICKNESS}
          sampleCount={PERF_HISTORY_SAMPLES}
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
