import { useCallback, useEffect, useState } from 'react';
import { MemoryStick } from 'lucide-react';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { useTranslation } from '../../../lib/i18n';
import { localizeNumbers } from '../../../lib/units';
import { EmptyState } from '../../common/EmptyState/EmptyState';
import { Badge } from '../../common/Badge/Badge';
import { Button } from '../../common/Button/Button';
import { ConfirmModal } from '../../common/ConfirmModal/ConfirmModal';
import { useToast } from '../../common/Toast/Toast';
import { cancelMemoryTest, scheduleMemoryTest, type DiagnosticsFetchOptions, type DiagnosticsMemoryResponse } from '../../../api/diagnostics';
import { NotAvailableNote, SectionLoadError } from './DiagnosticsSectionStates';
import { formatBytes, relativeTimeLabel, resolveSectionState } from './diagnosticsHelpers';
import styles from './DiagnosticsView.module.scss';

interface MemorySectionProps {
  data: DiagnosticsMemoryResponse | null;
  loading: boolean;
  error: boolean;
  onRefresh: (opts?: DiagnosticsFetchOptions) => void;
}

export function MemorySection({ data, loading, error, onRefresh }: MemorySectionProps) {
  const { t } = useTranslation();
  const { numberFormat } = useUnitPrefs();
  const { push } = useToast();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { setNow(Date.now()); }, [data]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const state = resolveSectionState({
    hasData: data !== null,
    loading,
    error,
    supported: data?.supported ?? false,
    isEmpty: (data?.modules.length ?? 0) === 0,
  });

  const handleSchedule = useCallback(async () => {
    setConfirmOpen(false);
    setBusy(true);
    const res = await scheduleMemoryTest();
    setBusy(false);
    push({ title: t(res.data?.scheduled ? 'diagnostics.memory.scheduledToast' : 'diagnostics.memory.scheduleFailed') });
    if (res.data?.scheduled) onRefresh();
  }, [onRefresh, push, t]);

  const handleCancel = useCallback(async () => {
    setCancelConfirmOpen(false);
    setBusy(true);
    const res = await cancelMemoryTest();
    setBusy(false);
    push({ title: t(res.data && !res.data.scheduled ? 'diagnostics.memory.cancelledToast' : 'diagnostics.memory.cancelFailed') });
    if (res.data && !res.data.scheduled) onRefresh();
  }, [onRefresh, push, t]);

  const lastTestLabel = data?.lastTest
    ? `${t(`diagnostics.memory.testResult.${data.lastTest.result}`)} (${relativeTimeLabel(data.lastTest.timeUtc, now, t)})`
    : t('diagnostics.memory.testResult.never');

  return (
    <section className={styles.section}>
      {state === 'error' && <SectionLoadError onRetry={() => onRefresh({ force: true })} loading={loading} />}
      {state === 'notSupported' && <NotAvailableNote />}
      {state === 'empty' && <EmptyState compact icon={<MemoryStick size={22} />} title={t('diagnostics.memory.empty')} />}
      {state === 'content' && data && (
        <>
          <table className={styles.moduleTable}>
            <thead>
              <tr>
                <th>{t('diagnostics.memory.col.slot')}</th>
                <th>{t('diagnostics.memory.col.size')}</th>
                <th>{t('diagnostics.memory.col.speed')}</th>
                <th>{t('diagnostics.memory.col.manufacturer')}</th>
                <th>{t('diagnostics.memory.col.partNumber')}</th>
              </tr>
            </thead>
            <tbody>
              {data.modules.map((module, i) => (
                <tr key={i}>
                  <td>{module.slot}</td>
                  <td>{formatBytes(module.sizeBytes, numberFormat)}</td>
                  <td>{localizeNumbers(`${module.configuredSpeedMts} MT/s`, numberFormat)}</td>
                  <td>{module.manufacturer}</td>
                  <td>{module.partNumber}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className={styles.memoryMetaRow}>
            {data.xmpLikelyActive === true && <Badge label={t('diagnostics.memory.xmpActive')} color="var(--accent)" />}
            <span>{t('diagnostics.memory.lastTest')}: {lastTestLabel}</span>
          </div>

          <div className={styles.testActions}>
            {data.testScheduled ? (
              <>
                <Badge label={t('diagnostics.memory.testScheduled')} color="var(--warn)" />
                <Button tone="ghost" size="sm" loading={busy} onClick={() => setCancelConfirmOpen(true)}>
                  {t('diagnostics.memory.cancelTest')}
                </Button>
              </>
            ) : (
              <Button tone="neutral" size="sm" loading={busy} onClick={() => setConfirmOpen(true)}>
                {t('diagnostics.memory.runTest')}
              </Button>
            )}
          </div>
        </>
      )}

      <ConfirmModal
        open={confirmOpen}
        title={t('diagnostics.memory.confirmTitle')}
        message={t('diagnostics.memory.confirmMessage')}
        confirmLabel={t('diagnostics.memory.confirmButton')}
        destructive={false}
        onConfirm={handleSchedule}
        onCancel={() => setConfirmOpen(false)}
      />
      <ConfirmModal
        open={cancelConfirmOpen}
        title={t('diagnostics.memory.cancelConfirmTitle')}
        message={t('diagnostics.memory.cancelConfirmMessage')}
        confirmLabel={t('diagnostics.memory.cancelTest')}
        destructive={false}
        onConfirm={handleCancel}
        onCancel={() => setCancelConfirmOpen(false)}
      />
    </section>
  );
}
