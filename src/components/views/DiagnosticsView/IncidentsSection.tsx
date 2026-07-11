import { useCallback, useEffect, useMemo, useState, type ComponentType } from 'react';
import { ExternalLink, History, Info, OctagonAlert, Trash2, TriangleAlert } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { SectionHeader } from '../../common/SectionHeader/SectionHeader';
import { EmptyState } from '../../common/EmptyState/EmptyState';
import { Button } from '../../common/Button/Button';
import { ChipGroup, type ChipOption } from '../../common/ChipGroup/ChipGroup';
import { DatePicker } from '../../common/DatePicker/DatePicker';
import { ConfirmModal } from '../../common/ConfirmModal/ConfirmModal';
import { InfoList, InfoRow } from '../../common/InfoList/InfoList';
import { useToast } from '../../common/Toast/Toast';
import { EventTimeline } from '../../common/EventTimeline/EventTimeline';
import { formatTooltipTimestamp } from '../../common/TimeSeriesChart/timeSeriesChartUtils';
import {
  clearDiagnosticsEventLogs,
  openDiagnosticsEventViewer,
  type DiagnosticsCounts30d,
  type DiagnosticsIncidentSeverity,
  type DiagnosticsIncidentsResponse,
} from '../../../api/diagnostics';
import { NotAvailableNote, SectionLoadError } from './DiagnosticsSectionStates';
import { incidentSeverityColor, incidentSourceLabelKey, resolveSectionState } from './diagnosticsHelpers';
import {
  INCIDENT_RANGE_OPTIONS,
  filterIncidentsToDomain,
  incidentEvents,
  incidentLanes,
  incidentTimelineDomain,
  incidentXTickFormat,
  type IncidentRangeHours,
  type IncidentTimelineEvent,
  type IncidentTimelineQuery,
} from './incidentTimelineHelpers';
import { formatTemperatureDayLabel, minSelectableTemperatureDate, temperatureRangeLabelKey, todayIso } from './temperatureHelpers';
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
  /** The 30-day event counters, shown under the timeline. From the system
   *  resource (a different endpoint than incidents), so passed in separately. */
  counts30d: DiagnosticsCounts30d | null;
  hours: IncidentRangeHours;
  date: string | null;
  onHoursChange: (hours: IncidentRangeHours) => void;
  onDateChange: (date: string) => void;
}

const SEVERITY_ICON: Record<DiagnosticsIncidentSeverity, ComponentType<{ size?: number }>> = {
  critical: OctagonAlert,
  warning: TriangleAlert,
  info: Info,
};

/**
 * System tab incidents shown as a swimlane timeline: one lane per incident
 * type, a dot at each event's exact time colored by severity, over the same
 * 24h/3d/7d/14d range + day picker the Cooling temperature chart uses. Hover or
 * tap a dot for the underlying incidents. The 30-day event counters sit under
 * the timeline. Open Event Viewer / Clear Windows event logs stay in the header.
 */
export function IncidentsSection({
  data, loading, error, onRefresh, onLogsCleared, counts30d, hours, date, onHoursChange, onDateChange,
}: IncidentsSectionProps) {
  const { t, language } = useTranslation();
  const { push } = useToast();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { setNow(Date.now()); }, [data]);

  const state = resolveSectionState({
    hasData: data !== null,
    loading,
    error,
    supported: data?.supported ?? false,
    isEmpty: (data?.incidents.length ?? 0) === 0,
  });

  const isDateMode = date !== null;
  const query = useMemo<IncidentTimelineQuery>(() => (date !== null ? { date } : { hours }), [date, hours]);
  const domain = useMemo(() => incidentTimelineDomain(query, now), [query, now]);
  const filtered = useMemo(() => (data ? filterIncidentsToDomain(data.incidents, domain) : []), [data, domain]);
  const lanes = useMemo(() => incidentLanes(filtered, t), [filtered, t]);
  const events = useMemo(() => incidentEvents(filtered), [filtered]);

  const today = todayIso();
  const windowDays = data?.windowDays ?? 30;
  const minDate = minSelectableTemperatureDate(today, windowDays);
  const rangeOptions: ChipOption[] = INCIDENT_RANGE_OPTIONS.map(h => ({ key: String(h), label: t(temperatureRangeLabelKey(h)) }));

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
      {data?.supported && (state === 'content' || state === 'empty') && (
        <>
          <div className={styles.temperatureControls}>
            <ChipGroup
              options={rangeOptions}
              activeKey={isDateMode ? '' : String(hours)}
              onChange={key => onHoursChange(Number(key) as IncidentRangeHours)}
              ariaLabel={t('diagnostics.incidents.rangeAriaLabel')}
            />
            <div className={`${styles.temperatureDayPicker}${isDateMode ? '' : ` ${styles.temperatureDayPickerInactive}`}`}>
              <DatePicker
                value={date ?? today}
                max={today}
                min={minDate}
                onChange={onDateChange}
                ariaLabel={t('diagnostics.incidents.dayPickerAriaLabel')}
              />
            </div>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              compact
              icon={<History size={22} />}
              title={isDateMode
                ? t('diagnostics.incidents.emptyDay', { date: formatTemperatureDayLabel(date) })
                : t('diagnostics.incidents.emptyRange', { range: t(temperatureRangeLabelKey(hours)) })}
            />
          ) : (
            <EventTimeline
              lanes={lanes}
              events={events}
              domain={domain}
              xTickFormat={incidentXTickFormat(query)}
              ariaLabel={t('diagnostics.incidents.title')}
              renderTooltip={cluster => (
                <IncidentClusterTooltip laneId={cluster.laneId} events={cluster.events} nowMs={now} language={language} />
              )}
            />
          )}

          {counts30d && (
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

function IncidentClusterTooltip({ laneId, events, nowMs, language }: {
  laneId: string;
  events: IncidentTimelineEvent[];
  nowMs: number;
  language: string;
}) {
  const { t } = useTranslation();
  const MAX_ROWS = 6;
  const shown = events.slice(0, MAX_ROWS);
  const extra = events.length - shown.length;
  return (
    <div className={styles.incidentTooltip}>
      <div className={styles.incidentTooltipHeader}>{t(incidentSourceLabelKey(laneId))}</div>
      {shown.map(ev => {
        const Icon = SEVERITY_ICON[ev.incident.severity];
        return (
          <div key={ev.id} className={styles.incidentTooltipRow}>
            <span className={styles.incidentIcon} style={{ color: incidentSeverityColor(ev.incident.severity) }}>
              <Icon size={13} aria-hidden />
            </span>
            <span className={styles.incidentTooltipTitle}>{ev.incident.title}</span>
            <span className={styles.incidentTooltipTime}>{formatTooltipTimestamp(ev.t, nowMs, language)}</span>
          </div>
        );
      })}
      {extra > 0 && (
        <div className={styles.incidentTooltipMore}>{t('diagnostics.incidents.moreCount', { n: String(extra) })}</div>
      )}
    </div>
  );
}
