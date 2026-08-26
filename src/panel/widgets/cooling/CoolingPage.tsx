import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Ban, CheckCheck, Gauge, Power } from 'lucide-react';
import { Button } from '../../../components/common/Button/Button';
import { HoverTooltip } from '../../../components/common/HoverTooltip/HoverTooltip';
import { usePersistentState, usePersistentIdSet } from '../../../hooks/usePersistentState';
import { pluralKey } from '../../../lib/pluralKey';
import { Badge } from '../../../components/common/Badge/Badge';
import {
  getNp50ConnectionState,
  np50HubModeFromName,
  setNp50LiveCoolingMode,
  setNp50FirmwareControl,
  NP50_LIVE_MODE_SOFTWARE,
} from '../../../api/np50';
import {
  setMiniHubLiveCoolingMode,
  MINIHUB_LIVE_MODE_MOTHERBOARD,
  MINIHUB_LIVE_MODE_SOFTWARE,
} from '../../../api/minihub';
import {
  getQSeriesState,
  setQSeriesControlMode,
  QSERIES_MODE_SOFTWARE,
  QSERIES_MODE_MOTHERBOARD,
  QSERIES_MODE_FIRMWARE,
} from '../../../api/qseries';
import {
  fetchFanChannels, fetchTemperatureSources, fetchCurves,
  setFanSpeed, releaseFanAuto, saveCurves, renameFan, setFanLock, setFanControlled, setFanRole, setFanOffset,
  fetchCoolingPresets, createCoolingPreset, updateCoolingPreset, deleteCoolingPreset,
  activateCoolingPreset, type CoolingPreset,
  startCalibration, fetchCalibrationResults, fetchProfiles, applyProfile,
  resetPresetCurve, isFanDisconnected,
  type FanChannel, type FanRole, type TemperatureSource,
  type FanCalibration,
} from '../../../api/cooling';
import { useCoolingRealtime } from '../../../hooks/useCooling';
import { useCoolingCurves } from '../../../hooks/useCoolingCurves';
import { useTopicCallback } from '../../../hooks/useMultiplexSocket';
import { useSensors } from '../../../hooks/useSensors';
import type { ServiceState } from '../../../hooks/useServiceState';
import type { ConnectionState } from '../../../hooks/useServiceStatus';
import { useTranslation } from '../../../lib/i18n';
import { useUiSettings } from '../../../hooks/useUiSettings';
import { publishControlSync, subscribeControlSync } from '../../../lib/controlSync';
import { emitRadialBloomFromElement } from '../../../lib/backgroundEffects';
import { ViewHeader } from '../../../components/common/ViewHeader/ViewHeader';
import { PresetToolbar } from '../../../components/common/PresetToolbar/PresetToolbar';
import { IconLabelButton } from '../../../components/common/IconLabelButton/IconLabelButton';
import { AdvancedModeCta } from '../../../components/common/AdvancedModeCta/AdvancedModeCta';
import { DeviceCountSummary } from '../../../components/common/DeviceCountSummary/DeviceCountSummary';
import { SimpleModeNotice } from '../../../components/common/SimpleModeNotice/SimpleModeNotice';
import { useUndoRedo } from '../../../hooks/useUndoRedo';
import { usePageModeToggle } from '../../../app/PageChrome';
import { ConfirmModal } from '../../../components/common/ConfirmModal/ConfirmModal';
import { CollapsibleSection } from '../../../components/common/CollapsibleSection/CollapsibleSection';
import { SortableList, type SortableRowArgs } from '../../../components/common/SortableList/SortableList';
import { ServiceRequired } from '../../../components/views/ServiceRequired';
import { CoolingSkeleton } from '../../../components/views/PageSkeleton/PageSkeleton';
import { FanCard, type FanBulkSelection, type FanCardHubMode } from './page/FanCard';
import { CurveCard } from './page/CurveEditor';
import { CurveSelector } from './page/CurveSelector';
import { fanDeviceGroupName } from './page/deviceGroupName';
import { COOLING_MODES, isCoolingModeKey, type CoolingModeKey } from './page/coolingModes';
import { loadCoolingCache, saveCoolingCache } from './coolingCache';
import { resolveCpuTempSensor, defaultCurveSourceId } from '../../../lib/tempSensorResolver';
import { curveDefsFromApi, curveDefToApi, MAX_CURVES, newCurve, type CurveDef, type FanState } from '../../../types/cooling';
import { ImportDialog, availableImportSources } from '../../../components/common/ImportCenter/ImportDialog';
import styles from './CoolingPage.module.scss';

/**
 * Cooling tab composer. State + transactional handlers live here; rendering is
 * delegated to a pinned CurveCard (the selected curve's editor + graph, with
 * the curve-selector buttons nested inside it) and FanCard (the fan grid).
 * Selecting a curve drives the hero card and highlights the fans bound to it;
 * fans bind to a curve through each fan card's mode dropdown.
 */

interface CoolingViewProps {
  serviceOnline: boolean;
  serviceState: ServiceState;
  connectionState?: ConnectionState;
  activeProfileId?: string;
  /** Host OS from /ping, as the lighting page takes it. Empty until the ping resolves, which keeps a Windows-only entry from flashing in on other hosts. */
  platform?: string;
}

/** The whole cooling configuration the page can change: curve shapes and the
 *  library itself, what drives each fan, manual duties, per-fan offsets, and
 *  the active mode. One stack covers the page because, unlike lighting, there
 *  is no separate modal editor with its own history. */
interface CoolingHistorySnapshot {
  curves: CurveDef[];
  fanStates: Record<string, FanState>;
  manualSpeeds: Record<string, number>;
  offsets: Record<string, number>;
  mode: CoolingModeKey | null;
}

// Module scope so the history survives CoolingPage's unmount on navigation.
// Session-only; assumes one mounted CoolingPage, as the lighting page does.
let coolingHistoryStacks: { undo: CoolingHistorySnapshot[]; redo: CoolingHistorySnapshot[] } | null = null;
const coolingHistoryStore = {
  read: () => coolingHistoryStacks,
  write: (s: { undo: CoolingHistorySnapshot[]; redo: CoolingHistorySnapshot[] }) => { coolingHistoryStacks = s; },
};

export function CoolingPage({ serviceOnline, serviceState, connectionState, activeProfileId, platform = '' }: CoolingViewProps) {
  const { t, language } = useTranslation();
  // Seed every primary slice from localStorage so subsequent visits to this
  // route paint cards immediately instead of flashing an empty fan list for
  // the duration of the /cooling/fans+curves+sources+profiles round-trip.
  // First-ever visit returns EMPTY (nothing cached yet); the live fetch
  // then populates and writes back. See coolingCache.ts for the contract.
  const cachedSeed = useMemo(() => loadCoolingCache(), []);
  const [channels, setChannels] = useState<FanChannel[]>(() => cachedSeed.channels);
  const [sources, setSources] = useState<TemperatureSource[]>(() => cachedSeed.sources);
  const [curves, setCurves] = useState<CurveDef[]>(() => cachedSeed.curves);
  const [fanStates, setFanStates] = useState<Record<string, FanState>>(() => cachedSeed.fanStates);
  const [calibrationResults, setCalibrationResults] = useState<FanCalibration[] | null>(null);
  // Seeded from the cache so the active preset tab on the header doesn't
  // flash unselected on every revisit. The live fetch refreshes it.
  const [activeMode, setActiveMode] = useState<CoolingModeKey | null>(() => cachedSeed.activeMode);
  // Per-hub live cooling mode keyed by FanChannel.deviceId (e.g.
  // 'np50:1A2B3C', 'minihub:XYZ'). NP50 can report its own mode; MiniHub
  // can't, so we cache what we last set. Drives the per-fan dropdown
  // display and the auto-switch behaviour when the user picks BIOS / FW /
  // Manual on any one fan of a hub. Seeded from the same persistent
  // cache so the per-fan dropdowns don't blink to a default on visit.
  const [hubModes, setHubModes] = useState<Record<string, FanCardHubMode>>(() => cachedSeed.hubModes);
  // Per-group collapse state for the fan grid (external hub groups + the
  // Disconnected group), persisted across restarts. Keyed by the group's
  // deviceId, plus the literal 'disconnected'. Default: only Disconnected
  // starts collapsed so a calibration-flagged-unresponsive fan doesn't
  // visually dominate the section; hub groups start expanded.
  const [collapsedFanGroups, setCollapsedFanGroups] = usePersistentState<string[]>('cooling.collapsedFanGroups', ['disconnected']);
  const isFanGroupCollapsed = (key: string) => collapsedFanGroups.includes(key);
  const toggleFanGroup = (key: string) =>
    setCollapsedFanGroups(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  const activeCoolingProfileRef = useRef('');
  // After an optimistic preset change (user click or Off-guard) we lock the
  // displayed preset for a short window so a stale `/cooling/profiles` poll or
  // refetch doesn't snap the UI back to the prior value mid-transition.
  const presetLockUntilRef = useRef(0);
  // While the user is actively editing a curve (dragging a point, nudging a
  // slider) the service echoes our own save back on the `cooling` topic; a
  // refetch mid-gesture would clobber the in-progress edit. Bump this on every
  // curve edit and ignore topic-echo refreshes until it lapses.
  const curveEditLockUntilRef = useRef(0);

  // Optimistic calibration lock: the server flag arrives via the cooling
  // broadcast, but the user needs the fan rail dimmed + locked the instant
  // they click Calibrate - not a broadcast round-trip later. The local flag
  // bridges that gap and hands off to the server flag (or expires after 10 s
  // if the start never confirms, so a failed start can't wedge the page).
  const [calStarting, setCalStarting] = useState(false);
  const [calConfirmOpen, setCalConfirmOpen] = useState(false);
  const serverCalibrating = serviceState.cooling?.calibrating ?? false;
  const calibrating = serverCalibrating || calStarting;
  useEffect(() => {
    if (!calStarting) return;
    if (serverCalibrating) { setCalStarting(false); return; }
    const id = setTimeout(() => setCalStarting(false), 10_000);
    return () => clearTimeout(id);
  }, [calStarting, serverCalibrating]);

  const realtimeData = useCoolingRealtime(serviceOnline);
  const curveCalcs = useCoolingCurves(serviceOnline);
  const sensors = useSensors(serviceOnline);
  const { settings, update: updateUi } = useUiSettings();
  const cpuTemp = resolveCpuTempSensor(sensors.cpu, settings.preferredCpuTempSensorId);

  const simpleDashboard = settings.coolingDashboardMode === 'simple';
  const toggleDashboardMode = useCallback(() => {
    updateUi({ coolingDashboardMode: simpleDashboard ? 'advanced' : 'simple' });
  }, [simpleDashboard, updateUi]);
  // The label names the TARGET mode (what a click switches to), matching the
  // in-page advanced-mode card.
  usePageModeToggle({
    label: t(simpleDashboard ? 'uiMode.advancedMode' : 'uiMode.simpleMode'),
    title: t(simpleDashboard ? 'uiMode.switchToAdvanced' : 'uiMode.switchToSimple'),
    onToggle: toggleDashboardMode,
  });

  // The curve whose graph + editor the hero card shows; a row of buttons inside
  // the card selects it. Selecting also highlights the fans bound to it. Seeded
  // from the cached curves so a revisit paints the hero card immediately.
  const [selectedCurveId, setSelectedCurveId] = usePersistentState<string | null>(
    'nexus.cooling.selectedCurve', cachedSeed.curves[0]?.id ?? null);

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
        if (isCoolingModeKey(profiles.active)) setActiveMode(profiles.active);
      }
    }

    if (fans?.channels) setChannels(fans.channels);

    // fanStates joins the fan list with the curve outputs, so it can only be
    // rebuilt when BOTH fetches land - fetchService returns null on any non-2xx.
    // Rebuilding from a null curves response drops every curve and binding, and
    // the next edit persists that empty set back to the service, wiping the
    // presets. An empty curves array is a legitimate state and still rebuilds.
    if (fans?.channels && saved?.curves) {
      const restored: Record<string, FanState> = {};
      for (const ch of fans.channels) {
        if (ch.mode === 'Manual') {
          restored[ch.id] = { softwareControl: true, curveId: null };
        }
      }

      setCurves(curveDefsFromApi(saved));
      for (const c of saved.curves) {
        for (const out of c.outputs ?? []) {
          restored[out.id] = { softwareControl: true, curveId: c.id };
        }
      }

      setFanStates(restored);
    }
    if (temps?.sources) setSources(temps.sources);
  }, [serviceOnline]);

  // Persist the cached slices on every change so the next visit to this
  // route paints from the last-good snapshot. JSON.stringify + a single
  // localStorage write per slice change is sub-ms - no debounce needed
  // since these slices only mutate on real events (refresh, user edit,
  // profile switch, hot-plug).
  useEffect(() => {
    saveCoolingCache({ channels, curves, sources, fanStates, activeMode, hubModes });
  }, [channels, curves, sources, fanStates, activeMode, hubModes]);

  // Re-runs on profile switch so the curves/fan assignments reflect the new
  // profile's persisted config.
  useEffect(() => {
    refreshCoolingConfig();
  }, [refreshCoolingConfig, activeProfileId]);

  // Seed hubModes from whatever the NP50 hub currently reports. Only NP50
  // exposes a read endpoint for its cooling mode; MiniHub stays at 'software'
  // until the user picks BIOS on one of its fans, which is the same default
  // assumption the curve engine makes anyway. Re-runs when an NP50 fan
  // appears so a hot-plug doesn't leave the dropdown blank.
  const hasNp50Fan = useMemo(
    () => channels.some(c => c.deviceId?.startsWith('np50:')),
    [channels],
  );
  useEffect(() => {
    if (!serviceOnline || !hasNp50Fan) return;
    let cancelled = false;
    (async () => {
      const state = await getNp50ConnectionState();
      if (cancelled || !state?.deviceId) return;
      const kind = np50HubModeFromName(state.coolingMode);
      if (!kind) return;
      setHubModes(prev => ({ ...prev, [state.deviceId]: kind }));
    })();
    return () => { cancelled = true; };
  }, [serviceOnline, hasNp50Fan]);

  // Seed the Q-series pump's hub mode from the cooler's reported control mode
  // (Software/Motherboard/Firmware) so its fan-card dropdown shows the live mode.
  const hasQSeriesPump = useMemo(
    () => channels.some(c => c.deviceId?.startsWith('qseries:')),
    [channels],
  );
  useEffect(() => {
    if (!serviceOnline || !hasQSeriesPump) return;
    let cancelled = false;
    (async () => {
      const s = await getQSeriesState();
      if (cancelled || !s?.connected || !s.deviceId) return;
      const kind = s.controlMode === QSERIES_MODE_SOFTWARE ? 'software'
        : s.controlMode === QSERIES_MODE_FIRMWARE ? 'firmware'
        : 'motherboard';
      setHubModes(prev => ({ ...prev, [s.deviceId]: kind }));
    })();
    return () => { cancelled = true; };
  }, [serviceOnline, hasQSeriesPump]);

  useEffect(() => subscribeControlSync(event => {
    if (event.domain !== 'cooling') return;
    const next = event.activePreset ?? event.activeProfile;
    if (next) {
      activeCoolingProfileRef.current = next;
      if (isCoolingModeKey(next)) setActiveMode(next);
    }
    refreshCoolingConfig();
  }), [refreshCoolingConfig]);

  // Cross-window profile detection: every profile switch broadcasts on the
  // `prefs` topic, so we refetch the active profile when the topic fires
  // instead of polling fetchProfiles() every second. The preset/curve-edit
  // lock gates still apply so a mid-transition push from our own mutation
  // doesn't repaint stale state.
  useTopicCallback('prefs', serviceOnline, () => {
    if (Date.now() < presetLockUntilRef.current) return;
    if (Date.now() < curveEditLockUntilRef.current) return;
    void (async () => {
      const profiles = await fetchProfiles();
      const next = profiles?.active ?? '';
      if (!next || next === activeCoolingProfileRef.current) return;
      activeCoolingProfileRef.current = next;
      refreshCoolingConfig();
    })();
  });

  // Anything that mutates the cooling config (per-fan Manual / BIOS, curve
  // edits, dropdown bind, preset apply) lands a "cooling" topic push from the
  // service. The widget already listens on this topic; the main view needs
  // the same wiring or the preset chip stays selected on Silent/Balanced/
  // Turbo even after the backend has derived ActivePreset=custom from the
  // per-fan change. The preset + curve-edit lock gates guard against
  // optimistic-update races (e.g. a point drag bouncing back mid-gesture).
  useTopicCallback('cooling', serviceOnline, () => {
    if (Date.now() < presetLockUntilRef.current) return;
    if (Date.now() < curveEditLockUntilRef.current) return;
    refreshCoolingConfig();
  });

  // Keep the curve sources' temperature values live so the select labels and
  // the graph's temperature dot track real-time sensor readings. The
  // `cooling-curves` topic streams inputTemperature per active curve at ~1 Hz,
  // so we merge those readings into the existing sources list instead of
  // refetching /cooling/sources every second. Sources that aren't driving any
  // curve keep their last-fetched value until a mutation triggers a refresh.
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

  // Poll the NP50 connection-state endpoint on a coarse cadence (~3 s) so
  // FanCard's hubMode prop reflects whatever the hub is actually in. Single
  // hub for now; once the service supports multiple, this becomes a fan-out
  // over each connected NP50. MiniHub has no read-back command - we cache
  // hubModes locally on PUT instead.
  useEffect(() => {
    if (!serviceOnline) return;
    let cancelled = false;
    const tick = async () => {
      const conn = await getNp50ConnectionState();
      if (cancelled || !conn || !conn.connected || !conn.deviceId) return;
      const kind = np50HubModeFromName(conn.coolingMode);
      if (!kind) return;
      setHubModes(prev => prev[conn.deviceId] === kind ? prev : { ...prev, [conn.deviceId]: kind });
    };
    void tick();
    const id = window.setInterval(tick, 3000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [serviceOnline]);

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
      fetchCalibrationResults().then(r => { if (r?.calibrations) setCalibrationResults(r.calibrations); });
    }
    prevCalStateRef.current = cur;
  }, [serviceState.cooling?.calibrationState]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  // ── Saved presets ─────────────────────────────────────────────────────────
  // Live write-through, matching the lighting page: there is no Save button, so
  // every configuration change re-captures into whichever preset is loaded.
  const [presets, setPresets] = useState<CoolingPreset[]>([]);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const activePresetIdRef = useRef<string | null>(null);
  useEffect(() => { activePresetIdRef.current = activePresetId; }, [activePresetId]);

  const loadPresets = useCallback(async () => {
    const res = await fetchCoolingPresets();
    if (!res) return;
    setPresets(res.presets);
    setActivePresetId(res.activeId);
  }, []);

  useEffect(() => {
    if (!serviceOnline) return;
    void loadPresets();
  }, [serviceOnline, loadPresets]);

  // ── Undo / redo ───────────────────────────────────────────────────────────
  // Latest-value refs so a snapshot taken inside a callback reads current
  // state rather than the closure's.
  const curvesRef = useRef(curves);
  const fanStatesRef = useRef(fanStates);
  const channelsRef = useRef(channels);
  const activeModeRef = useRef(activeMode);
  useEffect(() => { curvesRef.current = curves; }, [curves]);
  useEffect(() => { fanStatesRef.current = fanStates; }, [fanStates]);
  useEffect(() => { channelsRef.current = channels; }, [channels]);
  useEffect(() => { activeModeRef.current = activeMode; }, [activeMode]);

  const captureHistory = useCallback((): CoolingHistorySnapshot => {
    const manualSpeeds: Record<string, number> = {};
    const offsets: Record<string, number> = {};
    for (const ch of channelsRef.current) {
      if (fanStatesRef.current[ch.id]?.softwareControl && !fanStatesRef.current[ch.id]?.curveId) {
        manualSpeeds[ch.id] = ch.dutyPercent ?? 0;
      }
      if (ch.offset) offsets[ch.id] = ch.offset;
    }
    return {
      // Deep-copied: a later point drag mutates the live curve objects, which
      // would otherwise rewrite the snapshot already on the stack.
      curves: structuredClone(curvesRef.current),
      fanStates: structuredClone(fanStatesRef.current),
      manualSpeeds,
      offsets,
      mode: activeModeRef.current,
    };
  }, []);

  const pushCurvesRef = useRef<((d: CurveDef[], st: Record<string, FanState>) => Promise<unknown>) | null>(null);
  const saveActivePresetRef = useRef<(() => Promise<void>) | null>(null);

  const undoRedoRef = useRef<{
    undo: (c: CoolingHistorySnapshot) => CoolingHistorySnapshot | null;
    redo: (c: CoolingHistorySnapshot) => CoolingHistorySnapshot | null;
  }>({ undo: () => null, redo: () => null });
  const pushHistoryRef = useRef<((s: CoolingHistorySnapshot) => void) | null>(null);
  const pushHistory = useCallback(() => { pushHistoryRef.current?.(captureHistory()); }, [captureHistory]);

  // Mode first (it rewrites assignments), then the curve library and
  // assignments the snapshot actually recorded, then the per-fan values.
  const applyHistory = useCallback(async (snap: CoolingHistorySnapshot) => {
    if (snap.mode && snap.mode !== activeModeRef.current) {
      setActiveMode(snap.mode);
      activeCoolingProfileRef.current = snap.mode;
      presetLockUntilRef.current = Date.now() + 1500;
      publishControlSync({ domain: 'cooling', activePreset: snap.mode });
      await applyProfile(snap.mode);
    }
    setCurves(snap.curves);
    setFanStates(snap.fanStates);
    await pushCurvesRef.current?.(snap.curves, snap.fanStates);
    for (const [fanId, duty] of Object.entries(snap.manualSpeeds)) {
      await setFanSpeed(fanId, duty);
    }
    for (const ch of channelsRef.current) {
      const want = snap.offsets[ch.id] ?? 0;
      if ((ch.offset ?? 0) !== want) await setFanOffset(ch.id, want);
    }
    await refreshCoolingConfig();
    void saveActivePresetRef.current?.();
  }, [refreshCoolingConfig]);

  const handleUndo = useCallback(async () => {
    const restored = undoRedoRef.current.undo(captureHistory());
    if (restored) await applyHistory(restored);
  }, [captureHistory, applyHistory]);

  const handleRedo = useCallback(async () => {
    const restored = undoRedoRef.current.redo(captureHistory());
    if (restored) await applyHistory(restored);
  }, [captureHistory, applyHistory]);

  const {
    push: pushHistorySnapshot,
    undo: undoHistory,
    redo: redoHistory,
    canUndo,
    canRedo,
  } = useUndoRedo<CoolingHistorySnapshot>({
    maxDepth: 50,
    onUndo: handleUndo,
    onRedo: handleRedo,
    store: coolingHistoryStore,
  });
  undoRedoRef.current = { undo: undoHistory, redo: redoHistory };
  pushHistoryRef.current = pushHistorySnapshot;

  // Fired after any change the preset stores. The service captures live state,
  // so this needs no payload - and it is a no-op when no preset is loaded.
  const saveActivePreset = useCallback(async () => {
    const id = activePresetIdRef.current;
    if (!id) return;
    await updateCoolingPreset(id, { saveCurrent: true });
  }, []);
  saveActivePresetRef.current = saveActivePreset;

  const handlePresetLoad = useCallback(async (id: string) => {
    setActivePresetId(id);
    await activateCoolingPreset(id);
    await refreshCoolingConfig();
    await loadPresets();
  }, [refreshCoolingConfig, loadPresets]);

  const handlePresetCreate = useCallback(async (name: string) => {
    const res = await createCoolingPreset(name);
    if (!res || res.error) {
      return { error: true, msg: res?.msg };
    }
    await loadPresets();
    return { error: false };
  }, [loadPresets]);

  const handlePresetLoadWithHistory = useCallback(async (id: string) => {
    pushHistory();
    await handlePresetLoad(id);
  }, [pushHistory, handlePresetLoad]);

  const handlePresetRename = useCallback(async (id: string, name: string) => {
    await updateCoolingPreset(id, { name });
    await loadPresets();
  }, [loadPresets]);

  const handlePresetDelete = useCallback(async (id: string) => {
    await deleteCoolingPreset(id);
    await loadPresets();
  }, [loadPresets]);

  const pushCurves = useCallback((defs: CurveDef[], states: Record<string, FanState>) => {
    const apiCurves = defs.map(c => curveDefToApi(
      c,
      Object.entries(states).filter(([, st]) => st.curveId === c.id).map(([fanId]) => ({ id: fanId, type: 'Fan' })),
    ));
    return saveCurves({ globalSpeedModifier: 1, curves: apiCurves })
      .then(res => { void saveActivePreset(); return res; });
  }, [saveActivePreset]);
  pushCurvesRef.current = pushCurves;

  // Issue rule: when cooling is Off, the user changing any fan setting other
  // than reverting to BIOS Control snaps the active tab to Custom. We do the
  // tab switch first so the curve writes that follow land in the right
  // preset state, then refetch via the WebSocket "cooling" push that the
  // service emits after applyProfile.
  const exitOffToCustomIfNeeded = useCallback(async () => {
    if (activeCoolingProfileRef.current !== 'off') return;
    setActiveMode('custom');
    activeCoolingProfileRef.current = 'custom';
    presetLockUntilRef.current = Date.now() + 1500;
    publishControlSync({ domain: 'cooling', activePreset: 'custom' });
    await applyProfile('custom');
  }, []);

  const handleModeChange = useCallback(async (key: string) => {
    if (!isCoolingModeKey(key)) return;
    // Pressing a preset (header tab or a Silent/Balanced/Turbo curve button)
    // also shows that preset's curve in the hero graph.
    const presetCurve = curves.find(c => c.preset === key);
    if (presetCurve) setSelectedCurveId(presetCurve.id);
    if (key === activeMode) return;
    pushHistory();
    setActiveMode(key);
    activeCoolingProfileRef.current = key;
    presetLockUntilRef.current = Date.now() + 1500;
    publishControlSync({ domain: 'cooling', activePreset: key });
    await applyProfile(key);
    refreshCoolingConfig();
    void saveActivePreset();
  }, [activeMode, curves, refreshCoolingConfig, setSelectedCurveId, saveActivePreset, pushHistory]);

  const toggleSoftwareControl = useCallback(async (fanId: string, enabled: boolean) => {
    pushHistory();
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
  }, [fanStates, curves, pushCurves, exitOffToCustomIfNeeded, pushHistory]);

  const assignCurve = useCallback(async (fanId: string, curveId: string | null) => {
    pushHistory();
    if (curveId !== null) await exitOffToCustomIfNeeded();
    setFanStates(prev => ({ ...prev, [fanId]: { ...prev[fanId], curveId } }));
    await pushCurves(curves, { ...fanStates, [fanId]: { ...fanStates[fanId], curveId } });
  }, [fanStates, curves, pushCurves, exitOffToCustomIfNeeded, pushHistory]);

  const handleSpeedChange = useCallback(async (id: string, speed: number) => {
    pushHistory();
    await exitOffToCustomIfNeeded();
    await setFanSpeed(id, speed);
    const fans = await fetchFanChannels();
    if (fans?.channels) setChannels(fans.channels);
    void saveActivePreset();
  }, [exitOffToCustomIfNeeded, saveActivePreset, pushHistory]);

  const handleRename = useCallback(async (id: string, name: string) => {
    await renameFan(id, name);
    setChannels(prev => prev.map(ch => ch.id === id ? { ...ch, name } : ch));
  }, []);

  const handleToggleLock = useCallback(async (id: string, locked: boolean) => {
    setChannels(prev => prev.map(ch => ch.id === id ? { ...ch, locked } : ch));
    await setFanLock(id, locked);
    const fans = await fetchFanChannels();
    if (fans?.channels) setChannels(fans.channels);
  }, []);

  // Nexus Control on/off for one channel. The service releases the fan to the
  // motherboard on the way off, so the refetch is what brings its mode back as
  // BIOS; the optimistic write just keeps the card from flickering first.
  const handleSetFanControlled = useCallback(async (id: string, controlled: boolean) => {
    setChannels(prev => prev.map(ch => ch.id === id ? { ...ch, controlled } : ch));
    await setFanControlled(id, controlled);
    const fans = await fetchFanChannels();
    if (fans?.channels) setChannels(fans.channels);
  }, []);

  // Simple mode's one-click claim. Sequential rather than parallel: each write
  // re-derives the active preset service-side, and concurrent writes would race
  // that derivation.
  const claimAllFans = useCallback(async () => {
    for (const ch of channels) {
      if (ch.controlled === false) await setFanControlled(ch.id, true);
    }
    const fans = await fetchFanChannels();
    if (fans?.channels) setChannels(fans.channels);
  }, [channels]);

  // A locked fan is skipped by the preset buttons, and simple mode has no fan
  // rail to unlock it from - it would sit on its old speed, unexplained.
  // Latched per id: every lock write refetches the channels, so an unlatched
  // effect re-fires on its own result and a fan the service refuses to unlock
  // would loop forever.
  const unlockAttemptedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!simpleDashboard) { unlockAttemptedRef.current.clear(); return; }
    for (const ch of channels) {
      if (!ch.locked || unlockAttemptedRef.current.has(ch.id)) continue;
      unlockAttemptedRef.current.add(ch.id);
      void handleToggleLock(ch.id, false);
    }
  }, [simpleDashboard, channels, handleToggleLock]);

  // Counts Nexus Control, not "currently driven": the Off preset legitimately
  // drives nothing, and a summary that read 0/6 there would put a claim button
  // in front of a user who chose Off on purpose. Nexus Control off is the only
  // state the claim button can resolve, so it is the one the count tracks.
  const controlledFanCount = useMemo(
    () => channels.filter(ch => ch.controlled !== false).length,
    [channels],
  );

  const handleSetRole = useCallback(async (id: string, role: FanRole) => {
    setChannels(prev => prev.map(ch => ch.id === id ? { ...ch, role } : ch));
    await setFanRole(id, role);
    const fans = await fetchFanChannels();
    if (fans?.channels) setChannels(fans.channels);
  }, []);

  const addCurve = useCallback((): string => {
    if (curves.length >= MAX_CURVES) return '';
    const id = `curve-${Date.now()}`;
    const c = newCurve(id);
    // Default to the CPU temp (the sensor pinned in cooling settings), never
    // sources[0] - on Linux that's often a motherboard SuperIO channel.
    c.sourceId = defaultCurveSourceId(sources, cpuTemp?.id);
    // Append so new curves land at the end of the selector list.
    const next = [...curves, c];
    setCurves(next);
    // Show the new curve in the hero card right away.
    setSelectedCurveId(id);
    pushCurves(next, fanStates);
    return id;
  }, [cpuTemp?.id, curves, fanStates, pushCurves, setSelectedCurveId, sources]);

  // BIOS = release control; 'manual' = software control, no curve; curve id =
  // bind that curve; 'fw' = NP50 only, switches the whole hub to its EEPROM
  // Static mode. Keeps the full transition atomic.
  //
  // For external-hub fans (NP50 / MiniHub) the per-fan dropdown also drives
  // the *hub* cooling mode: BIOS flips the hub to Motherboard passthrough,
  // FW Control flips an NP50 to Static, and Manual/Curve guarantees the hub
  // is in Software so Nexus can actually drive frames into it. This auto-
  // switch matches how the hardware works - there's a single cooling mode
  // byte per hub, not per fan.
  // Multi-select: a mode change on a selected card is applied to every selected
  // fan, so a curve can be assigned to a group in one action.
  const [selectedFanIds, setSelectedFanIds] = usePersistentIdSet('nexus.cooling.selectedFans');

  const setFanMode = useCallback(async (fanId: string, value: string) => {
    const channel = channels.find(c => c.id === fanId);
    const deviceId = channel?.deviceId ?? null;
    const isNp50 = !!deviceId && deviceId.startsWith('np50:');
    const isMiniHub = !!deviceId && deviceId.startsWith('minihub:');
    const isQSeries = !!deviceId && deviceId.startsWith('qseries:');

    // NP50 has no motherboard "BIOS" hand-off of its own, so both 'fw' and the
    // 'bios' value mean "hand the hub back to firmware control" (Static @
    // device-page % or Motherboard PWM - the service reads the EEPROM defaults
    // to decide). Release the fan first - the backend flips the hub to
    // motherboard once its last software channel is released - then re-pin
    // firmware so we end in the device-page standalone mode rather than
    // motherboard.
    if ((value === 'fw' || value === 'bios') && isNp50 && deviceId) {
      const wasSw = fanStates[fanId]?.softwareControl ?? false;
      if (wasSw) await toggleSoftwareControl(fanId, false);
      await setNp50FirmwareControl();
      setHubModes(prev => ({ ...prev, [deviceId]: 'firmware' }));
      return;
    }

    // Q-series pump: FW Control = the cooler's onboard firmware temperature
    // curve (distinct from BIOS/motherboard, which the pump also offers).
    if (value === 'fw' && isQSeries && deviceId) {
      const wasSw = fanStates[fanId]?.softwareControl ?? false;
      if (wasSw) await toggleSoftwareControl(fanId, false);
      await setQSeriesControlMode(QSERIES_MODE_FIRMWARE);
      setHubModes(prev => ({ ...prev, [deviceId]: 'firmware' }));
      return;
    }

    if (value === 'bios') {
      if (isMiniHub && deviceId) {
        await setMiniHubLiveCoolingMode(MINIHUB_LIVE_MODE_MOTHERBOARD);
        setHubModes(prev => ({ ...prev, [deviceId]: 'motherboard' }));
      }
      if (isQSeries && deviceId) {
        await setQSeriesControlMode(QSERIES_MODE_MOTHERBOARD);
        setHubModes(prev => ({ ...prev, [deviceId]: 'motherboard' }));
      }
      const wasSw = fanStates[fanId]?.softwareControl ?? false;
      if (wasSw) await toggleSoftwareControl(fanId, false);
      return;
    }

    // 'manual' or a curve id - the hub must be in Software for the curve
    // engine to actually push duty cycles in. Only issue the hub write when
    // the hub isn't already in Software; the cooling-mode endpoint is
    // idempotent but skipping the call avoids USB chatter on every BIOS->
    // Manual transition.
    if (deviceId && hubModes[deviceId] && hubModes[deviceId] !== 'software') {
      if (isNp50) await setNp50LiveCoolingMode(NP50_LIVE_MODE_SOFTWARE);
      else if (isMiniHub) await setMiniHubLiveCoolingMode(MINIHUB_LIVE_MODE_SOFTWARE);
      else if (isQSeries) await setQSeriesControlMode(QSERIES_MODE_SOFTWARE);
      setHubModes(prev => ({ ...prev, [deviceId]: 'software' }));
    }

    await exitOffToCustomIfNeeded();
    const targetCurveId = value === 'manual' ? null : value;
    const wasSw = fanStates[fanId]?.softwareControl ?? false;
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
  }, [channels, fanStates, curves, hubModes, pushCurves, toggleSoftwareControl, assignCurve, exitOffToCustomIfNeeded]);

  // A change on a card that is part of the selection applies to the whole
  // selection; an unselected card still acts alone.
  // Replace-or-extend selection from a card body click.
  const selectFan = useCallback((id: string, additive: boolean) => {
    setSelectedFanIds(prev => {
      if (!additive) return prev.size === 1 && prev.has(id) ? new Set() : new Set([id]);
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, [setSelectedFanIds]);

  // A card inside a multi-selection acts on the whole selection, the way the
  // lighting device cards do. Aggregates read "any member still is", so one
  // press lands every member on the same state.
  const bulkForFan = useCallback((ch: FanChannel): FanBulkSelection | undefined => {
    if (selectedFanIds.size < 2 || !selectedFanIds.has(ch.id)) return undefined;
    const members = channels.filter(c => selectedFanIds.has(c.id));
    if (members.length < 2) return undefined;
    return {
      count: members.length,
      locked: members.some(c => c.locked === true),
      controlled: members.some(c => c.controlled !== false),
      setLocked: (locked: boolean) => { for (const c of members) void handleToggleLock(c.id, locked); },
      setControlled: (controlled: boolean) => { for (const c of members) void handleSetFanControlled(c.id, controlled); },
    };
  }, [channels, selectedFanIds, handleToggleLock, handleSetFanControlled]);

  // The curve the selection is wearing: shared across every selected fan, or
  // null when they disagree - there is no single curve to highlight then.
  const scopedCurveId = useMemo(() => {
    if (selectedFanIds.size === 0) return undefined;
    let common: string | null | undefined;
    for (const id of selectedFanIds) {
      const cid = fanStates[id]?.curveId ?? null;
      if (common === undefined) common = cid;
      else if (common !== cid) return null;
    }
    return common ?? null;
  }, [fanStates, selectedFanIds]);

  // The curve both highlights answer to: what the selected fans wear, or the
  // curve the editor is on when nothing is selected. Reading the fan highlight
  // off selectedCurveId instead let a reload light up the first curve's fans
  // while the button row was already showing the selection's curve.
  const effectiveCurveId = scopedCurveId === undefined ? selectedCurveId : scopedCurveId;

  /**
   * Assign one curve to many fans in a single write.
   *
   * Calling setFanMode per fan in a loop raced: each call derived its next
   * state from the SAME closed-over fanStates, so the last write clobbered the
   * others and only one fan ended up on the curve (and pushCurves ran N times
   * with conflicting snapshots).
   */
  const assignCurveToFans = useCallback(async (ids: string[], curveId: string | null) => {
    if (ids.length === 0) return;
    pushHistory();
    // A hub has to be in Software before the curve engine can drive it. One
    // write per hub, not per fan.
    const hubs = new Set(
      ids.map(id => channels.find(c => c.id === id)?.deviceId).filter((d): d is string => !!d),
    );
    for (const deviceId of hubs) {
      if (!hubModes[deviceId] || hubModes[deviceId] === 'software') continue;
      if (deviceId.startsWith('np50:')) await setNp50LiveCoolingMode(NP50_LIVE_MODE_SOFTWARE);
      else if (deviceId.startsWith('minihub:')) await setMiniHubLiveCoolingMode(MINIHUB_LIVE_MODE_SOFTWARE);
      else if (deviceId.startsWith('qseries:')) await setQSeriesControlMode(QSERIES_MODE_SOFTWARE);
      setHubModes(prev => ({ ...prev, [deviceId]: 'software' }));
    }
    await exitOffToCustomIfNeeded();

    const next = { ...fanStates };
    const takingOver: string[] = [];
    for (const id of ids) {
      if (!(fanStates[id]?.softwareControl ?? false)) takingOver.push(id);
      next[id] = { ...next[id], softwareControl: true, curveId };
    }
    setFanStates(next);
    // Seed a duty only for fans that were not already software-driven, same as
    // the single-fan path did.
    for (const id of takingOver) await setFanSpeed(id, 50);
    await pushCurves(curves, next);
    if (takingOver.length > 0) {
      const fans = await fetchFanChannels();
      if (fans?.channels) setChannels(fans.channels);
    }
  }, [channels, curves, exitOffToCustomIfNeeded, fanStates, hubModes, pushCurves, pushHistory]);

  const applyFanMode = useCallback((fanId: string, value: string) => {
    const ids = selectedFanIds.has(fanId) ? [...selectedFanIds] : [fanId];
    // Curve and manual assignments go through the batched writer; the hub
    // hand-off values stay per-fan, since each one is its own device call.
    if (ids.length > 1 && value !== 'bios' && value !== 'fw') {
      void assignCurveToFans(ids, value === 'manual' ? null : value);
      return;
    }
    for (const id of ids) void setFanMode(id, value);
  }, [assignCurveToFans, selectedFanIds, setFanMode]);

  // Clicking a curve always opens it in the editor. With fans selected it also
  // assigns it to them, routed through setFanMode so a curve pick from the
  // buttons behaves exactly like picking it in a card's mode dropdown (hub
  // hand-off, BIOS release and all).
  const handleCurveSelect = useCallback((curveId: string) => {
    setSelectedCurveId(curveId);
    if (selectedFanIds.size === 0) return;
    void assignCurveToFans([...selectedFanIds], curveId);
  }, [assignCurveToFans, selectedFanIds, setSelectedCurveId]);

  // Create a curve and bind it to the fan in one shot so pushCurves sees both
  // the new curve AND the fan's assignment in the same write. Triggered from
  // the fan-card mode dropdown's "+ Create curve" entry, which is only
  // reachable for already-connected fans.
  const createCurveAndAssign = useCallback(async (fanId: string) => {
    if (curves.length >= MAX_CURVES) return;
    await exitOffToCustomIfNeeded();
    const id = `curve-${Date.now()}`;
    const c = newCurve(id);
    c.sourceId = defaultCurveSourceId(sources, cpuTemp?.id);
    const nextCurves = [...curves, c];
    const wasSw = fanStates[fanId]?.softwareControl ?? false;
    const nextStates = { ...fanStates, [fanId]: { softwareControl: true, curveId: id } };
    setCurves(nextCurves);
    setFanStates(nextStates);
    setSelectedCurveId(id);
    if (!wasSw) await setFanSpeed(fanId, 50);
    pushCurves(nextCurves, nextStates);
    if (!wasSw) {
      const fans = await fetchFanChannels();
      if (fans?.channels) setChannels(fans.channels);
    }
  }, [cpuTemp?.id, curves, exitOffToCustomIfNeeded, fanStates, pushCurves, setSelectedCurveId, sources]);

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
    // Move the hero card off the deleted curve immediately; the maintenance
    // effect below also catches this, but this avoids a one-frame gap.
    if (selectedCurveId === id) setSelectedCurveId(next[0]?.id ?? null);
    await Promise.all(orphanedFanIds.map(fanId => releaseFanAuto(fanId)));
    await pushCurves(next, nextStates);
    if (orphanedFanIds.length > 0) {
      const fans = await fetchFanChannels();
      if (fans?.channels) setChannels(fans.channels);
    }
  }, [curves, fanStates, pushCurves, selectedCurveId, setSelectedCurveId]);

  const saveCurveAndPush = useCallback((updated: CurveDef) => {
    // One entry per drag: CurveEditor commits on pointer-up (onChange), while
    // the continuous in-drag stream goes to onPreview and never lands here.
    pushHistory();
    // Any edit to a preset curve diverges it from defaults; flip the dirty
    // flag optimistically so the Reset button enables immediately. The echoed
    // `cooling` refresh is suppressed below (so the edit isn't clobbered
    // mid-gesture), which means the server's authoritative isDefault wouldn't
    // otherwise reach the UI until some later refresh. The server recomputes
    // isDefault on the next fetch and agrees (the curve IS edited).
    const edited = updated.preset ? { ...updated, isDefault: false } : updated;
    const next = curves.map(c => c.id === edited.id ? edited : c);
    setCurves(next);
    // Suppress the echoed `cooling` refresh so a rapid edit (e.g. dragging a
    // multipoint) isn't clobbered mid-gesture by our own save bouncing back.
    curveEditLockUntilRef.current = Date.now() + 2000;
    pushCurves(next, fanStates);
  }, [curves, fanStates, pushCurves, pushHistory]);

  const runCalibration = useCallback(async () => {
    setCalConfirmOpen(false);
    setCalibrationResults(null);
    setCalStarting(true); // lock the rail immediately; the server flag takes over
    const r = await startCalibration([]);
    if (!r || r.error) setCalStarting(false);
  }, []);

  const dismissResults = useCallback(() => setCalibrationResults(null), []);

  // Keep the hero-card selection valid: default to the first curve and
  // re-point if the selected curve disappears (deleted, profile switch,
  // cap purge).
  useEffect(() => {
    if (curves.length === 0) {
      if (selectedCurveId !== null) setSelectedCurveId(null);
      return;
    }
    if (!selectedCurveId || !curves.some(c => c.id === selectedCurveId)) {
      setSelectedCurveId(curves[0].id);
    }
  }, [curves, selectedCurveId, setSelectedCurveId]);

  // Fall back to the first curve so the hero card paints immediately even
  // before the maintenance effect commits a selection (no one-frame "no
  // curves" flash on a cached revisit).
  const selectedCurve = useMemo(
    () => curves.find(c => c.id === selectedCurveId) ?? curves[0] ?? null,
    [curves, selectedCurveId],
  );

  const [importDialogOpen, setImportDialogOpen] = useState(false);
  // Cooling offers only the apps that carry a cooling setup; Nexus 2's import
  // is panel personalization, so it belongs to the Settings entry, not here.
  const importSources = useMemo(() => availableImportSources(platform, ['fancontrol']), [platform]);

  // Fans a Sync curve may follow: everything except the fans this curve itself
  // drives, so it can never end up chasing its own output.
  // Only ever clears: offsets arrive with a FanControl import, and the card is
  // where the user finds out one exists.
  const handleClearOffset = useCallback(async (id: string) => {
    if (!serviceOnline) return;
    await setFanOffset(id, 0);
    setChannels(prev => prev.map(c => (c.id === id ? { ...c, offset: 0 } : c)));
  }, [serviceOnline]);

  // Fans the selected curve drives: a Sync curve may not follow its own output,
  // so the picker greys these rather than hiding them.
  const syncExcludedIds = useMemo(
    () => channels.filter(c => fanStates[c.id]?.curveId === selectedCurve?.id).map(c => c.id),
    [channels, fanStates, selectedCurve],
  );

  // ── Fan card reordering (drag/drop, grip-gated, persisted per profile) ────
  const { settings: uiSettings, update: updateUiSettings } = useUiSettings();
  const savedFanOrder = uiSettings.fanChannelOrder;
  const [fanOrder, setFanOrder] = useState<string[]>([]);
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
    // the saved fanOrder - if a fan recovers it returns to its prior slot.
    const live: FanChannel[] = [];
    const dead: FanChannel[] = [];
    for (const ch of base) (isFanDisconnected(ch) ? dead : live).push(ch);
    return dead.length === 0 ? base : [...live, ...dead];
  }, [channels, fanOrder]);

  // Only fans Nexus can actually drive carry a checkbox, so only they can be
  // bulk-selected. Must match FanCard's own state-glyph rule.
  const selectableFanIds = useMemo(
    () => orderedChannels
      .filter(c => !isFanDisconnected(c) && !(c.readOnly ?? false) && c.classification !== 'Fixed'
        // Nexus Control off joined FanCard's undrivable rule, so it has to join
        // this one too: select-all would otherwise put a card in the selection
        // that refuses its own click, leaving no way to take it back out.
        && c.controlled !== false)
      .map(c => c.id),
    [orderedChannels],
  );
  const allFansSelected = selectableFanIds.length > 0
    && selectableFanIds.every(id => selectedFanIds.has(id));
  const selectedFanLabel = selectedFanIds.size === 0
    ? t('lighting.pane.selectedNone')
    : t(pluralKey('lighting.pane.selectedCount', language, selectedFanIds.size), { count: selectedFanIds.size });



  // A restored selection can name fans that are gone (hub unplugged between
  // visits). Drop those once channels have loaded, or bulk actions target ids
  // no card can show.
  useEffect(() => {
    if (channels.length === 0) return;
    const present = new Set(channels.map(c => c.id));
    setSelectedFanIds(prev => {
      if ([...prev].every(id => present.has(id))) return prev;
      return new Set([...prev].filter(id => present.has(id)));
    });
  }, [channels, setSelectedFanIds]);

  // Number of fans bound to each curve, shown under its selector button.
  // Excludes hardware-unresponsive (disconnected) fans - they sit in the
  // Disconnected group and can't be driven, so they don't count as "in use".
  const curveFanCounts = useMemo(() => {
    const disconnected = new Set(
      channels.filter(isFanDisconnected).map(c => c.id),
    );
    const m = new Map<string, number>();
    for (const [fanId, fs] of Object.entries(fanStates)) {
      if (fs.curveId && !disconnected.has(fanId)) m.set(fs.curveId, (m.get(fs.curveId) ?? 0) + 1);
    }
    return m;
  }, [fanStates, channels]);

  // Selecting a curve highlights every fan bound to it. A fan is bound when
  // its fanState.curveId matches.
  const highlightedFanIds = useMemo(() => {
    const s = new Set<string>();
    if (!effectiveCurveId) return s;
    for (const [fanId, st] of Object.entries(fanStates)) {
      if (st.curveId === effectiveCurveId) s.add(fanId);
    }
    return s;
  }, [effectiveCurveId, fanStates]);

  const modeTabs = COOLING_MODES.map(p => ({
    key: p.key,
    // Silent/Balanced/Turbo apply to every fan, so the tab reads "All <preset>".
    label: p.key === 'silent' || p.key === 'balanced' || p.key === 'turbo'
      ? `${t('cooling.mode.allPrefix')} ${t(p.i18nKey)}`
      : t(p.i18nKey),
    icon: <p.Icon size={14} />,
  }));

  const offStatusCard = activeMode === 'off' ? (
    <div className={styles.offStatus}
      role="status"
      aria-label={t('cooling.mode.off.banner')}>
      <Power size={13} aria-hidden />
      <span className={styles.offStatusLabel}>{t('cooling.mode.off.banner')}</span>
    </div>
  ) : null;

  if (!serviceOnline) {
    return (
      <div className={styles.cooling}>
        {!simpleDashboard && (
          <ViewHeader
            title={t('cooling.title')}
            tabs={modeTabs}
            activeTab={activeMode ?? undefined}
            onTabChange={k => handleModeChange(k)}
            tabsDisabled
          />
        )}
        <ServiceRequired state={connectionState} skeleton={<CoolingSkeleton />} />
      </div>
    );
  }

  // Simple mode: large preset tiles plus the advanced-mode path. Custom is
  // advanced-only (it means editing curves), so an active custom preset shows
  // as a hint line instead of a fifth tile.
  if (simpleDashboard) {
    return (
      <div className={styles.cooling}>
        <div className={`${styles.simpleBody} pageBodyFill`}>
          {/* Same summary+claim pair as the simple lighting page: one line
              carrying both counts, and the action only while it has something
              to resolve. */}
          <DeviceCountSummary
            detected={t(pluralKey('cooling.simple.controlledOf', language, channels.length), {
              controlled: controlledFanCount,
              total: channels.length,
            })}
            action={controlledFanCount < channels.length ? (
              <Button size="sm" pill onClick={() => { void claimAllFans(); }}>
                {t('cooling.simple.controlAll')}
              </Button>
            ) : undefined}
          />
          {/* Off is a state rather than a speed, so it leads as a wide row
              instead of competing with the three speed tiles. */}
          <IconLabelButton
            className={styles.simpleOffTile}
            icon={<Power size={22} />}
            label={t('cooling.mode.off')}
            description={t('cooling.mode.off.banner')}
            active={activeMode === 'off'}
            onPress={() => { void handleModeChange('off'); }}
          />
          <div className={styles.simplePresets} role="group" aria-label={t('cooling.title')}>
            {COOLING_MODES.filter(p => p.key !== 'custom' && p.key !== 'off').map(p => (
              <IconLabelButton
                key={p.key}
                className={styles.simplePresetTile}
                icon={<p.Icon size={48} />}
                label={t(p.i18nKey)}
                description={t(`cooling.mode.${p.key}.desc`)}
                active={activeMode === p.key}
                onPress={() => { void handleModeChange(p.key); }}
              />
            ))}
          </div>
          {activeMode === 'custom' && (
            <SimpleModeNotice message={t('cooling.simple.customActive')} />
          )}
          <div className={styles.simpleFooter}>
            <AdvancedModeCta
              label={t('cooling.simple.advancedCta')}
              onPress={() => updateUi({ coolingDashboardMode: 'advanced' })}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.cooling}>
      {/* Fan rail on the left, mode tabs + curve to its right, mirroring the
          lighting page. The rail header shares grid row 1 with the tabs so both
          columns start at the same line. Capped at --page-max (pageBody) so the
          page matches every other view's width. */}
      <div className={`${styles.body} pageBody`}>
        {/* Mode tabs and saved presets share one flex row: the presets keep
            their column width until the tab bar needs the space. */}
        <div className={styles.topRow}>
          <div className={styles.tabsCell}>
            <ViewHeader
              title={t('cooling.title')}
              tabs={modeTabs}
              activeTab={activeMode ?? undefined}
              onTabChange={(k, origin) => {
                // Status-change bloom only on an actual mode switch, from the pressed tab.
                if (origin && isCoolingModeKey(k) && k !== activeMode) emitRadialBloomFromElement(origin, k === 'off');
                void handleModeChange(k);
              }}
              tabActions={(
                <PresetToolbar
                  rail
                  presets={presets}
                  activeId={activePresetId}
                  presetCount={presets.length}
                  showHistory
                  canUndo={canUndo}
                  canRedo={canRedo}
                  onUndo={() => { void handleUndo(); }}
                  onRedo={() => { void handleRedo(); }}
                  translationPrefix="cooling.presets"
                  onImport={importSources.length > 0 ? () => setImportDialogOpen(true) : undefined}
                  importLabelKey="cooling.presets.importOption"
                  importDisabled={calibrating}
                  onLoad={id => { void handlePresetLoadWithHistory(id); }}
                  onCreate={handlePresetCreate}
                  onRename={handlePresetRename}
                  onDelete={handlePresetDelete}
                />
              )}
            />
          </div>
        </div>
        <div className={`${styles.paneHeader} ${styles.headerLeft}`}>
          <div className={styles.paneTitleGroup}>
            <span className={styles.paneTitle}>{t('cooling.label.fan')}</span>
            <Badge label={String(channels.length)} compact color="var(--text-dim)" />
          </div>
          <div className={styles.fanHeaderActions}>
            <HoverTooltip
              body={calibrating ? t('cooling.calibrate.running').split('-')[0].trim() : t('cooling.calibrate.button')}
              side="bottom"
            >
              <Button
                tone="ghost"
                size="sm"
                icon={<Gauge />}
                aria-label={t('cooling.calibrate.button')}
                disabled={calibrating}
                onClick={() => setCalConfirmOpen(true)}
              />
            </HoverTooltip>
            {selectableFanIds.length > 0 && (
            <>
              <span className={styles.headerSep} aria-hidden />
              {/* Icon-only, matching the lighting rail: too narrow for labels. */}
              <HoverTooltip body={t('lighting.ledMap.selectAll')} side="bottom">
                <Button
                  tone="ghost"
                  size="sm"
                  icon={<CheckCheck />}
                  aria-label={t('lighting.ledMap.selectAll')}
                  disabled={allFansSelected}
                  onClick={() => setSelectedFanIds(new Set(selectableFanIds))}
                />
              </HoverTooltip>
              <HoverTooltip body={t('lightingOnboarding.selectNone')} side="bottom">
                <Button
                  tone="ghost"
                  size="sm"
                  icon={<Ban />}
                  aria-label={t('lightingOnboarding.selectNone')}
                  disabled={selectedFanIds.size === 0}
                  onClick={() => setSelectedFanIds(new Set())}
                />
              </HoverTooltip>
            </>
            )}
          </div>
        </div>
        <div className={`${styles.paneHeader} ${styles.headerRight}`}>
          <span className={styles.paneTitle}>{t('cooling.label.curves')}</span>
          {/* What a curve press would apply to, in the lighting page's wording. */}
          <Badge label={selectedFanLabel} compact uppercase color="var(--text-dim)" />
        </div>
        <aside className={styles.fanSidebar}>
          {calibrationResults && !calibrating && (
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

          <div className={styles.fanListWrap}>
            {calibrating && (
              <div className={styles.calibrationOverlay} role="status" aria-live="polite">
                <div className={styles.calibrationOverlayInner}>
                  <div className={styles.calibrationSpinner} />
                  <div className={styles.calibrationOverlayTitle}>
                    {t('cooling.calibrate.running').split('-')[0].trim()}
                  </div>
                  <div className={styles.calibrationOverlayHint}>
                    {t('cooling.calibrate.locked')}
                  </div>
                </div>
              </div>
            )}
            <div
              /* `inert` locks the subtree from every input path (mouse,
                 keyboard, AT focus). React 19 treats it as a real boolean
                 prop. */
              inert={calibrating || undefined}
              aria-hidden={calibrating || undefined}
              className={`${styles.fanList} ${calibrating ? styles.fanGridDisabled : ''}`}
            >
            {offStatusCard}
            {(() => {
              const disconnected = orderedChannels.filter(isFanDisconnected);
              const live = orderedChannels.filter(c => !isFanDisconnected(c));
              const groups = new Map<string | null, FanChannel[]>();
              for (const ch of live) {
                const key = ch.deviceId || null;
                if (!groups.has(key)) groups.set(key, []);
                groups.get(key)!.push(ch);
              }
              const disconnectedIds = disconnected.map(c => c.id);
              const mobo = groups.get(null) ?? [];
              const moboIds = mobo.map(c => c.id);
              const deviceKeys = Array.from(groups.keys()).filter((k): k is string => !!k);

              const renderFanCard = (ch: FanChannel, drag: SortableRowArgs) => (
                <FanCard key={ch.id} channel={ch} state={fanStates[ch.id]} curves={curves}
                  compact
                  selected={selectedFanIds.has(ch.id)}
                  onSelect={additive => selectFan(ch.id, additive)}
                  calibrating={calibrating}
                  canCreateCurve={curves.length < MAX_CURVES}
                  highlighted={highlightedFanIds.has(ch.id) && !isFanDisconnected(ch)}
                  hubMode={ch.deviceId ? hubModes[ch.deviceId] : undefined}
                  hubSupportsFirmware={ch.deviceId?.startsWith('np50:') || ch.deviceId?.startsWith('qseries:')}
                  hubSupportsBios={!ch.deviceId?.startsWith('np50:') && !ch.deviceId?.startsWith('corsair:')}
                  onSetMode={v => applyFanMode(ch.id, v)}
                  onCreateCurve={() => createCurveAndAssign(ch.id)}
                  onRename={handleRename}
                  onSpeedChange={handleSpeedChange}
                  onToggleLock={handleToggleLock}
                  onToggleControlled={handleSetFanControlled}
                  onSelectOnly={() => setSelectedFanIds(new Set([ch.id]))}
                  bulk={bulkForFan(ch)}
                  onSetRole={handleSetRole}
                  onClearOffset={handleClearOffset}
                  drag={drag}
                />
              );

              return (
                <>
                  {moboIds.length > 0 && (
                    <SortableList
                      ids={moboIds}
                      onReorder={(newIds) => {
                        const nonMobo = fanOrder.filter(id => !moboIds.includes(id));
                        const next = [...newIds, ...nonMobo];
                        setFanOrder(next);
                        if (serviceOnline) updateUiSettings({ fanChannelOrder: next });
                      }}
                      renderRow={(id, a) => {
                        const ch = channels.find(c => c.id === id);
                        if (!ch) return null;
                        return renderFanCard(ch, a);
                      }}
                    />
                  )}
                  {deviceKeys.length > 0 && (
                    <SortableList
                      ids={deviceKeys}
                      onReorder={(newGroupKeys) => {
                        const next: string[] = [...moboIds];
                        for (const gKey of newGroupKeys) {
                          const members = groups.get(gKey) ?? [];
                          const memberIds = members.map(c => c.id);
                          const ordered = fanOrder.filter(id => memberIds.includes(id));
                          next.push(...(ordered.length > 0 ? ordered : memberIds));
                        }
                        next.push(...disconnectedIds);
                        setFanOrder(next);
                        if (serviceOnline) updateUiSettings({ fanChannelOrder: next });
                      }}
                      renderRow={(key, a) => {
                        const list = groups.get(key)!;
                        const memberIds = list.map(c => c.id);
                        const deviceName = fanDeviceGroupName(key, list[0]?.deviceName);
                        return (
                          <CollapsibleSection
                            key={key + '-hdr'}
                            compact
                            title={deviceName}
                            ariaLabel={deviceName}
                            open={!isFanGroupCollapsed(key)}
                            onToggle={() => toggleFanGroup(key)}
                            drag={a}
                            right={<span className={styles.fanGroupCount}>{list.length}</span>}
                          >
                            <div className={styles.fanGroupChildren}>
                              <SortableList
                                ids={memberIds}
                                onReorder={(newIds) => {
                                  const firstIdx = fanOrder.findIndex(id => memberIds.includes(id));
                                  const without = fanOrder.filter(id => !memberIds.includes(id));
                                  const next = [
                                    ...without.slice(0, firstIdx < 0 ? without.length : firstIdx),
                                    ...newIds,
                                    ...without.slice(firstIdx < 0 ? without.length : firstIdx),
                                  ];
                                  setFanOrder(next);
                                  if (serviceOnline) updateUiSettings({ fanChannelOrder: next });
                                }}
                                renderRow={(fanId, fa) => {
                                  const ch = channels.find(c => c.id === fanId);
                                  if (!ch) return null;
                                  return renderFanCard(ch, fa);
                                }}
                              />
                            </div>
                          </CollapsibleSection>
                        );
                      }}
                    />
                  )}
                  {disconnected.length > 0 && (
                    <CollapsibleSection key="disconnected-hdr" compact
                      title={t('cooling.fan.disconnected')} ariaLabel={t('cooling.fan.disconnected')}
                      open={!isFanGroupCollapsed('disconnected')} onToggle={() => toggleFanGroup('disconnected')}
                      right={<span className={styles.fanGroupCount}>{disconnected.length}</span>}>
                      <div className={styles.fanGroupChildren}>{disconnected.map(ch => (
                        <FanCard key={ch.id} channel={ch} state={fanStates[ch.id]} curves={curves}
                          compact
                          calibrating={calibrating}
                          canCreateCurve={curves.length < MAX_CURVES}
                          highlighted={false}
                          hubMode={ch.deviceId ? hubModes[ch.deviceId] : undefined}
                          hubSupportsFirmware={ch.deviceId?.startsWith('np50:') || ch.deviceId?.startsWith('qseries:')}
                          hubSupportsBios={!ch.deviceId?.startsWith('np50:') && !ch.deviceId?.startsWith('corsair:')}
                          onSetMode={v => applyFanMode(ch.id, v)}
                          onCreateCurve={() => createCurveAndAssign(ch.id)}
                          onRename={handleRename}
                          onSpeedChange={handleSpeedChange}
                          onToggleLock={handleToggleLock}
                          onToggleControlled={handleSetFanControlled}
                          onSelectOnly={() => setSelectedFanIds(new Set([ch.id]))}
                          bulk={bulkForFan(ch)}
                          onSetRole={handleSetRole}
                  onClearOffset={handleClearOffset}
                        />
                      ))}</div>
                    </CollapsibleSection>
                  )}
                </>
              );
            })()}
            </div>
          </div>
        </aside>
        <div className={styles.curveCol}>
          {/* Curve buttons are their own section under the "Curve" title; the
              editor below is a separate section with its own heading. With
              fans selected, the highlight follows what THEY are wearing, and
              goes away entirely when their curves disagree. */}
          <div className={styles.curvePickerSection}>
            <CurveSelector
              curves={curves}
              selectedCurveId={effectiveCurveId}
              curveFanCounts={curveFanCounts}
              onSelect={handleCurveSelect}
              onAdd={() => { addCurve(); }}
            />
          </div>
          <div className={styles.curveEditorHeader}>
            <span className={styles.paneTitle}>{t('cooling.label.curveEditor')}</span>
          </div>
          {selectedCurve ? (
            <CurveCard
              key={selectedCurve.id}
              curve={selectedCurve}
              allCurves={curves}
              sources={sources}
              channels={channels}
              syncExcludedIds={syncExcludedIds}
              onChange={saveCurveAndPush}
              onDelete={() => deleteCurve(selectedCurve.id)}
              onResetPreset={selectedCurve.preset ? () => handleResetPresetCurve(selectedCurve.preset!) : undefined}
            />
          ) : (
            <p className={styles.curvesEmpty}>{t('cooling.curves.empty')}</p>
          )}
        </div>

      </div>
      <ImportDialog
        open={importDialogOpen}
        onClose={() => setImportDialogOpen(false)}
        title={t('coolingImport.title')}
        sources={importSources}
        onImported={() => { void refreshCoolingConfig(); }}
      />
      <ConfirmModal
        open={calConfirmOpen && !calibrating}
        destructive={false}
        title={t('cooling.calibrate.confirmTitle')}
        message={t('cooling.calibrate.confirmMessage')}
        note={t('cooling.calibrate.locked')}
        confirmLabel={t('cooling.calibrate.confirmStart')}
        onCancel={() => setCalConfirmOpen(false)}
        onConfirm={runCalibration}
      />
    </div>
  );
}
