import { useEffect, useMemo, useState } from 'react';
import { Thermometer } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { useDiagnosticsWarningLingerMinutes, useUnitPrefs } from '../../../hooks/useUiSettings';
import { colorFor } from '../../../lib/monitoringStore';
import { formatDuration } from '../../../lib/formatDuration';
import { Badge } from '../../common/Badge/Badge';
import { ChipGroup, type ChipOption } from '../../common/ChipGroup/ChipGroup';
import { DatePicker } from '../../common/DatePicker/DatePicker';
import { EmptyState } from '../../common/EmptyState/EmptyState';
import { SectionHeader } from '../../common/SectionHeader/SectionHeader';
import { TimeSeriesChart } from '../../common/TimeSeriesChart/TimeSeriesChart';
import type { DiagnosticsTemperatureAppsResponse, DiagnosticsTemperaturesResponse } from '../../../api/diagnostics';
import { NotAvailableNote, SectionLoadError } from './DiagnosticsSectionStates';
import { resolveSectionState } from './diagnosticsHelpers';
import {
  DEFAULT_TEMPERATURE_RETENTION_DAYS,
  TEMPERATURE_RANGE_OPTIONS,
  appsForHoverBucket,
  episodeBand,
  episodeSentence,
  formatTemperatureCelsius,
  formatTemperatureDayLabel,
  minSelectableTemperatureDate,
  temperatureRangeDomain,
  temperatureRangeLabelKey,
  toChartSeries,
  todayIso,
  xTickFormatForRange,
  type AppHoverEntry,
  type TemperatureRangeHours,
} from './temperatureHelpers';
import styles from './DiagnosticsView.module.scss';

interface TemperatureSectionProps {
  data: DiagnosticsTemperaturesResponse | null;
  loading: boolean;
  error: boolean;
  // /diagnostics/temperatures doesn't exist on every service build yet, so
  // unlike the rest of this page's resources the mocked flag is surfaced
  // locally (not folded into the Summary tab's page-wide badge) - a user on
  // the Cooling tab needs to know this specific chart is fabricated.
  mocked: boolean;
  hours: TemperatureRangeHours;
  date: string | null;
  onHoursChange: (hours: TemperatureRangeHours) => void;
  onDateChange: (date: string) => void;
  onRetry: () => void;
  // Per-bucket app usage backing the chart's hover tooltip; null until the
  // fetch resolves, or when screen-time data is unavailable.
  appUsageData: DiagnosticsTemperatureAppsResponse | null;
}

function tooltipApps(apps: AppHoverEntry[]) {
  if (apps.length === 0) return null;
  return (
    <div className={styles.tooltipApps}>
      {apps.map(a => (
        <div key={a.appId} className={styles.tooltipAppRow}>
          <span className={styles.tooltipAppDot} style={{ background: colorFor(a.appId) }} />
          <span className={styles.tooltipAppName}>{a.appName}</span>
          <span className={styles.tooltipAppDuration}>{formatDuration(a.ms)}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * The Cooling tab's temperature history block: a range picker + day picker,
 * a sustained-high-temperature episodes callout (when any exist), and the
 * multi-line chart. Sits above the fan/pump list.
 */
export function TemperatureSection({
  data, loading, error, mocked, hours, date, onHoursChange, onDateChange, onRetry, appUsageData,
}: TemperatureSectionProps) {
  const { t } = useTranslation();
  const { monitoringTempUnit, numberFormat } = useUnitPrefs();
  const lingerMinutes = useDiagnosticsWarningLingerMinutes();
  // Re-snapshot "now" per fresh poll so the recency check below stays current
  // without reading Date.now() during render.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { setNow(Date.now()); }, [data]);
  // The "sustained high temperatures" callout is a current-warning banner, not
  // a history log: an episode qualifies only while it is still active or ended
  // within the user's warning-linger window (0 = immediate, so only ongoing /
  // last-bucket episodes show). The chart bands still render every episode.
  const recentEpisodes = useMemo(() => {
    if (!data) return [];
    const recencyMs = Math.max(data.bucketMinutes, lingerMinutes) * 60_000;
    return data.episodes.filter(ep => new Date(ep.endUtc).getTime() >= now - recencyMs);
  }, [data, lingerMinutes, now]);
  // Force the chart's x-window to the full selected range so a range wider than
  // the recorded data shows blank space on the left instead of stretching.
  const chartDomain = useMemo(() => temperatureRangeDomain(hours, date, now), [hours, date, now]);
  const state = resolveSectionState({
    hasData: data !== null,
    loading,
    error,
    supported: data?.supported ?? false,
    isEmpty: (data?.series.length ?? 0) === 0,
  });

  const isDateMode = date !== null;
  // Bounds are computed in browser-local time; the service treats ?date= as its
  // own host-local day. Identical on the localhost desktop view where the two
  // zones match; a remote browser in another zone can pick an edge day the
  // service then 400s or returns empty for.
  const today = todayIso();
  const retentionDays = data?.retentionDays ?? DEFAULT_TEMPERATURE_RETENTION_DAYS;
  const minDate = minSelectableTemperatureDate(today, retentionDays);

  const rangeOptions: ChipOption[] = TEMPERATURE_RANGE_OPTIONS.map(h => ({ key: String(h), label: t(temperatureRangeLabelKey(h)) }));

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeaderRow}>
        <div className={styles.actionBarStatus}>
          <SectionHeader>{t('diagnostics.temperature.title')}</SectionHeader>
          {mocked && <Badge label={t('diagnostics.mockDataBadge')} color="var(--warn)" />}
        </div>
        <div className={styles.temperatureControls}>
          <ChipGroup
            options={rangeOptions}
            activeKey={isDateMode ? '' : String(hours)}
            onChange={key => onHoursChange(Number(key) as TemperatureRangeHours)}
            ariaLabel={t('diagnostics.temperature.rangeAriaLabel')}
          />
          <div className={`${styles.temperatureDayPicker}${isDateMode ? '' : ` ${styles.temperatureDayPickerInactive}`}`}>
            <DatePicker
              value={date ?? today}
              max={today}
              min={minDate}
              onChange={onDateChange}
              ariaLabel={t('diagnostics.temperature.dayPickerAriaLabel')}
            />
          </div>
        </div>
      </div>

      {state === 'error' && <SectionLoadError onRetry={onRetry} loading={loading} />}
      {state === 'notSupported' && <NotAvailableNote />}
      {state === 'empty' && (
        <EmptyState
          compact
          icon={<Thermometer size={22} />}
          title={isDateMode ? t('diagnostics.temperature.emptyDay', { date: formatTemperatureDayLabel(date) }) : t('diagnostics.temperature.empty')}
        />
      )}
      {state === 'content' && data && (
        <>
          {recentEpisodes.length > 0 && (
            <div className={styles.temperatureEpisodes}>
              <div className={styles.temperatureEpisodesTitle}>{t('diagnostics.temperature.episodesTitle')}</div>
              <ul className={styles.temperatureEpisodesList}>
                {recentEpisodes.map((episode, i) => (
                  <li key={i}>{episodeSentence(episode, monitoringTempUnit, numberFormat, t)}</li>
                ))}
              </ul>
            </div>
          )}
          <TimeSeriesChart
            series={toChartSeries(data.series)}
            domain={chartDomain}
            valueFormat={v => formatTemperatureCelsius(v, monitoringTempUnit, numberFormat)}
            xTickFormat={isDateMode ? xTickFormatForRange(24) : xTickFormatForRange(hours)}
            avgLabel={t('diagnostics.temperature.avg')}
            maxLabel={t('diagnostics.temperature.max')}
            bands={data.episodes.map(episodeBand)}
            tooltipExtra={hoverT => tooltipApps(appsForHoverBucket(appUsageData, hoverT))}
          />
        </>
      )}
    </section>
  );
}

