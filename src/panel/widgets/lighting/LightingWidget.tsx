import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Lightbulb, Monitor } from 'lucide-react';
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
  setMusicReactive,
  setScreenEffect,
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
  playMedia,
  type MediaItem,
} from '../../../api/mediaLibrary';
import { fetchServiceBlob, pingService } from '../../../api/service';
import { EffectCard } from '../../../components/common/EffectCard/EffectCard';
import { IconLabelButton } from '../../../components/common/IconLabelButton/IconLabelButton';
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
  STATIC_EFFECTS,
  defaultStateFor,
  isStaticEffect,
  type EffectState,
  type EffectTemplateBundle,
  type LightingMode,
} from '../../../types/lighting';
import { normalizeSync as resolveMode } from '../../../hooks/useLightingSync';
import { mergeTemplates, slotThumbSignature } from '../../../types/lightingTemplates';
import { useUiSettings } from '../../../hooks/useUiSettings';
import { resolveAdvancedMode } from '../common/AdvancedModeSettings';
import { useStateChangePulse } from '../common/useStateChangePulse';
import { usePanelPreview } from '../common/PanelPreviewContext';
import { LightingLivePreview } from './LightingLivePreview';
import { LightingShaderPreview } from './LightingShaderPreview';
import type { WidgetProps } from '../types';
import styles from './LightingWidget.module.scss';

// Catalog preview pins screen mode (pass-through, reactive=false):
// the icon view renders with zero fetch/socket/blob traffic. Keep in sync with
// the simple-mode render - see .agents/rules/widget-preview-fixtures.md in the
// master repo.
const LIGHTING_PREVIEW_MODE: LightingMode = 'screen';

export function LightingWidget({ widget, immersive }: WidgetProps & { immersive?: boolean }) {
  const { t, language } = useTranslation();
  const { settings: ui } = useUiSettings();
  const preview = usePanelPreview();
  // Preview forces simple mode for determinism.
  const simpleMode = preview || !resolveAdvancedMode(widget.config, ui.widgetAdvancedMode);
  const [mode, setMode] = useState<LightingMode>(preview ? LIGHTING_PREVIEW_MODE : 'none');
  const [gpuAvailable, setGpuAvailable] = useState(true);
  const [activeDeviceCount, setActiveDeviceCount] = useState(0);
  // WS-synced from /lighting/current (re-hydrated on the 'lighting' topic), so
  // the shader preview freezes when lighting is paused from any surface.
  const [paused, setPaused] = useState(false);
  const [activeEffect, setActiveEffect] = useState('rainbow');
  // The service's remembered static key, so entering the mode from animate
  // returns to the last static pick instead of the catalog default.
  const staticEffectRef = useRef(DEFAULT_STATIC_EFFECT);
  const [templates, setTemplates] = useState<Record<string, EffectTemplateBundle>>({});
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
    if (preview) return;
    let cancelled = false;
    pingService().then(p => {
      if (!cancelled && p?.platform) setPlatform(p.platform);
    });
    return () => { cancelled = true; };
  }, [preview]);
  const modeButtons = useMemo(
    () => MODES.filter(m => m.key !== 'gamesync' || platform === 'windows'),
    [platform],
  );

  // Immersive only: tapping the live shader preview expands it to a full-bleed
  // shader view; tapping that closes it. Auto-closes whenever the mode leaves
  // animate - the fullscreen view only renders a shader effect.
  const [shaderFullscreen, setShaderFullscreen] = useState(false);

  // False until the first hydrate() resolves: mode/effect/filter sets
  // before that are hydration, not state changes, and must not animate.
  const [hydrated, setHydrated] = useState(false);
  // Discrete selection only - the live-preview canvas and thumbnail blob
  // loads must never trigger the flash.
  const flashPulse = useStateChangePulse(
    mode === 'animate' ? `animate:${activeEffect}`
      : mode === 'static' ? `static:${activeEffect}`
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

  const hydrate = useCallback(async () => {
    const [sync, animate, staticSettings, screen, lightStatus, defaults, deviceList] = await Promise.all([
      fetchCurrentSync(),
      fetchAnimateSettings(),
      fetchStaticSettings(),
      fetchScreenEffect(),
      fetchLightingStatus(),
      fetchAnimateDefaults(),
      fetchLightingDevices(),
    ]);
    setGpuAvailable(lightStatus?.gpuAvailable ?? true);
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
    const nextEffect = nextMode === 'static'
      ? staticEffectRef.current
      : EFFECTS.some(e => e.key === rawSync)
        ? rawSync
        : animate?.effect || 'rainbow';
    setActiveEffect(nextEffect);

    setMode(nextMode);
    setPaused(!!sync?.paused);
    setReactive(screen?.reactive ?? false);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (preview) return;
    // hydrate() fetches initial lighting state over HTTP; its setState
    // calls run after the fetches resolve, not during the effect body.

    hydrate();
  }, [preview, hydrate]);
  useTopicCallback('lighting', !preview, hydrate);

  // Leaving animate (a mode change from this surface or an external broadcast)
  // dismisses the immersive fullscreen shader.
  useEffect(() => {
    if (mode !== 'animate' && mode !== 'static') setShaderFullscreen(false);
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
    if (preview || !activeEffect) return;
    const want = activeVersion ?? '';
    if (loadedVersionRef.current[activeEffect] === want) return;
    let cancelled = false;
    (async () => {
      // frozen: static renders at speed 0, a different image than the animate
      // tile, and useEffectThumbnail keys its cache on the same flag.
      const blob = await fetchServiceBlob(effectThumbnailPath(activeEffect, activeSlot, activeVersion, mode === 'static'));
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

  // Media library is only needed in gif mode: the active media name, and the
  // simple-mode arrows cycle it. Skipped at 2x2 advanced, which shows neither.
  // mediaLoaded separates "library not fetched yet" from "library is empty".
  const [mediaLoaded, setMediaLoaded] = useState(false);
  const refreshMedia = useCallback(async () => {
    const [lib, cur] = await Promise.all([fetchMediaLibrary(), fetchMediaCurrent()]);
    if (lib?.items) {
      setMediaItems(lib.items);
      // A failed fetch stays "not loaded" so the arrows keep no-oping; the
      // lighting-topic subscription retries on the next broadcast.
      setMediaLoaded(true);
    }
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
    setMode('animate');
    setMusicReactive(false).catch(() => { /* best-effort */ });
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
    setMode('static');
    setMusicReactive(false).catch(() => { /* best-effort */ });
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

  const applyMirror = useCallback(async (nextReactive: boolean) => {
    setReactive(nextReactive);
    setMode('screen');
    setMusicReactive(false).catch(() => { /* best-effort */ });
    const current = await fetchScreenEffect();
    const next = { hue: 0, colorize: 0, saturation: 1, contrast: 1, reactivity: 0.5, intensity: 0.5, ...current, reactive: nextReactive };
    await setScreenEffect(next, true);
    await startScreenMirror(next.saturation, next.contrast, '', next.hue, next.colorize);
    publishLighting('screen', 'screen');
  }, [publishLighting]);

  const cycleAnimate = useCallback((delta: number) => {
    const pool = mode === 'static' ? STATIC_EFFECTS : ANIMATE_EFFECTS;
    const idx = pool.findIndex(e => e.key === activeEffect);
    const nextIdx = (idx < 0 ? 0 : (idx + delta + pool.length) % pool.length);
    const next = pool[nextIdx];
    const nextState = resolveEffectState(next.key, templates);
    if (mode === 'static') {
      void applyStatic(next.key, nextState);
      return;
    }
    applyEffect(next.key, nextState);
  }, [activeEffect, applyEffect, applyStatic, mode, templates]);

  const toggleReactive = useCallback(() => {
    applyMirror(!reactive);
  }, [applyMirror, reactive]);

  const cycleMedia = useCallback(async (delta: number) => {
    // A missing active id anchors on index 0, the item the view displays, so
    // the first press advances instead of replaying it.
    const idx = mediaItems.findIndex(m => m.id === activeMediaId);
    const anchor = idx < 0 ? 0 : idx;
    const nextIdx = (anchor + delta + mediaItems.length) % mediaItems.length;
    const item = mediaItems[nextIdx];
    if (!item) return;
    // Optimistic set like the other apply paths, so rapid taps step from the
    // already-advanced anchor; a failed play re-syncs from the service.
    setActiveMediaId(item.id);
    if (!(await playMedia(item.id))) {
      void refreshMedia();
      return;
    }
    publishLighting('gif', 'gif');
  }, [mediaItems, activeMediaId, publishLighting, refreshMedia]);

  // Simple-mode arrow handler (NEX-64): cycles the current mode's own pool -
  // animations, static effects, media items, or the two mirror filters. From a
  // state with nothing to cycle (game sync / off / an empty media library),
  // the first press jumps into the animation list: right arrow lands on the
  // first effect, left arrow lands on the last effect (i.e. the cycle's
  // wrap-around starting position).
  const cycleCurrentPool = useCallback((delta: number) => {
    if (mode === 'animate' || mode === 'static') {
      cycleAnimate(delta);
      return;
    }
    if (mode === 'gif') {
      // Library not fetched yet: no-op rather than misread it as empty and
      // jump into the animation list.
      if (!mediaLoaded) return;
      if (mediaItems.length > 0) {
        void cycleMedia(delta);
        return;
      }
    }
    if (mode === 'screen') {
      toggleReactive();
      return;
    }
    const targetIdx = delta > 0 ? 0 : EFFECTS.length - 1;
    const next = EFFECTS[targetIdx];
    applyEffect(next.key, resolveEffectState(next.key, templates));
  }, [mode, cycleAnimate, mediaLoaded, mediaItems, cycleMedia, toggleReactive, applyEffect, templates]);

  const onAnimateButton = useCallback(() => {
    const effect = ANIMATE_EFFECTS.some(e => e.key === activeEffect) ? activeEffect : 'rainbow';
    applyEffect(effect);
  }, [activeEffect, applyEffect]);

  const onStaticButton = useCallback(() => {
    const effect = isStaticEffect(activeEffect) ? activeEffect : staticEffectRef.current;
    void applyStatic(effect);
  }, [activeEffect, applyStatic]);

  const onMirrorButton = useCallback(() => {
    applyMirror(reactive);
  }, [applyMirror, reactive]);

  const onMediaButton = useCallback(async () => {
    setMode('gif');
    setMusicReactive(false).catch(() => { /* best-effort */ });
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
    setMusicReactive(false).catch(() => { /* best-effort */ });
    await stopLighting();
    publishLighting('none', 'none');
  }, [publishLighting]);

  const onGameSyncButton = useCallback(async () => {
    setMode('gamesync');
    setMusicReactive(false).catch(() => { /* best-effort */ });
    await startGameSync();
    publishLighting('gamesync', 'gamesync');
  }, [publishLighting]);

  // Mode-button dispatch (widget row + immersive grid) - covers every mode.
  const handleMode = (k: LightingMode) => {
    if (k === 'none') onOffButton();
    else if (k === 'animate') onAnimateButton();
    else if (k === 'static') onStaticButton();
    else if (k === 'gif') onMediaButton();
    else if (k === 'screen') onMirrorButton();
    else if (k === 'gamesync') onGameSyncButton();
  };

  const view = useMemo<SingleView>(() => {
    // In simple mode every mode's prev/next cycles that mode's own pool
    // (see cycleCurrentPool).
    const prev = simpleMode ? () => cycleCurrentPool(-1) : undefined;
    const next = simpleMode ? () => cycleCurrentPool(1)  : undefined;

    if (mode === 'animate' || mode === 'static') {
      const pool = mode === 'static' ? STATIC_EFFECTS : ANIMATE_EFFECTS;
      const fallbackKey = mode === 'static' ? DEFAULT_STATIC_EFFECT : pool[0].key;
      const effect = pool.find(e => e.key === activeEffect)
        ?? pool.find(e => e.key === fallbackKey)
        ?? pool[0];
      return {
        kind: 'thumb',
        thumbUrl: thumbs[effect.key] ?? null,
        label: mode === 'static'
          ? t(pluralKey('lighting.devices.activeCount', language, activeDeviceCount), { count: activeDeviceCount })
          : t(effect.labelKey),
        onPrev: prev ?? (() => cycleAnimate(-1)),
        onNext: next ?? (() => cycleAnimate(1)),
      };
    }
    if (mode === 'screen') {
      return {
        kind: 'icon',
        icon: Monitor,
        label: t(reactive ? 'lighting.filter.reactive' : 'lighting.filter.passthrough'),
        onPrev: prev ?? toggleReactive,
        onNext: next ?? toggleReactive,
      };
    }
    if (mode === 'gamesync') {
      // Game Sync is driven by the captured game; nothing to cycle here. Simple
      // mode keeps arrows (prev/next jump into the animation list).
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
        return { kind: 'message', message: t('lighting.controls.noMedia'), label: t('lighting.mode.gif'), onPrev: prev, onNext: next };
      }
      return {
        kind: 'thumb',
        thumbUrl: mediaThumbs[item.id] ?? null,
        label: item.name.replace(/\.[^.]+$/, ''),
        onPrev: prev,
        onNext: next,
      };
    }
    // mode === 'none' (off). In simple mode we still show arrows so
    // the first press enters the animation cycle.
    return { kind: 'message', message: t('lighting.panel.selectMode'), label: t('lighting.mode.off'), onPrev: prev, onNext: next };
  }, [mode, activeEffect, activeDeviceCount, language, thumbs, t, reactive, mediaItems, activeMediaId, mediaThumbs, cycleAnimate, toggleReactive, simpleMode, cycleCurrentPool]);

  // The flash stands in for a thumbnail that has not painted yet, so it only
  // makes sense where a thumbnail renders: Off, Mirror and Game Sync show an
  // icon or a message and stay still.
  const thumbFlash = view.kind === 'thumb' ? flash : null;

  // Active Animate effect state for the immersive on-device preview: the shader
  // is rendered locally at full resolution, replacing the low-res streamed LED
  // canvas (LightingLivePreview) for shader effects only.
  const animateState = useMemo(
    () => {
      const state = resolveEffectState(activeEffect, templates);
      return mode === 'static' ? { ...state, speed: 0 } : state;
    },
    [activeEffect, mode, templates],
  );

  // Immersive (fullscreen panel) variant: a row of icon-only mode buttons
  // on top, preview below. Shown for every mode and regardless of the
  // simple/advanced widget setting.
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
        <SingleItemView
          view={view}
          t={t}
          showArrows={false}
          overlay={
            <>
              {mode === 'animate' || mode === 'static'
                ? (
                  <button
                    type="button"
                    className={styles.previewExpand}
                    onClick={() => setShaderFullscreen(true)}
                    // Tap opens the fullscreen shader; never arm the overlay's
                    // swipe-to-dismiss here (it races the tap on Y70 WebView2).
                    data-panel-no-sheet-swipe="true"
                    aria-label={t('lighting.fullscreen')}
                  >
                    {/* Gated off while fullscreen is open: that view (below)
                        fully occludes this one, so only one WebGL context runs
                        at a time. The shader source is cached, so the remount
                        on close is instant. */}
                    {!shaderFullscreen && <LightingShaderPreview effect={activeEffect} state={animateState} gpuAvailable={gpuAvailable} paused={paused} />}
                  </button>
                )
                : <LightingLivePreview />}
              {flash}
            </>
          }
        />
        {(mode === 'animate' || mode === 'static') && shaderFullscreen && (
          <button
            type="button"
            className={styles.shaderFullscreen}
            onClick={() => setShaderFullscreen(false)}
            data-panel-no-sheet-swipe="true"
            aria-label={t('lighting.fullscreen.exit')}
          >
            <LightingShaderPreview effect={activeEffect} state={animateState} gpuAvailable={gpuAvailable} paused={paused} />
          </button>
        )}
      </div>
    );
  }

  // Simple mode: same UX at every size - center icon/label + arrows,
  // no mode-buttons row. Arrows cycle the active mode's own pool
  // (wired via the `view` builder's simpleMode-aware onPrev/onNext).
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
      <SingleItemView view={view} t={t} showArrows overlay={thumbFlash} framed />
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
  | { kind: 'icon';  icon: LucideIcon;       label: string; onPrev?: () => void; onNext?: () => void }
  | { kind: 'message'; message: string;      label: string; onPrev?: () => void; onNext?: () => void };

function SingleItemView({ view, t, showArrows, overlay, framed }: { view: SingleView; t: (key: string) => string; showArrows: boolean; overlay?: ReactNode; framed?: boolean }) {
  const arrowsRendered = showArrows && !!view.onPrev && !!view.onNext;
  if (view.kind === 'message') {
    return (
      <div className={styles.thumbBox}>
        <span className={styles.thumb}>
          <span className={styles.thumbIconWrap}>
            {/* eslint-disable-next-line i18next/no-literal-string -- aria boolean */}
            <Lightbulb className={styles.thumbIcon} aria-hidden="true" />
            <span className={styles.thumbCaption}>{view.label}</span>
          </span>
        </span>
        {overlay}
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
              <view.icon className={styles.thumbIcon} aria-hidden="true" />
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
