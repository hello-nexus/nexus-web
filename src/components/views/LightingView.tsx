import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  startStatic, startAnimate, startScreenMirror, stopLighting,
  fetchLightingDevices, fetchAnimateSettings, fetchStaticColor, saveAnimateTemplates,
  fetchMusicReactive, setMusicReactive, setLightingDevicePower,
  fetchScreenEffect, setScreenEffect, fetchMediaEffect, setMediaEffect, fetchLedMap,
  fetchCurrentSync,
  type LightingDevice, type LedMapEntry, type PostProcessSettings,
} from '../../api/lighting';
import { useLightingFrames } from '../../hooks/useLightingFrames';
import { useLightingSync } from '../../hooks/useLightingSync';
import { useTopicCallback } from '../../hooks/useMultiplexSocket';
import { useRgbStatus } from '../../hooks/useRgbStatus';
import type { ConnectionState } from '../../hooks/useServiceStatus';
import { useTranslation } from '../../lib/i18n';
import { publishControlSync, subscribeControlSync } from '../../lib/controlSync';
import { LIGHTING_MODE_ICONS } from '../../lib/lightingModeIcons';
import { ViewHeader } from '../ViewHeader/ViewHeader';
import { ServiceRequired } from './ServiceRequired';
import { LightingSkeleton } from './PageSkeleton/PageSkeleton';
import { DeviceCanvas } from '../DeviceCanvas/DeviceCanvas';
import { SupportedDevicesModal } from '../SupportedDevicesModal/SupportedDevicesModal';
import { useUsbDevices } from '../../hooks/useUsbDevices';
import {
  EFFECTS, MODES, defaultStateFor,
  type EffectState, type EffectTemplateBundle, type LightingMode,
} from '../../types/lighting';
import { buildAllDefaultTemplates, mergeTemplates, slotMatchesDefault } from '../../types/lightingTemplates';
import { AnimateGrid } from './lighting/AnimateGrid';
import { FullscreenShader } from './lighting/FullscreenShader';
import { ModeControls } from './lighting/ModeControls';
import { DevicePanel } from './lighting/DevicePanel';
import { LedMapEditor } from './lighting/LedMapEditor';
import { RescanDevicesButton } from './lighting/RescanDevicesButton';
import { RgbStatusCard } from './lighting/RgbStatusCard';
import { RightPaneTabs, type RightPaneTab } from './lighting/RightPaneTabs';
import { EffectTab, type PostProcessState } from './lighting/EffectTab';
import { useThrottle } from '../../hooks/cadence';
import { useAudioState } from '../../hooks/useAudioState';
import styles from './LightingView.module.scss';

/**
 * Lighting tab composer. Owns mode routing, per-effect animate state, device
 * canvas, and right-pane tab lifecycle. Individual renderers live in
 * `./lighting/*`.
 */

interface LightingViewProps {
  serviceOnline: boolean;
  connectionState?: ConnectionState;
  activeProfileId?: string;
}

const DEFAULT_POST_PROCESS: PostProcessState = { hue: 0, colorize: 0, saturation: 1, contrast: 1 };

export function LightingView({ serviceOnline, connectionState, activeProfileId }: LightingViewProps) {
  const { t } = useTranslation();
  const { mode, setMode, rawSync, setRawSync } = useLightingSync(serviceOnline, activeProfileId);
  const frames = useLightingFrames();
  const rgb = useRgbStatus(serviceOnline);
  const [devices, setDevices] = useState<LightingDevice[]>([]);
  const deviceDraggingRef = useRef(false);
  const handleDragActiveChange = useCallback((active: boolean) => { deviceDraggingRef.current = active; }, []);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const handleSelectDevice = useCallback((id: string | null) => {
    setSelectedDeviceId(id);
  }, []);
  const [catalogOpen, setCatalogOpen] = useState(false);

  const [activeEffect, setActiveEffect] = useState<string>('');
  const [effectTemplates, setEffectTemplates] = useState<Record<string, EffectTemplateBundle>>({});
  const [staticColor, setStaticColor] = useState<string>('#ff0000');
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const [hiddenFrameIds, setHiddenFrameIds] = useState<Set<string>>(() => new Set());
  const toggleFrameVisibility = useCallback((id: string) => {
    setHiddenFrameIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // LED map editor - lifted here so both the canvas settings button and the
  // ZoneCard settings button can open it.
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
  const editingDevice = editingDeviceId ? devices.find(d => d.id === editingDeviceId) ?? null : null;
  const handleOpenSettings = useCallback((id: string) => setEditingDeviceId(id), []);

  // LED positions for the selected device - fetched when a device is selected
  // so the canvas can show small dots indicating where each active LED is.
  const [selectedDeviceLeds, setSelectedDeviceLeds] = useState<LedMapEntry[] | null>(null);
  useEffect(() => {
    if (!selectedDeviceId) { setSelectedDeviceLeds(null); return; }
    setSelectedDeviceLeds(null);
    let cancelled = false;
    fetchLedMap(selectedDeviceId).then(data => {
      if (!cancelled && data) setSelectedDeviceLeds(data.leds);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [selectedDeviceId, editingDeviceId, activeProfileId]);

  const [musicReactive, setMusicReactiveState] = useState(false);
  const audioRef = useAudioState(musicReactive && mode === 'animate');

  // Right-pane tab: 'devices' is the rescan + zone cards; 'effect' holds
  // the post-process controls for animate / media / screen.
  const [activeRightTab, setActiveRightTab] = useState<RightPaneTab>('devices');
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
    if (event.staticColor) setStaticColor(event.staticColor);
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
      safe(fetchStaticColor()),
      safe(fetchMusicReactive()),
      safe(fetchScreenEffect()),
      safe(fetchMediaEffect()),
    ]).then(([
      currentSync,
      animateSettings,
      staticSettings,
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
      if (staticSettings) {
        setStaticColor(colorToHex(staticSettings.r, staticSettings.g, staticSettings.b));
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
    } else if (rawSync === 'static') {
      fetchStaticColor().then(data => {
        if (cancelled || !data) return;
        setStaticColor(colorToHex(data.r, data.g, data.b));
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

  // Static-mode color: refetch on initial entry; cross-device updates ride
  // the multiplex 'lighting' topic (see useTopicCallback below). The prior
  // 1s setInterval is gone now that mutations push.
  useEffect(() => {
    if (!serviceOnline || mode !== 'static') return;
    let cancelled = false;
    fetchStaticColor().then(data => {
      if (cancelled || !data) return;
      setStaticColor(colorToHex(data.r, data.g, data.b));
    });
    return () => { cancelled = true; };
  }, [serviceOnline, mode]);

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
    if (mode === 'static') {
      fetchStaticColor().then(data => {
        if (!data) return;
        setStaticColor(colorToHex(data.r, data.g, data.b));
      });
    } else if (mode === 'animate') {
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
      if (sync === 'static') {
        const hex = staticColor;
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        await startStatic(r, g, b);
      } else if (EFFECTS.some(e => e.key === sync)) {
        const state = stateFor(sync);
        await startAnimate(sync, state.speed, state.intensity, state.hue,
          state.colorize, state.saturation, state.contrast, state.params, false);
      } else if (sync === 'screen') {
        await startScreenMirror(screenPP.saturation, screenPP.contrast, '', screenPP.hue, screenPP.colorize);
      } else if (sync === 'media' || sync === 'gif') {
        await import('../../api/mediaLibrary').then(m => m.playCurrentOrFirstMedia());
      }
    })();
  }, [
    serviceOnline,
    activeProfileKey,
    loadedProfileLighting,
    staticColor,
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

  // Clicking an effect while the Devices tab is visible shouldn't hide the
  // devices - just nudge the user toward the Effect tab with a brief pulse
  // on the tab label so they know where the controls moved.
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
  const handleTogglePower = useCallback((id: string) => {
    const current = devicesRef.current.find(d => d.id === id);
    if (!current) return;
    const nextOn = !current.ledsOn;
    setLightingDevicePower(id, nextOn).catch(() => { /* 3s poll reconciles */ });
    setDevices(prev => prev.map(d => d.id === id ? { ...d, ledsOn: nextOn } : d));
  }, []);

  const usb = useUsbDevices(serviceOnline);
  const detectedVidPids = useMemo(() => {
    const set = new Set<string>();
    for (const d of usb.devices) {
      set.add(`${d.vendorId.toLowerCase()}:${d.productId.toLowerCase()}`);
    }
    return set;
  }, [usb.devices]);

  useEffect(() => {
    if (!serviceOnline) return;
    let cancelled = false;
    const refresh = async () => {
      const data = await fetchLightingDevices();
      if (cancelled || !data || deviceDraggingRef.current) return;
      const devices = (data.devices ?? []).map(d => ({
        ...d,
        canvasW: Math.max(60, d.canvasW),
        canvasH: Math.max(60, d.canvasH),
      }));
      setDevices(devices);
    };
    refresh();
    const id = setInterval(refresh, 3000);
    return () => { cancelled = true; clearInterval(id); };
  }, [serviceOnline, activeProfileId]);

  const handleModeChange = useCallback(async (m: LightingMode) => {
    setMode(m);
    try {
      switch (m) {
        case 'static': {
          const r = parseInt(staticColor.slice(1, 3), 16);
          const g = parseInt(staticColor.slice(3, 5), 16);
          const b = parseInt(staticColor.slice(5, 7), 16);
          await startStatic(r, g, b);
          break;
        }
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
          const { playCurrentOrFirstMedia } = await import('../../api/mediaLibrary');
          await playCurrentOrFirstMedia();
          break;
        }
        case 'none': await stopLighting(); break;
      }
      if (m !== 'animate') {
        publishControlSync({
          domain: 'lighting',
          mode: m,
          rawSync: m,
          staticColor: m === 'static' ? staticColor : undefined,
        });
      }
    } catch { /* best-effort; backend state becomes source of truth */ }
  }, [staticColor, activeEffect, rawSync, setMode, screenPP, stateFor]);

  const handleStaticColorChange = useCallback((hex: string) => {
    setStaticColor(hex);
    publishControlSync({ domain: 'lighting', mode: 'static', rawSync: 'static', staticColor: hex });
  }, []);

  const modeTabs = MODES.map(m => {
    const Icon = LIGHTING_MODE_ICONS[m.key];
    return { key: m.key, label: t(m.labelKey), icon: <Icon size={14} /> };
  });

  // Effect tab is only meaningful for animate / media / screen. Static + off
  // render an empty-state string; the tab header marks it disabled so the
  // user doesn't feel invited to click into nothing.
  const effectTabDisabled = mode === 'static' || mode === 'none';

  if (!serviceOnline) {
    return (
      <div className={styles.lighting}>
        <div className={styles.topBar}>
          <ViewHeader title={t('lighting.title')} titleTooltip={t('lighting.title.tooltip')} tabs={modeTabs} activeTab={mode} onTabChange={k => handleModeChange(k as LightingMode)} tabsDisabled />
        </div>
        <ServiceRequired state={connectionState} skeleton={<LightingSkeleton />} />
      </div>
    );
  }

  return (
    <div className={styles.lighting}>
      <div className={styles.topBar}>
        <ViewHeader title={t('lighting.title')} titleTooltip={t('lighting.title.tooltip')} tabs={modeTabs} activeTab={mode} onTabChange={k => handleModeChange(k as LightingMode)} />
        <div className={styles.topBarRight}>
          <div className={styles.statusCardSlot}>
            <RgbStatusCard rgbRunning={rgb.running} />
          </div>
          <RightPaneTabs
            active={activeRightTab}
            onSelect={setActiveRightTab}
            pulseKey={effectPulseKey}
            effectTabDisabled={effectTabDisabled}
          />
        </div>
      </div>
      <SupportedDevicesModal
        open={catalogOpen}
        onClose={() => setCatalogOpen(false)}
        source="lighting"
        detectedVidPids={detectedVidPids}
      />
      <div className={styles.body}>
        <div className={styles.main}>
          <div className={styles.canvasArea}>
            <DeviceCanvas devices={devices} canvasPixels={frames.canvasPixels} canvasW={frames.canvasW} canvasH={frames.canvasH} selectedDeviceId={selectedDeviceId} onSelectDevice={handleSelectDevice} shaderEffect={mode === 'animate' ? activeEffect : null} shaderState={mode === 'animate' ? currentState : null} audioRef={audioRef} hiddenFrameIds={hiddenFrameIds} selectedDeviceLeds={selectedDeviceLeds} onOpenSettings={handleOpenSettings} onDragActiveChange={handleDragActiveChange} />
            {mode === 'animate' && activeEffect && currentState && (
              <>
                {EFFECTS.find(e => e.key === activeEffect)?.audio && (
                  <button
                    type="button"
                    className={`${styles.musicReactiveBtn} ${musicReactive ? styles.musicReactiveBtnOn : ''}`}
                    onClick={handleMusicReactiveToggle}
                    title={t('lighting.musicReactive')}
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 10.5a1.5 1.5 0 1 0 3 0v-7l6 -1.5v7" />
                      <circle cx="10.5" cy="9.5" r="1.5" />
                    </svg>
                  </button>
                )}
                <button type="button" className={styles.fullscreenBtn} onClick={() => setFullscreenOpen(true)} title={t('lighting.fullscreen')}>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9,1 13,1 13,5" /><polyline points="5,13 1,13 1,9" />
                    <line x1="13" y1="1" x2="8.5" y2="5.5" /><line x1="1" y1="13" x2="5.5" y2="8.5" />
                  </svg>
                </button>
              </>
            )}
          </div>
          {mode === 'animate' ? (
            <AnimateGrid effect={activeEffect} onSelect={handleEffectSelect} />
          ) : (
            <div className={styles.controls}>
              <ModeControls mode={mode} staticColor={staticColor} onStaticChange={handleStaticColorChange} />
            </div>
          )}
        </div>
        <div className={styles.rightPane}>
          {activeRightTab === 'devices' ? (
            <>
              <DevicePanel
                devices={devices}
                selectedDeviceId={selectedDeviceId}
                onSelectDevice={handleSelectDevice}
                onTogglePower={handleTogglePower}
                onToggleFrameVisibility={toggleFrameVisibility}
                hiddenFrameIds={hiddenFrameIds}
                lightingOff={mode === 'none'}
                onOpenSettings={handleOpenSettings}
              />
              {mode !== 'none' && (
                <RescanDevicesButton rgbRunning={rgb.running} scanning={rgb.scanning} />
              )}
              <button type="button" className={styles.browseBottom} onClick={() => setCatalogOpen(true)}>
                {t('devices.supported.browse')}
              </button>
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
        <LedMapEditor device={editingDevice} onClose={() => setEditingDeviceId(null)} />
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
  };
}

function colorToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b]
    .map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'))
    .join('');
}

function modeForSync(sync: string): LightingMode {
  if (sync === 'none' || !sync) return 'none';
  if (sync === 'static') return 'static';
  if (sync === 'screen' || sync.includes('mirror')) return 'screen';
  if (sync === 'gif' || sync.includes('media')) return 'gif';
  return 'animate';
}
