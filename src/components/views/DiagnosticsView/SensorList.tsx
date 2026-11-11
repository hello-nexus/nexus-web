import { Cpu, Gpu, HardDrive, MemoryStick, type LucideIcon } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import type { BuiltInSensorKind, SensorAlertRule, SensorAlertState } from '../../../api/diagnosticsAlerts';
import { Badge } from '../../common/Badge/Badge';
import { StatusRow } from '../../common/StatusRow/StatusRow';
import { Toggle } from '../../common/Toggle/Toggle';
import { formatAlertValue, isBuiltIn, rowState, ruleLabel, stateColor, stateLabelKey } from './sensorAlertHelpers';
import { sensorCardAnchor } from './sensorHistoryHelpers';
import styles from './SensorList.module.scss';

/** Built-in rows lead with their component's icon, the same glyphs the Cooling page and the Diagnostics tabs use. */
const BUILT_IN_ICONS: Record<BuiltInSensorKind, LucideIcon> = {
  cpuTemp: Cpu,
  gpuTemp: Gpu,
  storageTemp: HardDrive,
  ramTemp: MemoryStick,
};

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
        const name = ruleLabel(t, rule);
        // An enabled sensor the PC does not report has nothing to switch or grade: the chip alone says so.
        // A switched-off sensor shows its name and switch only.
        const BuiltInIcon = rule.builtIn ? BUILT_IN_ICONS[rule.builtIn] : null;
        const notReported = rule.enabled && reading === null && (isBuiltIn(rule) || kind === 'unavailable');
        return (
          <li
            key={rule.id}
            className={styles.row}
            data-selected={selected ? 'true' : 'false'}
            data-state={notReported ? 'notReported' : kind}
            data-testid="sensor-row"
            data-rule-id={rule.id}
            data-search-anchor={sensorCardAnchor(rule.id)}
          >
            <StatusRow
              name={name}
              icon={BuiltInIcon ? <BuiltInIcon size={16} /> : undefined}
              selected={selected}
              dimmed={!rule.enabled}
              onSelect={() => onSelect(rule.id)}
              value={rule.enabled && !notReported
                ? (reading !== null ? formatAlertValue(reading, rule.sensor.type, tempUnit, numberFormat, monitoringWholeNumbers) : t('diagnostics.alerts.noReading'))
                : undefined}
              chip={rule.enabled
                ? (notReported
                  ? <Badge label={t('diagnostics.sensors.notReported')} color="var(--text-dim)" />
                  : <Badge label={t(stateLabelKey(kind))} color={stateColor(kind, rule)} />)
                : undefined}
              toggle={notReported ? undefined : (
                <Toggle checked={rule.enabled} onChange={enabled => onToggleEnabled(rule, enabled)} ariaLabel={t('diagnostics.alerts.enabledFor', { name })} />
              )}
            />
          </li>
        );
      })}
    </ul>
  );
}
