import { useTranslation } from '../../lib/i18n';
import { GAUGE_DESIGNS } from '../../panel/widgets/monitoring/gauges';
import type { GaugeProps } from '../../panel/widgets/monitoring/gauges';
import { useInViewport } from '../hooks/useInViewport';
import { useTickingHistory } from '../hooks/useTickingHistory';
import { DemoFrame } from '../components/DemoFrame';
import styles from '../site.module.scss';

const SparklineGauge = GAUGE_DESIGNS.sparkline;
const HalfGauge = GAUGE_DESIGNS.halfgauge;
const Arc270 = GAUGE_DESIGNS.arc270;

const MEMORY_TOTAL_GB = 32;

function gaugeProps(label: string, history: number[], value: number, formatted: string): GaugeProps {
  return {
    value,
    rawValue: value,
    formatted,
    label,
    history,
    maxValue: 100,
    historyDomain: [0, 100],
  };
}

export function MonitoringSection() {
  const { t } = useTranslation();
  const [ref, inView] = useInViewport<HTMLElement>();

  const cpu = useTickingHistory(42, 20, { spike: 0.22, active: inView });
  const mem = useTickingHistory(58, 3, { active: inView, intervalMs: 1400 });
  const gpu = useTickingHistory(63, 7, { active: inView, intervalMs: 1200 });

  return (
    <section ref={ref} id="features" className={styles.section}>
      <div className={styles.sectionText}>
        <p className={styles.eyebrow}>{t('site.monitoring.eyebrow')}</p>
        <h2>{t('site.monitoring.title')}</h2>
        <p className={styles.lead}>{t('site.monitoring.lead')}</p>
        <ul className={styles.points}>
          <li>{t('site.monitoring.point1')}</li>
          <li>{t('site.monitoring.point2')}</li>
          <li>{t('site.monitoring.point3')}</li>
        </ul>
      </div>
      <DemoFrame interactive={false} className={styles.sectionDemo}>
        <div className={styles.monitoringGrid}>
          <div className={styles.monitoringWide}>
            <SparklineGauge {...gaugeProps(
              t('site.monitoring.cpuLabel'), cpu.history, cpu.value, `${cpu.value}%`)} />
          </div>
          <div className={styles.monitoringCell}>
            <HalfGauge {...gaugeProps(
              t('site.monitoring.memLabel'), mem.history, mem.value,
              `${(MEMORY_TOTAL_GB * mem.value / 100).toFixed(1)} GB`)} />
          </div>
          <div className={styles.monitoringCell}>
            <Arc270 {...gaugeProps(
              t('site.monitoring.gpuLabel'), gpu.history, gpu.value, `${gpu.value}°C`)} />
          </div>
        </div>
      </DemoFrame>
    </section>
  );
}
