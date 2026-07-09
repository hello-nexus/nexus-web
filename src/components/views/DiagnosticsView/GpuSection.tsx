import { Monitor } from 'lucide-react';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { useTranslation } from '../../../lib/i18n';
import { convertTemperature, localizeNumbers, tempUnitSymbol } from '../../../lib/units';
import { SectionHeader } from '../../common/SectionHeader/SectionHeader';
import { EmptyState } from '../../common/EmptyState/EmptyState';
import { Card } from '../../common/Card/Card';
import { Badge } from '../../common/Badge/Badge';
import { InfoList, InfoRow } from '../../common/InfoList/InfoList';
import type { DiagnosticsFetchOptions, DiagnosticsGpu, DiagnosticsGpuResponse } from '../../../api/diagnostics';
import { NotAvailableNote, SectionLoadError } from './DiagnosticsSectionStates';
import { durationLabel, resolveSectionState } from './diagnosticsHelpers';
import styles from './DiagnosticsView.module.scss';

interface GpuSectionProps {
  data: DiagnosticsGpuResponse | null;
  loading: boolean;
  error: boolean;
  onRefresh: (opts?: DiagnosticsFetchOptions) => void;
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
      {state === 'error' && <SectionLoadError onRetry={() => onRefresh({ force: true })} loading={loading} />}
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
  const { monitoringTempUnit, numberFormat } = useUnitPrefs();
  return (
    <Card title={gpu.name} subtitle={`${t('diagnostics.gpu.driver')}: ${gpu.driverVersion}`}>
      <InfoList>
        <InfoRow label={t('diagnostics.gpu.temperature')} value={localizeNumbers(`${Math.round(convertTemperature(gpu.temperatureC, monitoringTempUnit))}${tempUnitSymbol(monitoringTempUnit)}`, numberFormat)} />
        <InfoRow label={t('diagnostics.gpu.power')} value={localizeNumbers(`${gpu.powerW.toFixed(0)}W`, numberFormat)} />
        <InfoRow label={t('diagnostics.gpu.tdrCount')} value={gpu.recentTdrCount} tone={gpu.recentTdrCount > 0 ? 'bad' : 'default'} />
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
