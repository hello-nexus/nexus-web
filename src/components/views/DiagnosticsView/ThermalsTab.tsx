import { useEffect, useMemo, useRef, useState } from 'react';
import { ChartLine, MousePointerClick, Plus, SearchX } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import {
  MAX_SENSOR_ALERT_RULES,
  type SensorAlertRule,
  type SensorRef,
} from '../../../api/diagnosticsAlerts';
import type { DiagnosticsTemperatureEpisode } from '../../../api/diagnostics';
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
import { ALERT_SENSOR_CATEGORIES, ALERT_SENSOR_TYPES, defaultRule, findTrackedRule, formatDisplayValue, isBannerAlert, rowTitles, ruleLabel, sensorRefOf } from './sensorAlertHelpers';
import { Card } from '../../common/Card/Card';
import { SearchInput } from '../../common/SearchInput/SearchInput';
import { SectionHeader } from '../../common/SectionHeader/SectionHeader';
import { CollapsibleSection } from '../../common/CollapsibleSection/CollapsibleSection';
import { SensorAlertRuleSettings } from './SensorAlertRuleSettings';
import { CoolingHistorySection } from './CoolingHistorySection';
import { toCoolingTempChartSeries } from './coolingHistoryHelpers';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { GuardTripNotice } from './GuardTripNotice';
import { SensorList } from './SensorList';
import { sensorCardAnchor, sensorYDomain } from './sensorHistoryHelpers';
import {
  deselect,
  groupLabelKey,
  groupedRules,
  groupTitleKey,
  linkHistories,
  resolveThermals,
  ruleForSeries,
  ruleLines,
  ruleOutOfRangeBands,
  ruleThresholds,
  selectGroup,
  selectRule,
  seriesIdOfRule,
  type ThermalsSelection,
  visibleSelection,
} from './thermalsHelpers';
import pageStyles from '../../../panel/widgets/lighting/LightingPage.module.scss';
import styles from './ThermalsTab.module.scss';

interface ThermalsTabProps {
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
  /** Chart group and the entry picked, owned by DiagnosticsView so they survive tab switches. */
  selection: ThermalsSelection;
  onSelectionChange: (next: ThermalsSelection) => void;
  /** A card to scroll to and shine once the rules have loaded (set by a Summary row). */
  focusRuleId: string | null;
  onFocused: () => void;
  /** Called after an alert was dismissed, so the Health summary refreshes. */
  onAlertDismissed: () => void;
}

/**
 * Every thermal in one place: a full-width chart of one unit group (Thermals, Loads, Voltages, ...), then the
 * watchlist on the left and the selected entry's settings on the right, then the fans. Selecting a watchlist
 * entry shows its group, and a chart legend item selects its entry; selecting it again clears the pick.
 */
export function ThermalsTab({
  coolingHistory, sensorHistory, episodes, serviceOnline, onOpenCooling, onGuardTripDismissed,
  selection, onSelectionChange, focusRuleId, onFocused, onAlertDismissed,
}: ThermalsTabProps) {
  const { t } = useTranslation();
  const { push } = useToast();
  const alerts = useSensorAlerts(true, true);
  const { rules, states, loaded, error, loading, refresh } = alerts;
  const lookup = useSensorLookup();
  const { sensors, extras, networkSensors, resolve } = lookup;
  const { group, groups, selectedId, groupRules } = resolveThermals(rules, selection);
  const selectedRule = rules.find(r => r.id === selectedId);
  const select = (rule: SensorAlertRule) => onSelectionChange(selectRule(selection, rule));
  // A second pick of the selected entry clears it.
  const toggleSelect = (rule: SensorAlertRule) => onSelectionChange(rule.id === selectedId ? deselect(selection) : selectRule(selection, rule));
  const { monitoringTempUnit, numberFormat, monitoringWholeNumbers } = useUnitPrefs();
  // The focus effect reads the latest selection without re-running on every selection change.
  const selectionRef = useRef(selection);
  useEffect(() => { selectionRef.current = selection; });
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
    if (res.rule) {
      // A search that would hide the new entry is cleared so it shows (and the selected-but-hidden state never applies to a fresh add).
      setQuery('');
      select(res.rule);
    }
    else if (res.result === 'tracked') {
      const existing = (res.ruleId ? rules.find(r => r.id === res.ruleId) : undefined) ?? findTracked(sensorRefOf(category, sensor));
      if (existing) setTrackedBy(existing);
      else push({ title: t('diagnostics.sensors.tracked.title') });
    }
    else if (res.result === 'error') push({ title: t('diagnostics.alerts.addFailed') });
  };

  // The sensor dropdown text the editor's picker lists for a stored sensor.
  const pickerLabel = (sensor: SensorRef) => sensorsForDevice(sensors, networkSensors, extras, sensor.category as DeckMonitoringCategory)
    .find(o => o.value === sensor.id || o.sensorName === sensor.id)?.label;
  const entryName = (rule: SensorAlertRule) => {
    const { title, subtitle } = rowTitles(rule, t, pickerLabel);
    return subtitle ? `${title}: ${subtitle}` : title;
  };
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const sections = groupedRules(rules)
    .map(section => ({
      ...section,
      rules: needle
        ? section.rules.filter(r => { const { title, subtitle } = rowTitles(r, t, pickerLabel); return `${title} ${subtitle ?? ''}`.toLowerCase().includes(needle); })
        : section.rules,
    }))
    .filter(section => section.rules.length > 0);
  const detailRule = visibleSelection(selectedRule, sections);
  // Collapsed unit groups. Searching shows every match, and picking a sensor (a chart click, a deep link) reopens its group.
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(() => new Set());
  // Keyed on the group too, so a sensor change that re-sorts the entry into another group reopens that group as well.
  const selectedGroup = groupedRules(rules).find(s => s.rules.some(r => r.id === selectedId))?.group;
  const selectionKey = `${selectedId ?? ''}|${selectedGroup ?? ''}`;
  const [seenSelectionKey, setSeenSelectionKey] = useState(selectionKey);
  if (selectionKey !== seenSelectionKey) {
    setSeenSelectionKey(selectionKey);
    if (selectedGroup && collapsedGroups.has(selectedGroup)) {
      const next = new Set(collapsedGroups);
      next.delete(selectedGroup);
      setCollapsedGroups(next);
    }
  }
  // Keeps a newly added or re-sorted entry inside the list's own scroll box. Scoped to that scroller, so the page never jumps.
  const listScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = listScrollRef.current;
    if (!box || !selectedId) return;
    const row = Array.from(box.querySelectorAll<HTMLElement>('[data-rule-id]')).find(el => el.dataset.ruleId === selectedId);
    if (!row) return;
    const rowRect = row.getBoundingClientRect();
    const boxRect = box.getBoundingClientRect();
    if (rowRect.top < boxRect.top) box.scrollTop -= boxRect.top - rowRect.top;
    else if (rowRect.bottom > boxRect.bottom) box.scrollTop += rowRect.bottom - boxRect.bottom;
    // Only a change of the selected entry or its group moves the list, not every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionKey, selectedRule !== undefined]);
  const toggleGroup = (g: string) => setCollapsedGroups(prev => {
    const next = new Set(prev);
    if (!next.delete(g)) next.add(g);
    return next;
  });

  // The chart's lines. Thermals draws the device temperatures plus the custom temperature entries; every other
  // group draws its entries' recorded lines.
  const thermalsGroup = group === 'thermals';
  const customTemps = useMemo(() => groupRules.filter(r => !r.builtIn), [groupRules]);
  const deviceLines = useMemo(() => toCoolingTempChartSeries(coolingHistory.series), [coolingHistory.series]);
  const customLines = useMemo(
    () => ruleLines(thermalsGroup ? customTemps : groupRules, sensorHistory.series, ruleLabel, new Set(deviceLines.map(l => l.color))),
    [thermalsGroup, customTemps, groupRules, sensorHistory.series, deviceLines],
  );
  const chartLines = useMemo(() => (thermalsGroup ? [...deviceLines, ...customLines] : customLines), [thermalsGroup, deviceLines, customLines]);
  const rangeBands = useMemo(() => ruleOutOfRangeBands(groupRules, chartLines), [groupRules, chartLines]);
  const chartHistory = useMemo(
    () => (thermalsGroup && customTemps.length > 0 ? linkHistories(coolingHistory, sensorHistory) : thermalsGroup ? coolingHistory : sensorHistory),
    [thermalsGroup, customTemps.length, coolingHistory, sensorHistory],
  );
  const groupType = groupRules[0]?.sensor.type ?? 'Temperature';
  const groupFormat = useMemo(
    () => (v: number) => formatDisplayValue(v, groupType, monitoringTempUnit, numberFormat, monitoringWholeNumbers),
    [groupType, monitoringTempUnit, numberFormat, monitoringWholeNumbers],
  );
  const thresholds = useMemo(() => ruleThresholds(selectedRule), [selectedRule]);
  const groupYDomain = useMemo(
    () => (thermalsGroup ? undefined : sensorYDomain({ id: '', name: '', color: '', points: customLines.flatMap(l => l.points) }, thresholds)),
    [thermalsGroup, customLines, thresholds],
  );

  const stateOf = (id: string) => states.find(s => s.ruleId === id);
  const listProps = {
    states,
    selectedId,
    pickerLabel,
    liveOf: (rule: SensorAlertRule) => resolve(rule.sensor.category, rule.sensor.id)?.value ?? null,
    onSelect: (id: string) => { const rule = rules.find(r => r.id === id); if (rule) toggleSelect(rule); },
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
  const activeHistory = chartHistory;
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

  const groupToggle = groups.length > 1 ? (
    <ChipGroup
      ariaLabel={t('diagnostics.thermals.mode.aria')}
      options={groups.map(key => ({ key, label: t(groupLabelKey(key)) }))}
      activeKey={group}
      onChange={key => onSelectionChange(selectGroup(selection, key as typeof group))}
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
            <div className={styles.listHead}>
              <div className={styles.groupHeader}>
                <SectionHeader>{t('diagnostics.tab.sensors')}</SectionHeader>
                {note && <span className={styles.note}>{note}</span>}
              </div>
              <SearchInput value={query} onChange={setQuery} placeholder={t('diagnostics.sensors.search')} />
            </div>
            <div className={styles.listScroll} ref={listScrollRef} data-testid="watchlist-scroll">
              {sections.length === 0 ? (
                <div className={styles.messageBox}>
                  <EmptyState compact icon={<SearchX size={22} />} title={t('diagnostics.sensors.noMatches')} />
                </div>
              ) : sections.map(section => (
                <div key={section.group} data-testid="watchlist-group" data-group={section.group}>
                  <CollapsibleSection
                    compact
                    title={t(groupLabelKey(section.group))}
                    open={needle !== '' || !collapsedGroups.has(section.group)}
                    onToggle={() => toggleGroup(section.group)}
                  >
                    <SensorList rules={section.rules} {...listProps} />
                  </CollapsibleSection>
                </div>
              ))}
              <button
                type="button" className={pageStyles.addSmartLights} data-testid="sensor-add"
                disabled={!loaded || alerts.atLimit || !firstSensor} onClick={() => void onAdd()}
              >
                <Plus size={22} aria-hidden />
                <span>{t('diagnostics.sensors.add')}</span>
              </button>
            </div>
          </div>
          {detailRule ? (
            <div className={styles.detail} data-testid="sensor-detail" data-rule-id={detailRule.id}>
              <div className={styles.groupHeader}>
                <SectionHeader>{t('diagnostics.sensors.settings.title')}</SectionHeader>
              </div>
              <Card>
                <div data-testid="sensor-settings">
                  <SensorAlertRuleSettings
                    key={detailRule.id}
                    rule={detailRule}
                    lookup={lookup}
                    onPreview={alerts.preview}
                    onSave={next => alerts.save(next, (code, ruleId) => {
                      const existing = code === 'sensor_already_tracked'
                        ? ((ruleId ? rules.find(r => r.id === ruleId) : undefined) ?? findTracked(next.sensor, next.id))
                        : undefined;
                      if (existing) setTrackedBy(existing);
                      else push({ title: t('diagnostics.alerts.saveFailed') });
                    })}
                    findTracked={sensor => findTracked(sensor, detailRule.id)}
                    onTracked={setTrackedBy}
                    onDelete={() => { void alerts.remove(detailRule.id).then(ok => { if (!ok) push({ title: t('diagnostics.alerts.deleteFailed') }); }); }}
                    onToggleEnabled={enabled => alerts.save({ ...detailRule, enabled }, () => push({ title: t('diagnostics.alerts.saveFailed') }))}
                    state={stateOf(detailRule.id)}
                    onRestoreDefault={() => restoreBuiltIn(detailRule.id)}
                  />
                </div>
              </Card>
            </div>
          ) : (
            <div className={styles.detail} data-testid="sensor-detail-empty">
              <div className={styles.groupHeader}>
                <SectionHeader>{t('diagnostics.sensors.settings.title')}</SectionHeader>
              </div>
              <div className={styles.messageBox}>
                <EmptyState compact icon={<MousePointerClick size={22} />} title={t('diagnostics.thermals.selectHint')} />
              </div>
            </div>
          )}
        </div>
      );

  return (
    <div className={styles.root}>
      <ConfirmModal
        open={trackedBy !== null}
        title={t('diagnostics.sensors.tracked.title')}
        message={trackedBy ? t('diagnostics.sensors.tracked.message', { name: entryName(trackedBy) }) : ''}
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
      <div data-testid="thermals-history" data-group={group}>
        <CoolingHistorySection
          history={chartHistory}
          episodes={thermalsGroup ? episodes : undefined}
          headerControl={groupToggle}
          title={t(groupTitleKey(group))}
          lines={thermalsGroup ? undefined : customLines}
          extraLines={thermalsGroup ? customLines : undefined}
          fanStrip={thermalsGroup}
          valueFormat={thermalsGroup ? undefined : groupFormat}
          yDomain={groupYDomain}
          emptyTitle={thermalsGroup ? undefined : t('diagnostics.sensors.noHistory')}
          wheelZoomNeedsModifier
          activeSeriesId={selectedRule ? seriesIdOfRule(selectedRule) : null}
          thresholds={thresholds}
          rangeBands={rangeBands}
          onSeriesSelect={seriesId => { const rule = ruleForSeries(rules, seriesId); if (rule) toggleSelect(rule); }}
        />
      </div>
      {watchlist}
    </div>
  );
}
