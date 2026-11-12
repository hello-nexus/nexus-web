import { FileText, PackageOpen, RefreshCw } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from '../../../lib/i18n';
import { useSensorAlerts } from '../../../hooks/useSensorAlerts';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import type {
  DiagnosticsFetchOptions,
  DiagnosticsHealth,
  DiagnosticsKind,
  DiagnosticsMemoryResponse,
  DiagnosticsSmartResponse,
  DiagnosticsSystemResponse,
} from '../../../api/diagnostics';
import { Card } from '../../common/Card/Card';
import { Button } from '../../common/Button/Button';
import { Badge } from '../../common/Badge/Badge';
import { ComponentHealthGrid } from './ComponentHealthGrid';
import { NotAvailableNote, SectionLoadError } from './DiagnosticsSectionStates';
import { GenericSkeleton } from '../PageSkeleton/PageSkeleton';
import { memoryDetail, sensorsDetail, storageDetail, systemDetail } from './summaryDetails';
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
  /** The tabs' own data, for the facts an OK card shows. */
  smartData: DiagnosticsSmartResponse | null;
  memoryData: DiagnosticsMemoryResponse | null;
  systemData: DiagnosticsSystemResponse | null;
}

export function SummaryTab({
  health, healthLoading, healthError, refreshHealth, anyMocked, anyLoading, onRefreshAll, now,
  onNavigate, downloading, downloadingReport, onDownload, onDownloadReport,
  smartData, memoryData, systemData,
}: SummaryTabProps) {
  const { t, language } = useTranslation();
  const { monitoringTempUnit: tempUnit, numberFormat, monitoringWholeNumbers: wholeNumbers } = useUnitPrefs();
  const { rules, states } = useSensorAlerts(true);
  const details = useMemo(() => {
    const ctx = { t, language, tempUnit, numberFormat, wholeNumbers };
    return {
      cooling: sensorsDetail(rules, states, ctx),
      storage: smartData ? storageDetail(smartData.drives, ctx) : null,
      memory: memoryData ? memoryDetail(memoryData, now, ctx) : null,
      system: systemData ? systemDetail(systemData, ctx) : null,
    };
  }, [t, language, tempUnit, numberFormat, wholeNumbers, rules, states, smartData, memoryData, systemData, now]);

  return (
    <>
      <Card className={styles.summaryStrip}>
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
            <Button tone="neutral" size="sm" icon={<FileText size={14} aria-hidden />} loading={downloadingReport} onClick={onDownloadReport}>
              {t('diagnostics.header.downloadReport')}
            </Button>
            <Button tone="neutral" size="sm" icon={<PackageOpen size={14} aria-hidden />} loading={downloading} onClick={onDownload}>
              {t('settings.diagnostics.supportBundleButton')}
            </Button>
          </div>
        </div>
      </Card>

      {!health ? (
        healthError ? <SectionLoadError onRetry={() => refreshHealth({ force: true })} loading={healthLoading} /> : <GenericSkeleton />
      ) : !health.supported ? <NotAvailableNote /> : (
        <ComponentHealthGrid components={health.components} onNavigate={onNavigate} details={details} />
      )}
    </>
  );
}
