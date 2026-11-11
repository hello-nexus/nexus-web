import { useEffect, useMemo, useRef, useState } from 'react';
import { ChartLine, Plus, ZoomOut } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { MAX_SENSOR_ALERT_RULES } from '../../../api/diagnosticsAlerts';
import { useSensorAlerts } from '../../../hooks/useSensorAlerts';
import type { UseMetricHistoryResult } from '../../../hooks/useMetricHistory';
import { requestSearchScroll } from '../../../search/scroll';
import { Button } from '../../common/Button/Button';
import { EmptyState } from '../../common/EmptyState/EmptyState';
import { LiveFollowControl } from '../../common/LiveFollowControl/LiveFollowControl';
import { Select } from '../../common/Select/Select';
import { useToast } from '../../common/Toast/Toast';
import { TimelineBrush, TIMELINE_BRUSH_DEFAULT_HEIGHT } from '../../common/TimelineBrush/TimelineBrush';
import { useSensorLookup } from '../../../panel/widgets/monitoring/picker/SensorPicker';
import { sensorsForDevice } from '../../../panel/widgets/monitoring/sensorPicker';
import type { DeckMonitoringCategory } from '../../../panel/widgets/deck/types';
import {
  RANGE_OPTIONS,
  formatBrushEdgeLabels,
  formatSelectedFrameTime,
} from '../../../panel/widgets/monitoring/page/metricHistoryHelpers';
import { GenericSkeleton } from '../PageSkeleton/PageSkeleton';
import { SectionLoadError } from './DiagnosticsSectionStates';
import { SensorAlertBanner } from './SensorAlertBanner';
import { SensorCard } from './SensorCard';
import { ALERT_SENSOR_CATEGORIES, ALERT_SENSOR_TYPES, defaultRule, isBannerAlert, sensorRefOf } from './sensorAlertHelpers';
import { sensorCardAnchor } from './sensorHistoryHelpers';
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

/** The tracked sensors: a card per sensor rule with its recorded history, limits, state and settings, an Add action, and a banner per active alert. */
export function SensorsTab({ history, focusRuleId, onFocused, onAlertDismissed }: SensorsTabProps) {
  const { t, language } = useTranslation();
  const { timeFormat, dateFormat } = useUnitPrefs();
  const { push } = useToast();
  const alerts = useSensorAlerts(true);
  const { rules, states, loaded, error, loading, refresh } = alerts;
  const lookup = useSensorLookup();
  const { sensors, extras, networkSensors, resolve } = lookup;
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(new Set());
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
    if (rule) setOpenIds(prev => new Set(prev).add(rule.id));
    else if (result === 'error') push({ title: t('diagnostics.alerts.addFailed') });
  };

  const toggleEditing = (id: string) => setOpenIds(prev => {
    const next = new Set(prev);
    if (!next.delete(id)) next.add(id);
    return next;
  });

  const stateOf = (id: string) => states.find(s => s.ruleId === id);
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
    if (rules.some(r => r.id === focusRuleId)) requestSearchScroll(sensorCardAnchor(focusRuleId));
    onFocused();
  }, [focusRuleId, loaded, historySettled, rules, onFocused]);

  const windowEnd = history.domain[1];
  const windowMs = windowEnd - history.domain[0];
  const detachedLabel = useMemo(() => formatSelectedFrameTime(windowEnd, windowMs, timeFormat, dateFormat), [windowEnd, windowMs, timeFormat, dateFormat]);
  const rangeOptions = RANGE_OPTIONS.map(o => ({ value: o.key, label: t(o.labelKey) }));

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
      <div className={styles.headerRow}>
        <span className={styles.addRow}>
          {addButton}
          {note && <span className={styles.note}>{note}</span>}
        </span>
        <LiveFollowControl following={history.following} detachedLabel={detachedLabel} onBackToLive={history.backToLive} />
      </div>
      <div className={styles.controls}>
        {history.rangeKey === 'custom' ? (
          <button
            type="button"
            className={styles.resetRange}
            style={{ height: TIMELINE_BRUSH_DEFAULT_HEIGHT }}
            onClick={() => history.setRange(history.lastPresetKey)}
          >
            <ZoomOut size={13} aria-hidden />
            {t('monitoring.history.zoomOut')}
          </button>
        ) : (
          <Select
            className={styles.rangeSelect}
            height={TIMELINE_BRUSH_DEFAULT_HEIGHT}
            value={history.rangeKey}
            onChange={key => history.setRange(key as typeof history.lastPresetKey)}
            options={rangeOptions}
            ariaLabel={t('monitoring.history.rangeAriaLabel')}
          />
        )}
        <TimelineBrush
          className={styles.brush}
          domainStart={history.stripDomain[0]}
          domainEnd={history.stripDomain[1]}
          from={history.domain[0]}
          to={history.domain[1]}
          onChange={history.onBrushChange}
          ariaLabel={t('monitoring.history.brushAriaLabel')}
          ariaValueText={(from, to) => `${new Date(from).toLocaleString()} - ${new Date(to).toLocaleString()}`}
          formatEdgeLabels={(start, end) => formatBrushEdgeLabels(start, end, timeFormat, dateFormat, language)}
        />
      </div>
      {!history.supported && <div className={styles.messageBox}>{t('monitoring.history.unsupported')}</div>}
      <div className={styles.cards}>
        {rules.map(rule => (
          <SensorCard
            key={rule.id}
            rule={rule}
            state={stateOf(rule.id)}
            live={resolve(rule.sensor.category, rule.sensor.id)?.value ?? null}
            history={history}
            lookup={lookup}
            editing={openIds.has(rule.id)}
            onToggleEditing={() => toggleEditing(rule.id)}
            onPreview={alerts.preview}
            onSave={next => alerts.save(next, () => push({ title: t('diagnostics.alerts.saveFailed') }))}
            onDelete={() => { void alerts.remove(rule.id).then(ok => { if (!ok) push({ title: t('diagnostics.alerts.deleteFailed') }); }); }}
          />
        ))}
      </div>
    </div>
  );
}
