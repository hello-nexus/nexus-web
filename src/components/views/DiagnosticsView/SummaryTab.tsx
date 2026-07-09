import { useMemo } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import type {
  DiagnosticsFetchOptions,
  DiagnosticsGpuResponse,
  DiagnosticsHealth,
  DiagnosticsKind,
  DiagnosticsMemoryResponse,
} from '../../../api/diagnostics';
import type { SystemSpecs } from '../../../hooks/useSystemSpecs';
import { Card } from '../../common/Card/Card';
import { Button } from '../../common/Button/Button';
import { Badge } from '../../common/Badge/Badge';
import { InfoList, InfoRow } from '../../common/InfoList/InfoList';
import { SectionHeader } from '../../common/SectionHeader/SectionHeader';
import { ComponentHealthGrid } from './ComponentHealthGrid';
import { NotAvailableNote, SectionLoadError } from './DiagnosticsSectionStates';
import { GenericSkeleton } from '../PageSkeleton/PageSkeleton';
import { buildSpecRows, relativeTimeLabel, statusColor, statusLabelKey } from './diagnosticsHelpers';
import styles from './DiagnosticsView.module.scss';

interface SummaryTabProps {
  health: DiagnosticsHealth | null;
  healthLoading: boolean;
  healthError: boolean;
  refreshHealth: (opts?: DiagnosticsFetchOptions) => void;
  memory: DiagnosticsMemoryResponse | null;
  gpu: DiagnosticsGpuResponse | null;
  specs: SystemSpecs | null;
  anyMocked: boolean;
  anyLoading: boolean;
  onRefreshAll: () => void;
  now: number;
  onNavigate: (kind: DiagnosticsKind) => void;
  downloading: boolean;
  downloadingReport: boolean;
  onDownload: () => void;
  onDownloadReport: () => void;
}

export function SummaryTab({
  health, healthLoading, healthError, refreshHealth, memory, gpu, specs, anyMocked, anyLoading, onRefreshAll, now,
  onNavigate, downloading, downloadingReport, onDownload, onDownloadReport,
}: SummaryTabProps) {
  const { t } = useTranslation();
  const specRows = useMemo(() => buildSpecRows(specs, memory, gpu, t), [specs, memory, gpu, t]);

  return (
    <>
      <Card>
        <div className={styles.actionBarRow}>
          <div className={styles.actionBarStatus}>
            {health && (
              <>
                <Badge label={t(statusLabelKey(health.overall))} color={statusColor(health.overall)} />
                <span className={styles.generatedAt}>
                  {t('diagnostics.header.generatedAt', { time: relativeTimeLabel(health.generatedAt, now, t) })}
                </span>
              </>
            )}
            {anyMocked && <Badge label={t('diagnostics.mockDataBadge')} color="var(--warn)" />}
          </div>
          <div className={styles.actionBarButtons}>
            <Button tone="neutral" size="sm" icon={<RefreshCw size={14} />} loading={anyLoading} onClick={onRefreshAll}>
              {t('diagnostics.refresh')}
            </Button>
            <Button tone="neutral" size="sm" icon={<Download size={14} />} loading={downloadingReport} onClick={onDownloadReport}>
              {t('diagnostics.header.downloadReport')}
            </Button>
            <Button tone="neutral" size="sm" icon={<Download size={14} />} loading={downloading} onClick={onDownload}>
              {t('diagnostics.header.downloadBundle')}
            </Button>
          </div>
        </div>
      </Card>

      {!health ? (
        healthError ? <SectionLoadError onRetry={() => refreshHealth({ force: true })} loading={healthLoading} /> : <GenericSkeleton />
      ) : !health.supported ? <NotAvailableNote /> : (
        <ComponentHealthGrid components={health.components} onNavigate={onNavigate} />
      )}

      {specRows.length > 0 && (
        <section className={styles.section}>
          <SectionHeader>{t('diagnostics.specs.title')}</SectionHeader>
          <InfoList>
            {specRows.map(row => <InfoRow key={row.label} label={row.label} value={row.value} />)}
          </InfoList>
        </section>
      )}
    </>
  );
}
