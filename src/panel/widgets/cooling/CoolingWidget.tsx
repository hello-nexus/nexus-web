import { useCallback, useEffect, useMemo, useState } from 'react';
import { Fan } from 'lucide-react';
import { applyProfile, fetchProfiles } from '../../../api/cooling';
import { useSensors } from '../../../hooks/useSensors';
import { useTopicCallback } from '../../../hooks/useMultiplexSocket';
import { publishControlSync, subscribeControlSync } from '../../../lib/controlSync';
import { COOLING_PRESETS, isCoolingPresetKey, type CoolingPresetKey } from '../../../components/views/cooling/coolingPresets';
import {
  FAN_MIN_DOMAIN_MAX, TEMP_DOMAIN,
  averageFanRpm, averageTemp, clampSamples, fanDomainMax,
  formatAverageTemp, formatFanRpm, paddedSamples,
} from '../../../components/views/cooling/coolingTrendHelpers';
import { Sparkline } from '../../../components/Sparkline/Sparkline';
import { useTranslation } from '../../../lib/i18n';
import { PERF_HISTORY_SAMPLES, useHistory } from '../common/useHistory';
import type { WidgetProps } from '../types';
import styles from './CoolingWidget.module.scss';

export function CoolingWidget({ widget }: WidgetProps) {
  const { t } = useTranslation();
  const [active, setActive] = useState<CoolingPresetKey>('custom');

  const sensors = useSensors(true);
  const cpuTemp = sensors.cpu.find(s => s.type === 'Temperature');
  const gpuTemp = sensors.gpu.find(s => s.type === 'Temperature');
  // Match the cooling page: average across mobo + GPU fans so the widget RPM
  // and the cooling-page trend RPM agree.
  const fanSensors = [
    ...sensors.motherboard.filter(s => s.type === 'Fan'),
    ...sensors.gpu.filter(s => s.type === 'Fan'),
  ];

  const hasFans = fanSensors.length > 0;
  const fanValue = averageFanRpm(fanSensors.map(s => s.value));
  const tempValue = averageTemp(cpuTemp, gpuTemp);
  const fanHistory = useHistory(hasFans ? fanValue : Number.NaN, PERF_HISTORY_SAMPLES);
  const tempHistory = useHistory(tempValue ?? Number.NaN, PERF_HISTORY_SAMPLES);

  const refreshProfiles = useCallback(() => {
    fetchProfiles().then(data => {
      if (!data) return;
      if (data.active && isCoolingPresetKey(data.active)) setActive(data.active);
    }).catch(() => { /* best-effort */ });
  }, []);
  useEffect(() => { refreshProfiles(); }, [refreshProfiles]);
  useTopicCallback('cooling', true, refreshProfiles);

  // Cross-window sync: a tab change on the desktop should reflect immediately.
  useEffect(() => subscribeControlSync(event => {
    if (event.domain !== 'cooling') return;
    const next = event.activePreset ?? event.activeProfile;
    if (next && isCoolingPresetKey(next)) setActive(next);
  }), []);

  const apply = (key: CoolingPresetKey) => {
    setActive(key);
    publishControlSync({ domain: 'cooling', activePreset: key });
    applyProfile(key).catch(() => { /* best-effort */ });
  };

  const compact = widget.size === '2x2';
  const showControls = widget.config?.showControls?.b ?? true;
  const activeLabel = t(COOLING_PRESETS.find(p => p.key === active)?.i18nKey ?? 'cooling.preset.custom');

  if (!showControls) {
    return (
      <div className={styles.cooling} data-size={widget.size} data-display-only="true">
        <div className={styles.display}>
          <Fan className={styles.displayIcon} aria-hidden="true" />
          {active !== 'off' && <div className={styles.displayMode}>{activeLabel}</div>}
          <div className={styles.displayValue}>{formatFanRpm(fanValue, hasFans)}</div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.cooling} data-size={widget.size}>
      {!compact && (
        <CoolingTrend
          activeLabel={activeLabel}
          tempValue={tempValue}
          tempHistory={tempHistory}
          fanHistory={fanHistory}
          fanValue={fanValue}
          hasFans={hasFans}
        />
      )}

      <div className={styles.chips}>
        {COOLING_PRESETS.map(p => {
          const label = t(p.i18nKey);
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => apply(p.key)}
              className={styles.chip}
              data-active={active === p.key ? 'true' : 'false'}
              aria-pressed={active === p.key}
              aria-label={`Apply ${label} cooling profile`}
              title={label}
            >
              <p.Icon aria-hidden="true" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface CoolingTrendProps {
  activeLabel: string;
  tempValue: number | undefined;
  tempHistory: number[];
  fanHistory: number[];
  fanValue: number;
  hasFans: boolean;
}

function CoolingTrend({
  activeLabel,
  tempValue,
  tempHistory,
  fanHistory,
  fanValue,
  hasFans,
}: CoolingTrendProps) {
  const fanMax = hasFans ? fanDomainMax(fanHistory, fanValue) : FAN_MIN_DOMAIN_MAX;
  const tempSamples = useMemo(
    () => tempValue === undefined ? [] : clampSamples(paddedSamples(tempHistory, tempValue, PERF_HISTORY_SAMPLES), TEMP_DOMAIN),
    [tempHistory, tempValue],
  );
  const fanSamples = useMemo(
    () => hasFans ? clampSamples(paddedSamples(fanHistory, fanValue, PERF_HISTORY_SAMPLES), [0, fanMax]) : [],
    [fanHistory, fanMax, fanValue, hasFans],
  );

  return (
    <section
      className={styles.trend}
      aria-label="Average temperature compared with average fan speed"
    >
      <div className={styles.trendHeader}>
        <span className={styles.modeLabel}>{activeLabel}</span>
        <span className={styles.trendValues}>
          <span className={styles.trendValue}>{formatAverageTemp(tempValue)}</span>
          <span className={styles.trendValue}>{formatFanRpm(fanValue, hasFans)}</span>
        </span>
      </div>
      <div className={styles.chartWrap}>
        <span className={styles.gridLine} data-line="upper" aria-hidden="true" />
        <span className={styles.gridLine} data-line="lower" aria-hidden="true" />
        {tempSamples.length > 0 && (
          <Sparkline
            className={styles.chart}
            values={tempSamples}
            domain={TEMP_DOMAIN}
            width="100%"
            height={58}
            color="var(--panel-accent)"
            sampleCount={PERF_HISTORY_SAMPLES}
            showFill
            fillOpacity={0.18}
            strokeWidth={2}
          />
        )}
        {fanSamples.length > 0 && (
          <Sparkline
            className={`${styles.chart} ${styles.fanLine}`}
            values={fanSamples}
            domain={[0, fanMax]}
            width="100%"
            height={58}
            color="var(--panel-accent)"
            sampleCount={PERF_HISTORY_SAMPLES}
            showFill={false}
            strokeWidth={2}
          />
        )}
      </div>
    </section>
  );
}

export default CoolingWidget;
