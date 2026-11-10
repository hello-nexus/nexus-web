import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { MAX_SENSOR_ALERT_RULES } from '../../../api/diagnosticsAlerts';
import { useSensorAlerts } from '../../../hooks/useSensorAlerts';
import { Button } from '../../common/Button/Button';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { useToast } from '../../common/Toast/Toast';
import { useSensorLookup } from '../../../panel/widgets/monitoring/picker/SensorPicker';
import { sensorsForDevice } from '../../../panel/widgets/monitoring/sensorPicker';
import type { DeckMonitoringCategory } from '../../../panel/widgets/deck/types';
import { SensorAlertRuleCard } from './SensorAlertRuleCard';
import { ALERT_SENSOR_CATEGORIES, ALERT_SENSOR_TYPES, defaultRule, sensorRefOf } from './sensorAlertHelpers';
import styles from './SensorAlertsSection.module.scss';

/** User-configurable sensor threshold alerts: up to MAX_SENSOR_ALERT_RULES rules, every edit written immediately. */
export function SensorAlertsSection() {
  const { t } = useTranslation();
  const { push } = useToast();
  const alerts = useSensorAlerts(true);
  const lookup = useSensorLookup();
  const { sensors, extras, networkSensors, resolve } = lookup;
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(new Set());

  // The first sensor the picker would list: new rules start on it.
  const firstSensor = useMemo(() => {
    for (const category of ALERT_SENSOR_CATEGORIES) {
      const options = sensorsForDevice(sensors, networkSensors, extras, category as DeckMonitoringCategory)
        .filter(o => o.type !== undefined && (ALERT_SENSOR_TYPES as readonly string[]).includes(o.type));
      for (const option of options) {
        const sensor = resolve(category, option.value);
        if (sensor) return { category, sensor };
      }
    }
    return null;
  }, [sensors, networkSensors, extras, resolve]);

  const toggleOpen = (id: string) => setOpenIds(prev => {
    const next = new Set(prev);
    if (!next.delete(id)) next.add(id);
    return next;
  });

  const onAdd = async () => {
    if (!firstSensor || alerts.atLimit) return;
    const { category, sensor } = firstSensor;
    const { result, rule } = await alerts.add(defaultRule(sensorRefOf(category, sensor), sensor.value));
    if (rule) setOpenIds(prev => new Set(prev).add(rule.id));
    else if (result === 'error') push({ title: t('diagnostics.alerts.addFailed') });
  };

  const stateOf = (id: string) => alerts.states.find(s => s.ruleId === id);
  const note = alerts.atLimit
    ? t('diagnostics.alerts.limitNote', { max: MAX_SENSOR_ALERT_RULES })
    : !firstSensor && alerts.rules.length === 0 ? t('diagnostics.alerts.noSensors') : null;

  return (
    <SettingsSection
      title={t('diagnostics.alerts.title')}
      description={t('diagnostics.alerts.description')}
      footer={(
        <div className={styles.addRow}>
          <Button
            type="button" tone="neutral" size="sm" icon={<Plus size={14} aria-hidden />}
            disabled={alerts.atLimit || !firstSensor} onClick={() => void onAdd()}
          >
            {t('diagnostics.alerts.add')}
          </Button>
          {note && <span className={styles.note}>{note}</span>}
        </div>
      )}
    >
      {alerts.rules.map(rule => (
        <SensorAlertRuleCard
          key={rule.id}
          rule={rule}
          state={stateOf(rule.id)}
          lookup={lookup}
          open={openIds.has(rule.id)}
          onToggleOpen={() => toggleOpen(rule.id)}
          onPreview={alerts.preview}
          onSave={next => alerts.save(next, () => push({ title: t('diagnostics.alerts.saveFailed') }))}
          onDelete={() => { void alerts.remove(rule.id); }}
        />
      ))}
    </SettingsSection>
  );
}
