import { useEffect, useMemo, useState } from 'react';
import type { ComponentType } from 'react';
import { Gamepad2, History, Info, OctagonAlert, RefreshCw, TriangleAlert } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { SectionHeader } from '../../common/SectionHeader/SectionHeader';
import { EmptyState } from '../../common/EmptyState/EmptyState';
import { Badge } from '../../common/Badge/Badge';
import { Button } from '../../common/Button/Button';
import { ChipGroup, type ChipOption } from '../../common/ChipGroup/ChipGroup';
import type { DiagnosticsIncidentSeverity, DiagnosticsIncidentsResponse } from '../../../api/diagnostics';
import { NotAvailableNote, SectionLoadError } from './DiagnosticsSectionStates';
import { incidentSeverityColor, incidentSourceLabelKey, relativeTimeLabel, resolveSectionState } from './diagnosticsHelpers';
import styles from './DiagnosticsView.module.scss';

interface IncidentsSectionProps {
  data: DiagnosticsIncidentsResponse | null;
  loading: boolean;
  error: boolean;
  onRefresh: () => void;
}

const SEVERITY_ICON: Record<DiagnosticsIncidentSeverity, ComponentType<{ size?: number }>> = {
  critical: OctagonAlert,
  warning: TriangleAlert,
  info: Info,
};

const ALL_SOURCES_KEY = 'all';

export function IncidentsSection({ data, loading, error, onRefresh }: IncidentsSectionProps) {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { setNow(Date.now()); }, [data]);
  const [sourceFilter, setSourceFilter] = useState(ALL_SOURCES_KEY);

  const state = resolveSectionState({
    hasData: data !== null,
    loading,
    error,
    supported: data?.supported ?? false,
    isEmpty: (data?.incidents.length ?? 0) === 0,
  });

  const presentSources = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.incidents.map(incident => incident.source)));
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    if (sourceFilter === ALL_SOURCES_KEY) return data.incidents;
    return data.incidents.filter(incident => incident.source === sourceFilter);
  }, [data, sourceFilter]);

  const chipOptions: ChipOption[] = [
    { key: ALL_SOURCES_KEY, label: t('diagnostics.incidents.filter.all') },
    ...presentSources.map(source => ({ key: source, label: t(incidentSourceLabelKey(source)) })),
  ];

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeaderRow}>
        <SectionHeader>{t('diagnostics.incidents.title')}</SectionHeader>
        <Button tone="ghost" size="sm" icon={<RefreshCw size={13} />} title={t('diagnostics.refresh')} aria-label={t('diagnostics.refresh')} onClick={onRefresh} />
      </div>
      {state === 'error' && <SectionLoadError onRetry={onRefresh} />}
      {state === 'notSupported' && <NotAvailableNote />}
      {state === 'empty' && (
        <EmptyState
          compact
          icon={<History size={22} />}
          title={t('diagnostics.incidents.empty', { days: String(data?.windowDays ?? 30) })}
        />
      )}
      {state === 'content' && data && (
        <>
          {presentSources.length > 1 && (
            <div className={styles.incidentFilters}>
              <ChipGroup
                options={chipOptions}
                activeKey={sourceFilter}
                onChange={setSourceFilter}
                ariaLabel={t('diagnostics.incidents.title')}
              />
            </div>
          )}
          <div className={styles.incidentsList}>
            {filtered.map(incident => {
              const Icon = SEVERITY_ICON[incident.severity];
              return (
                <div key={incident.id} className={styles.incidentRow}>
                  <span className={styles.incidentIcon} style={{ color: incidentSeverityColor(incident.severity) }}>
                    <Icon size={16} aria-hidden />
                  </span>
                  <div className={styles.incidentBody}>
                    <div className={styles.incidentTitleRow}>
                      <span className={styles.incidentTitle}>{incident.title}</span>
                      <Badge label={t(incidentSourceLabelKey(incident.source))} color="var(--text-dim)" />
                      {incident.app?.isGame && (
                        <Badge label={t('diagnostics.incidents.game')} color="var(--accent)" icon={<Gamepad2 size={11} />} />
                      )}
                    </div>
                    {incident.app && <div className={styles.incidentDetail}>{incident.app.name}</div>}
                    {incident.detail && <div className={styles.incidentDetail}>{incident.detail}</div>}
                  </div>
                  <span className={styles.incidentTime}>{relativeTimeLabel(incident.timeUtc, now, t)}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
