import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ComponentType } from 'react';
import { ChevronDown, ChevronRight, ExternalLink, Gamepad2, History, Info, OctagonAlert, Trash2, TriangleAlert } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { SectionHeader } from '../../common/SectionHeader/SectionHeader';
import { EmptyState } from '../../common/EmptyState/EmptyState';
import { Badge } from '../../common/Badge/Badge';
import { Button } from '../../common/Button/Button';
import { ChipGroup, type ChipOption } from '../../common/ChipGroup/ChipGroup';
import { ConfirmModal } from '../../common/ConfirmModal/ConfirmModal';
import { useToast } from '../../common/Toast/Toast';
import {
  clearDiagnosticsEventLogs,
  openDiagnosticsEventViewer,
  type DiagnosticsIncident,
  type DiagnosticsIncidentSeverity,
  type DiagnosticsIncidentsResponse,
} from '../../../api/diagnostics';
import { NotAvailableNote, SectionLoadError } from './DiagnosticsSectionStates';
import { incidentAppFaultLine, incidentSeverityColor, incidentSourceLabelKey, relativeTimeLabel, resolveSectionState } from './diagnosticsHelpers';
import styles from './DiagnosticsView.module.scss';

interface IncidentsSectionProps {
  data: DiagnosticsIncidentsResponse | null;
  loading: boolean;
  error: boolean;
  onRefresh: () => void;
  /** Called after a successful log clear, in addition to this section's own
   *  onRefresh - the health overview and System section's counts also read
   *  from data the clear just invalidated. */
  onLogsCleared: () => void;
}

const SEVERITY_ICON: Record<DiagnosticsIncidentSeverity, ComponentType<{ size?: number }>> = {
  critical: OctagonAlert,
  warning: TriangleAlert,
  info: Info,
};

const ALL_SOURCES_KEY = 'all';
const PAGE_SIZE = 20;

export function IncidentsSection({ data, loading, error, onRefresh, onLogsCleared }: IncidentsSectionProps) {
  const { t } = useTranslation();
  const { push } = useToast();
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

  const [openingViewer, setOpeningViewer] = useState(false);
  const handleOpenEventViewer = useCallback(async () => {
    setOpeningViewer(true);
    const result = await openDiagnosticsEventViewer();
    setOpeningViewer(false);
    if (!result?.opened) push({ title: t('diagnostics.incidents.openEventViewerFailed') });
  }, [push, t]);

  const [clearLogsConfirmOpen, setClearLogsConfirmOpen] = useState(false);
  const [clearingLogs, setClearingLogs] = useState(false);
  const handleClearLogs = useCallback(async () => {
    setClearLogsConfirmOpen(false);
    setClearingLogs(true);
    const result = await clearDiagnosticsEventLogs();
    setClearingLogs(false);
    if (!result) {
      push({ title: t('diagnostics.incidents.clearLogsFailed') });
      return;
    }
    // A completed request can still leave `cleared: false` (one log failed)
    // while having wiped the other, so every affected section resyncs
    // regardless of the outcome.
    onRefresh();
    onLogsCleared();
    if (result.cleared) {
      push({ title: t('diagnostics.incidents.clearLogsSuccess') });
    } else {
      const detail = [result.systemError, result.applicationError].filter(Boolean).join('; ');
      push({
        title: detail
          ? t('diagnostics.incidents.clearLogsFailedDetail', { detail })
          : t('diagnostics.incidents.clearLogsFailed'),
      });
    }
  }, [onLogsCleared, onRefresh, push, t]);

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeaderRow}>
        <SectionHeader>{t('diagnostics.incidents.title')}</SectionHeader>
        {data?.supported && (
          <div className={styles.incidentsHeaderActions}>
            <Button
              tone="ghost" size="sm" icon={<ExternalLink size={13} />} loading={openingViewer}
              onClick={() => void handleOpenEventViewer()}
            >
              {t('diagnostics.incidents.openEventViewer')}
            </Button>
            <Button
              tone="danger" size="sm" icon={<Trash2 size={13} />} loading={clearingLogs}
              onClick={() => setClearLogsConfirmOpen(true)}
            >
              {t('diagnostics.incidents.clearLogs')}
            </Button>
          </div>
        )}
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

      <ConfirmModal
        open={clearLogsConfirmOpen}
        title={t('diagnostics.incidents.clearLogsConfirmTitle')}
        message={t('diagnostics.incidents.clearLogsConfirmMessage')}
        bullets={[t('diagnostics.incidents.clearLogsBullet1'), t('diagnostics.incidents.clearLogsBullet2')]}
        note={t('diagnostics.incidents.clearLogsNote')}
        // eslint-disable-next-line i18next/no-literal-string -- note tone enum value
        noteTone="danger"
        confirmLabel={t('diagnostics.incidents.clearLogs')}
        onConfirm={() => void handleClearLogs()}
        onCancel={() => setClearLogsConfirmOpen(false)}
      />
    </section>
  );
}

function IncidentRow({ incident, now }: { incident: DiagnosticsIncident; now: number }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const Icon = SEVERITY_ICON[incident.severity];
  const hasDetail = Boolean(incident.detail) || incident.app !== null || incident.repeatCount > 1;
  const appFaultLine = incident.app ? incidentAppFaultLine(incident.app) : null;

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
          {appFaultLine && <div className={styles.incidentDetail}>{appFaultLine}</div>}
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
