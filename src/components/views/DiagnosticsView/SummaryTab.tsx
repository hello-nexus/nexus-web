import { Download, RefreshCw } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import type {
  DiagnosticsFetchOptions,
  DiagnosticsHealth,
  DiagnosticsKind,
} from '../../../api/diagnostics';
import { Card } from '../../common/Card/Card';
import { Button } from '../../common/Button/Button';
import { Badge } from '../../common/Badge/Badge';
import { ComponentHealthGrid } from './ComponentHealthGrid';
import { NotAvailableNote, SectionLoadError } from './DiagnosticsSectionStates';
import { GenericSkeleton } from '../PageSkeleton/PageSkeleton';
import { relativeTimeLabel, statusColor, statusLabelKey } from './diagnosticsHelpers';
import styles from './DiagnosticsView.module.scss';

interface SummaryTabProps {
  health: DiagnosticsHealth | null;
  healthLoading: boolean;
  healthError: boolean;
  refreshHealth: (opts?: DiagnosticsFetchOptions) => void;
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
  health, healthLoading, healthError, refreshHealth, anyMocked, anyLoading, onRefreshAll, now,
  onNavigate, downloading, downloadingReport, onDownload, onDownloadReport,
}: SummaryTabProps) {
  const { t } = useTranslation();

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
              {t('settings.diagnostics.supportBundleButton')}
            </Button>
          </div>
        </div>
      </Card>

      {!health ? (
        healthError ? <SectionLoadError onRetry={() => refreshHealth({ force: true })} loading={healthLoading} /> : <GenericSkeleton />
      ) : !health.supported ? <NotAvailableNote /> : (
        <ComponentHealthGrid components={health.components} onNavigate={onNavigate} />
      )}
    </>
  );
}
