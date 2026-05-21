import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Gauge, Plus, Power, Settings } from 'lucide-react';
import {
  fetchFanChannels, fetchTemperatureSources, fetchCurves,
  setFanSpeed, releaseFanAuto, saveCurves, renameFan,
  startCalibration, fetchCalibrations, fetchProfiles, applyProfile,
  resetPresetCurve,
  type FanChannel, type TemperatureSource,
  type FanCalibration,
} from '../../api/cooling';
import { useCoolingRealtime } from '../../hooks/useCooling';
import { useCoolingCurves } from '../../hooks/useCoolingCurves';
import { useTopicCallback } from '../../hooks/useMultiplexSocket';
import { useSensors } from '../../hooks/useSensors';
import type { ServiceState } from '../../hooks/useServiceState';
import type { ConnectionState } from '../../hooks/useServiceStatus';
import { useTranslation } from '../../lib/i18n';
import { useUiSettings } from '../../hooks/useUiSettings';
import { publishControlSync, subscribeControlSync } from '../../lib/controlSync';
import { ViewHeader } from '../common/ViewHeader/ViewHeader';
import { InfoTooltip } from '../common/InfoTooltip/InfoTooltip';
import { ServiceRequired } from './ServiceRequired';
import { CoolingSkeleton } from './PageSkeleton/PageSkeleton';
import { FanCard } from './cooling/FanCard';
import { CurveCard, computeCurveSpeed } from './cooling/CurveEditor';
import { CoolingTrendChart } from './cooling/CoolingTrendChart';
import { CoolingSettingsModal } from './cooling/CoolingSettingsModal';
import { COOLING_PRESETS, isCoolingPresetKey, type CoolingPresetKey } from './cooling/coolingPresets';
import { resolveCpuTempSensor, resolveGpuTempSensor } from '../../lib/tempSensorResolver';
import { newCurve, type CurveDef, type CurvePreset, type CurveType, type FanState, type MixFn } from '../../types/cooling';
import styles from './CoolingView.module.scss';

/**
 * Cooling tab composer. State + transactional handlers live here; rendering is
 * delegated to FanCard (fan grid + drag-drop) and CurveCard / CurveEditor
 * (curve definitions + live graph). Keeps CoolingView focused on flow control
 * instead of every layout detail.
 */

// Hard cap on user-created curves. The picker UI starts to crowd past this,
// and a curve list has fewer real use cases than fan channels do.
const MAX_CURVES = 10;

interface CoolingViewProps { serviceOnline: boolean; serviceState: ServiceState; connectionState?: ConnectionState; activeProfileId?: string; }

export function CoolingView({ serviceOnline, serviceState, connectionState, activeProfileId }: CoolingViewProps) {
  const { t } = useTranslation();
  const [channels, setChannels] = useState<FanChannel[]>([]);
  const [sources, setSources] = useState<TemperatureSource[]>([]);
  const [curves, setCurves] = useState<CurveDef[]>([]);
  const [fanStates, setFanStates] = useState<Record<string, FanState>>({});
  const [calibrationResults, setCalibrationResults] = useState<FanCalibration[] | null>(null);
  // null until the first /cooling/profiles snapshot returns. Keeps the preset
  // tab bar unselected during load instead of flashing 'custom' before the
  // real state arrives - the accent disc on the active tab makes that flash
  // visible.
  const [activePreset, setActivePreset] = useState<CoolingPresetKey | null>(null);
  const activeCoolingProfileRef = useRef('');
  // After an optimistic preset change (user click or Off-guard) we lock the
  // displayed preset for a short window so a stale `/cooling/profiles` poll or
  // refetch doesn't snap the UI back to the prior value mid-transition.
  const presetLockUntilRef = useRef(0);

  const calibrating = serviceState.cooling?.calibrating ?? false;

  const realtimeData = useCoolingRealtime(serviceOnline);
  const curveCalcs = useCoolingCurves(serviceOnline);
  const sensors = useSensors(serviceOnline);
  const { settings } = useUiSettings();
  const cpuTemp = resolveCpuTempSensor(sensors.cpu, settings.preferredCpuTempSensorId);
  const gpuTemp = resolveGpuTempSensor(sensors.gpu, settings.preferredGpuTempSensorId);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const refreshCoolingConfig = useCallback(async () => {
    if (!serviceOnline) return;
    const [fans, temps, saved, profiles] = await Promise.all([
      fetchFanChannels(),
      fetchTemperatureSources(),
      fetchCurves(),
      fetchProfiles(),
    ]);

    if (profiles?.active) {
      // Honour the optimistic-lock window: if the user just changed the preset
      // locally, ignore stale server values until the lock expires.
      if (Date.now() < presetLockUntilRef.current) {
        // Skip - locally-set preset wins for another beat.
      } else {
        activeCoolingProfileRef.current = profiles.active;
        if (isCoolingPresetKey(profiles.active)) setActivePreset(profiles.active);
      }
    }

    if (fans?.channels) {
      setChannels(fans.channels);
      const restored: Record<string, FanState> = {};
      for (const ch of fans.channels) {
        if (ch.mode === 'Manual') {
          restored[ch.id] = { softwareControl: true, curveId: null };
        }
      }

      if (saved?.curves?.length) {
        const loadedCurves: CurveDef[] = saved.curves.map(c => ({
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
            // Default matches the backend MixedCurveData / MixedCurve default
            // so curves persisted before this field existed don't display a
            // value the engine isn't actually using.
            responseTime: c.mixed?.responseTime ?? 1.0,
            curveIds: c.mixed?.curveIds ?? [],
            fn: (c.mixed?.fn ?? 'max') as MixFn,
          },
          preset: c.preset ? (c.preset as CurvePreset) : undefined,
          isDefault: c.isDefault ?? undefined,
        }));
        setCurves(loadedCurves);

        for (const c of saved.curves) {
          for (const out of c.outputs ?? []) {
            restored[out.id] = { softwareControl: true, curveId: c.id };
          }
        }
      } else {
        setCurves([]);
      }

      setFanStates(restored);
    }
    if (temps?.sources) setSources(temps.sources);
  }, [serviceOnline]);

  // Re-runs on profile switch so the curves/fan assignments reflect the new
  // profile's persisted config.
  useEffect(() => {
    refreshCoolingConfig();
  }, [refreshCoolingConfig, activeProfileId]);

  useEffect(() => subscribeControlSync(event => {
    if (event.domain !== 'cooling') return;
    const next = event.activePreset ?? event.activeProfile;
    if (next) {
      activeCoolingProfileRef.current = next;
      if (isCoolingPresetKey(next)) setActivePreset(next);
    }
    refreshCoolingConfig();
  }), [refreshCoolingConfig]);

  // Cross-window profile detection: every profile switch broadcasts on the
  // `prefs` topic, so we refetch the active profile when the topic fires
  // instead of polling fetchProfiles() every second. The preset-lock gate
  // still applies - a mid-transition push from our own mutation would
  // otherwise repaint stale state.
  useTopicCallback('prefs', serviceOnline, () => {
    if (Date.now() < presetLockUntilRef.current) return;
    void (async () => {
      const profiles = await fetchProfiles();
      const next = profiles?.active ?? '';
      if (!next || next === activeCoolingProfileRef.current) return;
      activeCoolingProfileRef.current = next;
      refreshCoolingConfig();
    })();
  });

  // Anything that mutates the cooling config (per-fan Manual / BIOS, curve
  // edits, wire-DnD, preset apply) lands a "cooling" topic push from the
  // service. The widget already listens on this topic; the main view needs
  // the same wiring or the preset chip stays selected on Silent/Balanced/
  // Turbo even after the backend has derived ActivePreset=custom from the
  // per-fan change. The preset-lock gate guards against optimistic-update
  // races the same way it does for the prefs topic above.
  useTopicCallback('cooling', serviceOnline, () => {
    if (Date.now() < presetLockUntilRef.current) return;
    refreshCoolingConfig();
  });

  // Keep the curve sources' temperature values live so the select labels and
  // the graph's vertical temperature line track real-time sensor readings.
  // The `cooling-curves` topic streams inputTemperature per active curve at
  // ~1 Hz, so we merge those readings into the existing sources list instead
  // of refetching /cooling/sources every second. Sources that aren't driving
  // any curve keep their last-fetched value until a mutation (curve
  // assignment change, profile switch, etc.) triggers a refresh.
  useEffect(() => {
    if (!curveCalcs?.calculations?.length) return;
    setSources(prev => {
      if (prev.length === 0) return prev;
      const updates = new Map<string, number>();
      for (const calc of curveCalcs.calculations) {
        if (calc.inputSensorId && Number.isFinite(calc.inputTemperature)) {
          updates.set(calc.inputSensorId, calc.inputTemperature);
        }
      }
      if (updates.size === 0) return prev;
      let changed = false;
      const next = prev.map(s => {
        const v = updates.get(s.id);
        if (v == null || v === s.value) return s;
        changed = true;
        return { ...s, value: v };
      });
      return changed ? next : prev;
    });
  }, [curveCalcs]);

  useEffect(() => {
    if (!realtimeData?.coolingComponents) return;
    const map = new Map<string, { rpm: number; speed: number }>();
    for (const comp of realtimeData.coolingComponents)
      for (const dev of comp.devices)
        map.set(dev.id, { rpm: dev.rpm ?? 0, speed: dev.speed ?? 0 });
    setChannels(prev => prev.map(ch => {
      const live = map.get(ch.id);
      return live ? { ...ch, rpm: live.rpm, dutyPercent: live.speed } : ch;
    }));
  }, [realtimeData]);

  // Show calibration results ONLY on a fresh running -> complete transition
  // observed during this mount. Without the running-prev guard, navigating
  // back to the cooling view after a previous calibration would re-display
  // the persisted "complete" result every time. Calibration results are
  // transient feedback; they live on screen between calibration end and
  // either user dismiss or first navigation away.
  const prevCalStateRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const cur = serviceState.cooling?.calibrationState;
    if (cur === 'complete' && prevCalStateRef.current === 'running') {
      fetchFanChannels().then(fans => { if (fans?.channels) setChannels(fans.channels); });
      fetchCalibrations().then(r => { if (r?.calibrations) setCalibrationResults(r.calibrations); });
    }
    prevCalStateRef.current = cur;
  }, [serviceState.cooling?.calibrationState]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const pushCurves = useCallback((defs: CurveDef[], states: Record<string, FanState>) => {
    const apiCurves = defs.map(c => ({
      id: c.id, name: c.name,
      type: c.type === 'flat' ? 'Flat' : c.type === 'linear' ? 'Linear' : c.type === 'graph' ? 'Graph' : 'Mixed',
      input: { id: c.sourceId, type: 'Temperature', device: '' },
      outputs: Object.entries(states).filter(([, s]) => s.curveId === c.id).map(([fanId]) => ({ id: fanId, type: 'Fan' })),
      flat: c.type === 'flat' ? { speed: c.flat.speed } : null,
      linear: c.type === 'linear' ? c.linear : null,
      graph: c.type === 'graph' ? { responseTime: c.graph.responseTime, speedModifier: 1, points: c.graph.points } : null,
      mixed: c.type === 'mix' ? { responseTime: c.mix.responseTime, curveIds: c.mix.curveIds, fn: c.mix.fn } : null,
      preset: c.preset ?? null,
    }));
    return saveCurves({ globalSpeedModifier: 1, curves: apiCurves });
  }, []);

  // Issue rule: when cooling is Off, the user changing any fan setting other
  // than reverting to BIOS Control snaps the active tab to Custom. We do the
  // tab switch first so the curve writes that follow land in the right
  // preset state, then refetch via the WebSocket "cooling" push that the
  // service emits after applyProfile.
  const exitOffToCustomIfNeeded = useCallback(async () => {
    if (activeCoolingProfileRef.current !== 'off') return;
    setActivePreset('custom');
    activeCoolingProfileRef.current = 'custom';
    presetLockUntilRef.current = Date.now() + 1500;
    publishControlSync({ domain: 'cooling', activePreset: 'custom' });
    await applyProfile('custom');
  }, []);

  const handlePresetChange = useCallback(async (key: string) => {
    if (!isCoolingPresetKey(key)) return;
    if (key === activePreset) return;
    setActivePreset(key);
    activeCoolingProfileRef.current = key;
    presetLockUntilRef.current = Date.now() + 1500;
    publishControlSync({ domain: 'cooling', activePreset: key });
    await applyProfile(key);
    refreshCoolingConfig();
  }, [activePreset, refreshCoolingConfig]);

  const toggleSoftwareControl = useCallback(async (fanId: string, enabled: boolean) => {
    if (enabled) {
      // Enabling software control is a non-BIOS user change; honour the Off-guard.
      await exitOffToCustomIfNeeded();
      const nextStates = { ...fanStates, [fanId]: { softwareControl: true, curveId: null } };
      setFanStates(nextStates);
      await setFanSpeed(fanId, 50);
    } else {
      // Disabling software control means BIOS Control - allowed in Off, no tab switch.
      const nextStates = { ...fanStates };
      delete nextStates[fanId];
      setFanStates(nextStates);
      await releaseFanAuto(fanId);
      await pushCurves(curves, nextStates);
    }
    const fans = await fetchFanChannels();
    if (fans?.channels) setChannels(fans.channels);
  }, [fanStates, curves, pushCurves, exitOffToCustomIfNeeded]);

  const assignCurve = useCallback(async (fanId: string, curveId: string | null) => {
    if (curveId !== null) await exitOffToCustomIfNeeded();
    setFanStates(prev => ({ ...prev, [fanId]: { ...prev[fanId], curveId } }));
    await pushCurves(curves, { ...fanStates, [fanId]: { ...fanStates[fanId], curveId } });
  }, [fanStates, curves, pushCurves, exitOffToCustomIfNeeded]);

  const handleSpeedChange = useCallback(async (id: string, speed: number) => {
    await exitOffToCustomIfNeeded();
    await setFanSpeed(id, speed);
    const fans = await fetchFanChannels();
    if (fans?.channels) setChannels(fans.channels);
  }, [exitOffToCustomIfNeeded]);

  const handleRename = useCallback(async (id: string, name: string) => {
    await renameFan(id, name);
    setChannels(prev => prev.map(ch => ch.id === id ? { ...ch, name } : ch));
  }, []);

  // Single-expansion state for the curve list. Declared up here so curve
  // ops (addCurve, deleteCurve, createCurveAndAssign) can reference it.
  // Hovered state is local to the wire-highlight pass below; only the
  // expanded id needs to be visible to the curve mutators.
  const [expandedCurveId, setExpandedCurveId] = useState<string | null>(null);

  const addCurve = useCallback((): string => {
    if (curves.length >= MAX_CURVES) return '';
    const id = `curve-${Date.now()}`;
    const c = newCurve(id);
    if (sources.length > 0) c.sourceId = sources[0].id;
    // New curves go on top so a freshly-added curve is immediately visible
    // without scrolling down through existing ones.
    const next = [c, ...curves];
    setCurves(next);
    // Newly created curves auto-expand so the user can configure them
    // without an extra click. Keeps the single-expansion invariant since
    // setExpandedCurveId replaces the previous id.
    setExpandedCurveId(id);
    pushCurves(next, fanStates);
    return id;
  }, [curves, sources, fanStates, pushCurves]);

  // BIOS = release control; 'manual' = software control, no curve; curve id =
  // bind that curve. Keeps the full transition atomic.
  const setFanMode = useCallback(async (fanId: string, value: string) => {
    const wasSw = fanStates[fanId]?.softwareControl ?? false;
    if (value === 'bios') {
      // BIOS Control is the one fan-control change that is allowed in Off.
      if (wasSw) await toggleSoftwareControl(fanId, false);
      return;
    }
    await exitOffToCustomIfNeeded();
    const targetCurveId = value === 'manual' ? null : value;
    if (!wasSw) {
      const nextStates = { ...fanStates, [fanId]: { softwareControl: true, curveId: targetCurveId } };
      setFanStates(nextStates);
      await setFanSpeed(fanId, 50);
      await pushCurves(curves, nextStates);
      const fans = await fetchFanChannels();
      if (fans?.channels) setChannels(fans.channels);
    } else {
      await assignCurve(fanId, targetCurveId);
    }
  }, [fanStates, curves, pushCurves, toggleSoftwareControl, assignCurve, exitOffToCustomIfNeeded]);

  // Move a curve binding from one fan to another in a single transaction.
  // Used by the wire DnD when the user picks up a wire from one fan and
  // drops it on another. Calling setFanMode twice in a row would race - both
  // closures see the same stale fanStates - so this composes the next state
  // map once and pushes / refetches once.
  const transferFanBinding = useCallback(async (fromFanId: string, toFanId: string, curveId: string) => {
    await exitOffToCustomIfNeeded();
    const wasToSw = fanStates[toFanId]?.softwareControl ?? false;
    const nextStates: Record<string, FanState> = {};
    for (const [fanId, st] of Object.entries(fanStates)) {
      if (fanId === fromFanId) continue;
      nextStates[fanId] = st;
    }
    nextStates[toFanId] = { softwareControl: true, curveId };
    setFanStates(nextStates);
    await releaseFanAuto(fromFanId);
    if (!wasToSw) await setFanSpeed(toFanId, 50);
    await pushCurves(curves, nextStates);
    const fans = await fetchFanChannels();
    if (fans?.channels) setChannels(fans.channels);
  }, [fanStates, curves, pushCurves, exitOffToCustomIfNeeded]);

  // Create a curve and bind it to the fan in one shot so pushCurves sees both
  // the new curve AND the fan's assignment in the same write. Triggered from
  // the fan-card mode dropdown's "+ Create curve" entry, which is only
  // reachable for already-connected fans.
  const createCurveAndAssign = useCallback(async (fanId: string) => {
    if (curves.length >= MAX_CURVES) return;
    await exitOffToCustomIfNeeded();
    const id = `curve-${Date.now()}`;
    const c = newCurve(id);
    if (sources.length > 0) c.sourceId = sources[0].id;
    const nextCurves = [c, ...curves];
    const wasSw = fanStates[fanId]?.softwareControl ?? false;
    const nextStates = { ...fanStates, [fanId]: { softwareControl: true, curveId: id } };
    setCurves(nextCurves);
    setFanStates(nextStates);
    setExpandedCurveId(id);
    if (!wasSw) await setFanSpeed(fanId, 50);
    pushCurves(nextCurves, nextStates);
    if (!wasSw) {
      const fans = await fetchFanChannels();
      if (fans?.channels) setChannels(fans.channels);
    }
  }, [curves, sources, fanStates, pushCurves, exitOffToCustomIfNeeded]);

  // Reset a preset curve (silent/balanced/turbo) back to defaults via
  // the service endpoint. Fan attachments are preserved server-side, so the
  // active preset stays in place; we just refetch to pick up the new template
  // values.
  const handleResetPresetCurve = useCallback(async (presetKey: string) => {
    await resetPresetCurve(presetKey);
    await refreshCoolingConfig();
  }, [refreshCoolingConfig]);

  const deleteCurve = useCallback(async (id: string) => {
    const next = curves.filter(c => c.id !== id);
    // Fans bound to the deleted curve revert to BIOS auto-control: drop
    // them from fanStates entirely (= no software control) and call
    // releaseFanAuto on each so the service relinquishes the channel.
    // Without releaseFanAuto the fan would linger in software-control with
    // no curve = legacy "Manual" mode, which is no longer reachable from
    // the UI.
    const orphanedFanIds: string[] = [];
    const nextStates: Record<string, FanState> = {};
    for (const [fanId, st] of Object.entries(fanStates)) {
      if (st.curveId === id) orphanedFanIds.push(fanId);
      else nextStates[fanId] = st;
    }
    setCurves(next);
    setFanStates(nextStates);
    if (expandedCurveId === id) setExpandedCurveId(null);
    await Promise.all(orphanedFanIds.map(fanId => releaseFanAuto(fanId)));
    await pushCurves(next, nextStates);
    if (orphanedFanIds.length > 0) {
      const fans = await fetchFanChannels();
      if (fans?.channels) setChannels(fans.channels);
    }
  }, [curves, fanStates, pushCurves, expandedCurveId]);

  const saveCurveAndPush = useCallback((updated: CurveDef) => {
    const next = curves.map(c => c.id === updated.id ? updated : c);
    setCurves(next);
    pushCurves(next, fanStates);
  }, [curves, fanStates, pushCurves]);

  const runCalibration = useCallback(async () => {
    setCalibrationResults(null);
    await startCalibration([]);
  }, []);

  const dismissResults = useCallback(() => setCalibrationResults(null), []);

  // ── Fan card reordering (drag/drop, grip-gated, persisted per profile) ────
  const { settings: uiSettings, update: updateUiSettings } = useUiSettings();
  const savedFanOrder = uiSettings.fanChannelOrder;
  const [fanOrder, setFanOrder] = useState<string[]>([]);
  const [dragFanId, setDragFanId] = useState<string | null>(null);
  const [dragOverFanId, setDragOverFanId] = useState<string | null>(null);

  const savedFanOrderKey = savedFanOrder.join('|');
  useEffect(() => {
    setFanOrder([]);
  }, [savedFanOrderKey]);

  useEffect(() => {
    if (channels.length === 0) return;
    setFanOrder(prev => {
      const ids = channels.map(c => c.id);
      const seed = prev.length === 0 ? savedFanOrder : prev;
      const kept = seed.filter(id => ids.includes(id));
      for (const id of ids) if (!kept.includes(id)) kept.push(id);
      return kept.length === prev.length && kept.every((id, i) => id === prev[i]) ? prev : kept;
    });
  }, [channels, savedFanOrder]);

  const orderedChannels = useMemo(() => {
    const base: FanChannel[] = [];
    if (fanOrder.length === 0) {
      base.push(...channels);
    } else {
      const byId = new Map(channels.map(c => [c.id, c]));
      for (const id of fanOrder) {
        const ch = byId.get(id);
        if (ch) base.push(ch);
      }
    }
    // Calibration can mark fans Unresponsive (no tach / not controllable).
    // Pin those to the bottom of the list so the actionable cards stay near
    // the top; preserve relative order within each group, and don't mutate
    // the saved fanOrder — if a fan recovers it returns to its prior slot.
    const live: FanChannel[] = [];
    const dead: FanChannel[] = [];
    for (const ch of base) (ch.classification === 'Unresponsive' ? dead : live).push(ch);
    return dead.length === 0 ? base : [...live, ...dead];
  }, [channels, fanOrder]);

  const dropFanOn = (targetId: string) => {
    if (!dragFanId || dragFanId === targetId) return;
    setFanOrder(prev => {
      const next = [...prev];
      const fromIdx = next.indexOf(dragFanId);
      const toIdx = next.indexOf(targetId);
      if (fromIdx === -1 || toIdx === -1) return prev;
      next.splice(fromIdx, 1);
      next.splice(toIdx, 0, dragFanId);
      if (serviceOnline) updateUiSettings({ fanChannelOrder: next });
      return next;
    });
  };

  const curvesInUse = useMemo(() => {
    const s = new Set<string>();
    for (const fs of Object.values(fanStates)) if (fs.curveId) s.add(fs.curveId);
    return s;
  }, [fanStates]);

  // ── Curve card reordering (HTML5 drag) ───────────────────────────────────
  // Curves array order is what /cooling/curves persists, so reordering
  // locally and re-saving via pushCurves is enough - no separate setting.
  const [dragCurveId, setDragCurveId] = useState<string | null>(null);
  const [dragOverCurveId, setDragOverCurveId] = useState<string | null>(null);

  const dropCurveOn = useCallback((targetId: string) => {
    if (!dragCurveId || dragCurveId === targetId) return;
    // Updater form so a concurrent WebSocket curves push between dragstart
    // and drop doesn't make us splice against a stale snapshot.
    setCurves(prev => {
      const fromIdx = prev.findIndex(c => c.id === dragCurveId);
      const toIdx = prev.findIndex(c => c.id === targetId);
      if (fromIdx === -1 || toIdx === -1) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      pushCurves(next, fanStates);
      return next;
    });
  }, [dragCurveId, fanStates, pushCurves]);

  // ── Hovered curve (paired with expandedCurveId declared above) ───────────
  // Only one curve can be expanded at a time. Hover is decoupled - hovering
  // a different curve does not collapse the expanded one; both states feed
  // into the wire highlight logic independently.
  const [hoveredCurveId, setHoveredCurveId] = useState<string | null>(null);
  // Hovering a fan card highlights only the wire feeding that fan and the
  // curve on the other end. A fan ever has one wire so this resolves to a
  // single wire path.
  const [hoveredFanId, setHoveredFanId] = useState<string | null>(null);

  // Card-border highlight tracks the same condition that lights up wires:
  // expand a curve, hover a curve, or hover a fan and both ends + the wire
  // glow together. A card lights up only if a real wire involves it - an
  // unbound curve / unbound fan stays neutral on hover so the highlight is
  // a connection signal rather than a generic hover affordance.
  const highlightedCurveIds = useMemo(() => {
    const s = new Set<string>();
    const hasBoundFan = (curveId: string) => {
      for (const st of Object.values(fanStates)) if (st.curveId === curveId) return true;
      return false;
    };
    if (expandedCurveId && hasBoundFan(expandedCurveId)) s.add(expandedCurveId);
    if (hoveredCurveId && hasBoundFan(hoveredCurveId)) s.add(hoveredCurveId);
    if (hoveredFanId) {
      const cid = fanStates[hoveredFanId]?.curveId;
      if (cid) s.add(cid);
    }
    return s;
  }, [expandedCurveId, hoveredCurveId, hoveredFanId, fanStates]);
  const highlightedFanIds = useMemo(() => {
    const s = new Set<string>();
    if (hoveredFanId && fanStates[hoveredFanId]?.curveId) s.add(hoveredFanId);
    const lit = expandedCurveId ?? hoveredCurveId;
    if (lit) {
      for (const [fanId, st] of Object.entries(fanStates)) {
        if (st.curveId === lit) s.add(fanId);
      }
    }
    return s;
  }, [expandedCurveId, hoveredCurveId, hoveredFanId, fanStates]);
  // Clear stale expanded id if its curve disappears (deleted, cap purge,
  // etc.) so the single-expansion invariant is never visibly broken. Same
  // pattern for hoveredFanId, since onMouseLeave does not fire when a card
  // unmounts mid-hover (e.g., a fan dropped from the channel list).
  useEffect(() => {
    if (expandedCurveId && !curves.some(c => c.id === expandedCurveId)) {
      setExpandedCurveId(null);
    }
  }, [curves, expandedCurveId]);
  useEffect(() => {
    if (hoveredFanId && !channels.some(c => c.id === hoveredFanId)) {
      setHoveredFanId(null);
    }
  }, [channels, hoveredFanId]);

  // ── Wire layer (curve output -> fan input) ──────────────────────────────
  // Live output % per curve, computed once for the wire layer AND every
  // CurveCard so the recursion-safe Mix path doesn't re-walk per card.
  const curveOutputs = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of curves) m.set(c.id, computeCurveSpeed(c, sources, curves));
    return m;
  }, [curves, sources]);

  // Refs to every nub so the wire layer can read live bboxes via
  // getBoundingClientRect. Maps are imperatively populated by ref callbacks.
  const curveNubRefs = useRef(new Map<string, HTMLDivElement>());
  const fanNubRefs = useRef(new Map<string, HTMLDivElement>());
  // Refs to every card root so the wire DnD hit-test can treat the whole
  // card as a drop target (much larger and more forgiving than just the
  // nub). Hit-tests still resolve to the same id either way.
  const curveCardRefs = useRef(new Map<string, HTMLDivElement>());
  const fanCardRefs = useRef(new Map<string, HTMLDivElement>());
  const setCurveNub = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) curveNubRefs.current.set(id, el); else curveNubRefs.current.delete(id);
  }, []);
  const setFanNub = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) fanNubRefs.current.set(id, el); else fanNubRefs.current.delete(id);
  }, []);
  const setCurveCard = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) curveCardRefs.current.set(id, el); else curveCardRefs.current.delete(id);
  }, []);
  const setFanCard = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) fanCardRefs.current.set(id, el); else fanCardRefs.current.delete(id);
  }, []);
  const bodyRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<SVGSVGElement>(null);

  // Wire endpoints, in coords relative to bodyRef. Recomputed on layout
  // changes (curves, fans, fan order, scroll, resize) inside a rAF batch so
  // a burst of updates never produces more than one render per frame.
  type Endpoint = { x: number; y: number };
  type WireEndpoints = {
    fanId: string;
    curveId: string;
    from: Endpoint;
    to: Endpoint;
    /** False when either nub is scrolled outside its container's visible band.
     *  Off-screen wires get the faded treatment so they don't trail visually
     *  into nothing. */
    visible: boolean;
  };
  const [wireEndpoints, setWireEndpoints] = useState<WireEndpoints[]>([]);
  const recomputeRafRef = useRef(0);
  // Synchronous wire recompute. Used inside useLayoutEffect so the wire
  // positions update in the same paint as the layout change that caused them
  // (e.g., expanding a curve card pushes cards below it down - their nubs
  // need to move with the new card y-coords without a one-frame lag).
  const recomputeWiresImmediate = useCallback(() => {
    if (!bodyRef.current) return;
    cancelAnimationFrame(recomputeRafRef.current);
    const bodyRect = bodyRef.current.getBoundingClientRect();
    const curvesScroll = bodyRef.current.querySelector(`.${styles.curvesScroll}`);
    const fanScroll = bodyRef.current.querySelector(`.${styles.fanList}`);
    const curvesScrollRect = curvesScroll?.getBoundingClientRect();
    const fanScrollRect = fanScroll?.getBoundingClientRect();
    const next: WireEndpoints[] = [];
    for (const [fanId, st] of Object.entries(fanStates)) {
      if (!st.curveId) continue;
      const curveEl = curveNubRefs.current.get(st.curveId);
      const fanEl = fanNubRefs.current.get(fanId);
      if (!curveEl || !fanEl) continue;
      const a = curveEl.getBoundingClientRect();
      const b = fanEl.getBoundingClientRect();
      // A nub is "visible" when at least its center sits inside its scroll
      // container's viewport band. Half-visible nubs (partially clipped at
      // a scroll edge) still read as connected, which keeps the wire from
      // popping out as soon as one pixel scrolls under the edge.
      const aVisible = !curvesScrollRect ||
        (a.top + a.height / 2 >= curvesScrollRect.top &&
         a.top + a.height / 2 <= curvesScrollRect.bottom);
      const bVisible = !fanScrollRect ||
        (b.top + b.height / 2 >= fanScrollRect.top &&
         b.top + b.height / 2 <= fanScrollRect.bottom);
      // Nubs are small circles straddling the card edge. Anchor wire
      // endpoints at the circle's center so the bezier visually starts /
      // ends right on the card edge regardless of which side the wire
      // approaches from.
      next.push({
        fanId,
        curveId: st.curveId,
        from: { x: a.left + a.width / 2 - bodyRect.left, y: a.top + a.height / 2 - bodyRect.top },
        to:   { x: b.left + b.width / 2 - bodyRect.left, y: b.top + b.height / 2 - bodyRect.top },
        visible: aVisible && bVisible,
      });
    }
    setWireEndpoints(next);
  }, [fanStates]);
  // rAF-batched variant for high-frequency triggers (scroll, resize) that
  // don't need a same-frame paint.
  const recomputeWires = useCallback(() => {
    cancelAnimationFrame(recomputeRafRef.current);
    recomputeRafRef.current = requestAnimationFrame(recomputeWiresImmediate);
  }, [recomputeWiresImmediate]);

  useLayoutEffect(() => { recomputeWiresImmediate(); }, [recomputeWiresImmediate, curves, fanStates, channels, fanOrder, expandedCurveId]);
  useEffect(() => {
    if (!bodyRef.current) return;
    const ro = new ResizeObserver(() => recomputeWires());
    ro.observe(bodyRef.current);
    // Both panes scroll independently; either scroll shifts the nubs.
    const curvesScroll = bodyRef.current.querySelector(`.${styles.curvesScroll}`);
    const fanScroll = bodyRef.current.querySelector(`.${styles.fanList}`);
    const onScroll = () => recomputeWires();
    curvesScroll?.addEventListener('scroll', onScroll, { passive: true });
    fanScroll?.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      ro.disconnect();
      curvesScroll?.removeEventListener('scroll', onScroll);
      fanScroll?.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(recomputeRafRef.current);
    };
  }, [recomputeWires]);

  // Wire-DnD state machine.
  //  idle  - no drag in flight
  //  new   - dragging from a curve output nub, no fan attached yet
  //  rewire- dragging the fan-end of an existing wire (originalCurveId is
  //          the curve we will re-bind to on Esc / cancel)
  type WireDrag =
    | { kind: 'idle' }
    | { kind: 'new'; curveId: string; cursor: Endpoint }
    | { kind: 'rewire'; fanId: string; originalCurveId: string; cursor: Endpoint };
  const [wireDrag, setWireDrag] = useState<WireDrag>({ kind: 'idle' });
  const wireDragRef = useRef<WireDrag>({ kind: 'idle' });
  wireDragRef.current = wireDrag;

  // Keep wires that just disappeared in the DOM for one extra paint so the
  // wire-burst exit animation can play before unmount. Tracks fanId -> the
  // last-known endpoint set for a deleted binding. Cleared after 280ms (a
  // hair longer than the 250ms .wirePathRemoving keyframe).
  const [removingWires, setRemovingWires] = useState<WireEndpoints[]>([]);
  const prevBindingsRef = useRef<Map<string, string>>(new Map());
  useEffect(() => {
    const prev = prevBindingsRef.current;
    const next = new Map<string, string>();
    for (const [fanId, st] of Object.entries(fanStates)) if (st.curveId) next.set(fanId, st.curveId);
    const removed: WireEndpoints[] = [];
    for (const [fanId, curveId] of prev) {
      if (next.get(fanId) === curveId) continue;
      // Find the endpoint snapshot we last rendered so the burst plays
      // from the right path, not from a freshly-recomputed one.
      const snap = wireEndpoints.find(w => w.fanId === fanId && w.curveId === curveId);
      if (snap) removed.push(snap);
    }
    if (removed.length > 0) {
      // Dedup: a wire dropped in empty space already seeded its own removing
      // entry at the cursor position - skip it here so the burst plays once,
      // anchored where the user released the drag, not at the original
      // curve -> fan endpoints.
      setRemovingWires(rs => {
        const fresh = removed.filter(r => !rs.some(x => x.fanId === r.fanId && x.curveId === r.curveId));
        if (fresh.length === 0) return rs;
        return [...rs, ...fresh];
      });
      window.setTimeout(() => {
        setRemovingWires(rs => rs.filter(r => !removed.some(x => x.fanId === r.fanId && x.curveId === r.curveId)));
      }, 280);
      // Timer is fire-and-forget. If the component unmounts before it
      // fires, React swallows the resulting setRemovingWires - acceptable
      // here since we are only animating an exit.
    }
    prevBindingsRef.current = next;
    // Intentionally only react to fanStates - wireEndpoints is a snapshot
    // we read inside the effect, not a trigger for it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fanStates]);

  // Hit-test: returns the id of the CARD under (x, y) on the *opposite* side
  // of the active drag, or null. The whole card is the drop target (not just
  // the nub) so a release anywhere on the destination commits the binding -
  // much more forgiving than a tiny nub target. Hardware-unresponsive fan
  // cards are skipped because they don't register a nub (no wire possible).
  const hitTestNub = useCallback((side: 'curveOut' | 'fanIn', clientX: number, clientY: number) => {
    const cardMap = side === 'curveOut' ? curveCardRefs.current : fanCardRefs.current;
    const nubMap = side === 'curveOut' ? curveNubRefs.current : fanNubRefs.current;
    for (const [id, el] of cardMap) {
      // Skip ids that don't have a registered nub. For fans this filters
      // out hardware-unresponsive channels; for curves it should never
      // happen but the guard is cheap.
      if (!nubMap.has(id)) continue;
      const r = el.getBoundingClientRect();
      if (clientX >= r.left && clientX <= r.right &&
          clientY >= r.top && clientY <= r.bottom) {
        return id;
      }
    }
    return null;
  }, []);

  // Pointer-down on a curve output nub starts a 'new' drag.
  const onCurveNubPointerDown = useCallback((curveId: string) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setWireDrag({ kind: 'new', curveId, cursor: { x: e.clientX, y: e.clientY } });
  }, []);

  // Pointer-down on a fan input nub: if the fan already has a curve, this is
  // a 'rewire' drag (we'll either reassign on drop or disconnect if released
  // in empty space). If the fan is unbound, treat the drag the same way as
  // a curve-out drag - the user is reaching into a blank fan to pick a curve.
  const onFanNubPointerDown = useCallback((fanId: string) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const existing = fanStates[fanId]?.curveId ?? null;
    if (existing) {
      setWireDrag({ kind: 'rewire', fanId, originalCurveId: existing, cursor: { x: e.clientX, y: e.clientY } });
    } else {
      // Fan-side drag from an unbound fan: model as 'rewire' with an empty
      // originalCurveId so the on-up handler routes it the same way as a
      // pulled-off existing wire. Drop on a curve nub binds; drop in empty
      // space stays unbound (no BIOS write needed since the fan was
      // already in BIOS).
      setWireDrag({ kind: 'rewire', fanId, originalCurveId: '', cursor: { x: e.clientX, y: e.clientY } });
    }
  }, [fanStates]);

  const flashNub = (el: HTMLDivElement | undefined) => {
    if (!el) return;
    el.classList.remove(styles.nubFlash);
    void el.offsetWidth;
    el.classList.add(styles.nubFlash);
    window.setTimeout(() => el.classList.remove(styles.nubFlash), 500);
  };

  // Window-level pointer move/up so the drag survives even if the cursor
  // leaves the originating nub (which it always will).
  useEffect(() => {
    if (wireDrag.kind === 'idle') return;
    let rafId = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const cur = wireDragRef.current;
        if (cur.kind === 'idle') return;
        setWireDrag({ ...cur, cursor: { x: e.clientX, y: e.clientY } });
      });
    };
    const onUp = (e: PointerEvent) => {
      cancelAnimationFrame(rafId);
      const cur = wireDragRef.current;
      setWireDrag({ kind: 'idle' });
      if (cur.kind === 'idle') return;
      if (cur.kind === 'new') {
        const targetFanId = hitTestNub('fanIn', e.clientX, e.clientY);
        if (targetFanId) {
          flashNub(fanNubRefs.current.get(targetFanId));
          // setFanMode handles the BIOS -> curve transition (turns software
          // control on, sets the initial duty, pushes curves) atomically.
          setFanMode(targetFanId, cur.curveId);
        }
        return;
      }
      // rewire: drop on a curve nub re-binds; drop on a *different* fan nub
      // transfers the binding (source fan -> BIOS, target fan -> source's
      // curve) atomically; drop in empty space disconnects.
      const targetCurveId = hitTestNub('curveOut', e.clientX, e.clientY);
      if (targetCurveId) {
        if (targetCurveId !== cur.originalCurveId) {
          flashNub(curveNubRefs.current.get(targetCurveId));
          setFanMode(cur.fanId, targetCurveId);
        }
        return;
      }
      const targetFanId = hitTestNub('fanIn', e.clientX, e.clientY);
      if (targetFanId && targetFanId !== cur.fanId && cur.originalCurveId) {
        flashNub(fanNubRefs.current.get(targetFanId));
        transferFanBinding(cur.fanId, targetFanId, cur.originalCurveId);
        return;
      }
      // Released in empty space: disconnect = revert to BIOS auto-control.
      // (Skip if the drag started from an already-unbound fan - nothing to
      // disconnect.)
      if (cur.originalCurveId) {
        // Seed the burst-out animation at the curve -> cursor position so
        // the wire vanishes where the user released the drag instead of
        // snapping back to its old curve -> fan path. The static-wire layer
        // already cross-checks fanStates so the stale snapshot is filtered
        // out the moment setFanMode('bios') updates state.
        const bodyRect = bodyRef.current?.getBoundingClientRect();
        const curveEl = curveNubRefs.current.get(cur.originalCurveId);
        if (bodyRect && curveEl) {
          const ca = curveEl.getBoundingClientRect();
          const ghost: WireEndpoints = {
            fanId: cur.fanId,
            curveId: cur.originalCurveId,
            from: { x: ca.left + ca.width / 2 - bodyRect.left, y: ca.top + ca.height / 2 - bodyRect.top },
            to: { x: e.clientX - bodyRect.left, y: e.clientY - bodyRect.top },
            visible: true,
          };
          setRemovingWires(rs => {
            if (rs.some(w => w.fanId === ghost.fanId && w.curveId === ghost.curveId)) return rs;
            return [...rs, ghost];
          });
          window.setTimeout(() => {
            setRemovingWires(rs => rs.filter(w => !(w.fanId === ghost.fanId && w.curveId === ghost.curveId)));
          }, 280);
        }
        setFanMode(cur.fanId, 'bios');
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setWireDrag({ kind: 'idle' });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('keydown', onKey);
      cancelAnimationFrame(rafId);
    };
  }, [wireDrag.kind, hitTestNub, setFanMode, transferFanBinding]);

  // While dragging, paint valid drop targets. From a curve out: only fan in
  // nubs are valid. From a fan (rewire): every curve is valid AND every
  // *other* fan is valid (drops there transfer the binding to that fan).
  const dragSourceFanId = wireDrag.kind === 'rewire' ? wireDrag.fanId : null;
  useEffect(() => {
    if (wireDrag.kind === 'idle') return;
    const elements: HTMLDivElement[] = [];
    if (wireDrag.kind === 'new') {
      for (const el of fanNubRefs.current.values()) elements.push(el);
    } else {
      for (const el of curveNubRefs.current.values()) elements.push(el);
      for (const [id, el] of fanNubRefs.current) {
        if (id !== dragSourceFanId) elements.push(el);
      }
    }
    for (const el of elements) el.classList.add(styles.nubTarget);
    return () => {
      for (const el of elements) el.classList.remove(styles.nubTarget);
    };
  }, [wireDrag.kind, dragSourceFanId]);

  // Convert a viewport-relative cursor point to body-relative for the SVG.
  const cursorInBody = (cursor: Endpoint): Endpoint => {
    const r = bodyRef.current?.getBoundingClientRect();
    if (!r) return cursor;
    return { x: cursor.x - r.left, y: cursor.y - r.top };
  };

  // Cubic bezier with horizontal handles. dx grows with distance so far-apart
  // wires bow out more, near-apart wires stay tight. Handle direction tracks
  // the sign of (b.x - a.x) so a wire whose start is to the RIGHT of its end
  // (e.g. a flipped rewire drag where the anchored end is the fan and the
  // cursor end is over a curve to the left) bows correctly instead of
  // looping.
  const wirePath = (a: Endpoint, b: Endpoint) => {
    const sign = b.x >= a.x ? 1 : -1;
    const dx = Math.max(40, Math.abs(b.x - a.x) * 0.45) * sign;
    return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y} ${b.x - dx} ${b.y} ${b.x} ${b.y}`;
  };

  const presetTabs = COOLING_PRESETS.map(p => ({
    key: p.key,
    label: t(p.i18nKey),
    icon: <p.Icon size={14} />,
  }));

  const offStatusCard = activePreset === 'off' ? (
    <div className={styles.offStatus}
      role="status"
      aria-label={t('cooling.preset.off.banner')}>
      <Power size={13} aria-hidden />
      <span className={styles.offStatusLabel}>{t('cooling.preset.off.banner')}</span>
    </div>
  ) : null;

  if (!serviceOnline) {
    return (
      <div className={styles.cooling}>
        <ViewHeader
          title={t('cooling.title')}
          titleTooltip={t('cooling.title.tooltip')}
          tabs={presetTabs}
          activeTab={activePreset ?? undefined}
          onTabChange={k => handlePresetChange(k)}
          tabsDisabled
        />
        <ServiceRequired state={connectionState} skeleton={<CoolingSkeleton />} />
      </div>
    );
  }

  return (
    <div className={styles.cooling}>
      <ViewHeader
        title={t('cooling.title')}
        titleTooltip={t('cooling.title.tooltip')}
        tabs={presetTabs}
        activeTab={activePreset ?? undefined}
        onTabChange={k => handlePresetChange(k)}
        tabActions={
          <button
            type="button"
            className={styles.settingsBtn}
            onClick={() => setSettingsOpen(true)}
            aria-label={t('cooling.settings.open')}
            title={t('cooling.settings.open')}
          >
            <Settings size={16} aria-hidden />
          </button>
        }
      />

      <CoolingSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        cpuSensors={sensors.cpu}
        gpuSensors={sensors.gpu}
      />

      {channels.length === 0 ? (
        <p className={styles.empty}>{t('cooling.empty')}</p>
      ) : (
        <div className={styles.body} ref={bodyRef}>
          <div className={styles.main}>
            <CoolingTrendChart
              cpuTempValue={cpuTemp?.value}
              gpuTempValue={gpuTemp?.value}
              channels={channels}
            />

            <section className={styles.curvesSection}>
              <div className={styles.sectionHeader}>
                <h3 className={styles.sectionTitle}>
                  {t('cooling.sections.curves')}
                  <InfoTooltip message={t('cooling.sections.curves.tooltip')} side="bottom" />
                </h3>
                <button type="button" className={styles.addCurveBtn}
                  onClick={addCurve}
                  disabled={curves.length >= MAX_CURVES}
                  title={curves.length >= MAX_CURVES ? t('cooling.curves.maxReached') : undefined}>
                  <Plus size={14} aria-hidden />
                  <span>{t('cooling.curves.add')}</span>
                </button>
              </div>
              <div className={styles.curvesScroll}>
                {curves.length === 0 ? (
                  <p className={styles.curvesEmpty}>{t('cooling.curves.empty')}</p>
                ) : (
                  <div className={styles.curvesList}>
                    {curves.map(c => (
                      <CurveCard key={c.id} curve={c} allCurves={curves} sources={sources}
                        inUse={curvesInUse.has(c.id)}
                        expanded={expandedCurveId === c.id}
                        highlighted={highlightedCurveIds.has(c.id)}
                        outputPercent={curveOutputs.get(c.id) ?? 0}
                        nubRef={el => setCurveNub(c.id, el)}
                        cardRef={el => setCurveCard(c.id, el)}
                        onWirePointerDown={onCurveNubPointerDown(c.id)}
                        onExpand={() => setExpandedCurveId(c.id)}
                        onCollapse={() => setExpandedCurveId(null)}
                        onHover={setHoveredCurveId}
                        onChange={saveCurveAndPush} onDelete={() => deleteCurve(c.id)}
                        onResetPreset={c.preset ? () => handleResetPresetCurve(c.preset!) : undefined}
                        drag={{
                          isDragging: dragCurveId === c.id,
                          isDragOver: dragOverCurveId === c.id && dragCurveId !== c.id,
                          onDragStart: () => setDragCurveId(c.id),
                          onDragOver: () => setDragOverCurveId(c.id),
                          onDragLeave: () => setDragOverCurveId(null),
                          onDrop: () => {
                            dropCurveOn(c.id);
                            setDragCurveId(null);
                            setDragOverCurveId(null);
                          },
                          onDragEnd: () => {
                            setDragCurveId(null);
                            setDragOverCurveId(null);
                          },
                        }} />
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>

          <aside className={styles.fanPanel}>
            {calibrating && (
              <div className={styles.calibrationBanner}>
                <div className={styles.calibrationSpinner} />
                <span>{t('cooling.calibrate.running')}</span>
              </div>
            )}

            {calibrationResults && (
              <div className={styles.calibrationResults}>
                <div className={styles.calibrationResultsHeader}>
                  <span>{t('cooling.calibrate.done')}</span>
                  <button type="button" className={styles.dismissBtn} onClick={dismissResults}>×</button>
                </div>
                {calibrationResults.map(r => (
                  <div key={r.fanId} className={styles.calibrationResultRow}>
                    <span className={styles.calFanId}>{channels.find(c => c.id === r.fanId)?.name ?? r.fanId}</span>
                    {r.classification === 'Unresponsive' ? (
                      <span className={`${styles.calBadge} ${styles.calUnresponsive}`}>
                        {t('cooling.calibrate.class.unresponsive')}
                      </span>
                    ) : (
                      <span className={styles.calRange}>{r.minRpm}-{r.maxRpm} RPM</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className={`${styles.fanList} ${calibrating ? styles.fanGridDisabled : ''}`}>
              {offStatusCard}
              {(() => {
                // Group channels by deviceId so external USB hubs (NP50,
                // future devices) render with a header + their child fans
                // beneath. Motherboard fans (no deviceId) render flat at
                // the top so users with no hub see the exact UI they
                // always had. Disconnected (Unresponsive) fans sort to the
                // bottom of each group so live fans are above the dead ones.
                const sorted = [...orderedChannels].sort((a, b) => {
                  const aDead = a.classification === 'Unresponsive' ? 1 : 0;
                  const bDead = b.classification === 'Unresponsive' ? 1 : 0;
                  return aDead - bDead;
                });
                const groups = new Map<string | null, FanChannel[]>();
                for (const ch of sorted) {
                  const key = ch.deviceId || null;
                  if (!groups.has(key)) groups.set(key, []);
                  groups.get(key)!.push(ch);
                }
                const renderFan = (ch: FanChannel) => (
                  <FanCard key={ch.id} channel={ch} state={fanStates[ch.id]} curves={curves}
                    calibrating={calibrating}
                    compact
                    canCreateCurve={curves.length < MAX_CURVES}
                    highlighted={highlightedFanIds.has(ch.id) && ch.classification !== 'Unresponsive'}
                    nubRef={el => setFanNub(ch.id, el)}
                    cardRef={el => setFanCard(ch.id, el)}
                    onWirePointerDown={onFanNubPointerDown(ch.id)}
                    onWireHover={setHoveredFanId}
                    onSetMode={v => setFanMode(ch.id, v)}
                    onCreateCurve={() => createCurveAndAssign(ch.id)}
                    onRename={handleRename}
                    onSpeedChange={handleSpeedChange}
                    drag={{
                      isDragging: dragFanId === ch.id,
                      isDragOver: dragOverFanId === ch.id && dragFanId !== ch.id,
                      onDragStart: () => setDragFanId(ch.id),
                      onDragOver: () => setDragOverFanId(ch.id),
                      onDragLeave: () => setDragOverFanId(null),
                      onDrop: () => {
                        dropFanOn(ch.id);
                        setDragFanId(null);
                        setDragOverFanId(null);
                      },
                      onDragEnd: () => {
                        setDragFanId(null);
                        setDragOverFanId(null);
                      },
                    }} />
                );
                const blocks: ReactNode[] = [];
                // Motherboard / GPU fans first (existing UI shape).
                const mobo = groups.get(null);
                if (mobo) for (const ch of mobo) blocks.push(renderFan(ch));
                // Then one labeled group per external device, in stable order.
                const deviceKeys = Array.from(groups.keys()).filter((k): k is string => !!k).sort();
                for (const key of deviceKeys) {
                  const list = groups.get(key)!;
                  const deviceName = key.startsWith('np50:') ? 'HYTE NP50' : key;
                  blocks.push(
                    <div key={`${key}-hdr`} className={styles.deviceGroupHeader}>
                      <span className={styles.deviceGroupName}>{deviceName}</span>
                      <span className={styles.deviceGroupCount}>{list.length} fan{list.length === 1 ? '' : 's'}</span>
                    </div>
                  );
                  for (const ch of list) blocks.push(renderFan(ch));
                }
                return blocks;
              })()}
            </div>

            <div className={styles.fanPanelFooter}>
              <button type="button" className={calibrating ? styles.cancelCalBtn : styles.calibrateBtn}
                onClick={runCalibration} disabled={calibrating}>
                <Gauge size={14} aria-hidden />
                <span>{calibrating ? t('cooling.calibrate.running').split('-')[0].trim() : t('cooling.calibrate.button')}</span>
              </button>
            </div>
          </aside>

          {/* Wire overlay. Drawn after the cards so it paints on top of card
              backgrounds where needed; pointer-events stays off so taps still
              fall through to cards. While a wire drag is in flight, JS adds
              .wireLayerActive (no-op visually but reserved for future drop-zone
              tweaks). */}
          <svg
            ref={layerRef}
            className={`${styles.wireLayer}${wireDrag.kind !== 'idle' ? ' ' + styles.wireLayerActive : ''}`}
            aria-hidden
          >
            {wireEndpoints
              // Skip wires whose curve OR fan nub is scrolled out of view -
              // a wire dangling into nothing is just visual noise. Hide the
              // static wire of a fan currently being rewired (only the
              // dragged ghost should show). And cross-check fanStates so a
              // wire snapshot left over from before a binding was removed
              // does not flash on screen between the state update and the
              // rAF that recomputes wireEndpoints.
              .filter(w =>
                w.visible
                && !(wireDrag.kind === 'rewire' && wireDrag.fanId === w.fanId)
                && fanStates[w.fanId]?.curveId === w.curveId)
              .map(w => {
                const highlighted =
                  w.curveId === expandedCurveId
                    || w.curveId === hoveredCurveId
                    || w.fanId === hoveredFanId;
                return (
                  <path
                    key={`${w.fanId}|${w.curveId}`}
                    className={`${styles.wirePath}${highlighted ? '' : ' ' + styles.wirePathFaded}`}
                    d={wirePath(w.from, w.to)}
                    style={{ ['--wire-len' as string]: `${Math.hypot(w.to.x - w.from.x, w.to.y - w.from.y) * 1.5}px` }}
                  />
                );
              })}
            {removingWires.map(w => (
              <path
                key={`rm-${w.fanId}|${w.curveId}`}
                className={`${styles.wirePath} ${styles.wirePathRemoving}`}
                d={wirePath(w.from, w.to)}
              />
            ))}
            {wireDrag.kind === 'new' && (() => {
              // Drag from a curve out nub: anchor at the circle nub's center
              // (which sits on the card edge).
              const r = bodyRef.current?.getBoundingClientRect();
              const el = curveNubRefs.current.get(wireDrag.curveId);
              if (!el || !r) return null;
              const a = el.getBoundingClientRect();
              const start = { x: a.left + a.width / 2 - r.left, y: a.top + a.height / 2 - r.top };
              const end = cursorInBody(wireDrag.cursor);
              return <path className={`${styles.wirePath} ${styles.wirePathDragging}`} d={wirePath(start, end)} />;
            })()}
            {wireDrag.kind === 'rewire' && (() => {
              const r = bodyRef.current?.getBoundingClientRect();
              if (!r) return null;
              // Rewire flip: while the cursor hovers a curve nub *other than*
              // the original, the wire reads as fan -> hovered-curve. We are
              // not connecting curve to curve; the picked-up end is the fan
              // end, so the anchored end becomes the fan nub. The cursor is
              // the moving end and visually settles into the new curve nub.
              // When the cursor leaves all curve nubs (or returns to the
              // original), snap back to "anchored at original curve, cursor
              // is the picked-up fan end".
              const hoverCurveId = hitTestNub('curveOut', wireDrag.cursor.x, wireDrag.cursor.y);
              const flipped = !!(hoverCurveId && hoverCurveId !== wireDrag.originalCurveId);
              const fanEl = fanNubRefs.current.get(wireDrag.fanId);
              const originalCurveEl = wireDrag.originalCurveId
                ? curveNubRefs.current.get(wireDrag.originalCurveId)
                : null;
              // No original curve (drag started from an unbound fan): wire
              // always anchors at the fan nub regardless of hover state.
              const anchorEl = !originalCurveEl ? fanEl
                : flipped ? fanEl
                : originalCurveEl;
              if (!anchorEl) return null;
              const a = anchorEl.getBoundingClientRect();
              // Anchor at the circle nub's center (on the card edge).
              const start = {
                x: a.left + a.width / 2 - r.left,
                y: a.top + a.height / 2 - r.top,
              };
              const end = cursorInBody(wireDrag.cursor);
              return <path className={`${styles.wirePath} ${styles.wirePathDragging}`} d={wirePath(start, end)} />;
            })()}
          </svg>
        </div>
      )}
    </div>
  );
}
