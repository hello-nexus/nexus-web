import { useCallback, useState } from 'react';
import { ChevronDown, ChevronRight, ExternalLink, ShieldCheck } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { SectionHeader } from '../../common/SectionHeader/SectionHeader';
import { EmptyState } from '../../common/EmptyState/EmptyState';
import { InfoList, InfoRow } from '../../common/InfoList/InfoList';
import { Button } from '../../common/Button/Button';
import { useToast } from '../../common/Toast/Toast';
import { openDiagnosticsDeviceManager, type DiagnosticsFetchOptions, type DiagnosticsSystemResponse, type PnpProblem } from '../../../api/diagnostics';
import { NotAvailableNote, SectionLoadError } from './DiagnosticsSectionStates';
import { pnpProblemLabel, resolveSectionState } from './diagnosticsHelpers';
import styles from './DiagnosticsView.module.scss';

interface SystemSectionProps {
  data: DiagnosticsSystemResponse | null;
  loading: boolean;
  error: boolean;
  onRefresh: (opts?: DiagnosticsFetchOptions) => void;
}

/** System tab: the Device Manager problem list. Each row expands to its raw
 *  code/text/instance-id, and a header action opens Device Manager itself
 *  (devmgmt.msc, no per-device selection). */
export function SystemSection({ data, loading, error, onRefresh }: SystemSectionProps) {
  const { t } = useTranslation();
  const { push } = useToast();
  const state = resolveSectionState({
    hasData: data !== null,
    loading,
    error,
    supported: data?.supported ?? false,
    isEmpty: false,
  });

  const [opening, setOpening] = useState(false);
  const handleOpenDeviceManager = useCallback(async () => {
    setOpening(true);
    const result = await openDiagnosticsDeviceManager();
    setOpening(false);
    if (!result?.opened) push({ title: t('diagnostics.system.openDeviceManagerFailed') });
  }, [push, t]);

  return (
    <section className={styles.section}>
      {state === 'error' && <SectionLoadError onRetry={() => onRefresh({ force: true })} loading={loading} />}
      {state === 'notSupported' && <NotAvailableNote />}
      {state === 'content' && data && (
        <>
          <div className={styles.sectionHeaderRow}>
            <SectionHeader>{t('diagnostics.system.pnpProblems')}</SectionHeader>
            {data.pnpProblems.length > 0 && (
              <Button
                tone="ghost" size="sm" icon={<ExternalLink size={13} />} loading={opening}
                onClick={() => void handleOpenDeviceManager()}
              >
                {t('diagnostics.system.openDeviceManager')}
              </Button>
            )}
          </div>
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
  const [expanded, setExpanded] = useState(false);
  const toggle = () => setExpanded(e => !e);
  return (
    <li className={styles.pnpItem}>
      <div
        className={styles.pnpItemMain}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={toggle}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggle();
          }
        }}
      >
        <div className={styles.pnpHeaderText}>
          <span className={styles.pnpDeviceName}>{problem.name || t('diagnostics.system.unknownDevice')}</span>
          <span className={styles.pnpExplanation}>{pnpProblemLabel(problem.problemCode, t)}</span>
        </div>
        {expanded
          ? <ChevronDown size={14} className={styles.pnpChevron} aria-hidden />
          : <ChevronRight size={14} className={styles.pnpChevron} aria-hidden />}
      </div>
      {expanded && (
        <div className={styles.pnpDetail}>
          <InfoList>
            <InfoRow label={t('diagnostics.system.problemCodeLabel')} value={String(problem.problemCode)} />
            <InfoRow label={t('diagnostics.system.problemTextLabel')} value={problem.problemText} />
            <InfoRow label={t('diagnostics.system.deviceIdLabel')} value={problem.deviceId} />
          </InfoList>
        </div>
      )}
    </li>
  );
}
