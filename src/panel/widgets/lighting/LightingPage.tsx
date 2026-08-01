import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Gamepad2, Music, Pause, Play } from 'lucide-react';
import {
  startAnimate, startStatic, startScreenMirror, stopLighting, startGameSync,
  fetchStaticSettings,
  fetchLightingDevices, fetchAnimateSettings, saveAnimateTemplates,
  fetchAnimateDefaults, cachedAnimateDefaults,
  fetchMusicReactive, setMusicReactive, setLightingDevicePower, setLightingDeviceControlled,
  fetchScreenEffect, setScreenEffect, fetchMediaEffect, setMediaEffect, fetchLedMap,
  fetchCurrentSync, fetchAvailableMappings, fetchGameSyncState, fetchGameSyncGames,
  steamArtworkUrl, resolveActiveGame, setLightingPaused,
  resetDeviceLayouts, applyDeviceLayouts, setActiveLayoutPreset, updateLayoutPreset,
  type LightingDevice, type LedMapEntry, type PostProcessSettings, type GameSyncDevice,
  type GameSyncGame, type DeviceLayoutDto,
} from '../../../api/lighting';
import { useUndoRedo } from '../../../hooks/useUndoRedo';
import { useLayoutPresets, devicesToLayouts, devicesToPower } from './page/useLayoutPresets';
import { mediaIdle, playCurrentOrFirstMedia } from '../../../api/mediaLibrary';
import { getSmartHubFirmwareControl, setSmartHubFirmwareControl } from '../../../api/smarthub';
import { getLianLiLighting } from '../../../api/lianli';
import { useLightingFrames } from '../../../hooks/useLightingFrames';
import { useLightingSync, normalizeSync } from '../../../hooks/useLightingSync';
import { useTopicCallback } from '../../../hooks/useMultiplexSocket';
import type { ServiceState } from '../../../hooks/useServiceState';
import type { ConnectionState } from '../../../hooks/useServiceStatus';
import type { DashboardSectionNavigate } from '../../engine/panelLayoutHelpers';
import { useTranslation } from '../../../lib/i18n';
import { publishControlSync, subscribeControlSync } from '../../../lib/controlSync';
import { emitRadialBloomFromElement } from '../../../lib/backgroundEffects';
import { LIGHTING_MODE_ICONS } from '../../../lib/lightingModeIcons';
import { HoverTooltip } from '../../../components/common/HoverTooltip/HoverTooltip';
import { ViewHeader } from '../../../components/common/ViewHeader/ViewHeader';
import { ServiceRequired } from '../../../components/views/ServiceRequired';
import { LightingSkeleton } from '../../../components/views/PageSkeleton/PageSkeleton';
import { DeviceCanvas } from '../../../components/common/DeviceCanvas/DeviceCanvas';
import { usePanelBackgroundUsage } from '../../../hooks/usePanelBackgroundUsage';
import {
  EFFECTS, ANIMATE_EFFECTS, STATIC_EFFECTS, MODES, defaultStateFor, isStaticEffect,
  type EffectState, type EffectTemplateBundle, type LightingMode,
} from '../../../types/lighting';
import { defaultTemplatesFor, mergeTemplates, slotMatchesDefault, slotThumbSignature } from '../../../types/lightingTemplates';
import { AnimateGrid } from './page/AnimateGrid';
import { FullscreenShader } from './page/FullscreenShader';
import { ModeControls } from './page/ModeControls';
import { DevicePanel } from './page/DevicePanel';
import { GameSyncLeftPane } from './page/GameSyncLeftPane';
import { LedMapEditor } from './page/LedMapEditor';
import { visibleCards } from './page/zoneUtils';
import { OpenRgbButton } from './page/OpenRgbButton';
import { GlobalBrightnessSlider } from './page/GlobalBrightnessSlider';
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
  platform?: string;
  /** Navigate to a sibling dashboard section (e.g. the smart-lights app). */
  onSectionNavigate?: DashboardSectionNavigate;
}

const DEFAULT_POST_PROCESS: PostProcessState = { hue: 0, colorize: 0, saturation: 1, contrast: 1 };

interface LayoutHistorySnapshot {
  layouts: Record<string, DeviceLayoutDto>;
  activeId: string | null;
  power: Record<string, boolean>;
  /** Device ids whose power this action changed; empty for layout-only edits.
   *  Scopes power reconciliation on undo/redo to exactly the touched devices. */
  powerIds: string[];
}

// Module scope so the layout undo/redo history survives LightingPage's unmount
// on navigation. Session-only; not persisted to storage. Assumes one mounted
// LightingPage - two concurrent instances would share and clobber this history.
let layoutHistoryStacks: { undo: LayoutHistorySnapshot[]; redo: LayoutHistorySnapshot[] } | null = null;
const layoutHistoryStore = {
  read: () => layoutHistoryStacks,
  write: (s: { undo: LayoutHistorySnapshot[]; redo: LayoutHistorySnapshot[] }) => { layoutHistoryStacks = s; },
};

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

export function LightingPage({ serviceOnline, serviceState, connectionState, activeProfileId, platform = '', onSectionNavigate }: LightingViewProps) {
  const { t } = useTranslation();
  const { mode, setMode, rawSync, setRawSync, synced, paused: syncedPaused } = useLightingSync(serviceOnline, activeProfileId);
  // Game Sync requires the Windows Chroma capture shim; hide it on non-Windows
  // (empty platform = ping not yet resolved, keep hidden to avoid a flash).
  const isWindows = platform === 'windows';
  const effectiveMode: LightingMode = (mode === 'gamesync' && !isWindows) ? 'none' : mode;
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
  const pushLayoutRef = useRef<((snap: LayoutHistorySnapshot) => void) | null>(null);
  const layoutActiveIdRef = useRef<string | null>(null);
  const handleDragActiveChange = useCallback((active: boolean) => {
    deviceDraggingRef.current = active;
  }, []);
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
  const handleBeforeLayoutSave = useCallback(() => {
    pushLayoutRef.current?.({ layouts: devicesToLayouts(devicesRef.current), power: devicesToPower(devicesRef.current), activeId: layoutActiveIdRef.current, powerIds: [] });
  }, []);

  const [smartHubFirmwareControl, setSmartHubFirmwareControlState] = useState(false);
  const [lianLiMode, setLianLiMode] = useState<string | null>(null);
  // true when the hub's active lighting mode is not 'custom' (firmware animation overrides per-LED engine).
  const lianLiFirmwareActive = lianLiMode !== null && lianLiMode !== 'custom';

  const handleSetSmartHubFirmwareControl = useCallback(async (enabled: boolean) => {
    setSmartHubFirmwareControlState(enabled);
    try {
      await setSmartHubFirmwareControl(enabled);
    } catch {
      setSmartHubFirmwareControlState(!enabled);
    }
  }, []);

  const [activeEffect, setActiveEffect] = useState<string>('');
  // Read inside applyAnimate, which several handlers share: static and animate
  // drive the same template state through different start endpoints.
  const modeRef = useRef(mode);
  modeRef.current = mode;
  // Static keeps its own last-selected key, so switching modes returns to what
  // each one was showing rather than carrying the other's effect across.
  const staticEffectRef = useRef<string>(STATIC_EFFECTS[0]?.key ?? '');
  // The mirror of staticEffectRef: the catalogs are disjoint, so entering
  // Animation while a static key is selected must fall back to what Animation
  // last had rather than carrying a pattern across.
  const animateEffectRef = useRef<string>('rainbow');
  const [effectTemplates, setEffectTemplates] = useState<Record<string, EffectTemplateBundle>>({});
  // Canonical default bundles from the service (fetched once, session-cached).
  // Kept in state so default-dependent memos recompute when they arrive.
  const [animateDefaults, setAnimateDefaults] = useState<Record<string, EffectTemplateBundle> | null>(cachedAnimateDefaults);
  // Committed snapshot: updated on hydrate, on preset switch, and after a param
  // save lands - never during a drag. The grid + preset thumbnails (and the
  // selected highlight) read from this, so they refetch on commit, not per slider
  // frame (effectTemplates churns during drag for the live RGB preview).
  const [committedTemplates, setCommittedTemplates] = useState<Record<string, EffectTemplateBundle>>({});
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
  // Cards whose LEDs are all user-disabled disappear from the listing and
  // the canvas, but a device always keeps at least one card visible: a
  // fully parked device shows one card with its zero-enabled badge so it
  // stays selectable and its LED map editor remains reachable.
  const visibleDevices = useMemo(() => visibleCards(devices), [devices]);
  const hiddenFrameIds = useMemo(() => {
    const set = new Set<string>();
    if (activeRightTab === 'effect') {
      for (const d of visibleDevices) set.add(d.id);
      return set;
    }
    for (const d of visibleDevices) if (!d.ledsOn) set.add(d.id);
    return set;
  }, [visibleDevices, activeRightTab]);

  // LED map editor - lifted here so both the canvas settings button and the
  // ZoneCard settings button can open it. Every card routes to the editor of
  // its OWNING device with that card's zone preselected; the community badge
  // deep-links to the editor with the community modal already stacked open.
  const [editorTarget, setEditorTarget] = useState<{
    deviceId: string;
    zoneId: string;
    zoneCustomizable: boolean;
  } | null>(null);
  const [editorCommunityOpen, setEditorCommunityOpen] = useState(false);
  const devicesRef = useRef<LightingDevice[]>([]);
  devicesRef.current = devices;
  const openEditorFor = useCallback((cardId: string, communityOpen: boolean) => {
    const card = devicesRef.current.find(d => d.id === cardId);
    if (!card) return;
    setEditorCommunityOpen(communityOpen);
    setEditorTarget({
      // deviceId falls back to the card id for services that predate the
      // zones model (single-zone behavior).
      deviceId: card.deviceId || card.id,
      zoneId: card.id,
      zoneCustomizable: card.zoneCustomizable === true,
    });
  }, []);
  const handleOpenSettings = useCallback((id: string) => {
    openEditorFor(id, false);
  }, [openEditorFor]);
  const handleOpenCommunity = useCallback((id: string) => {
    openEditorFor(id, true);
  }, [openEditorFor]);

  // After a hub composition change the device set may have changed (ports added/
  // removed, mirror toggled). Refetch devices and re-target the editor to the
  // first device that belongs to the same hub. The epoch counter forces the
  // editor to remount even when the deviceId doesn't change, so load() re-fires.
  const [compositionEpoch, setCompositionEpoch] = useState(0);
  const handleCompositionChanged = useCallback(async (hubId: string) => {
    const data = await fetchLightingDevices();
    if (!data) return;
    const next = (data.devices ?? []).map(d => ({
      ...d,
      canvasW: Math.max(60, d.canvasW),
      canvasH: Math.max(60, d.canvasH),
    }));
    setDevices(next);
    // Re-target the editor to the hub's first device. Match on parentDeviceId
    // (the exact hub identity each card carries) so a multi-hub setup can't be
    // mis-targeted by a shared id prefix.
    const match = next.find(d => d.parentDeviceId === hubId);
    if (match) {
      setEditorTarget({
        deviceId: match.deviceId || match.id,
        zoneId: match.id,
        zoneCustomizable: match.zoneCustomizable === true,
      });
      setCompositionEpoch(e => e + 1);
    } else {
      setEditorTarget(null);
    }
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
  }, [primaryDeviceId, editorTarget, activeProfileId]);

  const [musicReactive, setMusicReactiveState] = useState(false);
  const audioRef = useAudioState(musicReactive && mode === 'animate');

  // Optimistic local mirror of useLightingSync().paused, reconciled whenever
  // the server value changes (multiplex refetch, mode switch resetting it).
  const [paused, setPausedState] = useState(!!syncedPaused);
  useEffect(() => {
    setPausedState(!!syncedPaused);
  }, [syncedPaused]);

  const handlePauseToggle = useCallback(async () => {
    const next = !paused;
    setPausedState(next);
    try {
      await setLightingPaused(next);
    } catch {
      setPausedState(!next);
    }
  }, [paused]);

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
  // Static renders at speed 0; the canvas preview has to match or it animates
  // a look the LEDs are holding still.
  const previewState: EffectState | null = useMemo(
    () => currentState && mode === 'static' ? { ...currentState, speed: 0 } : currentState,
    [currentState, mode],
  );
  const currentSelected: number = useMemo(
    () => activeEffect ? (effectTemplates[activeEffect]?.selected ?? 0) : 0,
    [activeEffect, effectTemplates],
  );
  const canReset: boolean = useMemo(
    () => !!(activeEffect && currentState
      && !slotMatchesDefault(activeEffect, currentSelected, currentState, animateDefaults)),
    [activeEffect, currentState, currentSelected, animateDefaults],
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

  // keepSelection: static owns its selection (Lighting.Static.Effect); this
  // payload carries the animate one, so applying it here would drag the static
  // grid onto the last animated effect on every lighting broadcast.
  const hydrateAnimateSettings = useCallback(async (
    data: Awaited<ReturnType<typeof fetchAnimateSettings>>,
    keepSelection = false,
  ) => {
    if (!data) return;
    const defaults = await fetchAnimateDefaults();
    setAnimateDefaults(defaults);
    const merged: Record<string, EffectTemplateBundle> = {};
    const savedTemplates = data.templates ?? {};
    for (const fx of EFFECTS) {
      merged[fx.key] = mergeTemplates(fx.key, savedTemplates[fx.key], defaults);
    }
    if (!data.templates) {
      // Pre-templates service: fold the legacy per-effect states into slot 0
      // and persist, but only when there is something to migrate - the service
      // stores user deltas, so an all-defaults save is pure churn.
      const legacy = data.states ?? {};
      let migrated = false;
      for (const fx of EFFECTS) {
        const s = legacy[fx.key];
        if (!s) continue;
        migrated = true;
        const bundle = merged[fx.key];
        bundle.slots[0] = {
          ...bundle.slots[0],
          ...s,
          params: { ...bundle.slots[0].params, ...(s.params ?? {}) },
        };
        bundle.selected = 0;
      }
      if (migrated) {
        saveAnimateTemplates(merged).catch(() => { /* best-effort */ });
      }
    }
    setEffectTemplates(merged);
    setCommittedTemplates(merged);
    if (ANIMATE_EFFECTS.some(e => e.key === data.effect)) {
      animateEffectRef.current = data.effect;
    }
    if (!keepSelection && ANIMATE_EFFECTS.some(e => e.key === data.effect)) {
      setActiveEffect(data.effect);
    }
  }, []);

  const applyExternalEffectState = useCallback((effect: string, state?: EffectState, templateIndex?: number) => {
    if (!EFFECTS.some(e => e.key === effect)) return;
    setActiveEffect(effect);
    if (state === undefined && templateIndex === undefined) return;

    setEffectTemplates(prev => {
      const bundle = prev[effect] ?? defaultTemplatesFor(effect, cachedAnimateDefaults());
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
    ]).then(async ([
      currentSync,
      animateSettings,
      musicSettings,
      screenEffect,
      mediaEffect,
    ]) => {
      if (cancelled) return;
      const sync = currentSync?.sync ?? 'none';
      setRawSync(sync);
      setMode(normalizeSync(sync));

      if (animateSettings) {
        // Await: the profile-restore effect keyed off loadedProfileLighting
        // reads effectTemplates, which must hold the merged bundles (not the
        // pre-hydrate {}) or the restored effect starts with the base look.
        await hydrateAnimateSettings(animateSettings, normalizeSync(sync) === 'static');
        if (cancelled) return;
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

  // Seeded on mount, not just when static is active: entering the mode from
  // another one has to land on the key the service remembers.
  useEffect(() => {
    if (!serviceOnline) return;
    let cancelled = false;
    fetchStaticSettings().then(data => {
      if (cancelled || !data) return;
      if (isStaticEffect(data.effect)) staticEffectRef.current = data.effect;
    });
    return () => { cancelled = true; };
  }, [serviceOnline]);

  useEffect(() => {
    if (!serviceOnline || !rawSync) return;
    let cancelled = false;

    if (rawSync === 'static') {
      fetchStaticSettings().then(data => {
        if (cancelled || !data) return;
        if (isStaticEffect(data.effect)) {
          staticEffectRef.current = data.effect;
          setActiveEffect(data.effect);
        }
      });
    } else if (EFFECTS.some(e => e.key === rawSync)) {
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
    if (!serviceOnline || (mode !== 'animate' && mode !== 'static')) return;
    let cancelled = false;
    fetchAnimateSettings().then(data => {
      if (cancelled || !data) return;
      hydrateAnimateSettings(data, mode === 'static');
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
    // Static edits the same template slots, so both modes follow a remote edit.
    if (mode === 'animate' || mode === 'static') {
      if (Date.now() < localAnimateEditUntilRef.current) return;
      fetchAnimateSettings().then(data => {
        if (!data) return;
        hydrateAnimateSettings(data, mode === 'static');
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

  const [gameSyncState, setGameSyncState] = useState<{
    devices: GameSyncDevice[];
    lastFrameAt: number | null;
    activeApp: string | null;
    isReceiving: boolean;
  }>({ devices: [], lastFrameAt: null, activeApp: null, isReceiving: false });

  useEffect(() => {
    if (effectiveMode !== 'gamesync' || !serviceOnline) return;
    let cancelled = false;
    const poll = async () => {
      const data = await fetchGameSyncState().catch(() => null);
      if (cancelled || !data) return;
      const lastFrameAt = data.lastFrameAt ?? null;
      setGameSyncState({
        devices: data.devices ?? [],
        lastFrameAt,
        activeApp: data.activeApp ?? null,
        isReceiving: lastFrameAt != null && (Date.now() - lastFrameAt) < 2000,
      });
    };
    void poll();
    const id = window.setInterval(() => { void poll(); }, 1500);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [effectiveMode, serviceOnline]);

  const [gameSyncGames, setGameSyncGames] = useState<GameSyncGame[]>([]);

  useEffect(() => {
    if (effectiveMode !== 'gamesync' || !serviceOnline) return;
    let cancelled = false;
    fetchGameSyncGames().then(data => {
      if (!cancelled && data) setGameSyncGames(data.games ?? []);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [effectiveMode, serviceOnline]);

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
      if (modeRef.current === 'static') {
        startStatic(
          effect, state.intensity, state.hue, state.colorize,
          state.saturation, state.contrast, state.params, persist,
        ).catch(() => {});
        return;
      }
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
    // Return the save promise so callers can bump the thumbnail token only after
    // the new look is persisted (else the refetch races the write and re-caches
    // the old look).
    if (persist) {
      return saveAnimateTemplates(next).catch(() => { /* best-effort; UI already updated */ });
    }
    return Promise.resolve();
  }, [applyAnimate]);

  // Clicking an effect on the Devices tab pulses the Effect tab label
  // instead of switching away from the devices.
  const pulseEffectTab = useCallback(() => setEffectPulseKey(k => k + 1), []);

  const handleEffectSelect = useCallback((key: string) => {
    if (activeEffect !== key) {
      setActiveEffect(key);
      applyAnimate(key, stateFor(key), true);
    }
    const selectMode = modeRef.current === 'static' ? 'static' : 'animate';
    // Remember the pick per mode: rawSync stays 'static' across selections, so
    // the hydrate effect never re-runs and would otherwise leave this stale.
    if (selectMode === 'static') staticEffectRef.current = key;
    else animateEffectRef.current = key;
    publishControlSync({
      domain: 'lighting',
      mode: selectMode,
      rawSync: selectMode === 'static' ? 'static' : key,
      effect: key,
    });
    if (activeRightTab !== 'effect') pulseEffectTab();
  }, [activeEffect, activeRightTab, applyAnimate, pulseEffectTab, stateFor]);

  const effectPool = mode === 'static' ? STATIC_EFFECTS : ANIMATE_EFFECTS;

  const handlePrevEffect = useCallback(() => {
    if (!effectPool.length) return;
    const raw = effectPool.findIndex(e => e.key === activeEffect);
    const idx = raw < 0 ? 0 : raw;
    handleEffectSelect(effectPool[(idx - 1 + effectPool.length) % effectPool.length].key);
  }, [activeEffect, effectPool, handleEffectSelect]);

  const handleNextEffect = useCallback(() => {
    if (!effectPool.length) return;
    const raw = effectPool.findIndex(e => e.key === activeEffect);
    const idx = raw < 0 ? 0 : raw;
    handleEffectSelect(effectPool[(idx + 1) % effectPool.length].key);
  }, [activeEffect, effectPool, handleEffectSelect]);

  const handleTemplateSelect = useCallback((idx: number) => {
    if (!activeEffect) return;
    const bundle = effectTemplates[activeEffect];
    if (!bundle) return;
    if (idx === bundle.selected) return;
    localAnimateEditUntilRef.current = Date.now() + 1500;
    const clamped = Math.min(Math.max(idx, 0), bundle.slots.length - 1);
    const nextBundle: EffectTemplateBundle = { ...bundle, selected: clamped };
    const nextTemplates = { ...effectTemplates, [activeEffect]: nextBundle };
    writeTemplates(nextTemplates, activeEffect, true);
    // Selection is instant and the slot's params are unchanged, so the committed
    // snapshot can advance immediately (no save race).
    setCommittedTemplates(nextTemplates);
    publishControlSync({
      domain: 'lighting',
      // Static edits must not announce themselves as animate: subscribers
      // classify on rawSync, so a pattern key here flips every surface into
      // Animation mid-interaction.
      mode: modeRef.current === 'static' ? 'static' : 'animate',
      rawSync: modeRef.current === 'static' ? 'static' : activeEffect,
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
      // Static edits must not announce themselves as animate: subscribers
      // classify on rawSync, so a pattern key here flips every surface into
      // Animation mid-interaction.
      mode: modeRef.current === 'static' ? 'static' : 'animate',
      rawSync: modeRef.current === 'static' ? 'static' : activeEffect,
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
    // Advance the committed snapshot only after the save lands, so the thumbnail
    // refetch can't race ahead of the persisted look.
    saveAnimateTemplates(freshTemplates)
      .then(() => setCommittedTemplates(freshTemplates))
      .catch(() => { /* best-effort */ });
    applyAnimate(activeEffect, latest, true);
  }, [activeEffect, applyAnimate]);

  const handleStateReset = useCallback(() => {
    if (!activeEffect) return;
    const defaults = defaultTemplatesFor(activeEffect, animateDefaults);
    const bundle = effectTemplates[activeEffect];
    if (!bundle) return;
    const idx = bundle.selected;
    const nextSlots = bundle.slots.slice();
    nextSlots[idx] = defaults.slots[idx];
    const nextBundle: EffectTemplateBundle = { ...bundle, slots: nextSlots };
    const nextTemplates = { ...effectTemplates, [activeEffect]: nextBundle };
    writeTemplates(nextTemplates, activeEffect, true)
      .then(() => setCommittedTemplates(nextTemplates));
  }, [activeEffect, effectTemplates, writeTemplates, animateDefaults]);

  // Cross-panel usage drives the "used by a panel" badge. No exclusion: the
  // desktop page isn't a panel, so every panel background counts.
  const panelUsage = usePanelBackgroundUsage();

  // Grid cell = this surface's selected slot + its content hash, both from the
  // committed snapshot so thumbnails track commits, not drag frames.
  const slotForEffect = useCallback((e: string) => committedTemplates[e]?.selected ?? 0, [committedTemplates]);
  const versionForEffect = useCallback((e: string) => {
    const b = committedTemplates[e];
    if (!b || b.slots.length === 0) return '0';
    return slotThumbSignature(b.slots[Math.min(Math.max(b.selected, 0), b.slots.length - 1)]);
  }, [committedTemplates]);

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
      const next = { ...screenPP, hue: 0, colorize: 0, saturation: 1, contrast: 1, reactivity: 0.5, intensity: 0.5 };
      setScreenPP(next);
      setScreenEffect(next, true).catch(() => {});
    } else if (mode === 'gif') {
      const next = { ...mediaPP, hue: 0, colorize: 0, saturation: 1, contrast: 1 };
      setMediaPP(next);
      setMediaEffect(next, true).catch(() => {});
    }
  }, [mode, screenPP, mediaPP]);

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

  // "Controlled" mirrors the power toggle/setter pair above, but controls
  // whether Nexus pushes frames to the device at all (distinct from power,
  // which drives it to black).
  const handleToggleControlled = useCallback((id: string) => {
    const current = devicesRef.current.find(d => d.id === id);
    if (!current) return;
    const nextControlled = current.controlled === false;
    setLightingDeviceControlled(id, nextControlled).catch(() => { /* 3s poll reconciles */ });
    setDevices(prev => prev.map(d => d.id === id ? { ...d, controlled: nextControlled } : d));
  }, []);
  const handleSetControlled = useCallback((id: string, controlled: boolean) => {
    setLightingDeviceControlled(id, controlled).catch(() => { /* 3s poll reconciles */ });
    setDevices(prev => prev.map(d => d.id === id ? { ...d, controlled } : d));
  }, []);

  // Device list ordering: HTML5 drag/drop on ZoneCard, persisted to
  // localStorage. Mirrors the fan-card reorder pattern, but local-only -
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
    if (visibleDevices.length === 0) return visibleDevices;
    if (deviceOrder.length === 0) return visibleDevices;
    const byId = new Map(visibleDevices.map(d => [d.id, d]));
    const out: LightingDevice[] = [];
    const seen = new Set<string>();
    for (const id of deviceOrder) {
      const d = byId.get(id);
      if (d) { out.push(d); seen.add(id); }
    }
    for (const d of visibleDevices) if (!seen.has(d.id)) out.push(d);
    return out;
  }, [visibleDevices, deviceOrder]);

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

  useEffect(() => {
    if (!serviceOnline) return;
    let cancelled = false;
    getSmartHubFirmwareControl().then(v => {
      if (!cancelled && v !== null) setSmartHubFirmwareControlState(v);
    }).catch(() => {});
    getLianLiLighting().then(data => {
      if (!cancelled && data) setLianLiMode(data.mode);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [serviceOnline]);

  useEffect(() => {
    const onFocus = () => {
      if (!serviceOnline) return;
      getSmartHubFirmwareControl().then(v => {
        if (v !== null) setSmartHubFirmwareControlState(v);
      }).catch(() => {});
      getLianLiLighting().then(data => {
        if (data) setLianLiMode(data.mode);
      }).catch(() => {});
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [serviceOnline]);

  useTopicCallback('devices', serviceOnline, () => {
    void refreshDevices();
  });

  const prevScanningRef = useRef(rgb.scanning);
  useEffect(() => {
    if (prevScanningRef.current && !rgb.scanning) void refreshDevices();
    prevScanningRef.current = rgb.scanning;
  }, [rgb.scanning, refreshDevices]);

  const {
    presets, activeId: layoutActiveId,
    presetCount, loadPresets,
    handleCreate: handlePresetCreate,
    handleRename: handlePresetRename,
    handleDelete: handlePresetDelete,
    handleLoad: handlePresetLoad,
  } = useLayoutPresets(serviceOnline, activeProfileId);

  layoutActiveIdRef.current = layoutActiveId;

  const undoRedoRef = useRef<{
    undo: (current: LayoutHistorySnapshot) => LayoutHistorySnapshot | null;
    redo: (current: LayoutHistorySnapshot) => LayoutHistorySnapshot | null;
  }>({ undo: () => null, redo: () => null });

  const handleUndoLayout = useCallback(async () => {
    const current: LayoutHistorySnapshot = { layouts: devicesToLayouts(devicesRef.current), power: devicesToPower(devicesRef.current), activeId: layoutActiveIdRef.current, powerIds: [] };
    const restored = undoRedoRef.current.undo(current);
    if (!restored) return;
    // The entry now on the redo stack must reconcile the same ids when redone.
    // setStacks stored a reference to current, so this mutation updates the stored entry.
    current.powerIds = restored.powerIds;
    await applyDeviceLayouts(restored.layouts);
    const powerIds = restored.powerIds ?? [];
    const powerChanges = powerIds.filter(id => {
      const dev = devicesRef.current.find(d => d.id === id);
      return dev !== undefined && restored.power[id] !== undefined && dev.ledsOn !== restored.power[id];
    });
    if (powerChanges.length > 0) {
      const changeSet = new Set(powerChanges);
      setDevices(prev => prev.map(d => changeSet.has(d.id) ? { ...d, ledsOn: restored.power[d.id] } : d));
      await Promise.all(powerChanges.map(id => setLightingDevicePower(id, restored.power[id]).catch(() => { /* 3s poll reconciles */ })));
    }
    if (restored.activeId !== layoutActiveIdRef.current) {
      await setActiveLayoutPreset(restored.activeId);
    }
    if (restored.activeId) {
      await updateLayoutPreset(restored.activeId, { saveCurrent: true });
    }
    await loadPresets();
    await refreshDevices();
  }, [loadPresets, refreshDevices]);

  const handleRedoLayout = useCallback(async () => {
    const current: LayoutHistorySnapshot = { layouts: devicesToLayouts(devicesRef.current), power: devicesToPower(devicesRef.current), activeId: layoutActiveIdRef.current, powerIds: [] };
    const restored = undoRedoRef.current.redo(current);
    if (!restored) return;
    // The entry now on the undo stack must reconcile the same ids when undone.
    // setStacks stored a reference to current, so this mutation updates the stored entry.
    current.powerIds = restored.powerIds;
    await applyDeviceLayouts(restored.layouts);
    const powerIds = restored.powerIds ?? [];
    const powerChanges = powerIds.filter(id => {
      const dev = devicesRef.current.find(d => d.id === id);
      return dev !== undefined && restored.power[id] !== undefined && dev.ledsOn !== restored.power[id];
    });
    if (powerChanges.length > 0) {
      const changeSet = new Set(powerChanges);
      setDevices(prev => prev.map(d => changeSet.has(d.id) ? { ...d, ledsOn: restored.power[d.id] } : d));
      await Promise.all(powerChanges.map(id => setLightingDevicePower(id, restored.power[id]).catch(() => { /* 3s poll reconciles */ })));
    }
    if (restored.activeId !== layoutActiveIdRef.current) {
      await setActiveLayoutPreset(restored.activeId);
    }
    if (restored.activeId) {
      await updateLayoutPreset(restored.activeId, { saveCurrent: true });
    }
    await loadPresets();
    await refreshDevices();
  }, [loadPresets, refreshDevices]);

  const {
    push: pushLayout,
    undo: undoLayout,
    redo: redoLayout,
    canUndo: canUndoLayout,
    canRedo: canRedoLayout,
    reset: resetLayoutHistory,
  } = useUndoRedo<LayoutHistorySnapshot>({
    maxDepth: 50,
    // Off while the LED map editor is open: it has its own undo/redo on the same
    // Cmd/Ctrl+Z, and both listen on window, so an enabled layout history would
    // also fire and undo the canvas underneath the modal.
    enabled: activeRightTab === 'devices' && editorTarget === null,
    onUndo: handleUndoLayout,
    onRedo: handleRedoLayout,
    store: layoutHistoryStore,
  });

  undoRedoRef.current = { undo: undoLayout, redo: redoLayout };
  pushLayoutRef.current = pushLayout;

  const handlePresetLoadWithHistory = useCallback(async (id: string) => {
    pushLayout({ layouts: devicesToLayouts(devicesRef.current), power: devicesToPower(devicesRef.current), activeId: layoutActiveIdRef.current, powerIds: devicesRef.current.map(d => d.id) });
    await handlePresetLoad(id);
    await refreshDevices();
  }, [pushLayout, handlePresetLoad, refreshDevices]);

  const handleResetWithHistory = useCallback(async () => {
    resetLayoutHistory();
    await resetDeviceLayouts();
    const id = layoutActiveIdRef.current;
    if (id) {
      // saveCurrent after resetDeviceLayouts writes an empty layouts map into the preset,
      // which the service interprets as "use provider defaults" on next activation.
      await updateLayoutPreset(id, { saveCurrent: true });
    }
    await loadPresets();
    await refreshDevices();
  }, [resetLayoutHistory, loadPresets, refreshDevices]);

  const handleLayoutCommit = useCallback(async () => {
    const id = layoutActiveIdRef.current;
    if (!id) return;
    await updateLayoutPreset(id, { saveCurrent: true });
    await loadPresets();
  }, [loadPresets]);

  const handleSetDevicesPower = useCallback(async (ids: string[], on: boolean) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    pushLayoutRef.current?.({
      layouts: devicesToLayouts(devicesRef.current),
      power: devicesToPower(devicesRef.current),
      activeId: layoutActiveIdRef.current,
      powerIds: ids,
    });
    setDevices(prev => prev.map(d => idSet.has(d.id) ? { ...d, ledsOn: on } : d));
    await Promise.all(ids.map(id => setLightingDevicePower(id, on).catch(() => { /* 3s poll reconciles */ })));
    const presetId = layoutActiveIdRef.current;
    if (presetId) { await updateLayoutPreset(presetId, { saveCurrent: true }); await loadPresets(); }
  }, [loadPresets]);

  const handleModeChange = useCallback(async (m: LightingMode) => {
    setMode(m);
    // Starting any mode is never paused - reset optimistically so a stale
    // "paused" trailing glyph can't flash on the newly active tab while the
    // server confirms (paused doesn't carry across a mode switch).
    setPausedState(false);
    // Set rawSync optimistically so content renders the new mode immediately
    // without waiting for the publishControlSync round-trip.
    if (m !== 'animate') setRawSync(m);
    try {
      switch (m) {
        case 'animate': {
          const key = ANIMATE_EFFECTS.some(e => e.key === activeEffect)
            ? activeEffect
            : (ANIMATE_EFFECTS.some(e => e.key === rawSync) ? rawSync : animateEffectRef.current);
          setActiveEffect(key);
          setRawSync(key);
          const state = stateFor(key);
          await startAnimate(key, state.speed, state.intensity, state.hue, state.colorize, state.saturation, state.contrast, state.params);
          publishControlSync({ domain: 'lighting', mode: m, rawSync: key, effect: key });
          break;
        }
        case 'static': {
          const key = isStaticEffect(activeEffect) ? activeEffect : staticEffectRef.current;
          setActiveEffect(key);
          const state = stateFor(key);
          await startStatic(key, state.intensity, state.hue, state.colorize, state.saturation, state.contrast, state.params);
          publishControlSync({ domain: 'lighting', mode: m, rawSync: 'static', effect: key });
          break;
        }
        case 'screen':
          await startScreenMirror(screenPP.saturation, screenPP.contrast, '', screenPP.hue, screenPP.colorize);
          break;
        case 'gif': {
          const played = await playCurrentOrFirstMedia();
          if (!played) {
            // No playable media: black output while staying in Media mode, so
            // the tab stays selected instead of falling to Off.
            await mediaIdle();
          }
          break;
        }
        case 'gamesync':
          await startGameSync();
          break;
        case 'none': await stopLighting(); break;
      }
      if (m !== 'animate') {
        publishControlSync({ domain: 'lighting', mode: m, rawSync: m });
      }
    } catch { /* best-effort; backend state becomes source of truth */ }
  }, [activeEffect, rawSync, setMode, setRawSync, screenPP, stateFor, setPausedState]);

  // Pause/freeze applies to the three modes that drive a continuous output
  // (animate shader, media playback, screen mirror) - Off has nothing to
  // freeze and Game Sync is driven by the foreground game, not us.
  const modeTabs = MODES
    .filter(m => m.key !== 'gamesync' || isWindows)
    .map(m => {
      const Icon = LIGHTING_MODE_ICONS[m.key];
      const showPauseToggle = synced && m.key === effectiveMode
        && (m.key === 'animate' || m.key === 'gif' || m.key === 'screen');
      return {
        key: m.key,
        label: t(m.labelKey),
        icon: <Icon size={14} />,
        trailing: showPauseToggle ? (
          <HoverTooltip body={t(paused ? 'lighting.resume' : 'lighting.pause')} side="top">
            <span
              role="button"
              tabIndex={0}
              className={`${styles.pauseToggle} ${paused ? styles.pauseTogglePaused : ''}`}
              aria-label={t(paused ? 'lighting.resume' : 'lighting.pause')}
              onClick={e => { e.stopPropagation(); void handlePauseToggle(); }}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  void handlePauseToggle();
                }
              }}
            >
              {/* stroke="none": the glyph inherits a translucent currentColor, so a
                  same-colour stroke composites over the fill and paints a brighter
                  rim - a solid shape reads as an outline. Fill alone is uniform. */}
              {paused
                ? <Play size={13} fill="currentColor" stroke="none" />
                : <Pause size={13} fill="currentColor" stroke="none" />}
            </span>
          </HoverTooltip>
        ) : undefined,
      };
    });

  // Effect tab applies to animate / media / screen only; in Off and Game Sync
  // modes it renders an empty state and the tab header is disabled.
  const effectTabDisabled = effectiveMode === 'none' || effectiveMode === 'gamesync';
  const shaderMode = effectiveMode === 'animate' || effectiveMode === 'static';

  if (!serviceOnline) {
    return (
      <div className={styles.lighting}>
        <ViewHeader title={t('lighting.title')} tabs={modeTabs} activeTab={synced ? effectiveMode : undefined} onTabChange={k => handleModeChange(k as LightingMode)} tabsDisabled />
        <ServiceRequired state={connectionState} skeleton={<LightingSkeleton />} />
      </div>
    );
  }

  return (
    <div className={styles.lighting}>
      {/* ViewHeader lives in the left grid column so the device column (right)
          can rise to the very top of the page, level with the mode tabs. Capped
          at --page-max (pageBody) so the page matches every other view's width. */}
      <div className={`${styles.body} pageBody`}>
        <div className={styles.headerCell}>
          <ViewHeader
            title={t('lighting.title')}
            tabs={modeTabs}
            activeTab={synced ? effectiveMode : undefined}
            onTabChange={(k, origin) => {
              // Status-change bloom only on an actual mode switch, from the pressed tab.
              if (origin && k !== (synced ? effectiveMode : null)) emitRadialBloomFromElement(origin, k === 'none');
              void handleModeChange(k as LightingMode);
            }}
          />
        </div>
        <div className={styles.main}>
          {effectiveMode === 'gamesync' ? (
            <>
              <div className={styles.canvasArea}>
                <GameSyncActivityBlock
                  isReceiving={gameSyncState.isReceiving}
                  activeApp={gameSyncState.activeApp}
                  games={gameSyncGames}
                />
              </div>
              <div className={styles.controls}>
                <GameSyncLeftPane />
              </div>
            </>
          ) : (
            <>
              <div className={styles.canvasArea}>
                <DeviceCanvas devices={visibleDevices} canvasPixels={frames.canvasPixels} canvasW={frames.canvasW} canvasH={frames.canvasH} selectedIds={selectedDeviceIds} primaryDeviceId={primaryDeviceId} onSelectDevice={handleSelectDevice} onSetSelection={handleSetSelection} shaderEffect={shaderMode ? activeEffect : null} shaderState={shaderMode ? previewState : null} shaderPaused={paused} audioRef={audioRef} hiddenFrameIds={hiddenFrameIds} selectedDeviceLeds={selectedDeviceLeds} onOpenSettings={handleOpenSettings} onDragActiveChange={handleDragActiveChange} onBeforeLayoutSave={handleBeforeLayoutSave} onLayoutCommit={handleLayoutCommit} onSetDevicesPower={handleSetDevicesPower} gpuAvailable={serviceState.lighting?.gpuAvailable ?? true} />
                {shaderMode && activeEffect && currentState && activeRightTab === 'effect' && (
                  <>
                    {EFFECTS.find(e => e.key === activeEffect)?.audio && (
                      <HoverTooltip body={t('lighting.musicReactive')} side="left">
                        <button
                          type="button"
                          className={`${styles.musicReactiveBtn} ${musicReactive ? styles.musicReactiveBtnOn : ''}`}
                          onClick={handleMusicReactiveToggle}
                          aria-label={t('lighting.musicReactive')}
                        >
                          <Music size={14} strokeWidth={1.5} />
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
              {effectiveMode === 'animate' || effectiveMode === 'static' ? (
                <AnimateGrid effect={activeEffect} onSelect={handleEffectSelect} effects={effectiveMode === 'static' ? STATIC_EFFECTS : ANIMATE_EFFECTS} frozen={effectiveMode === 'static'} slotFor={slotForEffect} versionFor={versionForEffect} panelEffects={panelUsage.effects} gpuAvailable={serviceState.lighting?.gpuAvailable ?? true} />
              ) : (
                <div className={styles.controls}>
                  <ModeControls
                    mode={effectiveMode}
                    screenPP={screenPP}
                    onScreenPPChange={setScreenPP}
                  />
                </div>
              )}
            </>
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
                header={<GlobalBrightnessSlider serviceOnline={serviceOnline} />}
                selectedIds={selectedDeviceIds}
                onSelectDevice={handleSelectDevice}
                onSetSelection={handleSetSelection}
                onTogglePower={handleTogglePower}
                onSetPower={handleSetPower}
                onToggleControlled={handleToggleControlled}
                onSetControlled={handleSetControlled}
                lightingOff={effectiveMode === 'none'}
                onOpenSettings={handleOpenSettings}
                onDeviceReorder={(newOrder) => setDeviceOrder(newOrder)}
                communityCounts={mappingCounts}
                onOpenCommunity={handleOpenCommunity}
                smartHubFirmwareControl={smartHubFirmwareControl}
                onSetSmartHubFirmwareControl={handleSetSmartHubFirmwareControl}
                lianLiFirmwareActive={lianLiFirmwareActive}
                onOpenSmartLights={() => onSectionNavigate?.('smart-lights')}
                presets={presets}
                layoutActiveId={layoutActiveId}
                presetCount={presetCount}
                canUndo={canUndoLayout}
                canRedo={canRedoLayout}
                onPresetLoad={handlePresetLoadWithHistory}
                onPresetCreate={handlePresetCreate}
                onPresetRename={handlePresetRename}
                onPresetDelete={handlePresetDelete}
                onLayoutReset={handleResetWithHistory}
                onLayoutUndo={handleUndoLayout}
                onLayoutRedo={handleRedoLayout}
              />
              <OpenRgbButton rgbRunning={rgb.running} scanning={rgb.scanning} />
            </>
          ) : (
            <div className={styles.effectTabBody}>
              <EffectTab
                mode={effectiveMode}
                effect={activeEffect}
                state={currentState}
                bundle={activeEffect ? committedTemplates[activeEffect] ?? null : null}
                canReset={canReset}
                onTemplateSelect={handleTemplateSelect}
                onAnimateChange={handleStatePatch}
                onAnimateCommit={handleStateCommit}
                onAnimateReset={handleStateReset}
                panelSlots={panelUsage.slotsByEffect.get(activeEffect)}
                postProcess={postProcess}
                onPostProcessChange={handlePostProcessChange}
                onPostProcessCommit={handlePostProcessCommit}
                onPostProcessReset={handlePostProcessReset}
              />
            </div>
          )}
        </div>
      </div>
      {fullscreenOpen && activeEffect && currentState && committedTemplates[activeEffect] && (
        <FullscreenShader
          effect={activeEffect}
          state={currentState}
          bundle={committedTemplates[activeEffect]}
          canReset={canReset}
          audioRef={audioRef}
          onTemplateSelect={handleTemplateSelect}
          onChange={handleStatePatch}
          onCommit={handleStateCommit}
          onReset={handleStateReset}
          panelSlots={panelUsage.slotsByEffect.get(activeEffect)}
          onClose={() => setFullscreenOpen(false)}
          onPrev={handlePrevEffect}
          onNext={handleNextEffect}
          gpuAvailable={serviceState.lighting?.gpuAvailable ?? true}
          paused={paused}
        />
      )}
      {editorTarget && (
        <LedMapEditor
          key={`${editorTarget.deviceId}-${compositionEpoch}`}
          deviceId={editorTarget.deviceId}
          initialZoneId={editorTarget.zoneId}
          devices={devices}
          zoneCustomizable={editorTarget.zoneCustomizable}
          initialCommunityOpen={editorCommunityOpen}
          onClose={() => setEditorTarget(null)}
          onCompositionChanged={hubId => { void handleCompositionChanged(hubId); }}
          onNavigateToDevicePage={deviceKey => onSectionNavigate?.('device', { deviceKey })}
        />
      )}
    </div>
  );
}

interface GameSyncActivityBlockProps {
  isReceiving: boolean;
  activeApp: string | null;
  games: GameSyncGame[];
}

function GameSyncActivityBlock({ isReceiving, activeApp, games }: GameSyncActivityBlockProps) {
  const { t } = useTranslation();
  const [imgFailed, setImgFailed] = useState(false);

  const matchedGame = isReceiving && activeApp
    ? resolveActiveGame(activeApp, games)
    : null;

  const headerSrc = matchedGame ? steamArtworkUrl(matchedGame.appId, 'header') : null;

  // Reset failure flag when the URL changes so a new game's art gets a fresh attempt.
  const prevHeaderSrcRef = useRef(headerSrc);
  if (prevHeaderSrcRef.current !== headerSrc) {
    prevHeaderSrcRef.current = headerSrc;
    if (imgFailed) setImgFailed(false);
  }

  const showImage = headerSrc !== null && !imgFailed;

  return (
    <div className={styles.gameSyncActivity}>
      {showImage ? (
        <img
          src={headerSrc}
          alt=""
          aria-hidden
          className={styles.gameSyncActivityArt}
          onError={() => setImgFailed(true)}
        />
      ) : (
        <Gamepad2
          size={36}
          className={`${styles.gameSyncActivityIcon} ${isReceiving ? styles.gameSyncActivityIconActive : ''}`}
          aria-hidden
        />
      )}
      <span className={`${styles.gameSyncActivityLabel} ${showImage ? styles.gameSyncActivityLabelOverArt : ''}`}>
        {isReceiving
          ? (activeApp
              ? t('lighting.gameSync.signal.receiving', { activeApp })
              : t('lighting.gameSync.signal.receivingUnknown'))
          : t('lighting.gameSync.signal.idle')}
      </span>
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
    reactive: !!s.reactive,
    reactivity: typeof s.reactivity === 'number' ? s.reactivity : 0.5,
    intensity: typeof s.intensity === 'number' ? s.intensity : 0.5,
  };
}

