import { Cpu, Fan, Gpu, HardDrive, MemoryStick, type LucideIcon } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import type { BuiltInSensorKind, SensorAlertRule, SensorAlertState, SensorRef } from '../../../api/diagnosticsAlerts';
import { Badge } from '../../common/Badge/Badge';
import { StatusRow } from '../../common/StatusRow/StatusRow';
import { formatAlertValue, isNotReported, rowState, rowTitles, stateColor, stateLabelKey } from './sensorAlertHelpers';
import { sensorCardAnchor } from './sensorHistoryHelpers';
import styles from './SensorList.module.scss';

/** Built-in rows lead with their component's icon, the same glyphs the Cooling page and the Diagnostics tabs use. */
const BUILT_IN_ICONS: Record<BuiltInSensorKind, LucideIcon> = {
  cpuTemp: Cpu,
  gpuTemp: Gpu,
  storageTemp: HardDrive,
  ramTemp: MemoryStick,
  fanSpeed: Fan,
};

interface SensorListProps {
  rules: readonly SensorAlertRule[];
  states: readonly SensorAlertState[];
  selectedId: string | null;
  /** A sensor's current reading in its native unit, when the sensor is listed. */
  liveOf: (rule: SensorAlertRule) => number | null;
  /** The sensor dropdown label the picker lists for a stored sensor, when it needs live data. */
  pickerLabel?: (sensor: SensorRef) => string | undefined;
  onSelect: (id: string) => void;
}

/** The tracked sensors, one row each: name, live value, dim reading and state chip. A row selects the sensor for the detail pane; the enabled switch lives in that pane. */
export function SensorList({ rules, states, selectedId, liveOf, pickerLabel, onSelect }: SensorListProps) {
  const { t, language } = useTranslation();
  const { monitoringTempUnit: tempUnit, numberFormat, monitoringWholeNumbers } = useUnitPrefs();
  return (
    <ul className={styles.list}>
      {rules.map(rule => {
        const st = states.find(s => s.ruleId === rule.id);
        const kind = rowState(rule, st);
        // The service's verdict wins: it nulls the value of a sensor it judged unreported, while the picker's
        // live list can still carry a stale 0 for the same entry, which would show as a reading beside NOT REPORTED.
        const unreported = isNotReported(st);
        const reading = unreported ? null : (liveOf(rule) ?? st?.value ?? null);
        const selected = rule.id === selectedId;
        const { title: name, subtitle } = rowTitles(rule, t, pickerLabel, language);
        // A sensor the PC does not report has nothing to show: the chip alone says so. A switched-off sensor
        // (alerts off) still shows its reading and is charted; it only has no status chip.
        const BuiltInIcon = rule.builtIn ? (BUILT_IN_ICONS[rule.builtIn] ?? (rule.sensor.type === 'Fan' ? Fan : null)) : null;
        // Not reported is the service's verdict after its grace period; a sensor just switched on shows no chip until a reading arrives.
        const notReported = unreported;
        const awaiting = reading === null && !notReported;
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
              subtitle={subtitle}
              icon={BuiltInIcon ? <BuiltInIcon size={16} /> : undefined}
              selected={selected}
              onSelect={() => onSelect(rule.id)}
              value={reading !== null
                ? formatAlertValue(reading, rule.sensor.type, tempUnit, numberFormat, monitoringWholeNumbers)
                : undefined}
              chip={awaiting
                ? undefined
                : notReported
                  ? <Badge label={t('diagnostics.sensors.notReported')} color="var(--text-dim)" />
                  : kind !== 'disabled' ? <Badge label={t(stateLabelKey(kind, rule))} color={stateColor(kind, rule)} /> : undefined}
            />
          </li>
        );
      })}
    </ul>
  );
}
