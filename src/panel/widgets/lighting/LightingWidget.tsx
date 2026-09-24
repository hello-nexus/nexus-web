import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Lightbulb, MonitorPlay, Zap } from 'lucide-react';
import { PanelArrowButton } from '../../chrome/PanelArrowButton';
import type { LucideIcon } from 'lucide-react';
import {
  effectThumbnailPath,
  fetchAnimateDefaults,
  fetchAnimateSettings,
  fetchCurrentSync,
  fetchLightingStatus,
  fetchScreenEffect,
  fetchLightingDevices,
  fetchStaticSettings,
  startAnimate,
  startStatic,
  startGameSync,
  startScreenMirror,
  stopLighting,
} from '../../../api/lighting';
import {
  fetchMediaCurrent,
  fetchMediaLibrary,
  mediaIdle,
  playCurrentOrFirstMedia,
  type MediaItem,
} from '../../../api/mediaLibrary';
import { fetchServiceBlob, pingService } from '../../../api/service';
import { Button } from '../../../components/common/Button/Button';
import { isSimpleAnimation, simpleAnimationLabelKey, simpleAnimationState } from './simpleAnimations';
import { EffectCard } from '../../../components/common/EffectCard/EffectCard';
import { IconLabelButton } from '../../../components/common/IconLabelButton/IconLabelButton';
import { PanelWidgetEmpty } from '../common/PanelWidgetChrome';
import { useTopicCallback } from '../../../hooks/useMultiplexSocket';
import { publishControlSync } from '../../../lib/controlSync';
import { LIGHTING_MODE_ICONS } from '../../../lib/lightingModeIcons';
import { useTranslation } from '../../../lib/i18n';
import { pluralKey } from '../../../lib/pluralKey';
import {
  ANIMATE_EFFECTS,
  DEFAULT_STATIC_EFFECT,
  EFFECTS,
  MODES,
  defaultStateFor,
  isStaticEffect,
  type EffectState,
  type EffectTemplateBundle,
  type LightingMode,
} from '../../../types/lighting';
import { normalizeSync as resolveMode } from '../../../hooks/useLightingSync';
import { mergeTemplates, slotThumbSignature } from '../../../types/lightingTemplates';
import { useFeatureFlags, useUiSettings } from '../../../hooks/useUiSettings';
import { resolveAdvancedMode } from '../common/AdvancedModeSettings';
import { useStateChangePulse } from '../common/useStateChangePulse';
import { usePanelPreview } from '../common/PanelPreviewContext';
import { LightingLivePreview } from './LightingLivePreview';
import { LightingShaderPreview } from './LightingShaderPreview';
import type { GpuState } from '../../../components/common/CanvasNoticeBar/gpuNotice';
import type { WidgetProps } from '../types';
import styles from './LightingWidget.module.scss';

// Catalog preview pins screen mode (pass-through, reactive=false):
// the icon view renders with zero fetch/socket/blob traffic. Keep in sync with
// the simple-mode render; previewMode.test.tsx is the fixture-sync gate.
const LIGHTING_PREVIEW_MODE: LightingMode = 'screen';

export function LightingWidget({ widget, immersive, immersiveCanvas, onSectionNavigate }: WidgetProps & { immersive?: boolean; immersiveCanvas?: ReactNode }) {
  const { t, language } = useTranslation();
  const { settings: ui } = useUiSettings();
  const flags = useFeatureFlags();
  const preview = usePanelPreview();
  // Preview forces simple mode for determinism.
  const simpleMode = preview || !resolveAdvancedMode(widget.config, ui.widgetAdvancedMode);
  const [mode, setMode] = useState<LightingMode>(preview ? LIGHTING_PREVIEW_MODE : 'none');
  const [gpuAvailable, setGpuAvailable] = useState(true);
  const [gpuState, setGpuState] = useState<GpuState | undefined>(undefined);
  const [activeDeviceCount, setActiveDeviceCount] = useState(0);
  // WS-synced from /lighting/current (re-hydrated on the 'lighting' topic), so
  // the shader preview freezes when lighting is paused from any surface.
  const [paused, setPaused] = useState(false);
  const [activeEffect, setActiveEffect] = useState('rainbow');
  // The service's remembered static key, so entering the mode from animate
  // returns to the last static pick instead of the catalog default.
  const staticEffectRef = useRef(DEFAULT_STATIC_EFFECT);
  // Same, for animate. activeEffect holds the running mode's own pool, so it
  // is a static key while Static runs; without this ref, stepping back into
  // Animate would drop the user's animation for the catalog default.
  const animateEffectRef = useRef('rainbow');
  const [templates, setTemplates] = useState<Record<string, EffectTemplateBundle>>({});
  // Direction of a running simple-mode sweep, read from its stored speed sign.
  const [sweepReversed, setSweepReversed] = useState(false);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [activeMediaId, setActiveMediaId] = useState<string | null>(null);
  const [mediaThumbs, setMediaThumbs] = useState<Record<string, string>>({});
  const [reactive, setReactive] = useState(false);
  const mediaThumbsRef = useRef<Record<string, string>>({});
  const compact = widget.size === '2x2';

  // Game Sync only exists on Windows services; the mode button stays hidden
  // until the ping resolves (empty platform), matching LightingPage.
  const [platform, setPlatform] = useState('');
  useEffect(() => {
    if (preview || !flags.lighting) return;
    let cancelled = false;
    pingService().then(p => {
      if (!cancelled && p?.platform) setPlatform(p.platform);
    });
    return () => { cancelled = true; };
  }, [preview, flags.lighting]);
  const modeButtons = useMemo(
    () => MODES.filter(m => m.key !== 'gamesync' || platform === 'windows'),
    [platform],
  );

  // Immersive only: tapping the live shader preview expands it to a full-bleed
  // shader view; tapping that closes it. Auto-closes whenever the mode leaves
  // animate - the fullscreen view only renders a shader effect.
  // Static is excluded, and gets no preview of its own either: its colours are
  // assigned per device, so no single canvas or shader states what it is doing.
  // The device cards' own LED strips carry that, one per device.
  const [shaderFullscreen, setShaderFullscreen] = useState(false);

  // False until the first hydrate() resolves: mode/effect/filter sets
  // before that are hydration, not state changes, and must not animate.
  const [hydrated, setHydrated] = useState(false);
  // Discrete selection only - the live-preview canvas and thumbnail blob
  // loads must never trigger the flash.
  const flashPulse = useStateChangePulse(
    mode === 'animate' ? `animate:${activeEffect}`
      : mode === 'screen' ? `screen:${reactive}`
      : mode,
    !hydrated,
  );
  // Unmounted on animationend: a finished fill-mode animation stays active
  // on the node (holding a compositor layer) as long as it's rendered.
  const [flashDoneAt, setFlashDoneAt] = useState(0);
  const flash = flashPulse > flashDoneAt
    ? (
      <span
        key={flashPulse}
        className={styles.stateFlash}
        data-state-flash
        aria-hidden="true"
        onAnimationEnd={() => setFlashDoneAt(flashPulse)}
      />
    )
    : null;

  // Every mode step broadcasts, so steps in quick succession put several
  // hydrates in flight at once; without this the slowest one wins and reverts
  // the newest mode, effect and remembered picks.
  const hydrateSeqRef = useRef(0);
  const hydrate = useCallback(async () => {
    const seq = ++hydrateSeqRef.current;
    const [sync, animate, staticSettings, screen, lightStatus, defaults, deviceList] = await Promise.all([
      fetchCurrentSync(),
      fetchAnimateSettings(),
      fetchStaticSettings(),
      fetchScreenEffect(),
      fetchLightingStatus(),
      fetchAnimateDefaults(),
      fetchLightingDevices(),
    ]);
    if (seq !== hydrateSeqRef.current) return;
    setGpuAvailable(lightStatus?.gpuAvailable ?? true);
    setGpuState(lightStatus?.gpuState);
    // Static drives devices individually, so the widget reports how many are
    // lit rather than naming one effect.
    setActiveDeviceCount((deviceList?.devices ?? [])
      .filter(d => d.ledsOn && d.controlled !== false).length);

    const nextTemplates: Record<string, EffectTemplateBundle> = {};
    for (const effect of EFFECTS) {
      nextTemplates[effect.key] = mergeTemplates(effect.key, animate?.templates?.[effect.key], defaults);
    }
    setTemplates(nextTemplates);

    const rawSync = sync?.sync || 'none';
    const nextMode = resolveMode(rawSync);
    if (isStaticEffect(staticSettings?.effect ?? '')) staticEffectRef.current = staticSettings!.effect;
    // The running sync IS the animate key while Animate runs, and animate
    // settings still hold the pick once another mode takes over - so the ref
    // tracks it whatever mode we hydrate into.
    const animatePick = [rawSync, animate?.effect]
      .find(k => ANIMATE_EFFECTS.some(e => e.key === k));
    if (animatePick) animateEffectRef.current = animatePick;
    // A sweep drives the hardware without a catalogue entry, so it has to be
    // named here or the tile pictures whatever the last catalogue pick was.
    const sweep = isSimpleAnimation(rawSync);
    if (sweep) setSweepReversed((animate?.states?.[rawSync]?.speed ?? 50) < 0);
    const nextEffect = nextMode === 'static'
      ? staticEffectRef.current
      : EFFECTS.some(e => e.key === rawSync) || sweep
        ? rawSync
        : animateEffectRef.current;
    setActiveEffect(nextEffect);

    setMode(nextMode);
    setPaused(!!sync?.paused);
    setReactive(screen?.reactive ?? false);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (preview || !flags.lighting) return;
    // hydrate() fetches initial lighting state over HTTP; its setState
    // calls run after the fetches resolve, not during the effect body.

    hydrate();
  }, [preview, flags.lighting, hydrate]);
  useTopicCallback('lighting', !preview && flags.lighting, hydrate);

  // Leaving animate (a mode change from this surface or an external broadcast)
  // dismisses the immersive fullscreen shader.
  useEffect(() => {
    if (mode !== 'animate') setShaderFullscreen(false);
  }, [mode]);

  // The tile shows the active effect's selected universal slot. Its content hash
  // changes when that slot's saved look is edited (re-hydrate here, or the
  // lighting broadcast from another surface), so the tile refetches the BMP.
  const activeSlot = templates[activeEffect]?.selected ?? 0;
  const activeVersion = useMemo(() => {
    const b = templates[activeEffect];
    if (!b || b.slots.length === 0) return '0';
    return slotThumbSignature(b.slots[Math.min(Math.max(b.selected, 0), b.slots.length - 1)]);
  }, [templates, activeEffect]);

  // The widget shows one thumbnail at a time (active effect, Prev/Next
  // cycling). Load the active effect's BMP on demand and cache picks as
  // the user cycles, rather than fetching all 60+ on mount. Refetch when the
  // active effect's token changes.
  const thumbsRef = useRef<Record<string, string>>({});
  const loadedVersionRef = useRef<Record<string, string>>({});
  useEffect(() => {
    if (preview || !activeEffect || mode === 'static') return;
    const want = activeVersion ?? '';
    if (loadedVersionRef.current[activeEffect] === want) return;
    let cancelled = false;
    (async () => {
      const blob = await fetchServiceBlob(effectThumbnailPath(activeEffect, activeSlot, activeVersion));
      if (cancelled || !blob) return;
      const url = URL.createObjectURL(blob);
      const prev = thumbsRef.current[activeEffect];
      thumbsRef.current = { ...thumbsRef.current, [activeEffect]: url };
      loadedVersionRef.current = { ...loadedVersionRef.current, [activeEffect]: want };
      setThumbs(thumbsRef.current);
      if (prev) URL.revokeObjectURL(prev);
    })();
    return () => { cancelled = true; };
  }, [preview, activeEffect, activeSlot, activeVersion, mode]);

  useEffect(() => () => {
    for (const url of Object.values(thumbsRef.current)) URL.revokeObjectURL(url);
    thumbsRef.current = {};
  }, []);

  // Media library is only needed in gif mode, for the active media name.
  // Skipped at 2x2 advanced, which does not show it.
  const refreshMedia = useCallback(async () => {
    const [lib, cur] = await Promise.all([fetchMediaLibrary(), fetchMediaCurrent()]);
    if (lib?.items) setMediaItems(lib.items);
    if (cur?.mediaId !== undefined) setActiveMediaId(cur.mediaId);
  }, []);

  const mediaVisible = !preview && (!compact || simpleMode) && mode === 'gif';
  useEffect(() => {
    if (!mediaVisible) return;
    // refreshMedia()'s setState runs after the HTTP fetches resolve,
    // not synchronously in the effect.

    refreshMedia();
  }, [mediaVisible, refreshMedia]);
  // A play from another surface broadcasts on the lighting topic (not
  // mediaLibrary); refetch so the shown clip and the arrows' cycle anchor
  // follow it.
  useTopicCallback('lighting', mediaVisible, refreshMedia);

  useEffect(() => () => {
    for (const url of Object.values(mediaThumbsRef.current)) {
      URL.revokeObjectURL(url);
    }
    mediaThumbsRef.current = {};
  }, []);

  useEffect(() => {
    if (!mediaVisible) return;
    let cancelled = false;
    (async () => {
      for (const item of mediaItems) {
        if (cancelled) return;
        if (mediaThumbsRef.current[item.id]) continue;
        const blob = await fetchServiceBlob(`/media/${encodeURIComponent(item.id)}/thumbnail`);
        if (cancelled) return;
        if (!blob) continue;
        const url = URL.createObjectURL(blob);
        if (mediaThumbsRef.current[item.id]) {
          URL.revokeObjectURL(url);
          continue;
        }
        mediaThumbsRef.current = { ...mediaThumbsRef.current, [item.id]: url };
        setMediaThumbs(mediaThumbsRef.current);
      }
    })();
    return () => { cancelled = true; };
  }, [mediaVisible, mediaItems]);

  const publishLighting = useCallback((nextMode: LightingMode, rawSync: string, extra?: Partial<Parameters<typeof publishControlSync>[0]>) => {
    publishControlSync({ domain: 'lighting', mode: nextMode, rawSync, ...extra });
  }, []);

  const applyEffect = useCallback(async (effectKey: string, state?: EffectState, templateIndex?: number) => {
    const next = state ?? resolveEffectState(effectKey, templates);
    setActiveEffect(effectKey);
    animateEffectRef.current = effectKey;
    setMode('animate');
    await startAnimate(
      effectKey,
      next.speed,
      next.intensity,
      next.hue,
      next.colorize,
      next.saturation,
      next.contrast,
      next.params,
      true,
    );
    publishLighting('animate', effectKey, { effect: effectKey, templateIndex, effectState: next });
  }, [publishLighting, templates]);

  const applyStatic = useCallback(async (effectKey: string, state?: EffectState) => {
    const next = state ?? resolveEffectState(effectKey, templates);
    setActiveEffect(effectKey);
    staticEffectRef.current = effectKey;
    setMode('static');
    await startStatic(
      effectKey,
      next.intensity,
      next.hue,
      next.colorize,
      next.saturation,
      next.contrast,
      next.params,
      true,
    );
    publishLighting('static', 'static', { effect: effectKey, effectState: next });
  }, [publishLighting, templates]);

  const applyMirror = useCallback(async () => {
    setMode('screen');
    // The mirror's look is service-side state: StartScreen ignores the
    // post-process in its start body, and /lighting/screen/effect is its only
    // writer. Read the flag for the label; author nothing.
    const current = await fetchScreenEffect();
    setReactive(current?.reactive ?? false);
    await startScreenMirror(current?.saturation, current?.contrast, '', current?.hue, current?.colorize);
    publishLighting('screen', 'screen');
  }, [publishLighting]);

  const onAnimateButton = useCallback(() => {
    const effect = ANIMATE_EFFECTS.some(e => e.key === activeEffect)
      ? activeEffect
      : animateEffectRef.current;
    applyEffect(effect);
  }, [activeEffect, applyEffect]);

  const onStaticButton = useCallback(() => {
    const effect = isStaticEffect(activeEffect) ? activeEffect : staticEffectRef.current;
    void applyStatic(effect);
  }, [activeEffect, applyStatic]);

  const onMirrorButton = useCallback(() => {
    applyMirror();
  }, [applyMirror]);

  const onMediaButton = useCallback(async () => {
    setMode('gif');
    const played = await playCurrentOrFirstMedia();
    if (!played) {
      // No playable media: black output while staying in Media mode, so the
      // Media tab stays selected instead of falling to Off.
      await mediaIdle();
    }
    publishLighting('gif', 'gif');
  }, [publishLighting]);

  const onOffButton = useCallback(async () => {
    setMode('none');
    await stopLighting();
    publishLighting('none', 'none');
  }, [publishLighting]);

  const onGameSyncButton = useCallback(async () => {
    setMode('gamesync');
    await startGameSync();
    publishLighting('gamesync', 'gamesync');
  }, [publishLighting]);

  // Mode-button dispatch (widget row + immersive grid) - covers every mode.
  const handleMode = useCallback((k: LightingMode) => {
    if (k === 'none') onOffButton();
    else if (k === 'animate') onAnimateButton();
    else if (k === 'static') onStaticButton();
    else if (k === 'gif') onMediaButton();
    else if (k === 'screen') onMirrorButton();
    else if (k === 'gamesync') onGameSyncButton();
  }, [onOffButton, onAnimateButton, onStaticButton, onMediaButton, onMirrorButton, onGameSyncButton]);

  // The arrows step through the mode list, the way the cooling widget's step
  // through its presets. What plays inside a mode - the effect, the media item,
  // the mirror filter - is chosen on the lighting page, not here.
  const cycleMode = useCallback((delta: number) => {
    const keys = modeButtons.map(m => m.key);
    const idx = keys.indexOf(mode);
    const nextIdx = idx < 0
      ? (delta > 0 ? 0 : keys.length - 1)
      : (idx + delta + keys.length) % keys.length;
    handleMode(keys[nextIdx]);
  }, [handleMode, mode, modeButtons]);

  const view = useMemo<SingleView>(() => {
    const prev = () => cycleMode(-1);
    const next = () => cycleMode(1);

    // Static assigns a colour per device, so there is no one selection to
    // picture - the icon plus how many devices are lit is the whole truth.
    if (mode === 'static') {
      return {
        kind: 'icon',
        icon: LIGHTING_MODE_ICONS.static,
        label: t(pluralKey('lighting.devices.activeCount', language, activeDeviceCount), { count: activeDeviceCount }),
        onPrev: prev,
        onNext: next,
      };
    }
    if (mode === 'animate') {
      if (isSimpleAnimation(activeEffect)) {
        return {
          kind: 'thumb',
          thumbUrl: thumbs[activeEffect] ?? null,
          label: t(simpleAnimationLabelKey(activeEffect)),
          onPrev: prev,
          onNext: next,
        };
      }
      const effect = ANIMATE_EFFECTS.find(e => e.key === activeEffect) ?? ANIMATE_EFFECTS[0];
      return {
        kind: 'thumb',
        thumbUrl: thumbs[effect.key] ?? null,
        label: t(effect.labelKey),
        onPrev: prev,
        onNext: next,
      };
    }
    if (mode === 'screen') {
      return {
        kind: 'icon',
        // Same glyphs as the lighting page's Pass-Through / Reactive buttons.
        icon: reactive ? Zap : MonitorPlay,
        label: t(reactive ? 'lighting.filter.reactive' : 'lighting.filter.passthrough'),
        onPrev: prev,
        onNext: next,
      };
    }
    if (mode === 'gamesync') {
      return {
        kind: 'icon',
        icon: LIGHTING_MODE_ICONS.gamesync,
        label: t('lighting.mode.gamesync'),
        onPrev: prev,
        onNext: next,
      };
    }
    if (mode === 'gif') {
      const item = mediaItems.find(m => m.id === activeMediaId) ?? mediaItems[0];
      if (!item) {
        return { kind: 'icon', icon: LIGHTING_MODE_ICONS.gif, label: t('lighting.mode.gif'), onPrev: prev, onNext: next };
      }
      return {
        kind: 'thumb',
        thumbUrl: mediaThumbs[item.id] ?? null,
        label: item.name.replace(/\.[^.]+$/, ''),
        onPrev: prev,
        onNext: next,
      };
    }
    // mode === 'none' (off).
    return { kind: 'icon', icon: Lightbulb, muted: true, label: t('lighting.mode.off'), onPrev: prev, onNext: next };
  }, [mode, activeEffect, activeDeviceCount, language, thumbs, t, reactive, mediaItems, activeMediaId, mediaThumbs, cycleMode]);

  // The flash stands in for a thumbnail that has not painted yet, so the tile
  // only flashes where a thumbnail renders. Off, Static, Mirror, Game Sync and
  // an empty media library show an icon, so they stay still here.
  const thumbFlash = view.kind === 'thumb' ? flash : null;

  // Active Animate effect state for the immersive on-device preview: the shader
  // is rendered locally at full resolution, replacing the low-res streamed LED
  // canvas (LightingLivePreview) for shader effects only.
  const animateState = useMemo(
    () => (isSimpleAnimation(activeEffect)
      ? simpleAnimationState(sweepReversed)
      : resolveEffectState(activeEffect, templates)),
    [activeEffect, sweepReversed, templates],
  );

  if (!preview && !flags.lighting) {
    return (
      <div className={styles.lighting} data-size={widget.size} data-mode="off">
        <PanelWidgetEmpty
          icon={<Lightbulb size={24} />}
          title={t('featureDisabled.widget.lighting')}
          text={onSectionNavigate ? undefined : t('featureDisabled.hint.lighting')}
          action={onSectionNavigate ? (
            <Button size="sm" icon={<Lightbulb size={14} />} onClick={() => onSectionNavigate('lighting')}>
              {t('featureDisabled.widget.open', { feature: t('lighting.title') })}
            </Button>
          ) : undefined}
        />
      </div>
    );
  }

  // Immersive (fullscreen panel) variant: a row of icon-only mode buttons
  // on top, preview below. Shown for every mode and regardless of the
  // simple/advanced widget setting. `immersiveCanvas` replaces that preview
  // with a mode's own canvas.
  if (immersive) {
    return (
      <div className={styles.lighting} data-size={widget.size} data-mode={mode} data-immersive="true">
        <div className={styles.immersiveModeGrid}>
          {modeButtons.map(m => {
            const Icon = LIGHTING_MODE_ICONS[m.key];
            return (
              <IconLabelButton
                key={m.key}
                variant="bare"
                className={styles.immersiveModeButton}
                icon={<Icon aria-hidden="true" />}
                active={mode === m.key}
                ariaLabel={t(m.labelKey)}
                onPress={() => handleMode(m.key)}
              />
            );
          })}
        </div>
        {immersiveCanvas ? <div className={styles.thumbBox}>{immersiveCanvas}</div> : (
          <SingleItemView
            view={view}
            t={t}
            showArrows={false}
            overlay={
              <>
                {mode === 'animate'
                  ? (
                    <button
                      type="button"
                      className={styles.previewExpand}
                      onClick={() => setShaderFullscreen(true)}
                      aria-label={t('lighting.fullscreen')}
                    >
                      {/* Gated off while fullscreen is open: that view (below)
                          fully occludes this one, so only one WebGL context runs
                          at a time. The shader source is cached, so the remount
                          on close is instant. */}
                      {!shaderFullscreen && <LightingShaderPreview effect={activeEffect} state={animateState} gpuAvailable={gpuAvailable} gpuState={gpuState} paused={paused} />}
                    </button>
                  )
                  : <LightingLivePreview />}
                {flash}
              </>
            }
          />
        )}
        {mode === 'animate' && shaderFullscreen && (
          <button
            type="button"
            className={styles.shaderFullscreen}
            onClick={() => setShaderFullscreen(false)}
            // Of the shader views only the FULLSCREEN one blocks the overlay's
            // swipe-to-dismiss; the small preview above must stay swipeable to
            // close the panel. An immersiveCanvas may opt out on its own - the
            // Static picker does, since a vertical pick is its own drag.
            data-panel-no-sheet-swipe="true"
            aria-label={t('lighting.fullscreen.exit')}
          >
            <LightingShaderPreview effect={activeEffect} state={animateState} gpuAvailable={gpuAvailable} gpuState={gpuState} paused={paused} />
          </button>
        )}
      </div>
    );
  }

  // Simple mode: same UX at every size - center icon/label + arrows, no
  // mode-buttons row. The arrows switch mode (see cycleMode).
  if (simpleMode) {
    return (
      <div className={styles.lighting} data-size={widget.size} data-mode={mode} data-simple="true">
        <SingleItemView view={view} t={t} showArrows overlay={thumbFlash} framed />
      </div>
    );
  }

  if (compact) {
    return (
      <div className={styles.lighting} data-size={widget.size} data-mode={mode}>
        <SingleItemView view={view} t={t} showArrows={false} overlay={thumbFlash} framed />
      </div>
    );
  }

  return (
    <div className={styles.lighting} data-size={widget.size} data-mode={mode}>
      {/* The mode buttons below pick the mode, so no arrows here. */}
      <SingleItemView view={view} t={t} showArrows={false} overlay={thumbFlash} framed />
      <div className={styles.modeGrid}>
        {modeButtons.map(m => {
          const Icon = LIGHTING_MODE_ICONS[m.key];
          return (
            <IconLabelButton
              key={m.key}
              variant="bare"
              className={styles.modeButton}
              icon={<Icon aria-hidden="true" />}
              active={mode === m.key}
              title={t(m.labelKey)}
              ariaLabel={t(m.labelKey)}
              onPress={() => handleMode(m.key)}
            />
          );
        })}
      </div>
    </div>
  );
}

type SingleView =
  | { kind: 'thumb'; thumbUrl: string | null; label: string; onPrev?: () => void; onNext?: () => void }
  | { kind: 'icon';  icon: LucideIcon; muted?: boolean; label: string; onPrev?: () => void; onNext?: () => void };

function SingleItemView({ view, t, showArrows, overlay, framed }: { view: SingleView; t: (key: string) => string; showArrows: boolean; overlay?: ReactNode; framed?: boolean }) {
  const arrowsRendered = showArrows && !!view.onPrev && !!view.onNext;
  return (
    <div className={styles.thumbBox}>
      {view.kind === 'thumb' && framed ? (
        // Same card as the animation browser (EffectCard overlay), centered
        // at the browser's 16/9 aspect instead of stretched edge-to-edge.
        <div className={styles.thumbCardBox}>
          <div className={styles.thumbCardFit}>
            <EffectCard overlay nonInteractive label={view.label} thumbUrl={view.thumbUrl} active={false} />
            {overlay}
          </div>
        </div>
      ) : (
        <span className={styles.thumb}>
          {view.kind === 'icon' && (
            <span className={styles.thumbIconWrap}>
              {/* eslint-disable-next-line i18next/no-literal-string -- aria boolean */}
              <view.icon className={`${styles.thumbIcon} ${view.muted ? styles.thumbIconMuted : ''}`} aria-hidden="true" />
              <span className={styles.thumbCaption}>{view.label}</span>
            </span>
          )}
          {view.kind === 'thumb' && (
            view.thumbUrl
              ? (
                <>
                  <img src={view.thumbUrl} alt="" draggable={false} />
                  <span className={styles.thumbVignette} aria-hidden="true" />
                  <span className={styles.thumbLabel}>{view.label}</span>
                </>
              )
              : <span className={styles.thumbSkeleton} />
          )}
          {view.kind === 'thumb' && overlay}
        </span>
      )}
      {arrowsRendered && (
        <>
          <PanelArrowButton
            side="prev"
            className={styles.arrowBtn}
            onClick={view.onPrev!}
            ariaLabel={t('lighting.panel.prev')}
          />
          <PanelArrowButton
            side="next"
            className={styles.arrowBtn}
            onClick={view.onNext!}
            ariaLabel={t('lighting.panel.next')}
          />
        </>
      )}
    </div>
  );
}

function resolveEffectState(
  effectKey: string,
  templates: Record<string, EffectTemplateBundle>,
  saved?: EffectState,
): EffectState {
  const base = defaultStateFor(effectKey);
  if (saved) {
    return {
      ...base,
      ...saved,
      params: { ...base.params, ...(saved.params ?? {}) },
    };
  }
  const bundle = templates[effectKey];
  return bundle?.slots[bundle.selected] ?? base;
}

export default LightingWidget;
