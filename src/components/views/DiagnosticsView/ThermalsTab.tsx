import { useEffect, useMemo, useRef, useState } from 'react';
import { ChartLine, Plus } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import {
  MAX_SENSOR_ALERT_RULES,
  type SensorAlertRule,
  type SensorRef,
} from '../../../api/diagnosticsAlerts';
import type { DiagnosticsCoolingResponse, DiagnosticsTemperatureEpisode } from '../../../api/diagnostics';
import { useSensorAlerts } from '../../../hooks/useSensorAlerts';
import type { UseMetricHistoryResult } from '../../../hooks/useMetricHistory';
import { requestSearchScroll } from '../../../search/scroll';
import { Button } from '../../common/Button/Button';
import { ConfirmModal } from '../../common/ConfirmModal/ConfirmModal';
import { ChipGroup } from '../../common/ChipGroup/ChipGroup';
import { EmptyState } from '../../common/EmptyState/EmptyState';
import { useToast } from '../../common/Toast/Toast';
import { useSensorLookup } from '../../../panel/widgets/monitoring/picker/SensorPicker';
import { sensorsForDevice } from '../../../panel/widgets/monitoring/sensorPicker';
import type { DeckMonitoringCategory } from '../../../panel/widgets/deck/types';
import { GenericSkeleton } from '../PageSkeleton/PageSkeleton';
import { SectionLoadError } from './DiagnosticsSectionStates';
import { SensorAlertBanner } from './SensorAlertBanner';
import { ALERT_SENSOR_CATEGORIES, ALERT_SENSOR_TYPES, defaultRule, findTrackedRule, isBannerAlert, ruleLabel, sensorRefOf } from './sensorAlertHelpers';
import { Card } from '../../common/Card/Card';
import { SectionHeader } from '../../common/SectionHeader/SectionHeader';
import { SensorAlertRuleSettings } from './SensorAlertRuleSettings';
import { SensorHistorySection } from './SensorHistorySection';
import { CoolingHistorySection } from './CoolingHistorySection';
import { CoolingSection } from './CoolingSection';
import { GuardTripNotice } from './GuardTripNotice';
import { SensorList } from './SensorList';
import { sensorCardAnchor } from './sensorHistoryHelpers';
import {
  builtInSeriesId,
  builtInThresholds,
  resolveThermals,
  ruleForSeries,
  selectMode,
  selectRule,
  type ThermalsMode,
  type ThermalsSelection,
} from './thermalsHelpers';
import pageStyles from '../../../panel/widgets/lighting/LightingPage.module.scss';
import styles from './ThermalsTab.module.scss';

interface ThermalsTabProps {
  cooling: {
    data: DiagnosticsCoolingResponse | null;
    loading: boolean;
    error: boolean;
    refresh: () => void;
  };
  /** The All thermals chart's history; the hook instance lives in DiagnosticsView so its viewport survives tab switches. */
  coolingHistory: UseMetricHistoryResult;
  /** The Custom sensors chart's history. */
  sensorHistory: UseMetricHistoryResult;
  episodes: readonly DiagnosticsTemperatureEpisode[];
  serviceOnline: boolean;
  /** Opens the Cooling page, for an active thermal guard trip. */
  onOpenCooling?: () => void;
  /** The user dismissed an ended trip: refresh whatever shows it. */
  onGuardTripDismissed: () => void;
  /** Chart mode and the entry picked in each mode, owned by DiagnosticsView so they survive tab switches. */
  selection: ThermalsSelection;
  onSelectionChange: (next: ThermalsSelection) => void;
  /** A card to scroll to and shine once the rules have loaded (set by a Summary row). */
  focusRuleId: string | null;
  onFocused: () => void;
  /** Called after an alert was dismissed, so the Health summary refreshes. */
  onAlertDismissed: () => void;
}

/**
 * Every thermal in one place: a full-width chart (all device temperatures, or one custom sensor), then the
 * watchlist on the left and the selected entry's settings on the right, then the fans. Selecting a watchlist
 * entry picks the chart mode, and a chart legend item selects its built-in entry.
 */
export function ThermalsTab({
  cooling, coolingHistory, sensorHistory, episodes, serviceOnline, onOpenCooling, onGuardTripDismissed,
  selection, onSelectionChange, focusRuleId, onFocused, onAlertDismissed,
}: ThermalsTabProps) {
  const { t } = useTranslation();
  const { push } = useToast();
  const alerts = useSensorAlerts(true, true);
  const { rules, states, loaded, error, loading, refresh } = alerts;
  const lookup = useSensorLookup();
  const { sensors, extras, networkSensors, resolve } = lookup;
  const { mode, selectedId, builtIns, custom } = resolveThermals(rules, selection);
  const selectedRule = rules.find(r => r.id === selectedId);
  const select = (rule: SensorAlertRule) => onSelectionChange(selectRule(selection, rule));
  // The focus effect reads the latest selection without re-running on every selection change.
  const selectionRef = useRef(selection);
  useEffect(() => { selectionRef.current = selection; });
  // Re-snapshot "now" when the states change, so render stays pure.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { setNow(Date.now()); }, [states]);

  // The Custom view needs at least one custom sensor; once the last is deleted the stored mode follows the shown one.
  const customGone = loaded && selection.mode === 'custom' && custom.length === 0;
  useEffect(() => {
    if (customGone) onSelectionChange(selectMode(selection, 'all'));
  }, [customGone, selection, onSelectionChange]);

  // The first sensor the picker would list: new rules start on it.
  const firstSensor = useMemo(() => {
    for (const category of ALERT_SENSOR_CATEGORIES) {
      const options = sensorsForDevice(sensors, networkSensors, extras, category as DeckMonitoringCategory)
        .filter(o => o.type !== undefined && (ALERT_SENSOR_TYPES as readonly string[]).includes(o.type));
      for (const option of options) {
        const found = resolve(category, option.value);
        if (found && !findTrackedRule(rules, sensorRefOf(category, found))) return { category, sensor: found };
      }
    }
    return null;
  }, [sensors, networkSensors, extras, resolve, rules]);

  // The entry a refused add or re-point collided with; the modal offers to select it.
  const [trackedBy, setTrackedBy] = useState<SensorAlertRule | null>(null);
  const findTracked = (sensor: SensorRef, exceptId?: string) => findTrackedRule(rules, sensor, exceptId);

  const addingRef = useRef(false);
  const onAdd = async () => {
    if (!firstSensor || alerts.atLimit || !loaded || addingRef.current) return;
    addingRef.current = true;
    const { category, sensor } = firstSensor;
    const res = await alerts.add(defaultRule(sensorRefOf(category, sensor), sensor.value)).finally(() => { addingRef.current = false; });
    if (res.rule) select(res.rule);
    else if (res.result === 'tracked') {
      const existing = (res.ruleId ? rules.find(r => r.id === res.ruleId) : undefined) ?? findTracked(sensorRefOf(category, sensor));
      if (existing) setTrackedBy(existing);
      else push({ title: t('diagnostics.sensors.tracked.title') });
    }
    else if (res.result === 'error') push({ title: t('diagnostics.alerts.addFailed') });
  };

  const stateOf = (id: string) => states.find(s => s.ruleId === id);
  const listProps = {
    states,
    selectedId,
    liveOf: (rule: SensorAlertRule) => resolve(rule.sensor.category, rule.sensor.id)?.value ?? null,
    onSelect: (id: string) => { const rule = rules.find(r => r.id === id); if (rule) select(rule); },
    onToggleEnabled: (rule: SensorAlertRule, enabled: boolean) => alerts.save({ ...rule, enabled }, () => push({ title: t('diagnostics.alerts.saveFailed') })),
  };
  const restoreBuiltIn = (id: string) => { void alerts.resetBuiltIns(id).then(ok => { if (!ok) push({ title: t('diagnostics.alerts.saveFailed') }); }); };
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
  const activeHistory = mode === 'custom' ? sensorHistory : coolingHistory;
  const historySettled = !activeHistory.loading || !activeHistory.supported || activeHistory.error;
  const focusedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!focusRuleId) { focusedRef.current = null; return; }
    if (!loaded || !historySettled || focusedRef.current === focusRuleId) return;
    focusedRef.current = focusRuleId;
    const target = rules.find(r => r.id === focusRuleId);
    if (target) {
      onSelectionChange(selectRule(selectionRef.current, target));
      requestSearchScroll(sensorCardAnchor(focusRuleId));
    }
    onFocused();
  }, [focusRuleId, loaded, historySettled, rules, onSelectionChange, onFocused]);

  const modeToggle = custom.length > 0 ? (
    <ChipGroup
      ariaLabel={t('diagnostics.thermals.mode.aria')}
      options={[
        // eslint-disable-next-line i18next/no-literal-string -- option keys, not text
        { key: 'all', label: t('diagnostics.thermals.mode.all') },
        // eslint-disable-next-line i18next/no-literal-string -- option keys, not text
        { key: 'custom', label: t('diagnostics.thermals.mode.custom') },
      ]}
      activeKey={mode}
      onChange={key => onSelectionChange(selectMode(selection, key as ThermalsMode))}
    />
  ) : undefined;

  const watchlist = !loaded
    ? (error ? <SectionLoadError onRetry={refresh} loading={loading} /> : <GenericSkeleton />)
    : rules.length === 0
      ? (
        <div className={styles.messageBox}>
          <EmptyState
            compact
            icon={<ChartLine size={22} />}
            title={t('diagnostics.sensors.empty')}
            hint={note ?? t('diagnostics.sensors.emptyHintAdd')}
            action={addButton}
          />
        </div>
      )
      : (
        <div className={styles.split}>
          <div className={styles.listPane}>
            <div className={styles.groupHeader}>
              <SectionHeader>{t('diagnostics.tab.sensors')}</SectionHeader>
              {note && <span className={styles.note}>{note}</span>}
            </div>
            <SensorList rules={[...builtIns, ...custom]} {...listProps} />
            <button
              type="button" className={pageStyles.addSmartLights} data-testid="sensor-add"
              disabled={!loaded || alerts.atLimit || !firstSensor} onClick={() => void onAdd()}
            >
              <Plus size={22} aria-hidden />
              <span>{t('diagnostics.sensors.add')}</span>
            </button>
          </div>
          {selectedRule && (
            <div className={styles.detail} data-testid="sensor-detail" data-rule-id={selectedRule.id}>
              <div className={styles.groupHeader}>
                <SectionHeader>{t('diagnostics.sensors.settings.title')}</SectionHeader>
              </div>
              <Card>
                <div data-testid="sensor-settings">
                  <SensorAlertRuleSettings
                    key={selectedRule.id}
                    rule={selectedRule}
                    lookup={lookup}
                    onPreview={alerts.preview}
                    onSave={next => alerts.save(next, (code, ruleId) => {
                      const existing = code === 'sensor_already_tracked'
                        ? ((ruleId ? rules.find(r => r.id === ruleId) : undefined) ?? findTracked(next.sensor, next.id))
                        : undefined;
                      if (existing) setTrackedBy(existing);
                      else push({ title: t('diagnostics.alerts.saveFailed') });
                    })}
                    findTracked={sensor => findTracked(sensor, selectedRule.id)}
                    onTracked={setTrackedBy}
                    onDelete={() => { void alerts.remove(selectedRule.id).then(ok => { if (!ok) push({ title: t('diagnostics.alerts.deleteFailed') }); }); }}
                    state={stateOf(selectedRule.id)}
                    onRestoreDefault={() => restoreBuiltIn(selectedRule.id)}
                  />
                </div>
              </Card>
            </div>
          )}
        </div>
      );

  return (
    <div className={styles.root}>
      <ConfirmModal
        open={trackedBy !== null}
        title={t('diagnostics.sensors.tracked.title')}
        message={trackedBy ? t('diagnostics.sensors.tracked.message', { name: ruleLabel(trackedBy) }) : ''}
        confirmLabel={t('diagnostics.sensors.tracked.show')}
        destructive={false}
        onConfirm={() => { if (trackedBy) select(trackedBy); setTrackedBy(null); }}
        onCancel={() => setTrackedBy(null)}
      />
      <GuardTripNotice serviceOnline={serviceOnline} onOpenCooling={onOpenCooling} onDismissed={onGuardTripDismissed} />
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
      {mode === 'custom' && selectedRule ? (
        <div data-testid="sensor-history" data-mode="custom" data-rule-id={selectedRule.id}>
          <SensorHistorySection
            history={sensorHistory}
            rule={selectedRule}
            headerControl={modeToggle}
            legend={(
              <ChipGroup
                wrap
                ariaLabel={t('diagnostics.thermals.mode.custom')}
                options={custom.map(r => ({ key: r.id, label: ruleLabel(r) }))}
                activeKey={selectedRule.id}
                onChange={id => { const rule = rules.find(r => r.id === id); if (rule) select(rule); }}
              />
            )}
          />
        </div>
      ) : (
        <div data-testid="cooling-history" data-mode="all">
          <CoolingHistorySection
            history={coolingHistory}
            episodes={episodes}
            headerControl={modeToggle}
            activeSeriesId={builtInSeriesId(selectedRule)}
            thresholds={builtInThresholds(selectedRule)}
            onSeriesSelect={seriesId => { const rule = ruleForSeries(rules, seriesId); if (rule) select(rule); }}
          />
        </div>
      )}
      {watchlist}
      <CoolingSection
        data={cooling.data} loading={cooling.loading} error={cooling.error} onRefresh={cooling.refresh}
        heading={t('diagnostics.cooling.fansTitle')}
      />
    </div>
  );
}
