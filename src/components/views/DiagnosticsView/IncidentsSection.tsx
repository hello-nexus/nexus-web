import { useEffect, useMemo, useState } from 'react';
import type { ComponentType } from 'react';
import { ChevronDown, ChevronRight, Gamepad2, History, Info, OctagonAlert, RefreshCw, TriangleAlert } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { SectionHeader } from '../../common/SectionHeader/SectionHeader';
import { EmptyState } from '../../common/EmptyState/EmptyState';
import { Badge } from '../../common/Badge/Badge';
import { Button } from '../../common/Button/Button';
import { ChipGroup, type ChipOption } from '../../common/ChipGroup/ChipGroup';
import type { DiagnosticsIncident, DiagnosticsIncidentSeverity, DiagnosticsIncidentsResponse } from '../../../api/diagnostics';
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
const PAGE_SIZE = 20;

export function IncidentsSection({ data, loading, error, onRefresh }: IncidentsSectionProps) {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { setNow(Date.now()); }, [data]);
  const [sourceFilter, setSourceFilter] = useState(ALL_SOURCES_KEY);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  // Reset the reveal depth during render (not an effect) when the filter or
  // the underlying data changes, so the narrowed/reshuffled set never paints
  // with a stale (possibly too-large) visibleCount from a prior "Show more".
  const [prevResetKey, setPrevResetKey] = useState({ data, sourceFilter });
  if (prevResetKey.data !== data || prevResetKey.sourceFilter !== sourceFilter) {
    setPrevResetKey({ data, sourceFilter });
    setVisibleCount(PAGE_SIZE);
  }

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

  const paged = filtered.slice(0, visibleCount);
  const hasMore = filtered.length > paged.length;

  const chipOptions: ChipOption[] = [
    { key: ALL_SOURCES_KEY, label: t('diagnostics.incidents.filter.all') },
    ...presentSources.map(source => ({ key: source, label: t(incidentSourceLabelKey(source)) })),
  ];

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeaderRow}>
        <SectionHeader>{t('diagnostics.incidents.title')}</SectionHeader>
        <Button tone="ghost" size="sm" icon={<RefreshCw size={13} />} loading={loading} title={t('diagnostics.refresh')} aria-label={t('diagnostics.refresh')} onClick={() => onRefresh()} />
      </div>
      {state === 'error' && <SectionLoadError onRetry={() => onRefresh()} loading={loading} />}
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
            {paged.map(incident => <IncidentRow key={incident.id} incident={incident} now={now} />)}
          </div>
          {filtered.length > PAGE_SIZE && (
            <div className={styles.incidentsPager}>
              <span className={styles.incidentsPagerCount}>
                {t('diagnostics.incidents.shownOfTotal', { shown: String(paged.length), total: String(filtered.length) })}
              </span>
              {hasMore && (
                <Button tone="ghost" size="sm" onClick={() => setVisibleCount(c => c + PAGE_SIZE)}>
                  {t('diagnostics.incidents.showMore')}
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function IncidentRow({ incident, now }: { incident: DiagnosticsIncident; now: number }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const Icon = SEVERITY_ICON[incident.severity];
  const hasDetail = Boolean(incident.detail) || incident.app !== null || incident.repeatCount > 1;

  const toggle = () => setExpanded(e => !e);
  const summary = (
    <>
      <span className={styles.incidentIcon} style={{ color: incidentSeverityColor(incident.severity) }}>
        <Icon size={16} aria-hidden />
      </span>
      <Badge label={t(incidentSourceLabelKey(incident.source))} color="var(--text-dim)" />
      <span className={styles.incidentTitle}>{incident.title}</span>
      {incident.repeatCount > 1 && (
        <Badge label={t('diagnostics.incidents.repeatCount', { n: String(incident.repeatCount) })} color="var(--text-dim)" />
      )}
      <span className={styles.incidentTime}>{relativeTimeLabel(incident.timeUtc, now, t)}</span>
      {hasDetail && (
        expanded
          ? <ChevronDown size={14} className={styles.incidentChevron} aria-hidden />
          : <ChevronRight size={14} className={styles.incidentChevron} aria-hidden />
      )}
    </>
  );

  return (
    <div className={styles.incidentRow}>
      {hasDetail ? (
        <div
          className={styles.incidentSummary}
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
          {summary}
        </div>
      ) : (
        <div className={styles.incidentSummary}>{summary}</div>
      )}
      {expanded && hasDetail && (
        <div className={styles.incidentDetailBody}>
          {incident.app?.isGame && (
            <Badge label={t('diagnostics.incidents.game')} color="var(--accent)" icon={<Gamepad2 size={11} />} />
          )}
          {incident.detail && <div className={styles.incidentDetail}>{incident.detail}</div>}
          {incident.app && (
            <div className={styles.incidentDetail}>{`${incident.app.name} - ${incident.app.path}`}</div>
          )}
          {incident.app && (incident.app.faultingModule || incident.app.exceptionCode) && (
            <div className={styles.incidentDetail}>{`${incident.app.faultingModule} (${incident.app.exceptionCode})`}</div>
          )}
          {incident.repeatCount > 1 && incident.firstUtc && (
            <div className={styles.incidentDetail}>
              {t('diagnostics.incidents.firstSeen', { time: relativeTimeLabel(incident.firstUtc, now, t) })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
