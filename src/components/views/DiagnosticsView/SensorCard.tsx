import { useMemo } from 'react';
import { Pencil } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import type { UseMetricHistoryResult } from '../../../hooks/useMetricHistory';
import type { SensorAlertRule, SensorAlertState } from '../../../api/diagnosticsAlerts';
import { Badge } from '../../common/Badge/Badge';
import { Button } from '../../common/Button/Button';
import { Card } from '../../common/Card/Card';
import { TimeSeriesChart } from '../../common/TimeSeriesChart/TimeSeriesChart';
import { Toggle } from '../../common/Toggle/Toggle';
import type { useSensorLookup } from '../../../panel/widgets/monitoring/picker/SensorPicker';
import { xTickFormatForWindow } from '../../../panel/widgets/monitoring/page/metricHistoryHelpers';
import { SensorAlertRuleSettings } from './SensorAlertRuleSettings';
import { formatAlertValue, formatDisplayValue, rowState, sensorLabel, stateColor } from './sensorAlertHelpers';
import { sensorCardAnchor, sensorChartThresholds, sensorYDomain, toSensorChartSeries } from './sensorHistoryHelpers';
import styles from './SensorsTab.module.scss';

const CHART_HEIGHT = 180;

interface SensorCardProps {
  rule: SensorAlertRule;
  state: SensorAlertState | undefined;
  /** The sensor's current reading in its native unit, when the sensor is listed. */
  live: number | null;
  history: UseMetricHistoryResult;
  lookup: ReturnType<typeof useSensorLookup>;
  /** The settings are expanded under the graph. */
  editing: boolean;
  onToggleEditing: () => void;
  /** Shows an edit without writing it (a slider mid-drag). */
  onPreview: (rule: SensorAlertRule) => void;
  /** Writes the full rule. */
  onSave: (rule: SensorAlertRule) => void;
  onDelete: () => void;
}

/** One tracked sensor: its state, current value and enabled switch, a history chart with the alert limits drawn as lines, and its settings behind an Edit toggle. */
export function SensorCard({ rule, state, live, history, lookup, editing, onToggleEditing, onPreview, onSave, onDelete }: SensorCardProps) {
  const { t } = useTranslation();
  const { monitoringTempUnit: tempUnit, numberFormat, monitoringWholeNumbers, timeFormat, dateFormat } = useUnitPrefs();
  const type = rule.sensor.type;
  const kind = rowState(rule, state);
  const reading = live ?? state?.value ?? null;

  const line = useMemo(() => toSensorChartSeries(history.series, rule, tempUnit), [history.series, rule, tempUnit]);
  const thresholds = useMemo(() => sensorChartThresholds(rule, tempUnit), [rule, tempUnit]);
  const yDomain = useMemo(() => sensorYDomain(line, thresholds), [line, thresholds]);
  const windowMs = history.domain[1] - history.domain[0];
  const xTickFormat = useMemo(() => xTickFormatForWindow(windowMs, timeFormat, dateFormat), [windowMs, timeFormat, dateFormat]);
  const valueFormat = (v: number) => formatDisplayValue(v, type, tempUnit, numberFormat, monitoringWholeNumbers);

  return (
    <div data-search-anchor={sensorCardAnchor(rule.id)} data-testid="sensor-card" data-rule-id={rule.id}>
      <Card
        title={sensorLabel(rule.sensor)}
        actions={(
          <span className={styles.cardHead}>
            <span className={kind === 'disabled' ? `${styles.value} ${styles.muted}` : styles.value}>
              {reading !== null ? formatAlertValue(reading, type, tempUnit, numberFormat, monitoringWholeNumbers) : t('diagnostics.alerts.noReading')}
            </span>
            <Badge label={t(`diagnostics.alerts.state.${kind}`)} color={stateColor(kind, rule)} />
            <Toggle checked={rule.enabled} onChange={enabled => onSave({ ...rule, enabled })} ariaLabel={t('diagnostics.alerts.enabledFor', { name: sensorLabel(rule.sensor) })} />
            <Button
              type="button" size="sm" tone="neutral" icon={<Pencil size={13} aria-hidden />}
              data-testid="sensor-edit-toggle" aria-expanded={editing}
              aria-label={t('diagnostics.sensors.editFor', { name: sensorLabel(rule.sensor) })}
              onClick={onToggleEditing}
            >
              {t('diagnostics.sensors.edit')}
            </Button>
          </span>
        )}
      >
        {line ? (
          <TimeSeriesChart
            series={[line]}
            height={CHART_HEIGHT}
            domain={history.domain}
            valueFormat={valueFormat}
            xTickFormat={xTickFormat}
            avgLabel={t('diagnostics.temperature.avg')}
            maxLabel={t('diagnostics.temperature.max')}
            thresholds={thresholds}
            yDomain={yDomain}
            onRangeSelect={history.onChartDragSelect}
            onWheelZoom={history.onChartWheelZoom}
            stepSeconds={history.stepSeconds}
            yAxisSide="right"
            singleValueTooltip
            showLegend={false}
          />
        ) : (
          <div className={`${styles.messageBox} ${styles.muted}`}>{t('diagnostics.sensors.noHistory')}</div>
        )}
        {editing && (
          <div className={styles.settings} data-testid="sensor-settings">
            <SensorAlertRuleSettings rule={rule} lookup={lookup} onPreview={onPreview} onSave={onSave} onDelete={onDelete} />
          </div>
        )}
      </Card>
    </div>
  );
}
