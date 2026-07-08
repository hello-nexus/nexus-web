import { useCallback, useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import type { ConnectionState } from '../../../hooks/useServiceStatus';
import { useDiagnosticsHealth } from '../../../hooks/useDiagnosticsHealth';
import { useDiagnosticsResource } from '../../../hooks/useDiagnosticsResource';
import {
  downloadDiagnosticsBundle,
  fetchDiagnosticsCooling,
  fetchDiagnosticsGpu,
  fetchDiagnosticsIncidents,
  fetchDiagnosticsMemory,
  fetchDiagnosticsSmart,
  fetchDiagnosticsSystem,
} from '../../../api/diagnostics';
import { ViewHeader } from '../../common/ViewHeader/ViewHeader';
import { Button } from '../../common/Button/Button';
import { Badge } from '../../common/Badge/Badge';
import { useToast } from '../../common/Toast/Toast';
import { ServiceRequired } from '../ServiceRequired';
import { GenericSkeleton } from '../PageSkeleton/PageSkeleton';
import { ComponentHealthGrid } from './ComponentHealthGrid';
import { NotAvailableNote, SectionLoadError } from './DiagnosticsSectionStates';
import { StorageSection } from './StorageSection';
import { MemorySection } from './MemorySection';
import { GpuSection } from './GpuSection';
import { CoolingSection } from './CoolingSection';
import { SystemSection } from './SystemSection';
import { IncidentsSection } from './IncidentsSection';
import { relativeTimeLabel, statusColor, statusLabelKey } from './diagnosticsHelpers';
import styles from './DiagnosticsView.module.scss';

interface DiagnosticsViewProps {
  serviceOnline: boolean;
  connectionState?: ConnectionState;
}

const INCIDENT_WINDOW_DAYS = 30;

export function DiagnosticsView({ serviceOnline, connectionState }: DiagnosticsViewProps) {
  const { t } = useTranslation();
  const { push } = useToast();
  const { health, loading: healthLoading, error: healthError, mocked: healthMocked, refresh: refreshHealth } = useDiagnosticsHealth(serviceOnline);
  // Re-snapshot "now" whenever a fresh poll lands, so the header's relative
  // time stays current without calling Date.now() during render (impure).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { setNow(Date.now()); }, [health]);

  const smart = useDiagnosticsResource(serviceOnline, fetchDiagnosticsSmart);
  const memory = useDiagnosticsResource(serviceOnline, fetchDiagnosticsMemory);
  const gpu = useDiagnosticsResource(serviceOnline, fetchDiagnosticsGpu);
  const cooling = useDiagnosticsResource(serviceOnline, fetchDiagnosticsCooling);
  const system = useDiagnosticsResource(serviceOnline, fetchDiagnosticsSystem);
  const incidents = useDiagnosticsResource(serviceOnline, useCallback(() => fetchDiagnosticsIncidents(INCIDENT_WINDOW_DAYS), []));

  const anyMocked = healthMocked || smart.mocked || memory.mocked || gpu.mocked
    || cooling.mocked || system.mocked || incidents.mocked;

  const [downloading, setDownloading] = useState(false);
  const handleDownload = useCallback(async () => {
    setDownloading(true);
    const ok = await downloadDiagnosticsBundle();
    setDownloading(false);
    if (!ok) push({ title: t('diagnostics.header.downloadFailed') });
  }, [push, t]);

  if (!serviceOnline) {
    return (
      <div className={styles.diagnostics}>
        <ViewHeader title={t('diagnostics.title')} />
        <ServiceRequired state={connectionState} skeleton={<GenericSkeleton />} />
      </div>
    );
  }

  return (
    <div className={styles.diagnostics}>
      <ViewHeader
        title={t('diagnostics.title')}
        actions={
          <>
            {health && (
              <div className={styles.headerStatus}>
                <Badge label={t(statusLabelKey(health.overall))} color={statusColor(health.overall)} />
                <span className={styles.generatedAt}>
                  {t('diagnostics.header.generatedAt', { time: relativeTimeLabel(health.generatedAt, now, t) })}
                </span>
              </div>
            )}
            {anyMocked && <Badge label={t('diagnostics.mockDataBadge')} color="var(--warn)" />}
            <Button tone="neutral" size="sm" icon={<Download size={14} />} loading={downloading} onClick={handleDownload}>
              {t('diagnostics.header.downloadBundle')}
            </Button>
          </>
        }
      />
      <div className="pageBody">
        {!health ? (
          healthError ? <SectionLoadError onRetry={() => refreshHealth({ force: true })} loading={healthLoading} /> : <GenericSkeleton />
        ) : !health.supported ? <NotAvailableNote /> : (
          <ComponentHealthGrid components={health.components} />
        )}

        <StorageSection data={smart.data} loading={smart.loading} error={smart.error} onRefresh={smart.refresh} />
        <MemorySection data={memory.data} loading={memory.loading} error={memory.error} onRefresh={memory.refresh} />
        <GpuSection data={gpu.data} loading={gpu.loading} error={gpu.error} onRefresh={gpu.refresh} />
        <CoolingSection data={cooling.data} loading={cooling.loading} error={cooling.error} onRefresh={cooling.refresh} />
        <SystemSection data={system.data} loading={system.loading} error={system.error} onRefresh={system.refresh} />
        <IncidentsSection data={incidents.data} loading={incidents.loading} error={incidents.error} onRefresh={incidents.refresh} />
      </div>
    </div>
  );
}
