import { ShieldCheck } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { SectionHeader } from '../../common/SectionHeader/SectionHeader';
import { EmptyState } from '../../common/EmptyState/EmptyState';
import { InfoList, InfoRow } from '../../common/InfoList/InfoList';
import { InfoTooltip } from '../../common/InfoTooltip/InfoTooltip';
import type { DiagnosticsFetchOptions, DiagnosticsSystemResponse, PnpProblem } from '../../../api/diagnostics';
import { NotAvailableNote, SectionLoadError } from './DiagnosticsSectionStates';
import { pnpProblemLabel, resolveSectionState } from './diagnosticsHelpers';
import styles from './DiagnosticsView.module.scss';

interface SystemSectionProps {
  data: DiagnosticsSystemResponse | null;
  loading: boolean;
  error: boolean;
  onRefresh: (opts?: DiagnosticsFetchOptions) => void;
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
      {state === 'error' && <SectionLoadError onRetry={() => onRefresh({ force: true })} loading={loading} />}
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
            <InfoRow label={t('diagnostics.system.counts.appCrashes')} value={data.counts30d.appCrashes} />
          </InfoList>

          <SectionHeader>{t('diagnostics.system.pnpProblems')}</SectionHeader>
          <div className={styles.reasonSummary}>{t('diagnostics.system.pnpDescription')}</div>
          {data.pnpProblems.length === 0 ? (
            <EmptyState compact icon={<ShieldCheck size={22} />} title={t('diagnostics.system.pnpEmpty')} />
          ) : (
            <ul className={styles.pnpList}>
              {data.pnpProblems.map((problem, i) => <PnpProblemRow key={i} problem={problem} />)}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function PnpProblemRow({ problem }: { problem: PnpProblem }) {
  const { t } = useTranslation();
  const tooltipMessage = `${t('diagnostics.system.problemCode', { code: String(problem.problemCode) })}: ${problem.problemText} · ${problem.deviceId}`;
  return (
    <li className={styles.pnpItem}>
      <div className={styles.pnpItemRow}>
        <span className={styles.pnpDeviceName}>{problem.name || t('diagnostics.system.unknownDevice')}</span>
        <InfoTooltip message={tooltipMessage} side="top" />
      </div>
      <span className={styles.pnpExplanation}>{pnpProblemLabel(problem.problemCode, t)}</span>
    </li>
  );
}
