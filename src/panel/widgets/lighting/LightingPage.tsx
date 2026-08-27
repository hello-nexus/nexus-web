import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Ban, CheckCheck, Gamepad2, Lightbulb, Music, Pause, Play, PanelRightOpen, PanelRightClose } from 'lucide-react';
import {
  startAnimate, startStatic, startScreenMirror, stopLighting, startGameSync,
  fetchStaticSettings,
  fetchLightingDevices, fetchAnimateSettings, saveAnimateTemplates,
  fetchAnimateDefaults, cachedAnimateDefaults,
  fetchMusicReactive, setMusicReactive, setLightingDevicePower, setLightingDeviceControlled,
  fetchScreenEffect, setScreenEffect, fetchMediaEffect, setMediaEffect, fetchLedMap,
  fetchCurrentSync, fetchAvailableMappings, fetchGameSyncState, fetchGameSyncGames,
  fetchStaticDeviceLooks,
  steamArtworkUrl, resolveActiveGame, setLightingPaused,
  resetDeviceLayouts, applyDeviceLayouts, setActiveLayoutPreset, updateLayoutPreset,
  type LightingDevice, type LedMapEntry, type PostProcessSettings, type GameSyncDevice,
  type GameSyncGame, type DeviceLayoutDto, type PresetApp,
} from '../../../api/lighting';
import { useUndoRedo } from '../../../hooks/useUndoRedo';
import { useLayoutPresets, devicesToLayouts, devicesToPower } from './page/useLayoutPresets';
import { mediaIdle, playCurrentOrFirstMedia } from '../../../api/mediaLibrary';
import { getSmartHubFirmwareControl, setSmartHubFirmwareControl } from '../../../api/smarthub';
import { getLianLiLighting, setLianLiLighting } from '../../../api/lianli';
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
import { pluralKey } from '../../../lib/pluralKey';
import { Badge } from '../../../components/common/Badge/Badge';
import { EmptyState } from '../../../components/common/EmptyState/EmptyState';
import { HoverTooltip } from '../../../components/common/HoverTooltip/HoverTooltip';
import { ViewHeader } from '../../../components/common/ViewHeader/ViewHeader';
import { AdvancedModeCta } from '../../../components/common/AdvancedModeCta/AdvancedModeCta';
import { ModeMenu, MODE_MENU_TAB_KEY } from '../../../components/common/ModeMenu/ModeMenu';
import { usePageModeMenu } from '../../../components/common/ModeMenu/usePageModeMenu';
import { DeviceCountSummary } from '../../../components/common/DeviceCountSummary/DeviceCountSummary';
import { SimpleModeNotice } from '../../../components/common/SimpleModeNotice/SimpleModeNotice';
import { useUiSettings } from '../../../hooks/useUiSettings';
import { ServiceRequired } from '../../../components/views/ServiceRequired';
import { LightingSkeleton } from '../../../components/views/PageSkeleton/PageSkeleton';
import { DeviceCanvas } from '../../../components/common/DeviceCanvas/DeviceCanvas';
import { usePersistentState, usePersistentIdSet } from '../../../hooks/usePersistentState';
import {
  pickLookForDevices, pickPaletteForDevices, pickCustomForDevices, pushPalettePick, pushCustomPick, devicePicksFromLooks,
  DEVICE_PICKS_STORAGE_KEY, SELECTED_DEVICES_STORAGE_KEY, PRIMARY_DEVICE_STORAGE_KEY,
  type DevicePick,
} from './staticPicks';
import { usePanelBackgroundUsage } from '../../../hooks/usePanelBackgroundUsage';
import {
  EFFECTS, ANIMATE_EFFECTS, STATIC_EFFECTS, STATIC_PATTERN_EFFECTS, DEFAULT_STATIC_EFFECT, MODES,
  defaultStateFor, isStaticEffect, isStaticFill,
  type EffectState, type EffectTemplateBundle, type LightingMode,
} from '../../../types/lighting';
import {
  nearestPaletteId, paletteColor, paletteColorForKey, paletteFamilyKey, paletteIdFromKey,
  type PaletteColor,
} from '../../../types/lightingPalette';
import { defaultTemplatesFor, mergeTemplates, slotMatchesDefault, slotThumbSignature } from '../../../types/lightingTemplates';
import { AnimateGrid } from './page/AnimateGrid';
import { StaticPalette } from './page/StaticPalette';
import { FullscreenShader } from './page/FullscreenShader';
import { ModeControls } from './page/ModeControls';
import { MediaCanvasNotice } from './page/MediaCanvasNotice';
import { DevicePanel } from './page/DevicePanel';
import { type DiscoveryState } from './page/DeviceDiscoveryCard';
import { zoneCardSelectable, zoneCardUnavailable } from './page/ZoneCard';
import { Button } from '../../../components/common/Button/Button';
import { GameSyncLeftPane } from './page/GameSyncLeftPane';
import { LedMapEditor } from './page/LedMapEditor';
import { visibleCards } from './page/zoneUtils';
import { OpenRgbButton } from './page/OpenRgbButton';
import { GlobalBrightnessSlider } from './page/GlobalBrightnessSlider';
import { PresetToolbar } from '../../../components/common/PresetToolbar/PresetToolbar';
import { PresetAppsModal } from './page/PresetAppsModal';
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

/** What the effect grid and dock are pointed at - see the `scoped` memo. */
type ScopedTarget =
  | { kind: 'none' }
  | { kind: 'locked' }
  | { kind: 'pick'; key: string; slot: number; explicit: boolean; hex: string };

// Module scope so the layout undo/redo history survives LightingPage's unmount
// on navigation. Session-only; not persisted to storage. Assumes one mounted
// LightingPage - two concurrent instances would share and clobber this history.
let layoutHistoryStacks: { undo: LayoutHistorySnapshot[]; redo: LayoutHistorySnapshot[] } | null = null;
const layoutHistoryStore = {
  read: () => layoutHistoryStacks,
  write: (s: { undo: LayoutHistorySnapshot[]; redo: LayoutHistorySnapshot[] }) => { layoutHistoryStacks = s; },
};

// How long the rail keeps saying a scan is running when none was ever reported.
const DISCOVERY_GRACE_MS = 4000;

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
  const { t, language } = useTranslation();
  const { mode, setMode, rawSync, setRawSync, synced, paused: syncedPaused } = useLightingSync(serviceOnline, activeProfileId);
  // Game Sync requires the Windows Chroma capture shim; hide it on non-Windows
  // (empty platform = ping not yet resolved, keep hidden to avoid a flash).
  const isWindows = platform === 'windows';
  const effectiveMode: LightingMode = (mode === 'gamesync' && !isWindows) ? 'none' : mode;
  // Off and Static are the per-device modes: a flat colour can be scoped to a
  // subset of devices. Every other mode renders one shared canvas across all of
  // them, so the device list drops its selection affordance there and keeps
  // only the per-device power / controlled toggles.
  const perDeviceMode = effectiveMode === 'static' || effectiveMode === 'none';
  const { settings: uiSettings, update: updateUiSettings } = useUiSettings();
  const simpleDashboard = uiSettings.lightingDashboardMode === 'simple';
  // Off / simple / advanced live behind the first tab (see modeTabs). The
  // popover anchors on the tab row, which is why the ref sits on the element
  // wrapping the header rather than on the tab itself.
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const modeMenuAnchorRef = useRef<HTMLDivElement | null>(null);
  const closeModeMenu = useCallback(() => setModeMenuOpen(false), []);
  const setDashboardMode = useCallback((next: 'simple' | 'advanced') => {
    updateUiSettings({ lightingDashboardMode: next });
  }, [updateUiSettings]);
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
  const [selectedDeviceIds, setSelectedDeviceIds] = usePersistentIdSet(SELECTED_DEVICES_STORAGE_KEY);
  const [primaryDeviceId, setPrimaryDeviceId] = usePersistentState<string | null>(PRIMARY_DEVICE_STORAGE_KEY, null);
  const handleSelectDevice = useCallback((id: string | null) => {
    setSelectedDeviceIds(id ? new Set([id]) : new Set());
    setPrimaryDeviceId(id);
  }, [setPrimaryDeviceId, setSelectedDeviceIds]);
  const handleSetSelection = useCallback((ids: Set<string>, primary: string | null) => {
    setSelectedDeviceIds(ids);
    setPrimaryDeviceId(primary);
  }, [setPrimaryDeviceId, setSelectedDeviceIds]);
  const handleBeforeLayoutSave = useCallback(() => {
    pushLayoutRef.current?.({ layouts: devicesToLayouts(devicesRef.current), power: devicesToPower(devicesRef.current), activeId: layoutActiveIdRef.current, powerIds: [] });
  }, []);

  const [smartHubFirmwareControl, setSmartHubFirmwareControlState] = useState(false);
  const [lianLiMode, setLianLiMode] = useState<string | null>(null);
  // true when the hub's active lighting mode is not 'custom' (firmware animation overrides per-LED engine).
  const lianLiFirmwareActive = lianLiMode !== null && lianLiMode !== 'custom';

  // Hands the hub's LEDs back to the engine. Optimistic like the SmartHub
  // toggle above: the card state flips immediately and reverts if the PUT
  // fails, since nothing else re-reads the mode until a refetch.
  const handleLianLiTakeControl = useCallback(async () => {
    const previous = lianLiMode;
    setLianLiMode('custom');
    try {
      await setLianLiLighting({ mode: 'custom' });
    } catch {
      setLianLiMode(previous);
    }
  }, [lianLiMode]);

  const handleSetSmartHubFirmwareControl = useCallback(async (enabled: boolean) => {
    setSmartHubFirmwareControlState(enabled);
    try {
      await setSmartHubFirmwareControl(enabled);
    } catch {
      setSmartHubFirmwareControlState(!enabled);
    }
  }, []);

  // Per-device static pick, keyed by device id. Kept out of the device records
  // so a topic refetch cannot clobber a just-applied pick. A pick is (effect,
  // preset slot): the slot is captured when the pick is made, never read back
  // from the effect's shared pointer, or repointing one device would drag every
  // other device on that effect to the same preset.
  const [devicePicks, setDevicePicks] = usePersistentState<Record<string, DevicePick>>(
    DEVICE_PICKS_STORAGE_KEY, {},
  );
  // Collapsing the effect dock hands its space to the canvas and the browser.
  // The preset toolbar keeps its width either way - it lives in row 1, which
  // sizes itself.
  const [dockCollapsed, setDockCollapsed] = usePersistentState('nexus.lighting.effectDockCollapsed', true);
  const [paletteOpen, setPaletteOpen] = useState(true);
  const [customStaticColor, setCustomStaticColor] = usePersistentState('nexus.lighting.customColor', '');

  const [activeEffect, setActiveEffect] = useState<string>('');
  // Read inside applyAnimate, which several handlers share: static and animate
  // drive the same template state through different start endpoints.
  const modeRef = useRef(mode);
  modeRef.current = mode;
  // Static keeps its own last-selected key, so switching modes returns to what
  // each one was showing rather than carrying the other's effect across.
  const staticEffectRef = useRef<string>(DEFAULT_STATIC_EFFECT);
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
  // Canvas hides the frame for any device whose LEDs are off. The device
  // list is always mounted now, so there is no tab state to hide it behind.
  // Cards whose LEDs are all user-disabled disappear from the listing and
  // the canvas, but a device always keeps at least one card visible: a
  // fully parked device shows one card with its zero-enabled badge so it
  // stays selectable and its LED map editor remains reachable.
  const visibleDevices = useMemo(() => visibleCards(devices), [devices]);
  const hiddenFrameIds = useMemo(() => {
    const set = new Set<string>();
    for (const d of visibleDevices) if (!d.ledsOn) set.add(d.id);
    return set;
  }, [visibleDevices]);

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


  // Screen + Media share an identical post-process shape (hue, colorize,
  // saturation, contrast). Each mode has its own persisted snapshot; the
  // tab writes to whichever is active.
  const [screenPP, setScreenPP] = useState<PostProcessState>(DEFAULT_POST_PROCESS);
  const [mediaPP, setMediaPP] = useState<PostProcessState>(DEFAULT_POST_PROCESS);
  const postProcess = mode === 'screen' ? screenPP : mediaPP;

  const stateOf = useCallback((key: string, slot: number): EffectState => {
    const bundle = effectTemplates[key];
    if (!bundle || !bundle.slots || bundle.slots.length === 0) return defaultStateFor(key);
    const idx = Math.min(Math.max(slot, 0), bundle.slots.length - 1);
    return bundle.slots[idx];
  }, [effectTemplates]);
  const slotOf = useCallback((key: string) => effectTemplates[key]?.selected ?? 0, [effectTemplates]);
  const stateFor = useCallback(
    (key: string): EffectState => stateOf(key, slotOf(key)),
    [slotOf, stateOf],
  );
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

  // A static effect picked while devices are selected paints only those
  // devices. The pick records the slot it was made against, so a later
  // repoint of some other device leaves this one alone.
  const writeDevicePicks = useCallback((key: string, slot: number, ids: string[], push: boolean) => {
    const st = stateOf(key, slot);
    setDevicePicks(prev => pickLookForDevices(prev, key, slot, st, ids, push));
  }, [setDevicePicks, stateOf]);

  const applyDeviceColor = useCallback(
    (key: string, ids: string[]) => writeDevicePicks(key, slotOf(key), ids, true),
    [slotOf, writeDevicePicks],
  );

  // A palette pick is a colour and nothing else, so it travels as one and the
  // service paints it with no shader, no preset and no params.
  const writePalettePick = useCallback((color: PaletteColor, ids: string[]) => {
    setDevicePicks(prev => pickPaletteForDevices(prev, color, ids));
  }, [setDevicePicks]);

  // The service owns the assignments, so its copy wins over the local record:
  // a preset activate, a profile switch and a browser that has never seen this
  // machine all leave the local one stale.
  // Resolves once the legacy-flat migration's pushes have landed, so the read
  // below cannot observe pre-migration state and write it back.
  const migrationPushRef = useRef<Promise<unknown>>(Promise.resolve());
  const syncDevicePicks = useCallback(async () => {
    await migrationPushRef.current;
    // A service predating this route answers the SPA index with 200, so the
    // JSON parse throws rather than returning null.
    const res = await fetchStaticDeviceLooks().catch(() => null);
    if (!res?.looks) return;
    setDevicePicks(devicePicksFromLooks(res.looks));
  }, [setDevicePicks]);

  // A pick predating the palette names a flat EFFECT key. Repoint it at the
  // swatch nearest the colour it stored, and push so the LEDs match the card.
  const palettesMigratedRef = useRef(false);
  useEffect(() => {
    if (palettesMigratedRef.current) return;
    palettesMigratedRef.current = true;
    const pushes: Promise<unknown>[] = [];
    for (const [id, pick] of Object.entries(devicePicks)) {
      if (!isStaticFill(pick.key)) continue;
      const color = paletteColor(nearestPaletteId(pick.hex));
      if (!color) continue;
      writePalettePick(color, [id]);
      pushes.push(pushPalettePick(color, [id]));
    }
    migrationPushRef.current = Promise.all(pushes);
    // Once, against what storage restored; later picks are already palette picks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleEffectSelect = useCallback((key: string) => {
    // Scoped pick: the running effect is untouched, only the selected devices
    // take the colour.
    if (perDeviceMode && selectedDeviceIds.size > 0 && isStaticEffect(key)) {
      applyDeviceColor(key, [...selectedDeviceIds]);
      return;
    }
    // Static assigns per device and nothing else. With no selection there is
    // nothing to assign, so browsing the grid moves the editor and the preview
    // only - restarting the shared effect here would repaint every device that
    // has no assignment of its own, which is not what "nothing is selected"
    // should mean.
    if (effectiveMode === 'static') {
      setActiveEffect(key);
      staticEffectRef.current = key;
      return;
    }
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
  }, [activeEffect, applyAnimate, applyDeviceColor, effectiveMode, perDeviceMode, selectedDeviceIds, stateFor]);

  // A colour has nothing to browse into, so with no selection the swatch is
  // inert - the effect grid's rule, minus the editor move it still has to do.
  const handlePaletteSelect = useCallback((color: PaletteColor) => {
    if (!perDeviceMode || selectedDeviceIds.size === 0) return;
    writePalettePick(color, [...selectedDeviceIds]);
  }, [perDeviceMode, selectedDeviceIds, writePalettePick]);

  // Custom-colour writes: one in flight, newest wins. Paced by the write
  // landing rather than a timer, so a slow write drops the frames it outran
  // instead of queueing them behind the pointer. The queued entry carries its
  // own target ids - the selection can change before the chain drains.
  const customWrite = useRef<{ inFlight: boolean; queued: { hex: string; ids: string[] } | null }>(
    { inFlight: false, queued: null },
  );
  // Ref-held so the .finally re-entry keeps one stable identity, as
  // useSystemVolume's pump does.
  const pumpCustomRef = useRef<() => void>(() => {});
  const pumpCustom = useCallback(() => {
    const write = customWrite.current;
    if (write.inFlight || !write.queued) return;
    const { hex, ids } = write.queued;
    write.queued = null;
    write.inFlight = true;
    pushCustomPick(hex, ids).finally(() => {
      write.inFlight = false;
      pumpCustomRef.current();
    });
  }, []);
  pumpCustomRef.current = pumpCustom;

  const queueCustomWrite = useCallback((hex: string, ids: string[]) => {
    customWrite.current.queued = { hex, ids };
    pumpCustom();
  }, [pumpCustom]);

  const handleCustomSelect = useCallback((hex: string) => {
    setCustomStaticColor(hex);
    if (!perDeviceMode || selectedDeviceIds.size === 0) return;
    const ids = [...selectedDeviceIds];
    // Record without pushing and queue the write, so the commit cannot race a
    // preview still in flight and leave the hardware on the older colour.
    setDevicePicks(prev => pickCustomForDevices(prev, hex, ids, false));
    queueCustomWrite(hex, ids);
  }, [perDeviceMode, queueCustomWrite, selectedDeviceIds, setCustomStaticColor, setDevicePicks]);

  const handleCustomPreview = useCallback((hex: string) => {
    if (!perDeviceMode || selectedDeviceIds.size === 0) return;
    queueCustomWrite(hex, [...selectedDeviceIds]);
  }, [perDeviceMode, queueCustomWrite, selectedDeviceIds]);

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

  // What the effect grid and the dock are pointed at. With devices selected in
  // a per-device mode, that is the look those devices share - identity is
  // (effect, slot), so the same effect on two different presets counts as a
  // disagreement. 'locked' also covers a selection with no pick yet: there is
  // nothing scoped to edit, and the dock must not silently edit the global one.
  const scoped: ScopedTarget = useMemo(() => {
    if (!perDeviceMode || selectedDeviceIds.size === 0) return { kind: 'none' };
    let first: DevicePick | undefined;
    let explicit = false;
    let sig: string | null = null;
    for (const id of selectedDeviceIds) {
      // No pick means the device is simply wearing the running effect - that
      // IS its look, so it resolves rather than reading as "nothing chosen".
      const pick = devicePicks[id];
      const key = pick?.key ?? activeEffect;
      const slot = pick?.slot ?? slotOf(activeEffect);
      const s = `${key}#${slot}`;
      if (sig === null) {
        sig = s;
        first = { key, slot, hex: pick?.hex ?? '' };
        explicit = !!pick;
      } else if (sig !== s) return { kind: 'locked' };
    }
    if (!first || !first.key) return { kind: 'locked' };
    return { kind: 'pick', key: first.key, slot: first.slot, explicit, hex: first.hex };
  }, [activeEffect, devicePicks, perDeviceMode, selectedDeviceIds, slotOf]);

  // The dock always edits a single (effect, slot). Scoped, that is the
  // selection's own preset; otherwise the running effect's selected one.
  const dockEffect = scoped.kind === 'pick' ? scoped.key : activeEffect;
  const dockSlot = scoped.kind === 'pick' ? scoped.slot : slotOf(activeEffect);
  const dockState: EffectState | null = dockEffect ? stateOf(dockEffect, dockSlot) : null;
  // The slot strip highlights what the dock edits, so a scoped bundle carries
  // the selection's slot rather than the effect's shared pointer.
  const dockBundle: EffectTemplateBundle | null = dockEffect
    ? (committedTemplates[dockEffect] ? { ...committedTemplates[dockEffect], selected: dockSlot } : null)
    : null;
  // A palette pick is a colour: the dock shows which one, and there is nothing
  // to edit or reset.
  const dockPalette = paletteColorForKey(dockEffect);
  const dockCanReset = !!(dockEffect && dockState && !dockPalette
    && !slotMatchesDefault(dockEffect, dockSlot, dockState, animateDefaults));

  const handleTemplateSelect = useCallback((idx: number) => {
    // Scoped: repoint only the selected devices at this preset. The effect's
    // shared pointer stays put, so every other device wearing this effect keeps
    // the preset it was assigned.
    if (scoped.kind === 'pick') {
      if (idx === scoped.slot) return;
      const bundle = effectTemplates[scoped.key];
      const clampedIdx = bundle ? Math.min(Math.max(idx, 0), bundle.slots.length - 1) : idx;
      writeDevicePicks(scoped.key, clampedIdx, [...selectedDeviceIds], true);
      return;
    }
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
  }, [activeEffect, effectTemplates, scoped, selectedDeviceIds, writeDevicePicks, writeTemplates]);

  const handleStatePatch = useCallback((patch: Partial<EffectState>, commit = false) => {
    if (!dockEffect || !dockState) return;
    localAnimateEditUntilRef.current = Date.now() + 1500;
    const bundle = effectTemplates[dockEffect];
    if (!bundle) return;
    const idx = Math.min(Math.max(dockSlot, 0), bundle.slots.length - 1);
    const nextSlot: EffectState = { ...dockState, ...patch };
    const nextSlots = bundle.slots.slice();
    nextSlots[idx] = nextSlot;
    const nextBundle: EffectTemplateBundle = { ...bundle, slots: nextSlots };
    // A preset is shared by every device that references it, so the edit lands
    // in the slot either way. What scoping changes is the side effects: a
    // scoped edit must not restart the global effect or announce itself to the
    // other surfaces as a change of what is running.
    const scopedEdit = scoped.kind === 'pick' && scoped.explicit;
    writeTemplates(
      { ...effectTemplates, [dockEffect]: nextBundle },
      scopedEdit ? null : dockEffect,
      commit,
    );
    if (scopedEdit) {
      writeDevicePicks(dockEffect, idx, [...selectedDeviceIds], commit);
      return;
    }
    publishControlSync({
      domain: 'lighting',
      // Static edits must not announce themselves as animate: subscribers
      // classify on rawSync, so a pattern key here flips every surface into
      // Animation mid-interaction.
      mode: modeRef.current === 'static' ? 'static' : 'animate',
      rawSync: modeRef.current === 'static' ? 'static' : dockEffect,
      effect: dockEffect,
      templateIndex: idx,
      effectState: nextSlot,
    });
  }, [dockEffect, dockSlot, dockState, effectTemplates, scoped, selectedDeviceIds, writeDevicePicks, writeTemplates]);

  const handleStateCommit = useCallback(() => {
    if (!dockEffect) return;
    const freshTemplates = effectTemplatesRef.current;
    const bundle = freshTemplates[dockEffect];
    if (!bundle) return;
    const idx = Math.min(Math.max(dockSlot, 0), bundle.slots.length - 1);
    const latest = bundle.slots[idx];
    if (!latest) return;
    // Advance the committed snapshot only after the save lands, so the thumbnail
    // refetch can't race ahead of the persisted look.
    saveAnimateTemplates(freshTemplates)
      .then(() => setCommittedTemplates(freshTemplates))
      .catch(() => { /* best-effort */ });
    // Scoped, the edit belongs to the selection's preset, not to whatever is
    // running on the canvas - restarting the global effect here would swap it
    // out from under every unselected device.
    if (scoped.kind === 'pick' && scoped.explicit) {
      writeDevicePicks(dockEffect, idx, [...selectedDeviceIds], true);
      return;
    }
    applyAnimate(dockEffect, latest, true);
  }, [applyAnimate, dockEffect, dockSlot, scoped, selectedDeviceIds, writeDevicePicks]);

  const handleStateReset = useCallback(() => {
    if (!dockEffect) return;
    const defaults = defaultTemplatesFor(dockEffect, animateDefaults);
    const bundle = effectTemplates[dockEffect];
    if (!bundle) return;
    const idx = Math.min(Math.max(dockSlot, 0), bundle.slots.length - 1);
    const nextSlots = bundle.slots.slice();
    nextSlots[idx] = defaults.slots[idx];
    const nextBundle: EffectTemplateBundle = { ...bundle, slots: nextSlots };
    const nextTemplates = { ...effectTemplates, [dockEffect]: nextBundle };
    const scopedEdit = scoped.kind === 'pick' && scoped.explicit;
    writeTemplates(nextTemplates, scopedEdit ? null : dockEffect, true)
      .then(() => {
        setCommittedTemplates(nextTemplates);
        if (scopedEdit) writeDevicePicks(dockEffect, idx, [...selectedDeviceIds], true);
      });
  }, [animateDefaults, dockEffect, dockSlot, effectTemplates, scoped, selectedDeviceIds, writeDevicePicks, writeTemplates]);

  // Cross-panel usage drives the "used by a panel" badge. No exclusion: the
  // desktop page isn't a panel, so every panel background counts.
  const panelUsage = usePanelBackgroundUsage();

  // Grid cell = this surface's selected slot + its content hash, both from the
  // committed snapshot so thumbnails track commits, not drag frames.
  const slotForEffect = useCallback((e: string) => committedTemplates[e]?.selected ?? 0, [committedTemplates]);
  const versionForSlot = useCallback((e: string, slot: number) => {
    const b = committedTemplates[e];
    if (!b || b.slots.length === 0) return '0';
    return slotThumbSignature(b.slots[Math.min(Math.max(slot, 0), b.slots.length - 1)]);
  }, [committedTemplates]);
  // The grid highlights what the selection wears, so the highlighted tile has
  // to depict that device's preset - not the effect's shared pointer, which is
  // some other device's business.
  const gridSlotFor = useCallback(
    (e: string) => (scoped.kind === 'pick' && e === scoped.key ? scoped.slot : slotForEffect(e)),
    [scoped, slotForEffect],
  );
  const gridVersionFor = useCallback(
    (e: string) => versionForSlot(e, gridSlotFor(e)),
    [gridSlotFor, versionForSlot],
  );

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

  // Cards that can carry a selection; a zone the service could not drive, or
  // one with Nexus Control off, is excluded - matching what ZoneCard renders
  // as non-interactive.
  const selectableIds = useMemo(
    () => orderedDevices.filter(zoneCardSelectable).map(d => d.id),
    [orderedDevices],
  );


  // Off shuts the OpenRGB subprocess down, so the rail can be short for a
  // reason the list itself cannot show. The tail card says so while off, then
  // reports the scan that turning a mode on kicks off, then goes away.
  const [leftOff, setLeftOff] = useState(false);
  // Null until the sync resolves: the mode reads 'none' while hydrating, and
  // treating that as the user turning lighting on flashed the card on load.
  const wasOffRef = useRef<boolean | null>(null);
  const sawScanRef = useRef(false);
  useEffect(() => {
    if (!synced) return;
    const off = effectiveMode === 'none';
    if (wasOffRef.current === null) { wasOffRef.current = off; return; }
    if (off) { wasOffRef.current = true; sawScanRef.current = false; setLeftOff(false); return; }
    if (wasOffRef.current) { wasOffRef.current = false; sawScanRef.current = false; setLeftOff(true); }
  }, [effectiveMode, synced]);
  useEffect(() => {
    if (!leftOff) return undefined;
    if (rgb.scanning) { sawScanRef.current = true; return undefined; }
    // The scan we were reporting has ended.
    if (sawScanRef.current) { setLeftOff(false); return undefined; }
    // No scan was reported at all - a box with no OpenRGB never starts one, so
    // give up rather than leave the card claiming a scan forever. This bounds
    // a display state; nothing waits on it.
    const timer = setTimeout(() => setLeftOff(false), DISCOVERY_GRACE_MS);
    return () => clearTimeout(timer);
  }, [leftOff, rgb.scanning]);
  const discovery: DiscoveryState | undefined = effectiveMode === 'none'
    ? 'off'
    : (leftOff ? 'detecting' : undefined);

  // Nothing chosen yet means every device, not none: a first visit should be
  // able to pick a colour straight away. Stored separately from the selection
  // itself, because deselecting everything is a choice the page must keep.
  const [selectionSeeded, setSelectionSeeded] = usePersistentState('nexus.lighting.selectionSeeded', false);
  useEffect(() => {
    if (selectionSeeded || selectableIds.length === 0) return;
    setSelectionSeeded(true);
    setSelectedDeviceIds(new Set(selectableIds));
    setPrimaryDeviceId(selectableIds[0] ?? null);
  }, [selectionSeeded, selectableIds, setSelectionSeeded, setSelectedDeviceIds, setPrimaryDeviceId]);

  // A restored selection can name devices that are gone (unplugged between
  // visits) or that stopped being selectable (Nexus Control switched off).
  // Drop those once the list has loaded, or the preview count and the
  // scoped-look checks count devices no pick can reach.
  useEffect(() => {
    if (orderedDevices.length === 0) return;
    const keep = new Set(selectableIds);
    setSelectedDeviceIds(prev => {
      if ([...prev].every(id => keep.has(id))) return prev;
      return new Set([...prev].filter(id => keep.has(id)));
    });
    setPrimaryDeviceId(prev => (prev && !keep.has(prev) ? null : prev));
  }, [orderedDevices, selectableIds, setSelectedDeviceIds, setPrimaryDeviceId]);

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
    void syncDevicePicks();
  }, [serviceOnline, activeProfileId, refreshDevices, syncDevicePicks]);

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
    handleSetApps: handlePresetSetApps,
  } = useLayoutPresets(serviceOnline, activeProfileId);

  // Snapshot of the preset the app-binding modal was opened for. The service
  // can activate a different preset while it is open (a bound app taking
  // focus), which would otherwise retarget the save.
  const [presetAppsTarget, setPresetAppsTarget] = useState<{ id: string; name: string; apps: PresetApp[] } | null>(null);
  // Apps other presets already trigger, keyed by id and by resolved process
  // name so the same app picked two ways is recognised as one.
  const takenApps = useMemo(() => {
    const out: Record<string, string> = {};
    for (const preset of presets) {
      if (preset.id === presetAppsTarget?.id) continue;
      for (const app of preset.apps ?? []) {
        out[app.id] = preset.name;
        if (app.processName) out[app.processName] = preset.name;
      }
    }
    return out;
  }, [presets, presetAppsTarget?.id]);

  const presetOptions = useMemo(
    () => presets.map(p => ({ id: p.id, name: p.name, hasApps: (p.apps?.length ?? 0) > 0 })),
    [presets],
  );

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
      await updateLayoutPreset(restored.activeId, { saveCurrent: true, saveDeviceLooks: false });
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
      await updateLayoutPreset(restored.activeId, { saveCurrent: true, saveDeviceLooks: false });
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
    enabled: editorTarget === null,
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
    await syncDevicePicks();
  }, [pushLayout, handlePresetLoad, refreshDevices, syncDevicePicks]);

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

  // Simple mode has no device rail, so a colour paints every device at once.
  // Static has to own the output before the picks land - starting it after
  // would repaint them with the shared effect.
  const handleSimplePaletteSelect = useCallback(async (color: PaletteColor, targets?: string[]) => {
    if (effectiveMode !== 'static') await handleModeChange('static');
    const ids = targets ?? selectableIds;
    if (ids.length > 0) writePalettePick(color, ids);
  }, [effectiveMode, handleModeChange, selectableIds, writePalettePick]);

  // Simple mode has no per-device toggle, so a device left un-driven or dark on
  // the advanced page would sit black here with nothing on the page saying why.
  // Claimed when the user asks for something, not on arrival: switching the
  // view is not a decision about which devices Nexus drives.
  const claimAllDevices = useCallback((): string[] => {
    for (const d of devices) {
      if (d.controlled === false) handleSetControlled(d.id, true);
      if (!d.ledsOn) handleSetPower(d.id, true);
    }
    return orderedDevices.filter(d => !zoneCardUnavailable(d)).map(d => d.id);
  }, [devices, orderedDevices, handleSetControlled, handleSetPower]);

  // Counted over the devices the claim can actually reach. A zone with no LEDs
  // cannot be lit, so including it would leave the ratio permanently short of
  // its total and pin the claim button on screen with nothing left to do.
  const claimableDevices = useMemo(
    () => orderedDevices.filter(d => !zoneCardUnavailable(d)),
    [orderedDevices],
  );
  // Matches zoneCardSelectable: a device Nexus drives AND that is lit. Counting
  // only `controlled` would claim a dark device is being driven.
  const controlledCount = useMemo(
    () => claimableDevices.filter(d => d.controlled !== false && d.ledsOn).length,
    [claimableDevices],
  );

  // The swatch simple mode marks active: the colour every device is wearing.
  // A mixed set (or a device with no pick, which wears the shared effect) has
  // no single answer, so nothing reads as active.
  const simplePaletteId = useMemo(() => {
    if (effectiveMode !== 'static' || selectableIds.length === 0) return null;
    let shared: string | null = null;
    for (const deviceId of selectableIds) {
      const pick = devicePicks[deviceId];
      const colorId = pick ? paletteIdFromKey(pick.key) : null;
      if (!colorId) return null;
      if (shared === null) shared = colorId;
      else if (shared !== colorId) return null;
    }
    return shared;
  }, [devicePicks, effectiveMode, selectableIds]);

  // The simple page can only show Off or one palette swatch; anything else
  // leaves nothing marked active. `synced` gates it: an unsynced mode is a guess.
  const simpleCustomActive = synced && effectiveMode !== 'none'
    && selectableIds.length > 0 && simplePaletteId === null;

  // Pause/freeze applies to the three modes that drive a continuous output
  // (animate shader, media playback, screen mirror) - Off has nothing to
  // freeze and Game Sync is driven by the foreground game, not us.
  // Off is not a tab any more: it shares the first tab with the simple /
  // advanced swap, which the tab opens as a menu instead of switching mode.
  const modeMenu = usePageModeMenu({
    mode: simpleDashboard ? 'simple' : 'advanced',
    off: synced && effectiveMode === 'none',
    offIcon: LIGHTING_MODE_ICONS.none,
    offLabel: t('lighting.mode.off'),
    offDescription: t('lighting.modeMenu.offDesc'),
    simpleDescription: t('lighting.modeMenu.simpleDesc'),
    advancedDescription: t('lighting.modeMenu.advancedDesc'),
    // Simple mode never shows the device list, so Off claims what it can reach
    // first - the same claim the palette runs, so the page's counts agree.
    onOff: origin => {
      // Already off: asking again would re-run the claim and re-issue the stop.
      if (synced && effectiveMode === 'none') return;
      emitRadialBloomFromElement(origin, true);
      if (simpleDashboard) claimAllDevices();
      void handleModeChange('none');
    },
    onModeChange: setDashboardMode,
  });
  const modeMenuTab = {
    key: MODE_MENU_TAB_KEY,
    label: modeMenu.triggerLabel,
    ariaLabel: modeMenu.triggerAriaLabel,
    icon: modeMenu.triggerIcon,
    chip: true,
    expanded: modeMenuOpen,
  };
  const modeTabs = [modeMenuTab, ...MODES
    .filter(m => m.key !== 'none')
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
    })];
  // The strip marks the mode tab while lighting is off - it is the tab Off now
  // lives on. Every other mode still marks its own tab.
  const activeTabKey = !synced ? undefined
    : (effectiveMode === 'none' ? MODE_MENU_TAB_KEY : effectiveMode);
  // A tab press either opens the mode menu or switches mode; a mode switch
  // also drops the menu, which the tab row keeps "inside" its anchor.
  const handleTabChange = (key: string, origin?: HTMLButtonElement) => {
    if (key === MODE_MENU_TAB_KEY) {
      setModeMenuOpen(open => !open);
      return;
    }
    closeModeMenu();
    if (origin && key !== activeTabKey) emitRadialBloomFromElement(origin, false);
    void handleModeChange(key as LightingMode);
  };

  const shaderMode = effectiveMode === 'animate' || effectiveMode === 'static';
  // The preview stands for the selection in every mode: the modes that drive
  // every device still only draw the ones the selection highlights, so the
  // badge reads the same here as it does on Static.
  const previewBadgeLabel = selectedDeviceIds.size === 0
    ? t('lighting.pane.selectedNone')
    : t(pluralKey('lighting.pane.selectedCount', language, selectedDeviceIds.size), { count: selectedDeviceIds.size });
  // A colour picked with nothing selected has nowhere to land, so the browser
  // stops taking input until a device is chosen.
  const staticNeedsSelection = effectiveMode === 'static' && selectedDeviceIds.size === 0;
  const gridEffect = scoped.kind === 'pick' ? scoped.key : (scoped.kind === 'locked' ? '' : activeEffect);
  // The palette highlights the selection's colour; an effect pick highlights a
  // tile instead, so only one of the two ever reads as active.
  // devicePicksFromLooks snaps ANY flat colour to its nearest palette id, so the
  // key alone cannot tell a palette pick from a custom one - only the hex can.
  const scopedHex = scoped.kind === 'pick' ? scoped.hex : '';
  const scopedRawPaletteId = scoped.kind === 'pick' ? paletteIdFromKey(scoped.key) : null;
  const scopedCustom = !!scopedRawPaletteId && !!scopedHex
    && paletteColor(scopedRawPaletteId)?.hex.toLowerCase() !== scopedHex.toLowerCase();
  const scopedPaletteId = scopedCustom ? null : scopedRawPaletteId;
  // Selected devices wearing different looks have no single value for the
  // controls to edit, so the dock locks until the selection agrees.
  const mixedSelection = scoped.kind === 'locked';
  const allSelected = selectableIds.length > 0 && selectableIds.every(id => selectedDeviceIds.has(id));
  // The canvas previews the shared effect canvas, which Static does not sample
  // and Off has nothing to show on. Game Sync substitutes its own activity block.
  const showCanvas = effectiveMode !== 'static' && effectiveMode !== 'none' && effectiveMode !== 'gamesync';
  // The modes that reach every device lock their cards' checkmark on, so the
  // highlight is the only per-device signal left - the canvas draws exactly
  // the devices it highlights.
  const canvasDevices = useMemo(
    () => visibleDevices.filter(d => selectedDeviceIds.has(d.id)),
    [visibleDevices, selectedDeviceIds],
  );

  const simpleOff = synced && effectiveMode === 'none';
  // The mode tab leads the strip in both dashboard modes; simple mode carries
  // nothing after it, so its header is the mode tab alone.
  const simpleTabs = [modeMenuTab];
  const modeMenuNode = (
    <ModeMenu
      open={modeMenuOpen}
      onClose={closeModeMenu}
      anchorRef={modeMenuAnchorRef}
      entries={modeMenu.entries}
      ariaLabel={t('uiMode.menuLabel')}
    />
  );

  if (!serviceOnline) {
    return (
      <div className={styles.lighting}>
        <div className={styles.tabsAnchor} ref={modeMenuAnchorRef}>
          <ViewHeader
            title={t('lighting.title')}
            tabs={simpleDashboard ? simpleTabs : modeTabs}
            activeTab={activeTabKey}
            onTabChange={handleTabChange}
            tabsDisabled
          />
        </div>
        <ServiceRequired state={connectionState} skeleton={<LightingSkeleton />} />
      </div>
    );
  }

  // Simple mode: one colour everywhere, or off, plus the advanced-mode path.
  // No mode tabs, preset toolbar, device rail, canvas or dock - those are the
  // advanced page below, and so are the patterns (gradients, two-tone,
  // spectrum), which are looks rather than colours.
  if (simpleDashboard) {
    return (
      <div className={styles.lighting}>
        <div className={`${styles.simpleBody} pageBodyFill`}>
          <div className={styles.tabsAnchor} ref={modeMenuAnchorRef}>
            <ViewHeader
              title={t('lighting.title')}
              tabs={simpleTabs}
              activeTab={activeTabKey}
              onTabChange={handleTabChange}
              /* Off states what it did; every other mode carries both counts,
                 so a device the advanced page left un-driven is visible here
                 without a device list. Same line either way. The action runs
                 the same claim the palette does - controlledCount also
                 requires the lights to be on, so setting `controlled` alone
                 would leave the count short and the button stuck on screen. */
              tabsAdjacent={(
                <DeviceCountSummary
                  detected={simpleOff
                    ? t('lighting.off.message')
                    : t(pluralKey('lighting.simple.controlledOf', language, claimableDevices.length), {
                      controlled: controlledCount,
                      total: claimableDevices.length,
                    })}
                  action={!simpleOff && controlledCount < claimableDevices.length ? (
                    <Button size="sm" pill onClick={() => { claimAllDevices(); }}>
                      {t('lighting.simple.controlAll')}
                    </Button>
                  ) : undefined}
                />
              )}
            />
            {modeMenuNode}
          </div>
          <StaticPalette
            hero
            selectedId={simplePaletteId}
            onSelect={color => { void handleSimplePaletteSelect(color, claimAllDevices()); }}
          />
          {simpleCustomActive && (
            <SimpleModeNotice message={t('lighting.simple.customActive')} />
          )}
          <div className={styles.simpleFooter}>
            <AdvancedModeCta
              label={t('lighting.simple.advancedCta')}
              onPress={() => setDashboardMode('advanced')}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.lighting}>
      {/* Three columns: the device rail, the mode tabs + their content, and the
          always-mounted effect dock. Both side columns span the tab row so they
          rise to the very top of the page. Capped at --page-max (pageBody) so
          the page matches every other view's width. */}
      <div className={`${styles.body} ${dockCollapsed ? styles.bodyDockCollapsed : ''} pageBody`}>
        <div className={styles.topRow}>
          <div className={`${styles.tabsCell} ${styles.tabsAnchor}`} ref={modeMenuAnchorRef}>
            <ViewHeader
              title={t('lighting.title')}
              tabs={modeTabs}
              activeTab={activeTabKey}
              onTabChange={handleTabChange}
              tabActions={(
                <PresetToolbar
                  rail
                  presets={presetOptions}
                  activeId={layoutActiveId}
                  presetCount={presetCount}
                  canUndo={canUndoLayout}
                  canRedo={canRedoLayout}
                  onLoad={handlePresetLoadWithHistory}
                  onCreate={handlePresetCreate}
                  onRename={handlePresetRename}
                  onDelete={handlePresetDelete}
                  onManageApps={() => {
                    const preset = presets.find(p => p.id === layoutActiveId);
                    if (preset) {
                      setPresetAppsTarget({ id: preset.id, name: preset.name, apps: preset.apps ?? [] });
                    }
                  }}
                  onReset={handleResetWithHistory}
                  onUndo={handleUndoLayout}
                  onRedo={handleRedoLayout}
                />
              )}
            />
            {modeMenuNode}
          </div>
        </div>
        <div className={`${styles.paneHeader} ${styles.headerLeft}`}>
          <div className={styles.paneTitleGroup}>
            <span className={styles.paneTitle}>{t('lighting.rightPane.devices')}</span>
            <Badge label={String(orderedDevices.length)} compact color="var(--text-dim)" />
          </div>
          <div className={styles.deviceHeaderActions}>
            <OpenRgbButton rgbRunning={rgb.running} scanning={rgb.scanning} />
            {selectableIds.length > 0 && (
            <>
              <span className={styles.headerSep} aria-hidden />
              {/* Icon-only: the rail is too narrow for both labels beside the title. */}
              <HoverTooltip body={t('lighting.ledMap.selectAll')} side="bottom">
                <Button
                  tone="ghost"
                  size="sm"
                  icon={<CheckCheck />}
                  aria-label={t('lighting.ledMap.selectAll')}
                  disabled={allSelected}
                  onClick={() => handleSetSelection(new Set(selectableIds), selectableIds[0] ?? null)}
                />
              </HoverTooltip>
              <HoverTooltip body={t('lightingOnboarding.selectNone')} side="bottom">
                <Button
                  tone="ghost"
                  size="sm"
                  icon={<Ban />}
                  aria-label={t('lightingOnboarding.selectNone')}
                  disabled={selectedDeviceIds.size === 0}
                  onClick={() => handleSetSelection(new Set(), null)}
                />
              </HoverTooltip>
            </>
            )}
          </div>
        </div>
        <div className={`${styles.paneHeader} ${styles.headerCenter}`}>
          <span className={styles.paneTitle}>{t('lighting.pane.effects')}</span>
          {/* How many devices this preview stands for: every device in the
              modes that drive them all, the selection in the per-device ones. */}
          <Badge label={previewBadgeLabel} compact uppercase color="var(--text-dim)" />
          {dockCollapsed && (
            <HoverTooltip body={t('lighting.effectDock.expand')} side="bottom">
              <Button
                tone="ghost"
                size="sm"
                icon={<PanelRightOpen />}
                aria-label={t('lighting.effectDock.expand')}
                className={styles.dockToggle}
                onClick={() => setDockCollapsed(false)}
              >
                {t('lighting.rightPane.effect')}
              </Button>
            </HoverTooltip>
          )}
        </div>
        {!dockCollapsed && (
          <div className={`${styles.paneHeader} ${styles.headerRight}`}>
            <span className={styles.paneTitle}>{t('lighting.rightPane.effect')}</span>
            <HoverTooltip body={t('lighting.effectDock.collapse')} side="bottom">
              <Button
                tone="ghost"
                size="sm"
                icon={<PanelRightClose />}
                aria-label={t('lighting.effectDock.collapse')}
                className={styles.dockToggle}
                onClick={() => setDockCollapsed(true)}
              />
            </HoverTooltip>
          </div>
        )}
        <div className={styles.devicePane}>
          <DevicePanel
            devices={orderedDevices}
            // A mode that reaches every device overrides what any one of them
            // was assigned, so the picks stop applying - the strips go back to
            // sampling the shared canvas. They are kept, not cleared, so
            // returning to Static restores each device's own look.
            devicePicks={perDeviceMode ? devicePicks : undefined}
            versionForSlot={versionForSlot}
            ledFullscreen={effectiveMode === 'static'}
            selectedIds={selectedDeviceIds}
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
            onLianLiTakeControl={handleLianLiTakeControl}
            onOpenSmartLights={() => onSectionNavigate?.('smart-lights')}
            discovery={discovery}
            rgbRunning={rgb.running}
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
              {showCanvas && (
              <div className={styles.canvasArea}>
                <DeviceCanvas devices={canvasDevices} canvasPixels={frames.canvasPixels} canvasW={frames.canvasW} canvasH={frames.canvasH} selectedIds={selectedDeviceIds} primaryDeviceId={primaryDeviceId} onSelectDevice={handleSelectDevice} onSetSelection={handleSetSelection} shaderEffect={shaderMode ? activeEffect : null} shaderState={shaderMode ? previewState : null} shaderPaused={paused} audioRef={audioRef} hiddenFrameIds={hiddenFrameIds} selectedDeviceLeds={selectedDeviceLeds} onOpenSettings={handleOpenSettings} onDragActiveChange={handleDragActiveChange} onBeforeLayoutSave={handleBeforeLayoutSave} onLayoutCommit={handleLayoutCommit} onSetDevicesPower={handleSetDevicesPower} gpuAvailable={serviceState.lighting?.gpuAvailable ?? true} />
                {effectiveMode === 'gif' && <MediaCanvasNotice />}
                {shaderMode && activeEffect && currentState && (
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
              )}
              {/* Off renders no picker at all; Static and Animation each own an
                  effect pool; Screen and Media get their source controls. */}
              {effectiveMode === 'animate' || effectiveMode === 'static' ? (
                <>
                {staticNeedsSelection && (
                  <p className={styles.browserHint}>{t('lighting.pane.pickDevices')}</p>
                )}
                <div
                  className={`${styles.browserWrap} ${staticNeedsSelection ? styles.browserLocked : ''}`}
                  inert={staticNeedsSelection || undefined}
                >
                <AnimateGrid
                  effect={gridEffect}
                  onSelect={handleEffectSelect}
                  effects={effectiveMode === 'static' ? STATIC_PATTERN_EFFECTS : ANIMATE_EFFECTS}
                  frozen={effectiveMode === 'static'}
                  slotFor={gridSlotFor}
                  versionFor={gridVersionFor}
                  panelEffects={panelUsage.effects}
                  gpuAvailable={serviceState.lighting?.gpuAvailable ?? true}
                  leading={effectiveMode === 'static' ? (
                    <StaticPalette
                      selectedId={scopedPaletteId}
                      open={paletteOpen}
                      onToggle={() => setPaletteOpen(o => !o)}
                      onSelect={handlePaletteSelect}
                      customColor={scopedCustom ? scopedHex : customStaticColor}
                      customSelected={scopedCustom}
                      onSelectCustom={handleCustomSelect}
                      onPreviewCustom={handleCustomPreview}
                    />
                  ) : undefined}
                />
                </div>
                </>
              ) : effectiveMode === 'none' ? (
                <EmptyState icon={<Lightbulb />} title={t('lighting.pane.offHint')} />
              ) : (
                <div className={`${styles.controls} ${effectiveMode === 'gif' ? styles.controlsFill : ''}`}>
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
        {!dockCollapsed && (
        <div className={styles.rightPane}>
          <div className={styles.dockBrightness}>
            <GlobalBrightnessSlider serviceOnline={serviceOnline} />
          </div>
            <div
              className={`${styles.effectTabBody} ${mixedSelection ? styles.effectTabBodyLocked : ''}`}
              inert={mixedSelection || undefined}
              aria-hidden={mixedSelection || undefined}
            >
              {dockPalette ? (
                <div className={styles.paletteDetail}>
                  <div className={styles.paletteDetailSwatch} style={{ backgroundColor: dockPalette.hex }} />
                  <span className={styles.paletteDetailName}>
                    {`${t(paletteFamilyKey(dockPalette.family))} ${dockPalette.shade}`}
                  </span>
                  <span className={styles.paletteDetailHint}>{t('lighting.palette.noControls')}</span>
                </div>
              ) : (
              <EffectTab
                mode={effectiveMode}
                effect={dockEffect}
                state={dockState}
                bundle={dockBundle}
                canReset={dockCanReset}
                onTemplateSelect={handleTemplateSelect}
                onAnimateChange={handleStatePatch}
                onAnimateCommit={handleStateCommit}
                onAnimateReset={handleStateReset}
                panelSlots={panelUsage.slotsByEffect.get(dockEffect)}
                postProcess={postProcess}
                onPostProcessChange={handlePostProcessChange}
                onPostProcessCommit={handlePostProcessCommit}
                onPostProcessReset={handlePostProcessReset}
              />
              )}
            </div>
        </div>
        )}
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
      {presetAppsTarget && (
        <PresetAppsModal
          presetName={presetAppsTarget.name}
          apps={presetAppsTarget.apps}
          taken={takenApps}
          onSave={async apps => {
            const result = await handlePresetSetApps(presetAppsTarget.id, apps);
            if (result.kind === 'conflict') {
              return t('lighting.layoutPresets.appsTaken', {
                app: result.conflict.appName,
                preset: result.conflict.presetName,
              });
            }
            // Anything other than a clean 200 keeps the modal open with the
            // edit intact - closing on a failed write discards it silently.
            if (result.kind === 'failed') {
              return t('lighting.layoutPresets.appsSaveFailed');
            }
            setPresetAppsTarget(null);
            return null;
          }}
          onClose={() => setPresetAppsTarget(null)}
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

