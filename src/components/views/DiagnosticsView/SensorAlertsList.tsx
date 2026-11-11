import { useTranslation } from '../../../lib/i18n';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { useSensorAlerts } from '../../../hooks/useSensorAlerts';
import type { SensorAlertRule, SensorAlertState } from '../../../api/diagnosticsAlerts';
import { Badge } from '../../common/Badge/Badge';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { useSensorLookup } from '../../../panel/widgets/monitoring/picker/SensorPicker';
import { formatAlertValue, isBuiltIn, rowState, ruleLabel, stateColor, stateLabelKey } from './sensorAlertHelpers';
import styles from './SensorAlertsList.module.scss';

interface SensorAlertsListProps {
  /** Opens the Sensors tab on this rule's card. */
  onOpenRule: (ruleId: string) => void;
}

/**
 * Read-only roll-up of the configured sensor alerts for the Summary tab: one row per rule with its
 * live value and state. A row opens the rule on the Sensors tab, where it is edited and dismissed. Renders nothing until the list has loaded with at least one rule.
 */
export function SensorAlertsList({ onOpenRule }: SensorAlertsListProps) {
  const { t } = useTranslation();
  const { monitoringTempUnit: tempUnit, numberFormat, monitoringWholeNumbers } = useUnitPrefs();
  const { rules, states } = useSensorAlerts(true, true);
  const { resolve } = useSensorLookup();
  if (rules.length === 0) return null;

  const stateOf = (rule: SensorAlertRule): SensorAlertState | undefined => states.find(s => s.ruleId === rule.id);

  return (
    <div className={styles.list}>
      <SettingsSection title={t('diagnostics.tab.sensors')}>
        <ul className={styles.rows}>
          {rules.map(rule => {
            const state = stateOf(rule);
            const kind = rowState(rule, state);
            const type = rule.sensor.type;
            const reading = resolve(rule.sensor.category, rule.sensor.id)?.value ?? state?.value ?? null;
            const open = () => onOpenRule(rule.id);
            return (
              <li key={rule.id} className={styles.row} data-state={kind} data-severity={rule.severity}>
                <div
                  className={styles.main}
                  role="button"
                  tabIndex={0}
                  onClick={open}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      open();
                    }
                  }}
                >
                  <span className={styles.name}>{ruleLabel(t, rule)}</span>
                  {rule.enabled && (reading === null && (isBuiltIn(rule) || kind === 'unavailable') ? (
                    <Badge label={t('diagnostics.sensors.notReported')} color="var(--text-dim)" />
                  ) : (
                    <>
                      <span className={styles.value}>
                        {reading !== null ? formatAlertValue(reading, type, tempUnit, numberFormat, monitoringWholeNumbers) : t('diagnostics.alerts.noReading')}
                      </span>
                      <Badge label={t(stateLabelKey(kind))} color={stateColor(kind, rule)} />
                    </>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      </SettingsSection>
    </div>
  );
}
