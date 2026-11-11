import { useEffect, useMemo } from 'react';
import { ChartLine, ZoomOut } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { useSensorAlerts } from '../../../hooks/useSensorAlerts';
import type { UseMetricHistoryResult } from '../../../hooks/useMetricHistory';
import { requestSearchScroll } from '../../../search/scroll';
import { Button } from '../../common/Button/Button';
import { EmptyState } from '../../common/EmptyState/EmptyState';
import { LiveFollowControl } from '../../common/LiveFollowControl/LiveFollowControl';
import { Select } from '../../common/Select/Select';
import { TimelineBrush, TIMELINE_BRUSH_DEFAULT_HEIGHT } from '../../common/TimelineBrush/TimelineBrush';
import { useSensorLookup } from '../../../panel/widgets/monitoring/picker/SensorPicker';
import {
  RANGE_OPTIONS,
  formatBrushEdgeLabels,
  formatSelectedFrameTime,
} from '../../../panel/widgets/monitoring/page/metricHistoryHelpers';
import { GenericSkeleton } from '../PageSkeleton/PageSkeleton';
import { SectionLoadError } from './DiagnosticsSectionStates';
import { SensorCard } from './SensorCard';
import { sensorCardAnchor } from './sensorHistoryHelpers';
import styles from './SensorsTab.module.scss';

interface SensorsTabProps {
  /** One viewport shared by every card, so a single range picker and seek bar drive them all. */
  history: UseMetricHistoryResult;
  /** A card to scroll to and shine once the rules have loaded (set by a Summary row). */
  focusRuleId: string | null;
  onFocused: () => void;
  /** Opens the rule's card on the Settings tab. */
  onEditRule: (ruleId: string) => void;
  /** Opens the Settings tab, where tracked sensors are added. */
  onOpenSettings: () => void;
}

/** The tracked sensors: a card per sensor rule with its recorded history, limits and state. */
export function SensorsTab({ history, focusRuleId, onFocused, onEditRule, onOpenSettings }: SensorsTabProps) {
  const { t, language } = useTranslation();
  const { timeFormat, dateFormat } = useUnitPrefs();
  const { rules, states, loaded, error, loading, refresh } = useSensorAlerts(true);
  const { resolve } = useSensorLookup();

  useEffect(() => {
    if (!focusRuleId || !loaded) return;
    if (rules.some(r => r.id === focusRuleId)) requestSearchScroll(sensorCardAnchor(focusRuleId));
    onFocused();
  }, [focusRuleId, loaded, rules, onFocused]);

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
          hint={t('diagnostics.sensors.emptyHint')}
          action={<Button size="sm" onClick={onOpenSettings}>{t('diagnostics.sensors.openSettings')}</Button>}
        />
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.headerRow}>
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
            state={states.find(s => s.ruleId === rule.id)}
            live={resolve(rule.sensor.category, rule.sensor.id)?.value ?? null}
            history={history}
            onEdit={() => onEditRule(rule.id)}
          />
        ))}
      </div>
    </div>
  );
}
