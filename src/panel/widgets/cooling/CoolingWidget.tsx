import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IconLabelButton } from '../../../components/common/IconLabelButton/IconLabelButton';
import { Fan, Tornado } from 'lucide-react';
import { PanelArrowButton } from '../../chrome/PanelArrowButton';
import {
  applyProfile, fetchProfiles,
  fetchCurves, fetchFanChannels, fetchTemperatureSources,
  type FanChannel, type TemperatureSource,
} from '../../../api/cooling';
import { Button } from '../../../components/common/Button/Button';
import { useSensors } from '../../../hooks/useSensors';
import { useFeatureFlags, useTempSensorPrefs, useUiSettings, useUnitPrefs } from '../../../hooks/useUiSettings';
import { convertTemperature, localizeNumbers, tempUnitSymbol, type NumberFormat, type TempUnit } from '../../../lib/units';
import { resolveAdvancedMode } from '../common/AdvancedModeSettings';
import { useStateChangePulse } from '../common/useStateChangePulse';
import { PanelWidgetEmpty } from '../common/PanelWidgetChrome';
import { SignalBarsIcon } from './SignalBarsIcon';
import { resolveCpuTempSensor, resolveGpuTempSensor } from '../../../lib/tempSensorResolver';
import { useTopicCallback } from '../../../hooks/useMultiplexSocket';
import { publishControlSync, subscribeControlSync } from '../../../lib/controlSync';
import { COOLING_MODES, isCoolingModeKey, type CoolingModeKey } from './page/coolingModes';
import { setCachedCoolingActivePreset } from './coolingCache';
import { MicroBar } from '../monitoring/MicroBar';
import type { GaugeProps } from '../monitoring/gauges/types';
import { curveDefsFromApi, type CurveDef, type FanState } from '../../../types/cooling';
import { useTranslation } from '../../../lib/i18n';
import type { WidgetProps } from '../types';
import { usePanelPreview } from '../common/PanelPreviewContext';
import { CoolingResponseChart } from './CoolingResponseChart';
import styles from './CoolingWidget.module.scss';

const WIDGET_PRESET_KEYS: CoolingModeKey[] = ['silent', 'balanced', 'turbo', 'max'];
const TEMP_MAX = 100;
// Catalog preview shows a deterministic preset (label via the existing
// cooling.mode.balanced key). Keep in sync with the simple-mode render;
// previewMode.test.tsx is the fixture-sync gate.
const COOLING_PREVIEW_PRESET: CoolingModeKey = 'balanced';

interface CoolingSlot {
  key: 'cpu' | 'gpu' | 'fan';
  props: GaugeProps;
}

export function CoolingWidget({ widget, onSectionNavigate }: WidgetProps) {
  const { t } = useTranslation();
  const { settings: ui } = useUiSettings();
  const flags = useFeatureFlags();
  const preview = usePanelPreview();
  // Preview forces simple mode for determinism.
  const simpleMode = preview || !resolveAdvancedMode(widget.config, ui.widgetAdvancedMode);
  const [active, setActive] = useState<CoolingModeKey>(preview ? COOLING_PREVIEW_PRESET : 'custom');
  // False until the first profiles fetch resolves: preset changes before
  // that are hydration, not state changes, and must not animate.
  const [hydrated, setHydrated] = useState(false);
  const spinPulse = useStateChangePulse(active, !hydrated);
  // Cleared on animationend: a finished fill-mode animation stays active
  // on the node (holding a compositor layer) until the attribute drops.
  const [spinDoneAt, setSpinDoneAt] = useState(0);
  // Max's tornado runs its own entrance, on its own clock: it is much shorter
  // than the fan's coast-to-stop, and sharing spinDoneAt would let whichever
  // finished first cut the other off mid-animation.
  const [maxDoneAt, setMaxDoneAt] = useState(0);
  // Enabled one render after hydration commits, so the bars snap to the
  // initial server state instead of transitioning to it.
  const [barsAnimate, setBarsAnimate] = useState(false);
  useEffect(() => {
    if (hydrated) setBarsAnimate(true);
  }, [hydrated]);
  // Leaving Max unmounts the bars, so on the way back they mount at their
  // final level with nothing to transition from and the fill never plays.
  // Hold them empty for two frames - one to paint empty, one to start the
  // fill - so Max to Silent reads as the first bar filling, not appearing.
  const maxActive = active === 'max';
  const [barsFillIn, setBarsFillIn] = useState(false);
  useEffect(() => {
    if (maxActive) {
      setBarsFillIn(true);
      return;
    }
    if (!barsFillIn) return;
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setBarsFillIn(false));
    });
    return () => { cancelAnimationFrame(outer); cancelAnimationFrame(inner); };
  }, [maxActive, barsFillIn]);
  const [curves, setCurves] = useState<CurveDef[]>([]);
  const [fanStates, setFanStates] = useState<Record<string, FanState>>({});
  const [channels, setChannels] = useState<FanChannel[]>([]);
  const [sources, setSources] = useState<TemperatureSource[]>([]);

  const sensors = useSensors(!preview && flags.cooling);
  const tempPrefs = useTempSensorPrefs();
  const { monitoringTempUnit, numberFormat } = useUnitPrefs();
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
        props: gaugeProps(cpuTemp.value, cpuTemp.value / TEMP_MAX * 100, formatTemp(cpuTemp.value, monitoringTempUnit, numberFormat), t('cooling.label.cpu')),
      });
    }
    if (gpuTemp) {
      list.push({
        key: 'gpu',
        props: gaugeProps(gpuTemp.value, gpuTemp.value / TEMP_MAX * 100, formatTemp(gpuTemp.value, monitoringTempUnit, numberFormat), t('cooling.label.gpu')),
      });
    }
    if (hasFans) {
      const duty = avgDuty ?? 0;
      list.push({
        key: 'fan',
        props: gaugeProps(duty, duty, formatDuty(duty, numberFormat), t('cooling.label.fan')),
      });
    }
    return list;
  }, [cpuTemp, gpuTemp, avgDuty, hasFans, t, monitoringTempUnit, numberFormat]);

  // Optimistic-lock window - see CoolingPage's identical pattern. When the
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
      if (data.active && isCoolingModeKey(data.active)) {
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
  // chart. Fan→curve assignment is derived from each curve's `outputs` plus
  // any channel whose mode is Manual (those count as a flat baseline at
  // their current duty).
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
        setCurves(curveDefsFromApi(saved));
        for (const c of saved?.curves ?? []) {
          for (const out of c.outputs ?? []) {
            restored[out.id] = { softwareControl: true, curveId: c.id };
          }
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
    if (preview || !flags.cooling) return;
    refreshProfiles();
    refreshCoolingConfig();
  }, [preview, flags.cooling, refreshProfiles, refreshCoolingConfig]);
  useTopicCallback('cooling', !preview && flags.cooling, onCoolingTopic);

  useEffect(() => {
    if (preview || !flags.cooling) return;
    return subscribeControlSync(event => {
      if (event.domain !== 'cooling') return;
      if (Date.now() < presetLockUntilRef.current) return; // honour the lock
      const next = event.activePreset ?? event.activeProfile;
      if (next && isCoolingModeKey(next)) {
        setActive(next);
        setCachedCoolingActivePreset(next);
      }
    });
  }, [preview, flags.cooling]);

  const apply = useCallback((key: CoolingModeKey) => {
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

  // Simple mode handlers: arrows cycle ONLY silent/balanced/turbo/max.
  // Center always shows the current `active` state - could be one of
  // those four, or 'custom' / 'off'. First press from a non-cycle
  // state jumps to the first item in the cycle direction: right →
  // silent, left → max (per user spec).
  const cyclePreset = useCallback((delta: number) => {
    const idx = WIDGET_PRESET_KEYS.indexOf(active as CoolingModeKey);
    let nextIdx: number;
    if (idx < 0) {
      nextIdx = delta > 0 ? 0 : WIDGET_PRESET_KEYS.length - 1;
    } else {
      nextIdx = (idx + delta + WIDGET_PRESET_KEYS.length) % WIDGET_PRESET_KEYS.length;
    }
    apply(WIDGET_PRESET_KEYS[nextIdx]);
  }, [active, apply]);

  if (!preview && !flags.cooling) {
    return (
      <div className={styles.cooling} data-size={widget.size} data-mode="off">
        <PanelWidgetEmpty
          icon={<Fan size={24} />}
          title={t('featureDisabled.widget.cooling')}
          text={onSectionNavigate ? undefined : t('featureDisabled.hint.cooling')}
          action={onSectionNavigate ? (
            <Button size="sm" icon={<Fan size={14} />} onClick={() => onSectionNavigate('cooling')}>
              {t('featureDisabled.widget.open', { feature: t('cooling.title') })}
            </Button>
          ) : undefined}
        />
      </div>
    );
  }

  if (simpleMode) {
    // Identical layout at every size: fan-with-signal-bars icon centered,
    // current-mode label below, prev/next arrows on either side.
    // Max renders the tornado instead of bars, so it sits outside
    // the 1/2/3 scale but still drives the fan's spin as the top rung.
    const isMax = active === 'max';
    const level: 1 | 2 | 3 | null =
      active === 'silent' ? 1
      : active === 'balanced' ? 2
      : active === 'turbo' ? 3
      : null;
    const spinLevel = isMax ? 4 : level;
    const labelKey =
      active === 'silent' ? 'cooling.mode.silent'
      : active === 'balanced' ? 'cooling.mode.balanced'
      : active === 'turbo' ? 'cooling.mode.turbo'
      : isMax ? 'cooling.mode.max'
      : active === 'off' ? 'cooling.mode.off'
      : 'cooling.mode.custom';
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
            <div className={`${styles.simpleIconGroup} ${level || isMax ? '' : styles.simpleIconMuted}`}>
              {/* Keyed remount restarts the spin if the preset changes mid-spin. */}
              <Fan
                key={spinPulse}
                size={56}
                aria-hidden
                // eslint-disable-next-line i18next/no-literal-string -- data attribute boolean
                data-spinning={spinPulse > spinDoneAt ? 'true' : undefined}
                data-level={spinLevel ?? undefined}
                className={styles.simpleFan}
                onAnimationEnd={() => setSpinDoneAt(spinPulse)}
              />
              {isMax
                ? (
                  /* Keyed remount restarts the touchdown if Max is re-picked. */
                  <Tornado
                    key={spinPulse}
                    size={56}
                    aria-hidden
                    // eslint-disable-next-line i18next/no-literal-string -- data attribute boolean
                    data-spinning={spinPulse > maxDoneAt ? 'true' : undefined}
                    className={`${styles.simpleBars} ${styles.simpleMax}`}
                    onAnimationEnd={() => setMaxDoneAt(spinPulse)}
                  />
                )
                : <SignalBarsIcon level={barsFillIn ? 0 : level ?? 1} size={56} className={styles.simpleBars} animate={barsAnimate} />}
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
        {COOLING_MODES.map(p => {
          const label = t(p.i18nKey);
          return (
            <IconLabelButton
              key={p.key}
              variant="bare"
              className={styles.chip}
              icon={<p.Icon aria-hidden="true" />}
              active={active === p.key}
              title={label}
              ariaLabel={label}
              onPress={() => apply(p.key)}
            />
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

function formatTemp(value: number, tempUnit: TempUnit, numberFormat: NumberFormat): string {
  return localizeNumbers(`${Math.round(convertTemperature(value, tempUnit))}${tempUnitSymbol(tempUnit)}`, numberFormat);
}

function formatDuty(value: number, numberFormat: NumberFormat): string {
  return localizeNumbers(`${Math.round(value)}%`, numberFormat);
}

export default CoolingWidget;
