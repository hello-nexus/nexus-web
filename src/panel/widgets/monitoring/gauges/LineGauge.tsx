import { Sparkline } from '../../../../components/common/Sparkline/Sparkline';
import { PERF_HISTORY_SAMPLES } from '../../common/panelHistoryConfig';
import { GAUGE_LINE_THICKNESS } from './types';
import { GaugeValue } from './GaugeValue';
import { HistoryGradientDefs } from './HistoryGradientDefs';
import type { GaugeProps } from './types';
import styles from './SparklineGauge.module.scss';

const CHART_HEIGHT = 36;

export function LineGauge({ formatted, label, history, historyDomain, gradient }: GaugeProps) {
  const paint = gradient ? `url(#${gradient.id})` : undefined;
  return (
    <div className={styles.sparkline}>
      <div className={styles.chart}>
        <Sparkline
          values={history}
          domain={historyDomain}
          defs={gradient && <HistoryGradientDefs gradient={gradient} height={CHART_HEIGHT} padding={GAUGE_LINE_THICKNESS} />}
          color={paint ?? 'var(--panel-accent)'}
          sampleCount={PERF_HISTORY_SAMPLES}
          showFill={false}
          strokeWidth={GAUGE_LINE_THICKNESS}
          // Lift the line off the clip edge so the non-scaling stroke isn't
          // cropped by .chart's overflow:hidden at domain min/max. padding is in
          // viewBox units, so a full stroke gives generous headroom around the
          // nominal 36px render height and more on taller tiles.
          padding={GAUGE_LINE_THICKNESS}
          width={160}
          height={CHART_HEIGHT}
        />
      </div>
      <div className={styles.info}>
        <GaugeValue formatted={formatted} className={styles.value} />
        {label && <span className={styles.label}>{label}</span>}
      </div>
    </div>
  );
}
