import { useCallback, useEffect, useMemo, useState } from 'react';
import { applyProfile, fetchProfiles } from '../../../api/cooling';
import { useSensors } from '../../../hooks/useSensors';
import { useTopicCallback } from '../../../hooks/useMultiplexSocket';
import { publishControlSync, subscribeControlSync } from '../../../lib/controlSync';
import { COOLING_PRESETS, isCoolingPresetKey, type CoolingPresetKey } from '../../../components/views/cooling/coolingPresets';
import { averageFanRpm } from '../../../components/views/cooling/coolingTrendHelpers';
import { HalfGaugeGauge } from '../performance/gauges/HalfGaugeGauge';
import { MicroBar } from '../performance/MicroBar';
import type { GaugeProps } from '../performance/gauges/types';
import { useTranslation } from '../../../lib/i18n';
import type { WidgetProps } from '../types';
import styles from './CoolingWidget.module.scss';

const WIDGET_PRESET_KEYS: CoolingPresetKey[] = ['silent', 'balanced', 'performance'];
const TEMP_MAX = 100;
const FAN_BASELINE_MAX = 2500;

interface CoolingSlot {
  key: 'cpu' | 'gpu' | 'fan';
  props: GaugeProps;
}

export function CoolingWidget({ widget }: WidgetProps) {
  const { t } = useTranslation();
  const [active, setActive] = useState<CoolingPresetKey>('custom');

  const sensors = useSensors(true);
  const cpuTemp = sensors.cpu.find(s => s.type === 'Temperature');
  const gpuTemp = sensors.gpu.find(s => s.type === 'Temperature');
  const fanSensors = [
    ...sensors.motherboard.filter(s => s.type === 'Fan'),
    ...sensors.gpu.filter(s => s.type === 'Fan'),
  ];
  const hasFans = fanSensors.length > 0;
  const fanValue = averageFanRpm(fanSensors.map(s => s.value));
  const fanMax = Math.max(FAN_BASELINE_MAX, fanValue * 1.2);

  const slots = useMemo<CoolingSlot[]>(() => {
    const list: CoolingSlot[] = [];
    if (cpuTemp) {
      list.push({
        key: 'cpu',
        props: gaugeProps(cpuTemp.value, cpuTemp.value / TEMP_MAX * 100, formatTemp(cpuTemp.value), t('cooling.label.cpu')),
      });
    }
    if (gpuTemp) {
      list.push({
        key: 'gpu',
        props: gaugeProps(gpuTemp.value, gpuTemp.value / TEMP_MAX * 100, formatTemp(gpuTemp.value), t('cooling.label.gpu')),
      });
    }
    if (hasFans) {
      list.push({
        key: 'fan',
        props: gaugeProps(fanValue, (fanValue / fanMax) * 100, formatFan(fanValue), t('cooling.label.fan')),
      });
    }
    return list;
  }, [cpuTemp, gpuTemp, fanValue, fanMax, hasFans, t]);

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
      <div className={styles.cooling} data-size={widget.size} data-slots={slots.length}>
        <div className={styles.microRows}>
          {slots.map(slot => (
            <MicroBar
              key={slot.key}
              label={slot.props.label}
              formatted={slot.props.formatted}
              fillPercent={slot.props.value}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.cooling} data-size={widget.size} data-slots={slots.length}>
      <div
        className={styles.slotGrid}
        role="group"
        aria-label={t('panel.widget.cooling')}
      >
        {slots.map(slot => (
          <div key={slot.key} className={styles.slot}>
            <HalfGaugeGauge {...slot.props} />
          </div>
        ))}
      </div>

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

function gaugeProps(rawValue: number, pct: number, formatted: string, label: string): GaugeProps {
  return {
    value: Math.max(0, Math.min(100, pct)),
    rawValue,
    formatted,
    label,
    history: [],
    maxValue: 100,
    historyDomain: [0, 100],
  };
}

function formatTemp(value: number): string {
  return `${Math.round(value)}°C`;
}

function formatFan(value: number): string {
  // No thousands separator - splitFormatted's number regex only handles
  // plain digits, so "1,400 RPM" would split into "1" + ",400 RPM" and
  // the unit chip would swallow most of the number.
  return `${Math.round(value)} RPM`;
}

export default CoolingWidget;
