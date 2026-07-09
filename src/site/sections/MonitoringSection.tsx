import { Activity } from 'lucide-react';
import { useTranslation } from '../../lib/i18n';
import { GAUGE_DESIGNS } from '../../panel/widgets/monitoring/gauges';
import type { GaugeProps } from '../../panel/widgets/monitoring/gauges';
import { useInViewport } from '../hooks/useInViewport';
import { useTickingHistories } from '../hooks/useTickingHistory';
import { DemoFrame } from '../components/DemoFrame';
import styles from '../site.module.scss';

const SparklineGauge = GAUGE_DESIGNS.sparkline;
const Arc270 = GAUGE_DESIGNS.arc270;
const DotGrid = GAUGE_DESIGNS.dotgrid;
const Segments = GAUGE_DESIGNS.segments;

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

  // Wide swings so every gauge style visibly moves; one shared interval
  // keeps the gauges updating in lockstep.
  const [cpu, gpu, mem, fan] = useTickingHistories([
    { base: 44, swing: 26, spike: 0.3 },
    { base: 62, swing: 10 },
    { base: 56, swing: 14 },
    { base: 46, swing: 28, spike: 0.16 },
  ], { active: inView });

  return (
    <section ref={ref} id="features" className={styles.section}>
      <div className={styles.sectionText}>
        <p className={styles.eyebrow}>
          <Activity size={15} aria-hidden />
          <span>{t('welcome.capabilities.monitoring')}</span>
        </p>
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
            <Arc270 {...gaugeProps(
              t('site.monitoring.gpuLabel'), gpu.history, gpu.value, `${gpu.value}°C`)} />
          </div>
          <div className={styles.monitoringCell}>
            <DotGrid {...gaugeProps(
              t('site.monitoring.memLabel'), mem.history, mem.value,
              `${(MEMORY_TOTAL_GB * mem.value / 100).toFixed(1)} GB`)} />
          </div>
          <div className={styles.monitoringCell}>
            <Segments {...gaugeProps(
              t('site.cooling.fanLabel'), fan.history, fan.value, `${fan.value}%`)} />
          </div>
        </div>
      </DemoFrame>
    </section>
  );
}
