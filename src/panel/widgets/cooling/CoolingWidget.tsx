import { useCallback, useEffect, useMemo, useState } from 'react';
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

const TEMP_RANGE_MAX = TEMP_DOMAIN[1];

const WIDGET_PRESET_KEYS: CoolingPresetKey[] = ['silent', 'balanced', 'performance'];

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
  const widgetPresets = useMemo(
    () => COOLING_PRESETS.filter(p => WIDGET_PRESET_KEYS.includes(p.key)),
    [],
  );

  if (compact) {
    return (
      <div className={styles.cooling} data-size={widget.size} data-display-only="true">
        <CoolingMicroBars
          t={t}
          tempValue={tempValue}
          fanValue={fanValue}
          fanHistory={fanHistory}
          hasFans={hasFans}
        />
      </div>
    );
  }

  return (
    <div className={styles.cooling} data-size={widget.size}>
      <CoolingTrend
        tempValue={tempValue}
        tempHistory={tempHistory}
        fanHistory={fanHistory}
        fanValue={fanValue}
        hasFans={hasFans}
      />

      <div className={styles.chips}>
        {widgetPresets.map(p => {
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
              <span className={styles.chipLabel}>{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface CoolingTrendProps {
  tempValue: number | undefined;
  tempHistory: number[];
  fanHistory: number[];
  fanValue: number;
  hasFans: boolean;
}

function CoolingTrend({
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
        <span className={styles.trendValue}>{formatAverageTemp(tempValue)}</span>
        <span className={styles.trendValue}>{formatFanRpm(fanValue, hasFans)}</span>
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

interface CoolingMicroBarsProps {
  t: (key: string) => string;
  tempValue: number | undefined;
  fanValue: number;
  fanHistory: number[];
  hasFans: boolean;
}

function CoolingMicroBars({ t, tempValue, fanValue, fanHistory, hasFans }: CoolingMicroBarsProps) {
  // Temp fills 0-100°C - the domain the cooling page already uses.
  // Fan fills 0 to the current observed max (auto-scaled) so the bar
  // remains useful at idle when the absolute RPM is low.
  const fanMax = hasFans ? fanDomainMax(fanHistory, fanValue) : FAN_MIN_DOMAIN_MAX;
  const tempPct = tempValue === undefined ? 0 : Math.max(0, Math.min(1, tempValue / TEMP_RANGE_MAX)) * 100;
  const fanPct = !hasFans || fanMax <= 0 ? 0 : Math.max(0, Math.min(1, fanValue / fanMax)) * 100;

  return (
    <div className={styles.microBars}>
      <MicroBar
        label={t('cooling.label.temp')}
        value={formatAverageTemp(tempValue)}
        pct={tempPct}
        active={tempValue !== undefined}
      />
      <MicroBar
        label={t('cooling.label.fan')}
        value={formatFanRpm(fanValue, hasFans)}
        pct={fanPct}
        active={hasFans}
      />
    </div>
  );
}

function MicroBar({ label, value, pct, active }: {
  label: string;
  value: string;
  pct: number;
  active: boolean;
}) {
  return (
    <div className={styles.microBar}>
      <div className={styles.microBarHeader}>
        <span className={styles.microBarLabel}>{label}</span>
        <span className={styles.microBarValue}>{value}</span>
      </div>
      <div className={styles.microBarTrack} data-active={active ? 'true' : 'false'}>
        <span
          className={styles.microBarFill}
          style={{ width: `${pct}%` }}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}

export default CoolingWidget;
