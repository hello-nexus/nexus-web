import { Thermometer } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { Badge } from '../../common/Badge/Badge';
import { ChipGroup, type ChipOption } from '../../common/ChipGroup/ChipGroup';
import { EmptyState } from '../../common/EmptyState/EmptyState';
import { SectionHeader } from '../../common/SectionHeader/SectionHeader';
import { TimeSeriesChart } from '../../common/TimeSeriesChart/TimeSeriesChart';
import type { DiagnosticsTemperaturesResponse } from '../../../api/diagnostics';
import { NotAvailableNote, SectionLoadError } from './DiagnosticsSectionStates';
import { resolveSectionState } from './diagnosticsHelpers';
import {
  TEMPERATURE_RANGE_OPTIONS,
  episodeBand,
  episodeSentence,
  formatTemperatureCelsius,
  temperatureRangeLabelKey,
  toChartSeries,
  xTickFormatForRange,
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
  onHoursChange: (hours: TemperatureRangeHours) => void;
  onRetry: () => void;
}

/**
 * The Cooling tab's temperature history block: a range picker, a
 * sustained-high-temperature episodes callout (when any exist), and the
 * multi-line chart. Sits above the fan/pump list.
 */
export function TemperatureSection({ data, loading, error, mocked, hours, onHoursChange, onRetry }: TemperatureSectionProps) {
  const { t } = useTranslation();
  const { monitoringTempUnit, numberFormat } = useUnitPrefs();
  const state = resolveSectionState({
    hasData: data !== null,
    loading,
    error,
    supported: data?.supported ?? false,
    isEmpty: (data?.series.length ?? 0) === 0,
  });

  const rangeOptions: ChipOption[] = TEMPERATURE_RANGE_OPTIONS.map(h => ({ key: String(h), label: t(temperatureRangeLabelKey(h)) }));

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeaderRow}>
        <div className={styles.actionBarStatus}>
          <SectionHeader>{t('diagnostics.temperature.title')}</SectionHeader>
          {mocked && <Badge label={t('diagnostics.mockDataBadge')} color="var(--warn)" />}
        </div>
        <ChipGroup
          options={rangeOptions}
          activeKey={String(hours)}
          onChange={key => onHoursChange(Number(key) as TemperatureRangeHours)}
          ariaLabel={t('diagnostics.temperature.rangeAriaLabel')}
        />
      </div>

      {state === 'error' && <SectionLoadError onRetry={onRetry} loading={loading} />}
      {state === 'notSupported' && <NotAvailableNote />}
      {state === 'empty' && <EmptyState compact icon={<Thermometer size={22} />} title={t('diagnostics.temperature.empty')} />}
      {state === 'content' && data && (
        <>
          {data.episodes.length > 0 && (
            <div className={styles.temperatureEpisodes}>
              <div className={styles.temperatureEpisodesTitle}>{t('diagnostics.temperature.episodesTitle')}</div>
              <ul className={styles.temperatureEpisodesList}>
                {data.episodes.map((episode, i) => (
                  <li key={i}>{episodeSentence(episode, monitoringTempUnit, numberFormat, t)}</li>
                ))}
              </ul>
            </div>
          )}
          <TimeSeriesChart
            series={toChartSeries(data.series)}
            valueFormat={v => formatTemperatureCelsius(v, monitoringTempUnit, numberFormat)}
            xTickFormat={xTickFormatForRange(hours)}
            avgLabel={t('diagnostics.temperature.avg')}
            maxLabel={t('diagnostics.temperature.max')}
            bands={data.episodes.map(episodeBand)}
          />
        </>
      )}
    </section>
  );
}
