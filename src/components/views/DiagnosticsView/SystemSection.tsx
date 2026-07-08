import { RefreshCw, ShieldCheck } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { SectionHeader } from '../../common/SectionHeader/SectionHeader';
import { EmptyState } from '../../common/EmptyState/EmptyState';
import { Button } from '../../common/Button/Button';
import { InfoList, InfoRow } from '../../common/InfoList/InfoList';
import type { DiagnosticsSystemResponse } from '../../../api/diagnostics';
import { NotAvailableNote, SectionLoadError } from './DiagnosticsSectionStates';
import { resolveSectionState } from './diagnosticsHelpers';
import styles from './DiagnosticsView.module.scss';

interface SystemSectionProps {
  data: DiagnosticsSystemResponse | null;
  loading: boolean;
  error: boolean;
  onRefresh: () => void;
}

export function SystemSection({ data, loading, error, onRefresh }: SystemSectionProps) {
  const { t } = useTranslation();
  const state = resolveSectionState({
    hasData: data !== null,
    loading,
    error,
    supported: data?.supported ?? false,
    isEmpty: false,
  });

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeaderRow}>
        <SectionHeader>{t('diagnostics.kind.system')}</SectionHeader>
        <Button tone="ghost" size="sm" icon={<RefreshCw size={13} />} title={t('diagnostics.refresh')} aria-label={t('diagnostics.refresh')} onClick={onRefresh} />
      </div>
      {state === 'error' && <SectionLoadError onRetry={onRefresh} />}
      {state === 'notSupported' && <NotAvailableNote />}
      {state === 'content' && data && (
        <>
          <SectionHeader>{t('diagnostics.system.counts.title')}</SectionHeader>
          <InfoList>
            <InfoRow label={t('diagnostics.system.counts.whea')} value={data.counts30d.whea} />
            <InfoRow label={t('diagnostics.system.counts.bugchecks')} value={data.counts30d.bugchecks} tone={data.counts30d.bugchecks > 0 ? 'bad' : 'default'} />
            <InfoRow label={t('diagnostics.system.counts.dirtyShutdowns')} value={data.counts30d.dirtyShutdowns} />
            <InfoRow label={t('diagnostics.system.counts.diskErrors')} value={data.counts30d.diskErrors} tone={data.counts30d.diskErrors > 0 ? 'bad' : 'default'} />
            <InfoRow label={t('diagnostics.system.counts.tdrs')} value={data.counts30d.tdrs} />
            <InfoRow label={t('diagnostics.system.counts.gpuDriverErrors')} value={data.counts30d.gpuDriverErrors} />
            <InfoRow label={t('diagnostics.system.counts.appCrashes')} value={data.counts30d.appCrashes} />
          </InfoList>

          <SectionHeader>{t('diagnostics.system.pnpProblems')}</SectionHeader>
          {data.pnpProblems.length === 0 ? (
            <EmptyState compact icon={<ShieldCheck size={22} />} title={t('diagnostics.system.pnpEmpty')} />
          ) : (
            <ul className={styles.pnpList}>
              {data.pnpProblems.map((problem, i) => (
                <li key={i} className={styles.pnpItem}>
                  <span>{problem.name}</span>
                  <span className={styles.pnpCode}>
                    {t('diagnostics.system.problemCode', { code: String(problem.problemCode) })} - {problem.problemText}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
