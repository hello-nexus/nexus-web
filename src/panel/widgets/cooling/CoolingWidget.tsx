import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  applyProfile, fetchProfiles,
  fetchCurves, fetchFanChannels, fetchTemperatureSources,
  type FanChannel, type TemperatureSource,
} from '../../../api/cooling';
import { useSensors } from '../../../hooks/useSensors';
import { useTopicCallback } from '../../../hooks/useMultiplexSocket';
import { publishControlSync, subscribeControlSync } from '../../../lib/controlSync';
import { COOLING_PRESETS, isCoolingPresetKey, type CoolingPresetKey } from '../../../components/views/cooling/coolingPresets';
import { MicroBar } from '../performance/MicroBar';
import type { GaugeProps } from '../performance/gauges/types';
import type { CurveDef, CurveType, FanState, MixFn, CurvePreset } from '../../../types/cooling';
import { useTranslation } from '../../../lib/i18n';
import type { WidgetProps } from '../types';
import { CoolingResponseChart } from './CoolingResponseChart';
import styles from './CoolingWidget.module.scss';

const WIDGET_PRESET_KEYS: CoolingPresetKey[] = ['silent', 'balanced', 'performance'];
const TEMP_MAX = 100;

interface CoolingSlot {
  key: 'cpu' | 'gpu' | 'fan';
  props: GaugeProps;
}

export function CoolingWidget({ widget }: WidgetProps) {
  const { t } = useTranslation();
  const [active, setActive] = useState<CoolingPresetKey>('custom');
  const [curves, setCurves] = useState<CurveDef[]>([]);
  const [fanStates, setFanStates] = useState<Record<string, FanState>>({});
  const [channels, setChannels] = useState<FanChannel[]>([]);
  const [sources, setSources] = useState<TemperatureSource[]>([]);

  const sensors = useSensors(true);
  const cpuTemp = sensors.cpu.find(s => s.type === 'Temperature');
  const gpuTemp = sensors.gpu.find(s => s.type === 'Temperature');
  const fanSensors = [
    ...sensors.motherboard.filter(s => s.type === 'Fan'),
    ...sensors.gpu.filter(s => s.type === 'Fan'),
  ];
  const hasFans = fanSensors.length > 0;
  const avgDuty = channels.length
    ? channels.reduce((sum, c) => sum + c.dutyPercent, 0) / channels.length
    : undefined;

  const compact = widget.size === '2x2';

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
      const duty = avgDuty ?? 0;
      list.push({
        key: 'fan',
        props: gaugeProps(duty, duty, formatDuty(duty), t('cooling.label.fan')),
      });
    }
    return list;
  }, [cpuTemp, gpuTemp, avgDuty, hasFans, t]);

  const refreshProfiles = useCallback(() => {
    fetchProfiles().then(data => {
      if (!data) return;
      if (data.active && isCoolingPresetKey(data.active)) setActive(data.active);
    }).catch(() => { /* best-effort */ });
  }, []);

  // Load curves + fan-state mapping + temperature sources for the response
  // chart. Mirrors CoolingView's normalisation: the API ships curves keyed
  // by "input.id" / "Flat|Linear|Graph|Mixed" so we adapt to the shared
  // CurveDef shape that computeCurveSpeed expects. Fan→curve assignment is
  // derived from each curve's `outputs` plus any channel whose mode is
  // Manual (those count as a flat baseline at their current duty).
  const refreshCoolingConfig = useCallback(() => {
    Promise.all([fetchFanChannels(), fetchCurves(), fetchTemperatureSources()])
      .then(([fans, saved, temps]) => {
        const restored: Record<string, FanState> = {};
        if (fans?.channels) {
          setChannels(fans.channels);
          for (const ch of fans.channels) {
            if (ch.mode === 'Manual') restored[ch.id] = { softwareControl: true, curveId: null };
          }
        }
        if (saved?.curves?.length) {
          const loaded: CurveDef[] = saved.curves.map(c => ({
            id: c.id,
            name: c.name,
            type: (c.type === 'Flat' ? 'flat' : c.type === 'Linear' ? 'linear' : c.type === 'Graph' ? 'graph' : 'mix') as CurveType,
            sourceId: c.input?.id ?? '',
            flat: { speed: c.flat?.speed ?? 50 },
            linear: {
              responseTime: c.linear?.responseTime ?? 1.5,
              minTemp: c.linear?.minTemp ?? 35,
              maxTemp: c.linear?.maxTemp ?? 75,
              minSpeed: c.linear?.minSpeed ?? 30,
              maxSpeed: c.linear?.maxSpeed ?? 90,
            },
            graph: {
              responseTime: c.graph?.responseTime ?? 1.5,
              points: c.graph?.points?.length ? c.graph.points : [
                { temp: 30, speed: 25 }, { temp: 50, speed: 40 },
                { temp: 70, speed: 70 }, { temp: 90, speed: 100 },
              ],
            },
            mix: {
              responseTime: c.mixed?.responseTime ?? 1.0,
              curveIds: c.mixed?.curveIds ?? [],
              fn: (c.mixed?.fn ?? 'max') as MixFn,
            },
            preset: c.preset ? (c.preset as CurvePreset) : undefined,
          }));
          setCurves(loaded);
          for (const c of saved.curves) {
            for (const out of c.outputs ?? []) {
              restored[out.id] = { softwareControl: true, curveId: c.id };
            }
          }
        } else {
          setCurves([]);
        }
        setFanStates(restored);
        if (temps?.sources) setSources(temps.sources);
      })
      .catch(() => { /* best-effort */ });
  }, []);

  const onCoolingTopic = useCallback(() => {
    refreshProfiles();
    refreshCoolingConfig();
  }, [refreshProfiles, refreshCoolingConfig]);

  useEffect(() => { refreshProfiles(); refreshCoolingConfig(); }, [refreshProfiles, refreshCoolingConfig]);
  useTopicCallback('cooling', true, onCoolingTopic);

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
    <div className={styles.cooling} data-size={widget.size}>
      <CoolingResponseChart
        curves={curves}
        fanStates={fanStates}
        channels={channels}
        sources={sources}
        cpuTemp={cpuTemp?.value}
        gpuTemp={gpuTemp?.value}
        avgDuty={avgDuty}
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

function formatDuty(value: number): string {
  return `${Math.round(value)}%`;
}

export default CoolingWidget;
