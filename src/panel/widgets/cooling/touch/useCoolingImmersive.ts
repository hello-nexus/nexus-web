import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  applyProfile, fetchCurves, fetchFanChannels, fetchProfiles, fetchTemperatureSources,
  releaseFanAuto, saveCurves,
  renameFan as apiRenameFan,
  resetPresetCurve as apiResetPresetCurve,
  setFanSpeed as apiSetFanSpeed,
  type FanChannel, type TemperatureSource,
} from '../../../../api/cooling';
import {
  getNp50ConnectionState,
  np50HubModeFromName,
  setNp50FirmwareControl,
  setNp50LiveCoolingMode,
  NP50_LIVE_MODE_SOFTWARE,
} from '../../../../api/np50';
import {
  setMiniHubLiveCoolingMode,
  MINIHUB_LIVE_MODE_MOTHERBOARD,
  MINIHUB_LIVE_MODE_SOFTWARE,
} from '../../../../api/minihub';
import { useCoolingRealtime } from '../../../../hooks/useCooling';
import { useCoolingCurves } from '../../../../hooks/useCoolingCurves';
import { useMultiplex, useTopicCallback } from '../../../../hooks/useMultiplexSocket';
import { useServiceState } from '../../../../hooks/useServiceState';
import { useTempSensorPrefs } from '../../../../hooks/useUiSettings';
import { publishControlSync, subscribeControlSync } from '../../../../lib/controlSync';
import { defaultCurveSourceId } from '../../../../lib/tempSensorResolver';
import { curveDefsFromApi, newCurve, MAX_CURVES, type CurveDef, type FanState } from '../../../../types/cooling';
import { loadCoolingCache, saveCoolingCache, setCachedCoolingActivePreset } from '../coolingCache';
import { isCoolingPresetKey, type CoolingPresetKey } from '../page/coolingPresets';
import type { FanCardHubMode } from '../page/FanCard';

// Optimistic-lock window shared with CoolingPage / CoolingWidget: after a
// local preset change, stale topic / control-sync pushes are ignored for this
// long so they can't snap the UI back mid-transition.
const PRESET_LOCK_MS = 1500;

export interface CoolingImmersiveController {
  channels: FanChannel[];
  sources: TemperatureSource[];
  curves: CurveDef[];
  fanStates: Record<string, FanState>;
  activePreset: CoolingPresetKey | null;
  hubModes: Record<string, FanCardHubMode>;
  canAddCurve: boolean;
  /** Server calibration in progress — fan controls must lock (same interlock
   *  as the desktop page's dimmed rail). */
  calibrating: boolean;
  applyPreset: (key: CoolingPresetKey) => void;
  setFanMode: (fanId: string, value: string) => void;
  createCurveAndAssign: (fanId: string) => void;
  /** Returns the new curve's id, or '' when the cap is reached. */
  addCurve: () => string;
  deleteCurve: (id: string) => void;
  saveCurve: (c: CurveDef) => void;
  resetPresetCurve: (presetKey: string) => void;
  renameFan: (id: string, name: string) => void;
  setFanSpeed: (id: string, speed: number) => void;
}

/**
 * Data layer for the cooling immersive view: CoolingPage's state +
 * transactional handlers minus the desktop-only concerns (wire DnD,
 * calibration, card reordering, settings modal). Seeds from the shared
 * localStorage cache for an instant first paint, then live-fetches and
 * resyncs on the 'cooling' / 'prefs' topics and cross-surface control-sync.
 */
export function useCoolingImmersive(): CoolingImmersiveController {
  const cachedSeed = useMemo(() => loadCoolingCache(), []);
  const [channels, setChannels] = useState<FanChannel[]>(() => cachedSeed.channels);
  const [sources, setSources] = useState<TemperatureSource[]>(() => cachedSeed.sources);
  const [curves, setCurves] = useState<CurveDef[]>(() => cachedSeed.curves);
  const [fanStates, setFanStates] = useState<Record<string, FanState>>(() => cachedSeed.fanStates);
  const [activePreset, setActivePreset] = useState<CoolingPresetKey | null>(() => cachedSeed.activePreset);
  const [hubModes, setHubModes] = useState<Record<string, FanCardHubMode>>(() => cachedSeed.hubModes);
  const presetLockUntilRef = useRef(0);
  const activeProfileRef = useRef('');
  const tempPrefs = useTempSensorPrefs();
  const multiplex = useMultiplex();
  const serviceState = useServiceState(true, multiplex);
  const calibrating = serviceState.cooling?.calibrating ?? false;

  // The NP50 is the only hub with a mode read-back; re-read it on every
  // refresh. The hub doesn't broadcast mode changes, so a mode flipped from
  // another surface can still stay stale until the next cooling event — the
  // desktop page covers that gap with a 3s poll, the immersive deliberately
  // doesn't poll. Locked out briefly after our own hub writes so an in-flight
  // read of the pre-switch mode can't clobber the optimistic write-through.
  const hubModeLockUntilRef = useRef(0);
  const refreshNp50HubMode = useCallback(async () => {
    const state = await getNp50ConnectionState();
    if (!state?.deviceId) return;
    if (Date.now() < hubModeLockUntilRef.current) return;
    const kind = np50HubModeFromName(state.coolingMode);
    if (!kind) return;
    setHubModes(prev => prev[state.deviceId] === kind ? prev : { ...prev, [state.deviceId]: kind });
  }, []);

  const refresh = useCallback(async () => {
    const [fans, temps, saved, profiles] = await Promise.all([
      fetchFanChannels(),
      fetchTemperatureSources(),
      fetchCurves(),
      fetchProfiles(),
    ]);

    if (fans?.channels?.some(c => c.deviceId?.startsWith('np50:'))) {
      void refreshNp50HubMode();
    }

    if (profiles?.active && Date.now() >= presetLockUntilRef.current) {
      activeProfileRef.current = profiles.active;
      if (isCoolingPresetKey(profiles.active)) setActivePreset(profiles.active);
    }

    if (fans?.channels) {
      setChannels(fans.channels);
      const restored: Record<string, FanState> = {};
      for (const ch of fans.channels) {
        if (ch.mode === 'Manual') restored[ch.id] = { softwareControl: true, curveId: null };
      }
      setCurves(curveDefsFromApi(saved));
      for (const c of saved?.curves ?? []) {
        for (const out of c.outputs ?? []) {
          restored[out.id] = { softwareControl: true, curveId: c.id };
        }
      }
      setFanStates(restored);
    }
    if (temps?.sources) setSources(temps.sources);
  }, [refreshNp50HubMode]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Mirror the desktop page's stale-while-revalidate write-back so the next
  // open (here or on the dashboard) paints from the last-good snapshot.
  useEffect(() => {
    saveCoolingCache({ channels, curves, sources, fanStates, activePreset, hubModes });
  }, [channels, curves, sources, fanStates, activePreset, hubModes]);

  // Every cooling-config mutation lands a 'cooling' push from the service.
  const onCoolingTopic = useCallback(() => {
    if (Date.now() < presetLockUntilRef.current) return;
    void refresh();
  }, [refresh]);
  useTopicCallback('cooling', true, onCoolingTopic);

  // Profile switches broadcast on 'prefs'; refetch only when the active
  // profile actually changed instead of polling fetchProfiles.
  const onPrefsTopic = useCallback(() => {
    if (Date.now() < presetLockUntilRef.current) return;
    void (async () => {
      const profiles = await fetchProfiles();
      const next = profiles?.active ?? '';
      if (!next || next === activeProfileRef.current) return;
      activeProfileRef.current = next;
      void refresh();
    })();
  }, [refresh]);
  useTopicCallback('prefs', true, onPrefsTopic);

  useEffect(() => subscribeControlSync(event => {
    if (event.domain !== 'cooling') return;
    const next = event.activePreset ?? event.activeProfile;
    if (next && isCoolingPresetKey(next) && Date.now() >= presetLockUntilRef.current) {
      activeProfileRef.current = next;
      setActivePreset(next);
    }
    void refresh();
  }), [refresh]);

  // Live RPM / duty merge from the realtime topic.
  const realtimeData = useCoolingRealtime(true);
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

  // The 'cooling-curves' topic streams inputTemperature per active curve at
  // ~1 Hz; merge those readings into the sources list so curve graphs track
  // live temps without refetching /cooling/sources.
  const curveCalcs = useCoolingCurves(true);
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

  // ── Handlers (ports of CoolingPage's transactional handlers) ─────────────

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

  // When cooling is Off, any fan change other than reverting to BIOS snaps
  // the preset to Custom first so the curve writes land in the right state.
  const exitOffToCustomIfNeeded = useCallback(async () => {
    if (activeProfileRef.current !== 'off') return;
    setActivePreset('custom');
    activeProfileRef.current = 'custom';
    presetLockUntilRef.current = Date.now() + PRESET_LOCK_MS;
    publishControlSync({ domain: 'cooling', activePreset: 'custom' });
    await applyProfile('custom');
  }, []);

  const applyPreset = useCallback((key: CoolingPresetKey) => {
    if (key === activePreset) return;
    // Lock first so pushes triggered by this write can't revert the
    // optimistic update below.
    presetLockUntilRef.current = Date.now() + PRESET_LOCK_MS;
    setActivePreset(key);
    activeProfileRef.current = key;
    publishControlSync({ domain: 'cooling', activePreset: key });
    // Seed the page's cache so a later navigation to /cooling paints the
    // right preset on first frame.
    setCachedCoolingActivePreset(key);
    void applyProfile(key).then(() => refresh()).catch(() => { /* best-effort */ });
  }, [activePreset, refresh]);

  const toggleSoftwareControl = useCallback(async (fanId: string, enabled: boolean) => {
    if (enabled) {
      await exitOffToCustomIfNeeded();
      const nextStates = { ...fanStates, [fanId]: { softwareControl: true, curveId: null } };
      setFanStates(nextStates);
      await apiSetFanSpeed(fanId, 50);
    } else {
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

  // BIOS = release control; 'manual' = software control, no curve; curve id =
  // bind that curve; 'fw' = NP50 only. Same hub auto-switch semantics as
  // CoolingPage: the cooling mode is a single byte per hub, not per fan.
  const setFanMode = useCallback(async (fanId: string, value: string) => {
    const channel = channels.find(c => c.id === fanId);
    const deviceId = channel?.deviceId ?? null;
    const isNp50 = !!deviceId && deviceId.startsWith('np50:');
    const isMiniHub = !!deviceId && deviceId.startsWith('minihub:');

    // NP50 has no motherboard BIOS hand-off of its own; both 'fw' and 'bios'
    // mean "hand the hub back to firmware control".
    if ((value === 'fw' || value === 'bios') && isNp50 && deviceId) {
      const wasSw = fanStates[fanId]?.softwareControl ?? false;
      if (wasSw) await toggleSoftwareControl(fanId, false);
      await setNp50FirmwareControl();
      hubModeLockUntilRef.current = Date.now() + PRESET_LOCK_MS;
      setHubModes(prev => ({ ...prev, [deviceId]: 'firmware' }));
      return;
    }

    if (value === 'bios') {
      if (isMiniHub && deviceId) {
        await setMiniHubLiveCoolingMode(MINIHUB_LIVE_MODE_MOTHERBOARD);
        hubModeLockUntilRef.current = Date.now() + PRESET_LOCK_MS;
        setHubModes(prev => ({ ...prev, [deviceId]: 'motherboard' }));
      }
      const wasSw = fanStates[fanId]?.softwareControl ?? false;
      if (wasSw) await toggleSoftwareControl(fanId, false);
      return;
    }

    // 'manual' or a curve id - the hub must be in Software for the curve
    // engine to actually push duty cycles in.
    if (deviceId && hubModes[deviceId] && hubModes[deviceId] !== 'software') {
      if (isNp50) await setNp50LiveCoolingMode(NP50_LIVE_MODE_SOFTWARE);
      else if (isMiniHub) await setMiniHubLiveCoolingMode(MINIHUB_LIVE_MODE_SOFTWARE);
      hubModeLockUntilRef.current = Date.now() + PRESET_LOCK_MS;
      setHubModes(prev => ({ ...prev, [deviceId]: 'software' }));
    }

    await exitOffToCustomIfNeeded();
    const targetCurveId = value === 'manual' ? null : value;
    const wasSw = fanStates[fanId]?.softwareControl ?? false;
    if (!wasSw) {
      const nextStates = { ...fanStates, [fanId]: { softwareControl: true, curveId: targetCurveId } };
      setFanStates(nextStates);
      await apiSetFanSpeed(fanId, 50);
      await pushCurves(curves, nextStates);
      const fans = await fetchFanChannels();
      if (fans?.channels) setChannels(fans.channels);
    } else {
      await assignCurve(fanId, targetCurveId);
    }
  }, [channels, fanStates, curves, hubModes, pushCurves, toggleSoftwareControl, assignCurve, exitOffToCustomIfNeeded]);

  const addCurve = useCallback((): string => {
    if (curves.length >= MAX_CURVES) return '';
    const id = `curve-${Date.now()}`;
    const c = newCurve(id);
    c.sourceId = defaultCurveSourceId(sources, tempPrefs.cpuId);
    // New curves go on top so a freshly-added curve is immediately visible.
    const next = [c, ...curves];
    setCurves(next);
    void pushCurves(next, fanStates);
    return id;
  }, [curves, sources, fanStates, pushCurves, tempPrefs.cpuId]);

  // Create a curve and bind it to the fan in one shot so pushCurves sees both
  // the new curve AND the fan's assignment in the same write.
  const createCurveAndAssign = useCallback(async (fanId: string) => {
    if (curves.length >= MAX_CURVES) return;
    await exitOffToCustomIfNeeded();
    const id = `curve-${Date.now()}`;
    const c = newCurve(id);
    c.sourceId = defaultCurveSourceId(sources, tempPrefs.cpuId);
    const nextCurves = [c, ...curves];
    const wasSw = fanStates[fanId]?.softwareControl ?? false;
    const nextStates = { ...fanStates, [fanId]: { softwareControl: true, curveId: id } };
    setCurves(nextCurves);
    setFanStates(nextStates);
    if (!wasSw) await apiSetFanSpeed(fanId, 50);
    void pushCurves(nextCurves, nextStates);
    if (!wasSw) {
      const fans = await fetchFanChannels();
      if (fans?.channels) setChannels(fans.channels);
    }
  }, [curves, sources, fanStates, pushCurves, exitOffToCustomIfNeeded, tempPrefs.cpuId]);

  const deleteCurve = useCallback(async (id: string) => {
    const next = curves.filter(c => c.id !== id);
    // Fans bound to the deleted curve revert to BIOS auto-control.
    const orphanedFanIds: string[] = [];
    const nextStates: Record<string, FanState> = {};
    for (const [fanId, st] of Object.entries(fanStates)) {
      if (st.curveId === id) orphanedFanIds.push(fanId);
      else nextStates[fanId] = st;
    }
    setCurves(next);
    setFanStates(nextStates);
    await Promise.all(orphanedFanIds.map(fanId => releaseFanAuto(fanId)));
    await pushCurves(next, nextStates);
    if (orphanedFanIds.length > 0) {
      const fans = await fetchFanChannels();
      if (fans?.channels) setChannels(fans.channels);
    }
  }, [curves, fanStates, pushCurves]);

  const saveCurve = useCallback((updated: CurveDef) => {
    const next = curves.map(c => c.id === updated.id ? updated : c);
    setCurves(next);
    void pushCurves(next, fanStates);
  }, [curves, fanStates, pushCurves]);

  const resetPresetCurve = useCallback(async (presetKey: string) => {
    await apiResetPresetCurve(presetKey);
    await refresh();
  }, [refresh]);

  const renameFan = useCallback(async (id: string, name: string) => {
    await apiRenameFan(id, name);
    setChannels(prev => prev.map(ch => ch.id === id ? { ...ch, name } : ch));
  }, []);

  const setFanSpeed = useCallback(async (id: string, speed: number) => {
    await exitOffToCustomIfNeeded();
    await apiSetFanSpeed(id, speed);
    const fans = await fetchFanChannels();
    if (fans?.channels) setChannels(fans.channels);
  }, [exitOffToCustomIfNeeded]);

  return {
    channels, sources, curves, fanStates, activePreset, hubModes,
    canAddCurve: curves.length < MAX_CURVES,
    calibrating,
    applyPreset,
    setFanMode: (fanId, value) => { void setFanMode(fanId, value); },
    createCurveAndAssign: (fanId) => { void createCurveAndAssign(fanId); },
    addCurve,
    deleteCurve: (id) => { void deleteCurve(id); },
    saveCurve,
    resetPresetCurve: (presetKey) => { void resetPresetCurve(presetKey); },
    renameFan: (id, name) => { void renameFan(id, name); },
    setFanSpeed: (id, speed) => { void setFanSpeed(id, speed); },
  };
}
