import { useTranslation } from '../../../lib/i18n';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import type { SensorAlertRule, SensorAlertState } from '../../../api/diagnosticsAlerts';
import { Badge } from '../../common/Badge/Badge';
import { Toggle } from '../../common/Toggle/Toggle';
import { formatAlertValue, isBuiltIn, rowState, ruleLabel, stateColor } from './sensorAlertHelpers';
import { sensorCardAnchor } from './sensorHistoryHelpers';
import styles from './SensorList.module.scss';

interface SensorListProps {
  rules: readonly SensorAlertRule[];
  states: readonly SensorAlertState[];
  selectedId: string | null;
  /** A sensor's current reading in its native unit, when the sensor is listed. */
  liveOf: (rule: SensorAlertRule) => number | null;
  onSelect: (id: string) => void;
  onToggleEnabled: (rule: SensorAlertRule, enabled: boolean) => void;
}

/** The tracked sensors, one row each: name, live value, state chip and the enabled switch. A row selects the sensor for the detail pane. */
export function SensorList({ rules, states, selectedId, liveOf, onSelect, onToggleEnabled }: SensorListProps) {
  const { t } = useTranslation();
  const { monitoringTempUnit: tempUnit, numberFormat, monitoringWholeNumbers } = useUnitPrefs();
  return (
    <ul className={styles.list}>
      {rules.map(rule => {
        const st = states.find(s => s.ruleId === rule.id);
        const kind = rowState(rule, st);
        const reading = liveOf(rule) ?? st?.value ?? null;
        const selected = rule.id === selectedId;
        return (
          <li
            key={rule.id}
            className={styles.row}
            data-selected={selected ? 'true' : 'false'}
            data-state={kind}
            data-testid="sensor-row"
            data-rule-id={rule.id}
            data-search-anchor={sensorCardAnchor(rule.id)}
          >
            <button type="button" className={styles.select} aria-pressed={selected} onClick={() => onSelect(rule.id)}>
              <span className={styles.name}>{ruleLabel(t, rule)}</span>
              <span className={styles.value}>
                {reading !== null ? formatAlertValue(reading, rule.sensor.type, tempUnit, numberFormat, monitoringWholeNumbers) : t(isBuiltIn(rule) ? 'diagnostics.sensors.notReported' : 'diagnostics.alerts.noReading')}
              </span>
              <span className={styles.chip}><Badge label={t(`diagnostics.alerts.state.${kind}`)} color={stateColor(kind, rule)} /></span>
            </button>
            <Toggle checked={rule.enabled} onChange={enabled => onToggleEnabled(rule, enabled)} ariaLabel={t('diagnostics.alerts.enabledFor', { name: ruleLabel(t, rule) })} />
          </li>
        );
      })}
    </ul>
  );
}
