import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Fan } from 'lucide-react';
import { PanelArrowButton } from '../../PanelArrowButton';
import {
  applyProfile, fetchProfiles,
  fetchCurves, fetchFanChannels, fetchTemperatureSources,
  type FanChannel, type TemperatureSource,
} from '../../../api/cooling';
import { useSensors } from '../../../hooks/useSensors';
import { useTempSensorPrefs, useUiSettings } from '../../../hooks/useUiSettings';
import { resolveAdvancedMode } from '../common/AdvancedModeSettings';
import { useStateChangePulse } from '../common/useStateChangePulse';
import { SignalBarsIcon } from './SignalBarsIcon';
import { resolveCpuTempSensor, resolveGpuTempSensor } from '../../../lib/tempSensorResolver';
import { useTopicCallback } from '../../../hooks/useMultiplexSocket';
import { publishControlSync, subscribeControlSync } from '../../../lib/controlSync';
import { COOLING_PRESETS, isCoolingPresetKey, type CoolingPresetKey } from './page/coolingPresets';
import { setCachedCoolingActivePreset } from './coolingCache';
import { MicroBar } from '../monitoring/MicroBar';
import type { GaugeProps } from '../monitoring/gauges/types';
import type { CurveDef, CurveType, FanState, MixFn, CurvePreset } from '../../../types/cooling';
import { useTranslation } from '../../../lib/i18n';
import type { WidgetProps } from '../types';
import { usePanelPreview } from '../common/PanelPreviewContext';
import { CoolingResponseChart } from './CoolingResponseChart';
import styles from './CoolingWidget.module.scss';

const WIDGET_PRESET_KEYS: CoolingPresetKey[] = ['silent', 'balanced', 'turbo'];
const TEMP_MAX = 100;
// Catalog preview shows a deterministic preset (label via the existing
// cooling.preset.balanced key). Keep in sync with the simple-mode render —
// see .agents/rules/widget-preview-fixtures.md in the master repo.
const COOLING_PREVIEW_PRESET: CoolingPresetKey = 'balanced';

interface CoolingSlot {
  key: 'cpu' | 'gpu' | 'fan';
  props: GaugeProps;
}

export function CoolingWidget({ widget }: WidgetProps) {
  const { t } = useTranslation();
  const { settings: ui } = useUiSettings();
  const preview = usePanelPreview();
  // Preview forces simple mode for determinism.
  const simpleMode = preview || !resolveAdvancedMode(widget.config, ui.widgetAdvancedMode);
  const [active, setActive] = useState<CoolingPresetKey>(preview ? COOLING_PREVIEW_PRESET : 'custom');
  // False until the first profiles fetch resolves: preset changes before
  // that are hydration, not state changes, and must not animate.
  const [hydrated, setHydrated] = useState(false);
  const spinPulse = useStateChangePulse(active, !hydrated);
  // Cleared on animationend: a finished fill-mode animation stays active
  // on the node (holding a compositor layer) until the attribute drops.
  const [spinDoneAt, setSpinDoneAt] = useState(0);
  // Enabled one render after hydration commits, so the bars snap to the
  // initial server state instead of transitioning to it.
  const [barsAnimate, setBarsAnimate] = useState(false);
  useEffect(() => {
    if (hydrated) setBarsAnimate(true);
  }, [hydrated]);
  const [curves, setCurves] = useState<CurveDef[]>([]);
  const [fanStates, setFanStates] = useState<Record<string, FanState>>({});
  const [channels, setChannels] = useState<FanChannel[]>([]);
  const [sources, setSources] = useState<TemperatureSource[]>([]);

  const sensors = useSensors(!preview);
  const tempPrefs = useTempSensorPrefs();
  const cpuTemp = resolveCpuTempSensor(sensors.cpu, tempPrefs.cpuId);
  const gpuTemp = resolveGpuTempSensor(sensors.gpu, tempPrefs.gpuId);
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

  // Optimistic-lock window — see CoolingPage's identical pattern. When the
  // user clicks a preset, we set this to `now + WINDOW_MS` so the next few
  // server pushes (a stale `cooling` topic or another surface's
  // control-sync event) don't snap the UI back to the previous value while
  // the new applyProfile is still in flight. 1500 ms matches CoolingPage.
  const presetLockUntilRef = useRef(0);
  const PRESET_LOCK_MS = 1500;

  const refreshProfiles = useCallback(() => {
    fetchProfiles().then(data => {
      if (!data) return;
      setHydrated(true);
      if (Date.now() < presetLockUntilRef.current) return; // honour the lock
      if (data.active && isCoolingPresetKey(data.active)) {
        setActive(data.active);
        // Mirror the freshly-fetched active preset into the page's
        // localStorage cache so a subsequent navigation to /cooling
        // paints the right tab + preset state on first frame instead of
        // a stale value from the last time the page itself ran.
        setCachedCoolingActivePreset(data.active);
      }
    }).catch(() => { /* best-effort */ });
  }, []);

  // Load curves + fan-state mapping + temperature sources for the response
  // chart. Mirrors CoolingPage's normalisation: the API ships curves keyed
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

  useEffect(() => {
    if (preview) return;
    refreshProfiles();
    refreshCoolingConfig();
  }, [preview, refreshProfiles, refreshCoolingConfig]);
  useTopicCallback('cooling', !preview, onCoolingTopic);

  useEffect(() => {
    if (preview) return;
    return subscribeControlSync(event => {
      if (event.domain !== 'cooling') return;
      if (Date.now() < presetLockUntilRef.current) return; // honour the lock
      const next = event.activePreset ?? event.activeProfile;
      if (next && isCoolingPresetKey(next)) {
        setActive(next);
        setCachedCoolingActivePreset(next);
      }
    });
  }, [preview]);

  const apply = useCallback((key: CoolingPresetKey) => {
    // Lock first so any topic/control-sync push triggered by *this* write
    // (or a still-in-flight previous write) can't revert the optimistic
    // setActive below.
    presetLockUntilRef.current = Date.now() + PRESET_LOCK_MS;
    setActive(key);
    publishControlSync({ domain: 'cooling', activePreset: key });
    // Seed the page's cache immediately so a fresh navigation to the
    // cooling page paints the right active tab on its first frame, the
    // same way the lighting widget's optimistic state shows up the
    // moment the page mounts.
    setCachedCoolingActivePreset(key);
    applyProfile(key).catch(() => { /* best-effort */ });
  }, []);

  const widgetPresets = useMemo(
    () => COOLING_PRESETS.filter(p => WIDGET_PRESET_KEYS.includes(p.key)),
    [],
  );

  // Simple mode handlers: arrows cycle ONLY silent/balanced/turbo.
  // Center always shows the current `active` state — could be one of
  // those three, or 'custom' / 'off'. First press from a non-cycle
  // state jumps to the first item in the cycle direction: right →
  // silent, left → turbo (per user spec).
  const cyclePreset = useCallback((delta: number) => {
    const idx = WIDGET_PRESET_KEYS.indexOf(active as CoolingPresetKey);
    let nextIdx: number;
    if (idx < 0) {
      nextIdx = delta > 0 ? 0 : WIDGET_PRESET_KEYS.length - 1;
    } else {
      nextIdx = (idx + delta + WIDGET_PRESET_KEYS.length) % WIDGET_PRESET_KEYS.length;
    }
    apply(WIDGET_PRESET_KEYS[nextIdx]);
  }, [active, apply]);

  if (simpleMode) {
    // Identical layout at every size: fan-with-signal-bars icon centered,
    // current-mode label below, prev/next arrows on either side.
    const level: 1 | 2 | 3 | null =
      active === 'silent' ? 1
      : active === 'balanced' ? 2
      : active === 'turbo' ? 3
      : null;
    const labelKey =
      active === 'silent' ? 'cooling.preset.silent'
      : active === 'balanced' ? 'cooling.preset.balanced'
      : active === 'turbo' ? 'cooling.preset.turbo'
      : active === 'off' ? 'cooling.preset.off'
      : 'cooling.preset.custom';
    const showLabel = widget.size !== '2x2';
    return (
      <div className={styles.cooling} data-size={widget.size} data-simple="true">
        <div className={styles.simpleStage}>
          <PanelArrowButton
            side="prev"
            className={styles.simpleArrow}
            onClick={() => cyclePreset(-1)}
            ariaLabel={t('cooling.panel.prev')}
          />
          <div className={styles.simpleCenter}>
            <div className={`${styles.simpleIconGroup} ${level ? '' : styles.simpleIconMuted}`}>
              {/* Keyed remount restarts the spin if the preset changes mid-spin. */}
              <Fan
                key={spinPulse}
                size={56}
                aria-hidden
                data-spinning={spinPulse > spinDoneAt ? 'true' : undefined}
                data-level={level ?? undefined}
                className={styles.simpleFan}
                onAnimationEnd={() => setSpinDoneAt(spinPulse)}
              />
              <SignalBarsIcon level={level ?? 1} size={56} className={styles.simpleBars} animate={barsAnimate} />
            </div>
            {showLabel && <span className={styles.simpleLabel}>{t(labelKey)}</span>}
          </div>
          <PanelArrowButton
            side="next"
            className={styles.simpleArrow}
            onClick={() => cyclePreset(1)}
            ariaLabel={t('cooling.panel.next')}
          />
        </div>
      </div>
    );
  }

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
