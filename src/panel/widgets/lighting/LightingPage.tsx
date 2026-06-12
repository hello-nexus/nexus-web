import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import {
  startAnimate, startScreenMirror, stopLighting,
  fetchLightingDevices, fetchAnimateSettings, saveAnimateTemplates,
  fetchMusicReactive, setMusicReactive, setLightingDevicePower,
  fetchScreenEffect, setScreenEffect, fetchMediaEffect, setMediaEffect, fetchLedMap,
  fetchCurrentSync, fetchAvailableMappings,
  type LightingDevice, type LedMapEntry, type PostProcessSettings,
} from '../../../api/lighting';
import { playCurrentOrFirstMedia } from '../../../api/mediaLibrary';
import { useLightingFrames } from '../../../hooks/useLightingFrames';
import { useLightingSync } from '../../../hooks/useLightingSync';
import { useTopicCallback } from '../../../hooks/useMultiplexSocket';
import type { ServiceState } from '../../../hooks/useServiceState';
import type { ConnectionState } from '../../../hooks/useServiceStatus';
import { useTranslation } from '../../../lib/i18n';
import { publishControlSync, subscribeControlSync } from '../../../lib/controlSync';
import { LIGHTING_MODE_ICONS } from '../../../lib/lightingModeIcons';
import { HoverTooltip } from '../../../components/common/HoverTooltip/HoverTooltip';
import { ViewHeader } from '../../../components/common/ViewHeader/ViewHeader';
import { ServiceRequired } from '../../../components/views/ServiceRequired';
import { LightingSkeleton } from '../../../components/views/PageSkeleton/PageSkeleton';
import { DeviceCanvas } from '../../../components/common/DeviceCanvas/DeviceCanvas';
import { SupportedDevicesModal } from '../../../components/common/SupportedDevicesModal/SupportedDevicesModal';
import { useUsbDevices } from '../../../hooks/useUsbDevices';
import {
  EFFECTS, MODES, defaultStateFor,
  type EffectState, type EffectTemplateBundle, type LightingMode,
} from '../../../types/lighting';
import { buildAllDefaultTemplates, mergeTemplates, slotMatchesDefault } from '../../../types/lightingTemplates';
import { AnimateGrid } from './page/AnimateGrid';
import { FullscreenShader } from './page/FullscreenShader';
import { ModeControls } from './page/ModeControls';
import { DevicePanel } from './page/DevicePanel';
import { LedMapEditor } from './page/LedMapEditor';
import { RescanDevicesButton } from './page/RescanDevicesButton';
import { RgbStatusCard } from './page/RgbStatusCard';
import { LightingSettingsModal } from './page/LightingSettingsModal';
import { RightPaneTabs, type RightPaneTab } from './page/RightPaneTabs';
import { EffectTab, type PostProcessState } from './page/EffectTab';
import { useThrottle } from '../../../hooks/cadence';
import { useAudioState } from '../../../hooks/useAudioState';
import styles from './LightingPage.module.scss';

/**
 * Lighting tab composer. Owns mode routing, per-effect animate state, device
 * canvas, and right-pane tab lifecycle. Individual renderers live in
 * `./lighting/*`.
 */

interface LightingViewProps {
  serviceOnline: boolean;
  serviceState: ServiceState;
  connectionState?: ConnectionState;
  activeProfileId?: string;
}

const DEFAULT_POST_PROCESS: PostProcessState = { hue: 0, colorize: 0, saturation: 1, contrast: 1 };

const RIGHT_PANE_TAB_KEY = 'lighting.rightPaneTab';
function loadRightPaneTab(): RightPaneTab {
  try {
    const v = localStorage.getItem(RIGHT_PANE_TAB_KEY);
    if (v === 'devices' || v === 'effect') return v;
  } catch { /* localStorage unavailable; fall through to default */ }
  return 'effect';
}

const DEVICE_ORDER_KEY = 'lighting.deviceOrder';
function loadDeviceOrder(): string[] {
  try {
    const raw = localStorage.getItem(DEVICE_ORDER_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every(v => typeof v === 'string')) return parsed;
  } catch { /* localStorage / JSON parse failed; fall through to empty */ }
  return [];
}

export function LightingPage({ serviceOnline, serviceState, connectionState, activeProfileId }: LightingViewProps) {
  const { t } = useTranslation();
  const { mode, setMode, rawSync, setRawSync, synced } = useLightingSync(serviceOnline, activeProfileId);
  const frames = useLightingFrames();
  // Read RGB running/scanning off useServiceState (already subscribed
  // to the lighting topic for the sidebar pip) so a topic push doesn't
  // trigger a duplicate GET. `running` is the openrgb-headless
  // subprocess state (LightingStatus.rgbRunning), not the effect-engine
  // `running` field; the badge + rescan gate want the subprocess.
  const rgb = {
    running: serviceState.lighting?.rgbRunning ?? false,
    scanning: serviceState.lighting?.scanning ?? false,
  };
  const [devices, setDevices] = useState<LightingDevice[]>([]);
  const deviceDraggingRef = useRef(false);
  const handleDragActiveChange = useCallback((active: boolean) => { deviceDraggingRef.current = active; }, []);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Multi-selection on the canvas + right-side device panel. The set drives
  // visual highlighting on both surfaces; `primaryDeviceId` is the single
  // device used for LED-dot rendering on the canvas and for the LED-map
  // fetch effect below (only one device's positions are visualised at a
  // time, even when several are selected for group drag).
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<Set<string>>(() => new Set());
  const [primaryDeviceId, setPrimaryDeviceId] = useState<string | null>(null);
  const handleSelectDevice = useCallback((id: string | null) => {
    setSelectedDeviceIds(id ? new Set([id]) : new Set());
    setPrimaryDeviceId(id);
  }, []);
  const handleSetSelection = useCallback((ids: Set<string>, primary: string | null) => {
    setSelectedDeviceIds(ids);
    setPrimaryDeviceId(primary);
  }, []);
  const [catalogOpen, setCatalogOpen] = useState(false);

  const [activeEffect, setActiveEffect] = useState<string>('');
  const [effectTemplates, setEffectTemplates] = useState<Record<string, EffectTemplateBundle>>({});
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  // Canvas hides the frame for any device with LEDs off, and hides all
  // frames while the Effect tab is showing (frames are a Devices-tab
  // concern). Right-pane tab: 'effect' = post-process controls for
  // animate / media / screen; 'devices' = rescan + zone cards.
  // Persisted across remounts.
  const [activeRightTab, setActiveRightTab] = useState<RightPaneTab>(loadRightPaneTab);
  useEffect(() => {
    try { localStorage.setItem(RIGHT_PANE_TAB_KEY, activeRightTab); } catch { /* persist best-effort */ }
  }, [activeRightTab]);
  const hiddenFrameIds = useMemo(() => {
    const set = new Set<string>();
    if (activeRightTab === 'effect') {
      for (const d of devices) set.add(d.id);
      return set;
    }
    for (const d of devices) if (!d.ledsOn) set.add(d.id);
    return set;
  }, [devices, activeRightTab]);

  // LED map editor - lifted here so both the canvas settings button and the
  // ZoneCard settings button can open it. The community badge deep-links to
  // the editor's Community tab via editorInitialTab.
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
  const [editorInitialTab, setEditorInitialTab] = useState<'editor' | 'community'>('editor');
  const editingDevice = editingDeviceId ? devices.find(d => d.id === editingDeviceId) ?? null : null;
  const handleOpenSettings = useCallback((id: string) => {
    setEditorInitialTab('editor');
    setEditingDeviceId(id);
  }, []);
  const handleOpenCommunity = useCallback((id: string) => {
    setEditorInitialTab('community');
    setEditingDeviceId(id);
  }, []);

  // Cached community-layout counts for the device-card badges. Cache-only on
  // the service side, so a single fetch per page mount is enough.
  const [mappingCounts, setMappingCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!serviceOnline) return;
    let cancelled = false;
    fetchAvailableMappings().then(data => {
      if (!cancelled && data && !data.error) setMappingCounts(data.counts ?? {});
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [serviceOnline]);

  // LED positions for the selected device - fetched when a device is selected
  // so the canvas can show small dots indicating where each active LED is.
  const [selectedDeviceLeds, setSelectedDeviceLeds] = useState<LedMapEntry[] | null>(null);
  useEffect(() => {
    if (!primaryDeviceId) { setSelectedDeviceLeds(null); return; }
    setSelectedDeviceLeds(null);
    let cancelled = false;
    fetchLedMap(primaryDeviceId).then(data => {
      if (!cancelled && data) setSelectedDeviceLeds(data.leds);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [primaryDeviceId, editingDeviceId, activeProfileId]);

  const [musicReactive, setMusicReactiveState] = useState(false);
  const audioRef = useAudioState(musicReactive && mode === 'animate');

  const [effectPulseKey, setEffectPulseKey] = useState(0);

  // Screen + Media share an identical post-process shape (hue, colorize,
  // saturation, contrast). Each mode has its own persisted snapshot; the
  // tab writes to whichever is active.
  const [screenPP, setScreenPP] = useState<PostProcessState>(DEFAULT_POST_PROCESS);
  const [mediaPP, setMediaPP] = useState<PostProcessState>(DEFAULT_POST_PROCESS);
  const postProcess = mode === 'screen' ? screenPP : mediaPP;

  const stateFor = useCallback((key: string): EffectState => {
    const bundle = effectTemplates[key];
    if (!bundle || !bundle.slots || bundle.slots.length === 0) return defaultStateFor(key);
    const idx = Math.min(Math.max(bundle.selected, 0), bundle.slots.length - 1);
    return bundle.slots[idx];
  }, [effectTemplates]);
  const currentState: EffectState | null = useMemo(
    () => activeEffect ? stateFor(activeEffect) : null,
    [activeEffect, stateFor],
  );
  const currentSelected: number = useMemo(
    () => activeEffect ? (effectTemplates[activeEffect]?.selected ?? 0) : 0,
    [activeEffect, effectTemplates],
  );
  const canReset: boolean = useMemo(
    () => !!(activeEffect && currentState
      && !slotMatchesDefault(activeEffect, currentSelected, currentState)),
    [activeEffect, currentState, currentSelected],
  );
  const throttleAnimate = useThrottle();
  const throttlePostProcess = useThrottle();
  const localAnimateEditUntilRef = useRef(0);
  const activeProfileKey = activeProfileId ?? 'default';
  const activeProfileKeyRef = useRef(activeProfileKey);
  activeProfileKeyRef.current = activeProfileKey;
  const [loadedProfileLighting, setLoadedProfileLighting] = useState<{ profileKey: string; sync: string } | null>(null);

  const effectTemplatesRef = useRef(effectTemplates);
  effectTemplatesRef.current = effectTemplates;

  const hydrateAnimateSettings = useCallback((data: Awaited<ReturnType<typeof fetchAnimateSettings>>) => {
    if (!data) return;
    const merged: Record<string, EffectTemplateBundle> = buildAllDefaultTemplates();
    const savedTemplates = data.templates ?? {};
    for (const fx of EFFECTS) {
      merged[fx.key] = mergeTemplates(fx.key, savedTemplates[fx.key]);
    }
    if (!data.templates) {
      const legacy = data.states ?? {};
      for (const fx of EFFECTS) {
        const s = legacy[fx.key];
        if (!s) continue;
        const bundle = merged[fx.key];
        bundle.slots[0] = {
          ...bundle.slots[0],
          ...s,
          params: { ...bundle.slots[0].params, ...(s.params ?? {}) },
        };
        bundle.selected = 0;
      }
      saveAnimateTemplates(merged).catch(() => { /* best-effort */ });
    }
    setEffectTemplates(merged);
    if (EFFECTS.some(e => e.key === data.effect)) {
      setActiveEffect(data.effect);
    }
  }, []);

  const applyExternalEffectState = useCallback((effect: string, state?: EffectState, templateIndex?: number) => {
    if (!EFFECTS.some(e => e.key === effect)) return;
    setActiveEffect(effect);
    if (state === undefined && templateIndex === undefined) return;

    setEffectTemplates(prev => {
      const bundle = prev[effect] ?? mergeTemplates(effect, undefined);
      const selected = templateIndex === undefined
        ? bundle.selected
        : Math.min(Math.max(templateIndex, 0), bundle.slots.length - 1);
      const slots = bundle.slots.slice();
      if (state) {
        slots[selected] = {
          ...slots[selected],
          ...state,
          params: { ...slots[selected].params, ...(state.params ?? {}) },
        };
      }
      return {
        ...prev,
        [effect]: { ...bundle, selected, slots },
      };
    });
  }, []);

  useEffect(() => subscribeControlSync(event => {
    if (event.domain !== 'lighting') return;
    if (event.effect) {
      applyExternalEffectState(event.effect, event.effectState, event.templateIndex);
    }
  }), [applyExternalEffectState]);

  useEffect(() => {
    if (!serviceOnline) return;
    let cancelled = false;
    const profileKey = activeProfileKey;
    setLoadedProfileLighting(null);

    const safe = <T,>(promise: Promise<T | null>): Promise<T | null> =>
      promise.catch(() => null);

    Promise.all([
      safe(fetchCurrentSync()),
      safe(fetchAnimateSettings()),
      safe(fetchMusicReactive()),
      safe(fetchScreenEffect()),
      safe(fetchMediaEffect()),
    ]).then(([
      currentSync,
      animateSettings,
      musicSettings,
      screenEffect,
      mediaEffect,
    ]) => {
      if (cancelled) return;
      const sync = currentSync?.sync ?? 'none';
      setRawSync(sync);
      setMode(modeForSync(sync));

      if (animateSettings) {
        hydrateAnimateSettings(animateSettings);
      }
      if (musicSettings) {
        setMusicReactiveState(!!musicSettings.enabled);
      }
      if (screenEffect) {
        setScreenPP(normalizePP(screenEffect));
      }
      if (mediaEffect) {
        setMediaPP(normalizePP(mediaEffect));
      }
      setLoadedProfileLighting({ profileKey, sync });
    });

    return () => { cancelled = true; };
  }, [serviceOnline, activeProfileKey, setMode, setRawSync, hydrateAnimateSettings]);

  useEffect(() => {
    if (!serviceOnline || !rawSync) return;
    let cancelled = false;

    if (EFFECTS.some(e => e.key === rawSync)) {
      setActiveEffect(rawSync);
      fetchAnimateSettings().then(data => {
        if (cancelled || !data) return;
        hydrateAnimateSettings(data);
      });
      fetchMusicReactive().then(data => {
        if (!cancelled && data) setMusicReactiveState(!!data.enabled);
      });
    } else if (rawSync === 'screen') {
      fetchScreenEffect().then(data => {
        if (!cancelled && data) setScreenPP(normalizePP(data));
      });
    } else if (rawSync === 'gif' || rawSync.includes('media')) {
      fetchMediaEffect().then(data => {
        if (!cancelled && data) setMediaPP(normalizePP(data));
      });
    }

    return () => { cancelled = true; };
  }, [serviceOnline, rawSync, hydrateAnimateSettings]);

  // Animate-mode templates: same shape - one fetch on entry, multiplex push
  // for the rest. Local edits still ignore pushes for the
  // localAnimateEditUntilRef debounce window so the user's drag isn't fought.
  useEffect(() => {
    if (!serviceOnline || mode !== 'animate') return;
    let cancelled = false;
    fetchAnimateSettings().then(data => {
      if (cancelled || !data) return;
      hydrateAnimateSettings(data);
    });
    return () => { cancelled = true; };
  }, [serviceOnline, mode, hydrateAnimateSettings]);

  // Push-driven refresh: every /lighting/* mutation publishes a 'lighting'
  // frame on the multiplex hub. Each branch refetches the resource it owns.
  useTopicCallback('lighting', serviceOnline, () => {
    // refreshDevices is declared further down; this callback only fires after
    // mount once the closure binding is initialized, so the "declared later"
    // static check is safe to disable.
     
    void refreshDevices();
    if (mode === 'animate') {
      if (Date.now() < localAnimateEditUntilRef.current) return;
      fetchAnimateSettings().then(data => {
        if (!data) return;
        hydrateAnimateSettings(data);
      });
    }
  });

  const handleMusicReactiveToggle = useCallback(async () => {
    const next = !musicReactive;
    setMusicReactiveState(next);
    try {
      await setMusicReactive(next);
    } catch {
      setMusicReactiveState(!next);
    }
  }, [musicReactive]);

  const restartedProfileRef = useRef<string | null>(null);
  useEffect(() => {
    restartedProfileRef.current = null;
  }, [activeProfileKey]);

  useEffect(() => {
    if (!serviceOnline || loadedProfileLighting?.profileKey !== activeProfileKey) return;
    const key = activeProfileKey;
    const sync = loadedProfileLighting.sync;
    if (restartedProfileRef.current === key) return;
    if (!sync || sync === 'none') { return; }
    restartedProfileRef.current = key;
    (async () => {
      if (EFFECTS.some(e => e.key === sync)) {
        const state = stateFor(sync);
        await startAnimate(sync, state.speed, state.intensity, state.hue,
          state.colorize, state.saturation, state.contrast, state.params, false);
      } else if (sync === 'screen') {
        await startScreenMirror(screenPP.saturation, screenPP.contrast, '', screenPP.hue, screenPP.colorize);
      } else if (sync === 'media' || sync === 'gif') {
        await playCurrentOrFirstMedia();
      }
    })();
  }, [
    serviceOnline,
    activeProfileKey,
    loadedProfileLighting,
    stateFor,
    screenPP.saturation,
    screenPP.contrast,
    screenPP.hue,
    screenPP.colorize,
  ]);

  const applyAnimate = useCallback((effect: string, state: EffectState, persist: boolean) => {
    if (!effect) return;
    const expectedProfileKey = activeProfileKeyRef.current;
    throttleAnimate(() => {
      if (activeProfileKeyRef.current !== expectedProfileKey) return;
      startAnimate(
        effect, state.speed, state.intensity, state.hue, state.colorize,
        state.saturation, state.contrast, state.params, persist,
      ).catch(() => {});
    });
  }, [throttleAnimate]);

  const writeTemplates = useCallback((
    next: Record<string, EffectTemplateBundle>,
    runningEffect: string | null,
    persist: boolean,
  ) => {
    setEffectTemplates(next);
    if (runningEffect) {
      const bundle = next[runningEffect];
      if (bundle) {
        const idx = Math.min(Math.max(bundle.selected, 0), bundle.slots.length - 1);
        applyAnimate(runningEffect, bundle.slots[idx], persist);
      }
    }
    if (persist) {
      saveAnimateTemplates(next).catch(() => { /* best-effort; UI already updated */ });
    }
  }, [applyAnimate]);

  // Clicking an effect on the Devices tab pulses the Effect tab label
  // instead of switching away from the devices.
  const pulseEffectTab = useCallback(() => setEffectPulseKey(k => k + 1), []);

  const handleEffectSelect = useCallback((key: string) => {
    if (activeEffect !== key) {
      setActiveEffect(key);
      applyAnimate(key, stateFor(key), true);
    }
    publishControlSync({ domain: 'lighting', mode: 'animate', rawSync: key, effect: key });
    if (activeRightTab !== 'effect') pulseEffectTab();
  }, [activeEffect, activeRightTab, applyAnimate, pulseEffectTab, stateFor]);

  const handlePrevEffect = useCallback(() => {
    if (!EFFECTS.length) return;
    const raw = EFFECTS.findIndex(e => e.key === activeEffect);
    const idx = raw < 0 ? 0 : raw;
    handleEffectSelect(EFFECTS[(idx - 1 + EFFECTS.length) % EFFECTS.length].key);
  }, [activeEffect, handleEffectSelect]);

  const handleNextEffect = useCallback(() => {
    if (!EFFECTS.length) return;
    const raw = EFFECTS.findIndex(e => e.key === activeEffect);
    const idx = raw < 0 ? 0 : raw;
    handleEffectSelect(EFFECTS[(idx + 1) % EFFECTS.length].key);
  }, [activeEffect, handleEffectSelect]);

  const handleTemplateSelect = useCallback((idx: number) => {
    if (!activeEffect) return;
    const bundle = effectTemplates[activeEffect];
    if (!bundle) return;
    if (idx === bundle.selected) return;
    localAnimateEditUntilRef.current = Date.now() + 1500;
    const clamped = Math.min(Math.max(idx, 0), bundle.slots.length - 1);
    const nextBundle: EffectTemplateBundle = { ...bundle, selected: clamped };
    writeTemplates({ ...effectTemplates, [activeEffect]: nextBundle }, activeEffect, true);
    publishControlSync({
      domain: 'lighting',
      mode: 'animate',
      rawSync: activeEffect,
      effect: activeEffect,
      templateIndex: clamped,
      effectState: nextBundle.slots[clamped],
    });
  }, [activeEffect, effectTemplates, writeTemplates]);

  const handleStatePatch = useCallback((patch: Partial<EffectState>, commit = false) => {
    if (!activeEffect || !currentState) return;
    localAnimateEditUntilRef.current = Date.now() + 1500;
    const bundle = effectTemplates[activeEffect];
    if (!bundle) return;
    const idx = bundle.selected;
    const nextSlot: EffectState = { ...currentState, ...patch };
    const nextSlots = bundle.slots.slice();
    nextSlots[idx] = nextSlot;
    const nextBundle: EffectTemplateBundle = { ...bundle, slots: nextSlots };
    writeTemplates(
      { ...effectTemplates, [activeEffect]: nextBundle },
      activeEffect,
      commit,
    );
    publishControlSync({
      domain: 'lighting',
      mode: 'animate',
      rawSync: activeEffect,
      effect: activeEffect,
      templateIndex: idx,
      effectState: nextSlot,
    });
  }, [activeEffect, currentState, effectTemplates, writeTemplates]);

  const handleStateCommit = useCallback(() => {
    if (!activeEffect) return;
    const freshTemplates = effectTemplatesRef.current;
    const bundle = freshTemplates[activeEffect];
    if (!bundle) return;
    const idx = Math.min(Math.max(bundle.selected, 0), bundle.slots.length - 1);
    const latest = bundle.slots[idx];
    if (!latest) return;
    saveAnimateTemplates(freshTemplates).catch(() => { /* best-effort */ });
    applyAnimate(activeEffect, latest, true);
  }, [activeEffect, applyAnimate]);

  const handleStateReset = useCallback(() => {
    if (!activeEffect) return;
    const defaults = mergeTemplates(activeEffect, undefined);
    const bundle = effectTemplates[activeEffect];
    if (!bundle) return;
    const idx = bundle.selected;
    const nextSlots = bundle.slots.slice();
    nextSlots[idx] = defaults.slots[idx];
    const nextBundle: EffectTemplateBundle = { ...bundle, slots: nextSlots };
    writeTemplates({ ...effectTemplates, [activeEffect]: nextBundle }, activeEffect, true);
  }, [activeEffect, effectTemplates, writeTemplates]);

  const postProcessRef = useRef({ screen: screenPP, media: mediaPP });
  postProcessRef.current = { screen: screenPP, media: mediaPP };

  const applyPostProcess = useCallback((next: PostProcessState, persist: boolean) => {
    if (mode === 'screen') {
      throttlePostProcess(() => setScreenEffect(next, persist));
    } else if (mode === 'gif') {
      throttlePostProcess(() => setMediaEffect(next, persist));
    }
  }, [mode, throttlePostProcess]);

  const handlePostProcessChange = useCallback((patch: Partial<PostProcessState>, commit: boolean) => {
    if (mode === 'screen') {
      setScreenPP(prev => {
        const next = { ...prev, ...patch };
        applyPostProcess(next, commit);
        return next;
      });
    } else if (mode === 'gif') {
      setMediaPP(prev => {
        const next = { ...prev, ...patch };
        applyPostProcess(next, commit);
        return next;
      });
    }
  }, [mode, applyPostProcess]);

  const handlePostProcessCommit = useCallback(() => {
    const snapshot = postProcessRef.current;
    if (mode === 'screen') setScreenEffect(snapshot.screen, true).catch(() => {});
    else if (mode === 'gif') setMediaEffect(snapshot.media, true).catch(() => {});
  }, [mode]);

  const handlePostProcessReset = useCallback(() => {
    if (mode === 'screen') {
      setScreenPP(DEFAULT_POST_PROCESS);
      setScreenEffect(DEFAULT_POST_PROCESS, true).catch(() => {});
    } else if (mode === 'gif') {
      setMediaPP(DEFAULT_POST_PROCESS);
      setMediaEffect(DEFAULT_POST_PROCESS, true).catch(() => {});
    }
  }, [mode]);

  const devicesRef = useRef<LightingDevice[]>([]);
  devicesRef.current = devices;
  // Per-zone toggle (flips one device's current state). Paired with the
  // absolute handleSetPower below: a per-zone toggle applied to a whole
  // group would re-enable already-off zones in a partially-lit group.
  const handleTogglePower = useCallback((id: string) => {
    const current = devicesRef.current.find(d => d.id === id);
    if (!current) return;
    const nextOn = !current.ledsOn;
    setLightingDevicePower(id, nextOn).catch(() => { /* 3s poll reconciles */ });
    setDevices(prev => prev.map(d => d.id === id ? { ...d, ledsOn: nextOn } : d));
  }, []);
  // Absolute setter, used by group-header switches to set every child
  // zone to the same state (see handleTogglePower).
  const handleSetPower = useCallback((id: string, on: boolean) => {
    setLightingDevicePower(id, on).catch(() => { /* 3s poll reconciles */ });
    setDevices(prev => prev.map(d => d.id === id ? { ...d, ledsOn: on } : d));
  }, []);

  // Device list ordering: HTML5 drag/drop on ZoneCard, persisted to
  // localStorage. Mirrors the fan-card reorder pattern, but local-only —
  // device identity is per-machine, not per-profile.
  const [deviceOrder, setDeviceOrder] = useState<string[]>(loadDeviceOrder);
  useEffect(() => {
    try { localStorage.setItem(DEVICE_ORDER_KEY, JSON.stringify(deviceOrder)); } catch { /* persist best-effort */ }
  }, [deviceOrder]);
  // Reconcile the saved order against the live devices list: drop ids for
  // devices that no longer exist, append new ones. Without this, the saved
  // order would accumulate dead ids across USB unplugs / OpenRGB rescans.
  useEffect(() => {
    if (devices.length === 0) return;
    setDeviceOrder(prev => {
      const ids = devices.map(d => d.id);
      const kept = prev.filter(id => ids.includes(id));
      for (const id of ids) if (!kept.includes(id)) kept.push(id);
      return kept.length === prev.length && kept.every((id, i) => id === prev[i]) ? prev : kept;
    });
  }, [devices]);
  const orderedDevices = useMemo(() => {
    if (devices.length === 0) return devices;
    if (deviceOrder.length === 0) return devices;
    const byId = new Map(devices.map(d => [d.id, d]));
    const out: LightingDevice[] = [];
    const seen = new Set<string>();
    for (const id of deviceOrder) {
      const d = byId.get(id);
      if (d) { out.push(d); seen.add(id); }
    }
    for (const d of devices) if (!seen.has(d.id)) out.push(d);
    return out;
  }, [devices, deviceOrder]);
  const [dragDeviceId, setDragDeviceId] = useState<string | null>(null);
  const [dragOverDeviceId, setDragOverDeviceId] = useState<string | null>(null);
  const dropDeviceOn = useCallback((targetId: string) => {
    if (!dragDeviceId || dragDeviceId === targetId) return;
    setDeviceOrder(prev => {
      // Seed the persisted order from the current rendered order so the
      // first drop captures the natural service order before splicing.
      const base = prev.length > 0
        ? prev.filter(id => orderedDevices.some(d => d.id === id))
        : orderedDevices.map(d => d.id);
      const fromIdx = base.indexOf(dragDeviceId);
      const toIdx = base.indexOf(targetId);
      if (fromIdx === -1 || toIdx === -1) return prev;
      const next = base.slice();
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
  }, [dragDeviceId, orderedDevices]);
  const dragForDevice = useCallback((id: string) => ({
    isDragging: dragDeviceId === id,
    isDragOver: dragOverDeviceId === id && dragDeviceId !== id,
    onDragStart: () => setDragDeviceId(id),
    onDragOver: () => setDragOverDeviceId(id),
    onDragLeave: () => setDragOverDeviceId(null),
    onDrop: () => {
      dropDeviceOn(id);
      setDragDeviceId(null);
      setDragOverDeviceId(null);
    },
    onDragEnd: () => {
      setDragDeviceId(null);
      setDragOverDeviceId(null);
    },
  }), [dragDeviceId, dragOverDeviceId, dropDeviceOn]);

  const usb = useUsbDevices(serviceOnline);
  const detectedVidPids = useMemo(() => {
    const set = new Set<string>();
    for (const d of usb.devices) {
      set.add(`${d.vendorId.toLowerCase()}:${d.productId.toLowerCase()}`);
    }
    return set;
  }, [usb.devices]);

  // Devices list: fetch on entry + profile change, then refresh push-driven.
  // The `lighting` topic fires on every /lighting mutation (layout edits,
  // renames). The `devices` topic fires on USB hardware add/remove. RGB
  // rescan completion has no topic frame, so we piggyback on rgb.scanning
  // transitioning back to false (useServiceState polls for that flip).
  const refreshDevices = useCallback(async () => {
    const data = await fetchLightingDevices();
    if (!data || deviceDraggingRef.current) return;
    const devices = (data.devices ?? []).map(d => ({
      ...d,
      canvasW: Math.max(60, d.canvasW),
      canvasH: Math.max(60, d.canvasH),
    }));
    setDevices(devices);
  }, []);

  useEffect(() => {
    if (!serviceOnline) return;
    void refreshDevices();
  }, [serviceOnline, activeProfileId, refreshDevices]);

  useTopicCallback('devices', serviceOnline, () => {
    void refreshDevices();
  });

  const prevScanningRef = useRef(rgb.scanning);
  useEffect(() => {
    if (prevScanningRef.current && !rgb.scanning) void refreshDevices();
    prevScanningRef.current = rgb.scanning;
  }, [rgb.scanning, refreshDevices]);

  const handleModeChange = useCallback(async (m: LightingMode) => {
    setMode(m);
    try {
      switch (m) {
        case 'animate': {
          const key = activeEffect || (EFFECTS.some(e => e.key === rawSync) ? rawSync : 'rainbow');
          setActiveEffect(key);
          const state = stateFor(key);
          await startAnimate(key, state.speed, state.intensity, state.hue, state.colorize, state.saturation, state.contrast, state.params);
          publishControlSync({ domain: 'lighting', mode: m, rawSync: key, effect: key });
          break;
        }
        case 'screen':
          await startScreenMirror(screenPP.saturation, screenPP.contrast, '', screenPP.hue, screenPP.colorize);
          break;
        case 'gif': {
          await playCurrentOrFirstMedia();
          break;
        }
        case 'none': await stopLighting(); break;
      }
      if (m !== 'animate') {
        publishControlSync({ domain: 'lighting', mode: m, rawSync: m });
      }
    } catch { /* best-effort; backend state becomes source of truth */ }
  }, [activeEffect, rawSync, setMode, screenPP, stateFor]);

  const modeTabs = MODES.map(m => {
    const Icon = LIGHTING_MODE_ICONS[m.key];
    return { key: m.key, label: t(m.labelKey), icon: <Icon size={14} /> };
  });

  // Effect tab applies to animate / media / screen only; in Off mode
  // it renders an empty state and the tab header is disabled.
  const effectTabDisabled = mode === 'none';

  if (!serviceOnline) {
    return (
      <div className={styles.lighting}>
        <ViewHeader title={t('lighting.title')} tabs={modeTabs} activeTab={synced ? mode : undefined} onTabChange={k => handleModeChange(k as LightingMode)} tabsDisabled />
        <ServiceRequired state={connectionState} skeleton={<LightingSkeleton />} />
      </div>
    );
  }

  return (
    <div className={styles.lighting}>
      <ViewHeader
        title={t('lighting.title')}
        tabs={modeTabs}
        activeTab={synced ? mode : undefined}
        onTabChange={k => handleModeChange(k as LightingMode)}
        tabActions={
          <HoverTooltip body={t('lighting.settings.open')} side="bottom">
            <button
              type="button"
              className={styles.settingsBtn}
              onClick={() => setSettingsOpen(true)}
              aria-label={t('lighting.settings.open')}
            >
              <SlidersHorizontal size={16} aria-hidden />
            </button>
          </HoverTooltip>
        }
      />
      <LightingSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        serviceOnline={serviceOnline}
      />
      <SupportedDevicesModal
        open={catalogOpen}
        onClose={() => setCatalogOpen(false)}
        source="lighting"
        detectedVidPids={detectedVidPids}
      />
      <div className={`${styles.body} pageBody`}>
        <div className={styles.main}>
          <div className={styles.canvasArea}>
            <DeviceCanvas devices={devices} canvasPixels={frames.canvasPixels} canvasW={frames.canvasW} canvasH={frames.canvasH} selectedIds={selectedDeviceIds} primaryDeviceId={primaryDeviceId} onSelectDevice={handleSelectDevice} onSetSelection={handleSetSelection} shaderEffect={mode === 'animate' ? activeEffect : null} shaderState={mode === 'animate' ? currentState : null} audioRef={audioRef} hiddenFrameIds={hiddenFrameIds} selectedDeviceLeds={selectedDeviceLeds} onOpenSettings={handleOpenSettings} onDragActiveChange={handleDragActiveChange} />
            {mode === 'animate' && activeEffect && currentState && (
              <>
                {EFFECTS.find(e => e.key === activeEffect)?.audio && (
                  <HoverTooltip body={t('lighting.musicReactive')} side="left">
                    <button
                      type="button"
                      className={`${styles.musicReactiveBtn} ${musicReactive ? styles.musicReactiveBtnOn : ''}`}
                      onClick={handleMusicReactiveToggle}
                      aria-label={t('lighting.musicReactive')}
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 10.5a1.5 1.5 0 1 0 3 0v-7l6 -1.5v7" />
                        <circle cx="10.5" cy="9.5" r="1.5" />
                      </svg>
                    </button>
                  </HoverTooltip>
                )}
                <HoverTooltip body={t('lighting.fullscreen')} side="left">
                  <button type="button" className={styles.fullscreenBtn} onClick={() => setFullscreenOpen(true)} aria-label={t('lighting.fullscreen')}>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9,1 13,1 13,5" /><polyline points="5,13 1,13 1,9" />
                      <line x1="13" y1="1" x2="8.5" y2="5.5" /><line x1="1" y1="13" x2="5.5" y2="8.5" />
                    </svg>
                  </button>
                </HoverTooltip>
              </>
            )}
          </div>
          {mode === 'animate' ? (
            <AnimateGrid effect={activeEffect} onSelect={handleEffectSelect} />
          ) : (
            <div className={styles.controls}>
              <ModeControls
                mode={mode}
                screenPP={screenPP}
                onScreenPPChange={setScreenPP}
              />
            </div>
          )}
        </div>
        <div className={styles.rightPane}>
          <div className={styles.rightPaneTabsHeader}>
            <RightPaneTabs
              active={activeRightTab}
              onSelect={setActiveRightTab}
              pulseKey={effectPulseKey}
              effectTabDisabled={effectTabDisabled}
            />
          </div>
          {activeRightTab === 'devices' ? (
            <>
              <DevicePanel
                devices={orderedDevices}
                selectedIds={selectedDeviceIds}
                onSelectDevice={handleSelectDevice}
                onSetSelection={handleSetSelection}
                onTogglePower={handleTogglePower}
                onSetPower={handleSetPower}
                lightingOff={mode === 'none'}
                onOpenSettings={handleOpenSettings}
                dragFor={dragForDevice}
                communityCounts={mappingCounts}
                onOpenCommunity={handleOpenCommunity}
              />
              {mode !== 'none' && (
                <RescanDevicesButton rgbRunning={rgb.running} scanning={rgb.scanning} />
              )}
              <RgbStatusCard
                rgbRunning={rgb.running}
                onClick={() => setCatalogOpen(true)}
                title={t('devices.supported.browse')}
              />
            </>
          ) : (
            <div className={styles.effectTabBody}>
              <EffectTab
                mode={mode}
                effect={activeEffect}
                state={currentState}
                bundle={activeEffect ? effectTemplates[activeEffect] ?? null : null}
                canReset={canReset}
                onTemplateSelect={handleTemplateSelect}
                onAnimateChange={handleStatePatch}
                onAnimateCommit={handleStateCommit}
                onAnimateReset={handleStateReset}
                postProcess={postProcess}
                onPostProcessChange={handlePostProcessChange}
                onPostProcessCommit={handlePostProcessCommit}
                onPostProcessReset={handlePostProcessReset}
              />
            </div>
          )}
        </div>
      </div>
      {fullscreenOpen && activeEffect && currentState && effectTemplates[activeEffect] && (
        <FullscreenShader
          effect={activeEffect}
          state={currentState}
          bundle={effectTemplates[activeEffect]}
          canReset={canReset}
          audioRef={audioRef}
          onTemplateSelect={handleTemplateSelect}
          onChange={handleStatePatch}
          onCommit={handleStateCommit}
          onReset={handleStateReset}
          onClose={() => setFullscreenOpen(false)}
          onPrev={handlePrevEffect}
          onNext={handleNextEffect}
        />
      )}
      {editingDevice && (
        <LedMapEditor device={editingDevice} initialTab={editorInitialTab} onClose={() => setEditingDeviceId(null)} />
      )}
    </div>
  );
}

function normalizePP(s: PostProcessSettings | null | undefined): PostProcessState {
  if (!s) return DEFAULT_POST_PROCESS;
  return {
    hue: typeof s.hue === 'number' ? s.hue : 0,
    colorize: typeof s.colorize === 'number' ? s.colorize : 0,
    saturation: typeof s.saturation === 'number' ? s.saturation : 1,
    contrast: typeof s.contrast === 'number' ? s.contrast : 1,
    flipX: !!s.flipX,
    flipY: !!s.flipY,
  };
}

function modeForSync(sync: string): LightingMode {
  if (sync === 'none' || !sync) return 'none';
  if (sync === 'screen' || sync.includes('mirror')) return 'screen';
  if (sync === 'gif' || sync.includes('media')) return 'gif';
  return 'animate';
}
