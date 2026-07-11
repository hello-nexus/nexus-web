import { useTranslation } from '../../../lib/i18n';
import { SectionHeader } from '../../common/SectionHeader/SectionHeader';
import { InfoList, InfoRow } from '../../common/InfoList/InfoList';
import type { DiagnosticsCounts30d } from '../../../api/diagnostics';
import styles from './DiagnosticsView.module.scss';

/** The "Last 30 days" event counters (WHEA / bugchecks / dirty shutdowns / disk
 *  errors / TDRs / app crashes). Sits beside the Device problems section under
 *  the System tab's incident timeline. */
export function IncidentCounts({ counts30d }: { counts30d: DiagnosticsCounts30d | null }) {
  const { t } = useTranslation();
  if (!counts30d) return null;
  return (
    <div className={styles.countsBlock}>
      <SectionHeader>{t('diagnostics.system.counts.title')}</SectionHeader>
      <InfoList>
        <InfoRow label={t('diagnostics.system.counts.whea')} value={counts30d.whea} />
        <InfoRow label={t('diagnostics.system.counts.bugchecks')} value={counts30d.bugchecks} tone={counts30d.bugchecks > 0 ? 'bad' : 'default'} />
        <InfoRow label={t('diagnostics.system.counts.dirtyShutdowns')} value={counts30d.dirtyShutdowns} />
        <InfoRow label={t('diagnostics.system.counts.diskErrors')} value={counts30d.diskErrors} tone={counts30d.diskErrors > 0 ? 'bad' : 'default'} />
        <InfoRow label={t('diagnostics.system.counts.tdrs')} value={counts30d.tdrs} />
        <InfoRow label={t('diagnostics.system.counts.appCrashes')} value={counts30d.appCrashes} />
      </InfoList>
    </div>
  );
}
