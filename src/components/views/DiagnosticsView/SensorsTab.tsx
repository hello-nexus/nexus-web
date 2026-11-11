import { useEffect, useMemo, useRef, useState } from 'react';
import { ChartLine, Plus, RotateCcw } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { MAX_SENSOR_ALERT_RULES, type SensorAlertRule } from '../../../api/diagnosticsAlerts';
import { useSensorAlerts } from '../../../hooks/useSensorAlerts';
import type { UseMetricHistoryResult } from '../../../hooks/useMetricHistory';
import { requestSearchScroll } from '../../../search/scroll';
import { Button } from '../../common/Button/Button';
import { EmptyState } from '../../common/EmptyState/EmptyState';
import { useToast } from '../../common/Toast/Toast';
import { useSensorLookup } from '../../../panel/widgets/monitoring/picker/SensorPicker';
import { sensorsForDevice } from '../../../panel/widgets/monitoring/sensorPicker';
import type { DeckMonitoringCategory } from '../../../panel/widgets/deck/types';
import { GenericSkeleton } from '../PageSkeleton/PageSkeleton';
import { SectionLoadError } from './DiagnosticsSectionStates';
import { SensorAlertBanner } from './SensorAlertBanner';
import { ALERT_SENSOR_CATEGORIES, ALERT_SENSOR_TYPES, defaultRule, isBannerAlert, isBuiltIn, sensorRefOf } from './sensorAlertHelpers';
import { Card } from '../../common/Card/Card';
import { SectionHeader } from '../../common/SectionHeader/SectionHeader';
import { SensorAlertRuleSettings } from './SensorAlertRuleSettings';
import { SensorHistorySection } from './SensorHistorySection';
import { SensorList } from './SensorList';
import { SensorNotificationSettings } from './SensorNotificationSettings';
import { resolveSelectedId, sensorCardAnchor } from './sensorHistoryHelpers';
import styles from './SensorsTab.module.scss';

interface SensorsTabProps {
  /** One viewport shared by every card, so a single range picker and seek bar drive them all. */
  history: UseMetricHistoryResult;
  /** A card to scroll to and shine once the rules have loaded (set by a Summary row). */
  focusRuleId: string | null;
  onFocused: () => void;
  /** Called after an alert was dismissed, so the Health summary refreshes. */
  onAlertDismissed: () => void;
}

/** The tracked sensors: the selected sensor's recorded history (limits drawn as lines) at full width, then a list on the left and the selected sensor's settings on the right; an Add action and a banner per active alert. */
export function SensorsTab({ history, focusRuleId, onFocused, onAlertDismissed }: SensorsTabProps) {
  const { t } = useTranslation();
  const { push } = useToast();
  const alerts = useSensorAlerts(true);
  const { rules, states, loaded, error, loading, refresh } = alerts;
  const lookup = useSensorLookup();
  const { sensors, extras, networkSensors, resolve } = lookup;
  const [picked, setPicked] = useState<string | null>(null);
  const selectedId = resolveSelectedId(rules, picked);
  const selectedRule = rules.find(r => r.id === selectedId);
  const builtInRules = useMemo(() => rules.filter(isBuiltIn), [rules]);
  const userRules = useMemo(() => rules.filter(r => !isBuiltIn(r)), [rules]);
  // Re-snapshot "now" when the states change, so render stays pure.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { setNow(Date.now()); }, [states]);

  // The first sensor the picker would list: new rules start on it.
  const firstSensor = useMemo(() => {
    for (const category of ALERT_SENSOR_CATEGORIES) {
      const options = sensorsForDevice(sensors, networkSensors, extras, category as DeckMonitoringCategory)
        .filter(o => o.type !== undefined && (ALERT_SENSOR_TYPES as readonly string[]).includes(o.type));
      for (const option of options) {
        const found = resolve(category, option.value);
        if (found) return { category, sensor: found };
      }
    }
    return null;
  }, [sensors, networkSensors, extras, resolve]);

  const addingRef = useRef(false);
  const onAdd = async () => {
    if (!firstSensor || alerts.atLimit || !loaded || addingRef.current) return;
    addingRef.current = true;
    const { category, sensor } = firstSensor;
    const { result, rule } = await alerts.add(defaultRule(sensorRefOf(category, sensor), sensor.value)).finally(() => { addingRef.current = false; });
    if (rule) setPicked(rule.id);
    else if (result === 'error') push({ title: t('diagnostics.alerts.addFailed') });
  };

  const stateOf = (id: string) => states.find(s => s.ruleId === id);
  const listProps = {
    states,
    selectedId,
    liveOf: (rule: SensorAlertRule) => resolve(rule.sensor.category, rule.sensor.id)?.value ?? null,
    onSelect: setPicked,
    onToggleEnabled: (rule: SensorAlertRule, enabled: boolean) => alerts.save({ ...rule, enabled }, () => push({ title: t('diagnostics.alerts.saveFailed') })),
  };
  const restoreBuiltIns = (id?: string) => { void alerts.resetBuiltIns(id).then(ok => { if (!ok) push({ title: t('diagnostics.alerts.saveFailed') }); }); };
  const note = alerts.atLimit
    ? t('diagnostics.alerts.limitNote', { max: MAX_SENSOR_ALERT_RULES })
    : loaded && !firstSensor && rules.length === 0 ? t('diagnostics.alerts.noSensors') : null;
  const addButton = (
    <Button
      type="button" size="sm" tone="neutral" icon={<Plus size={14} aria-hidden />} data-testid="sensor-add"
      disabled={!loaded || alerts.atLimit || !firstSensor} onClick={() => void onAdd()}
    >
      {t('diagnostics.sensors.add')}
    </Button>
  );

  // Charts grow once history lands, so the scroll waits for it to avoid landing above the target's final position.
  const historySettled = !history.loading || !history.supported || history.error;
  useEffect(() => {
    if (!focusRuleId || !loaded || !historySettled) return;
    if (rules.some(r => r.id === focusRuleId)) {
      setPicked(focusRuleId);
      requestSearchScroll(sensorCardAnchor(focusRuleId));
    }
    onFocused();
  }, [focusRuleId, loaded, historySettled, rules, onFocused]);

  if (!loaded) return error ? <SectionLoadError onRetry={refresh} loading={loading} /> : <GenericSkeleton />;

  if (rules.length === 0) {
    return (
      <div className={styles.messageBox}>
        <EmptyState
          compact
          icon={<ChartLine size={22} />}
          title={t('diagnostics.sensors.empty')}
          hint={note ?? t('diagnostics.sensors.emptyHintAdd')}
          action={addButton}
        />
      </div>
    );
  }

  return (
    <div className={styles.root}>
      {rules.map(rule => {
        const st = stateOf(rule.id);
        return isBannerAlert(rule, st) && (
          <SensorAlertBanner
            key={rule.id}
            rule={rule}
            state={st}
            nowMs={now}
            onDismiss={async () => {
              const ok = await alerts.acknowledge(rule.id);
              if (ok) onAlertDismissed();
              return ok;
            }}
          />
        );
      })}
      {selectedRule && (
        <div data-testid="sensor-history" data-rule-id={selectedRule.id}>
          <SensorHistorySection history={history} rule={selectedRule} />
        </div>
      )}
      <div className={styles.split}>
        <div className={styles.listPane}>
          {builtInRules.length > 0 && (
            <section className={styles.group} data-testid="sensor-group-builtin">
              <div className={styles.groupHeader}>
                <SectionHeader>{t('diagnostics.sensors.group.builtIn')}</SectionHeader>
                <Button type="button" size="sm" tone="neutral" icon={<RotateCcw size={14} aria-hidden />} data-testid="sensor-restore-all" onClick={() => restoreBuiltIns()}>
                  {t('diagnostics.sensors.restoreDefaults')}
                </Button>
              </div>
              <SensorList rules={builtInRules} {...listProps} />
            </section>
          )}
          <section className={styles.group} data-testid="sensor-group-custom">
            <div className={styles.groupHeader}>
              {builtInRules.length > 0 && <SectionHeader>{t('diagnostics.sensors.group.custom')}</SectionHeader>}
              <span className={styles.addRow}>
                {addButton}
                {note && <span className={styles.note}>{note}</span>}
              </span>
            </div>
            <SensorList rules={userRules} {...listProps} />
          </section>
        </div>
        {selectedRule && (
          <div className={styles.detail} data-testid="sensor-detail" data-rule-id={selectedRule.id}>
            <Card>
              <div data-testid="sensor-settings">
                <SensorAlertRuleSettings
                  key={selectedRule.id}
                  rule={selectedRule}
                  lookup={lookup}
                  onPreview={alerts.preview}
                  onSave={next => alerts.save(next, () => push({ title: t('diagnostics.alerts.saveFailed') }))}
                  onDelete={() => { void alerts.remove(selectedRule.id).then(ok => { if (!ok) push({ title: t('diagnostics.alerts.deleteFailed') }); }); }}
                  state={stateOf(selectedRule.id)}
                  onRestoreDefault={() => restoreBuiltIns(selectedRule.id)}
                />
              </div>
            </Card>
          </div>
        )}
      </div>
      <SensorNotificationSettings />
    </div>
  );
}
