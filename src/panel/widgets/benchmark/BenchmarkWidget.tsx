import { useState } from 'react';
import { Gauge, Cpu, Monitor, MemoryStick, HardDrive } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { useBenchmarkHistory } from '../../../hooks/useBenchmarkHistory';
import { PanelWidgetShell, PanelWidgetEmpty } from '../common/PanelWidgetChrome';
import type { WidgetProps } from '../types';
import styles from './BenchmarkWidget.module.scss';

export function BenchmarkWidget({ widget }: WidgetProps) {
  const { t } = useTranslation();
  const { latest } = useBenchmarkHistory();
  const size = widget.size;
  const [now] = useState(() => Date.now());

  if (!latest) {
    return (
      <PanelWidgetShell size={size}>
        <PanelWidgetEmpty
          icon={<Gauge size={24} />}
          title={t('benchmark.start')}
        />
      </PanelWidgetShell>
    );
  }

  const relativeTime = (() => {
    const diff = now - (latest?.timestamp ?? now);
    const mins = Math.floor(diff / 60000);
    const hrs = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (days > 0) return t('benchmark.widget.daysAgo', { n: String(days) });
    if (hrs > 0) return t('benchmark.widget.hoursAgo', { n: String(hrs) });
    if (mins > 0) return t('benchmark.widget.minsAgo', { n: String(mins) });
    return t('benchmark.widget.justNow');
  })();

  return (
    <PanelWidgetShell size={size} className={styles.widget}>
      <div className={styles.main}>
        <div className={styles.compositeRow}>
          <Gauge size={16} className={styles.gaugeIcon} />
          <div className={styles.score}>{Math.round(latest.composite)}</div>
        </div>
        <div className={styles.label}>{t('benchmark.result.composite')}</div>
        <div className={styles.time}>{relativeTime}</div>
      </div>
      {size === '4x2' && (
        <div className={styles.axisRow}>
          <div className={styles.axisChip}>
            <Cpu size={12} />
            <span>{Math.round(latest.cpu)}</span>
          </div>
          <div className={styles.axisChip}>
            <Monitor size={12} />
            <span>{Math.round(latest.gpu)}</span>
          </div>
          <div className={styles.axisChip}>
            <MemoryStick size={12} />
            <span>{Math.round(latest.ram)}</span>
          </div>
          <div className={styles.axisChip}>
            <HardDrive size={12} />
            <span>{Math.round(latest.storage)}</span>
          </div>
        </div>
      )}
    </PanelWidgetShell>
  );
}
