import { Monitor, RefreshCw } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { SectionHeader } from '../../common/SectionHeader/SectionHeader';
import { EmptyState } from '../../common/EmptyState/EmptyState';
import { Card } from '../../common/Card/Card';
import { Badge } from '../../common/Badge/Badge';
import { Button } from '../../common/Button/Button';
import { InfoList, InfoRow } from '../../common/InfoList/InfoList';
import type { DiagnosticsGpu, DiagnosticsGpuResponse } from '../../../api/diagnostics';
import { NotAvailableNote, SectionLoadError } from './DiagnosticsSectionStates';
import { durationLabel, resolveSectionState } from './diagnosticsHelpers';
import styles from './DiagnosticsView.module.scss';

interface GpuSectionProps {
  data: DiagnosticsGpuResponse | null;
  loading: boolean;
  error: boolean;
  onRefresh: () => void;
}

export function GpuSection({ data, loading, error, onRefresh }: GpuSectionProps) {
  const { t } = useTranslation();
  const state = resolveSectionState({
    hasData: data !== null,
    loading,
    error,
    supported: data?.supported ?? false,
    isEmpty: (data?.gpus.length ?? 0) === 0,
  });

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeaderRow}>
        <SectionHeader>{t('diagnostics.kind.gpu')}</SectionHeader>
        <Button tone="ghost" size="sm" icon={<RefreshCw size={13} />} title={t('diagnostics.refresh')} aria-label={t('diagnostics.refresh')} onClick={onRefresh} />
      </div>
      {state === 'error' && <SectionLoadError onRetry={onRefresh} />}
      {state === 'notSupported' && <NotAvailableNote />}
      {state === 'empty' && <EmptyState compact icon={<Monitor size={22} />} title={t('diagnostics.gpu.empty')} />}
      {state === 'content' && data && (
        <div className={styles.gpuGrid}>
          {data.gpus.map((gpu, i) => <GpuCard key={i} gpu={gpu} />)}
        </div>
      )}
    </section>
  );
}

const THROTTLE_COUNTERS: Array<{ key: keyof DiagnosticsGpu['throttle']; reason: string }> = [
  { key: 'swPowerCapUs', reason: 'swPower' },
  { key: 'swThermalUs', reason: 'swThermal' },
  { key: 'hwThermalUs', reason: 'hwThermal' },
  { key: 'hwPowerBrakeUs', reason: 'hwPowerBrake' },
];

function GpuCard({ gpu }: { gpu: DiagnosticsGpu }) {
  const { t } = useTranslation();
  return (
    <Card title={gpu.name} subtitle={`${t('diagnostics.gpu.driver')}: ${gpu.driverVersion}`}>
      <InfoList>
        <InfoRow label={t('diagnostics.gpu.temperature')} value={`${Math.round(gpu.temperatureC)}°C`} />
        <InfoRow label={t('diagnostics.gpu.power')} value={`${gpu.powerW.toFixed(0)}W`} />
        <InfoRow label={t('diagnostics.gpu.tdrCount')} value={gpu.recentTdrCount} tone={gpu.recentTdrCount > 0 ? 'bad' : 'default'} />
        <InfoRow label={t('diagnostics.gpu.driverErrorCount')} value={gpu.recentDriverErrorCount} tone={gpu.recentDriverErrorCount > 0 ? 'warn' : 'default'} />
      </InfoList>

      <SectionHeader>{t('diagnostics.gpu.throttle.title')}</SectionHeader>
      {gpu.throttle.active.length === 0 ? (
        <div className={styles.reasonSummary}>{t('diagnostics.gpu.throttle.none')}</div>
      ) : (
        <div className={styles.throttleBadges}>
          {gpu.throttle.active.map(reason => (
            <Badge key={reason} label={t(`diagnostics.gpu.throttle.${reason}`)} color="var(--warn)" />
          ))}
        </div>
      )}

      <InfoList>
        {THROTTLE_COUNTERS.filter(c => (gpu.throttle[c.key] as number) > 0).map(c => (
          <InfoRow
            key={c.reason}
            label={t(`diagnostics.gpu.throttle.${c.reason}`)}
            value={durationLabel(gpu.throttle[c.key] as number, t)}
          />
        ))}
      </InfoList>
    </Card>
  );
}
