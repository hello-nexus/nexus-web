import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Film, Lightbulb, Monitor, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  fetchAnimateSettings,
  fetchCurrentSync,
  fetchScreenEffect,
  setMusicReactive,
  setScreenEffect,
  startAnimate,
  startScreenMirror,
} from '../../../api/lighting';
import {
  fetchMediaCurrent,
  fetchMediaLibrary,
  playCurrentOrFirstMedia,
  type MediaItem,
} from '../../../api/mediaLibrary';
import { fetchServiceBlob } from '../../../api/service';
import { useTopicCallback } from '../../../hooks/useMultiplexSocket';
import { publishControlSync } from '../../../lib/controlSync';
import { useTranslation } from '../../../lib/i18n';
import {
  DEFAULT_SCREEN_FILTER,
  SCREEN_FILTERS,
  matchScreenFilter,
  screenFilterByKey,
  type ScreenFilterKey,
} from './page/screenFilters';
import {
  EFFECTS,
  defaultStateFor,
  type EffectState,
  type EffectTemplateBundle,
  type LightingMode,
} from '../../../types/lighting';
import { buildAllDefaultTemplates, mergeTemplates } from '../../../types/lightingTemplates';
import { useUiSettings } from '../../../hooks/useUiSettings';
import { resolveAdvancedMode } from '../common/AdvancedModeSettings';
import type { WidgetProps } from '../types';
import styles from './LightingWidget.module.scss';

type WidgetMode = 'animate' | 'gif' | 'screen';

const WIDGET_BUTTONS: { key: WidgetMode; icon: LucideIcon; labelKey: string }[] = [
  { key: 'animate', icon: Sparkles, labelKey: 'lighting.mode.animate' },
  { key: 'gif',     icon: Film,     labelKey: 'lighting.mode.gif'     },
  { key: 'screen',  icon: Monitor,  labelKey: 'lighting.mode.screen'  },
];

export function LightingWidget({ widget }: WidgetProps) {
  const { t } = useTranslation();
  const { settings: ui } = useUiSettings();
  const simpleMode = !resolveAdvancedMode(widget.config, ui.widgetAdvancedMode);
  const [mode, setMode] = useState<LightingMode>('none');
  const [activeEffect, setActiveEffect] = useState('rainbow');
  const [templates, setTemplates] = useState<Record<string, EffectTemplateBundle>>(buildAllDefaultTemplates);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [activeMediaId, setActiveMediaId] = useState<string | null>(null);
  const [mediaThumbs, setMediaThumbs] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<ScreenFilterKey>(DEFAULT_SCREEN_FILTER);
  const mediaThumbsRef = useRef<Record<string, string>>({});
  const compact = widget.size === '2x2';

  const hydrate = useCallback(async () => {
    const [sync, animate, screen] = await Promise.all([
      fetchCurrentSync(),
      fetchAnimateSettings(),
      fetchScreenEffect(),
    ]);

    const nextTemplates = buildAllDefaultTemplates();
    if (animate?.templates) {
      for (const effect of EFFECTS) {
        nextTemplates[effect.key] = mergeTemplates(effect.key, animate.templates[effect.key]);
      }
    }
    setTemplates(nextTemplates);

    const rawSync = sync?.sync || 'none';
    const nextEffect = EFFECTS.some(e => e.key === rawSync)
      ? rawSync
      : animate?.effect || 'rainbow';
    setActiveEffect(nextEffect);

    setMode(resolveMode(rawSync));
    setFilter(matchScreenFilter(screen) ?? DEFAULT_SCREEN_FILTER);
  }, []);

  useEffect(() => {
    // hydrate() fetches initial lighting state from the service over HTTP;
    // the setState calls inside happen asynchronously after fetches resolve
    // (not synchronously during the effect body), so this is the canonical
    // "subscribe to external system" pattern despite the lint heuristic.
     
    hydrate();
  }, [hydrate]);
  useTopicCallback('lighting', true, hydrate);

  // The widget shows ONE thumbnail at a time (the active effect, with Prev/Next
  // cycling). Pre-fetching all 60+ effect BMPs on mount was pure waste; load
  // the active one on demand and cache subsequent picks as the user cycles.
  const thumbsRef = useRef<Record<string, string>>({});
  useEffect(() => {
    if (!activeEffect || thumbsRef.current[activeEffect]) return;
    let cancelled = false;
    (async () => {
      const blob = await fetchServiceBlob(`/lighting/effects/${activeEffect}/thumbnail.bmp`);
      if (cancelled || !blob) return;
      if (thumbsRef.current[activeEffect]) return;
      const url = URL.createObjectURL(blob);
      thumbsRef.current = { ...thumbsRef.current, [activeEffect]: url };
      setThumbs(thumbsRef.current);
    })();
    return () => { cancelled = true; };
  }, [activeEffect]);

  useEffect(() => () => {
    for (const url of Object.values(thumbsRef.current)) URL.revokeObjectURL(url);
    thumbsRef.current = {};
  }, []);

  // Media library is only needed when the service is actually in gif mode so
  // we can show the active media name; we never enter gif mode from the
  // widget, so no need to load library otherwise.
  const refreshMedia = useCallback(async () => {
    const [lib, cur] = await Promise.all([fetchMediaLibrary(), fetchMediaCurrent()]);
    if (lib?.items) setMediaItems(lib.items);
    if (cur?.mediaId !== undefined) setActiveMediaId(cur.mediaId);
  }, []);

  useEffect(() => {
    if (compact || mode !== 'gif') return;
    // refreshMedia() awaits HTTP fetches before updating state; setState only
    // runs once the network responses resolve, not synchronously in the effect.
     
    refreshMedia();
  }, [compact, mode, refreshMedia]);

  useEffect(() => () => {
    for (const url of Object.values(mediaThumbsRef.current)) {
      URL.revokeObjectURL(url);
    }
    mediaThumbsRef.current = {};
  }, []);

  useEffect(() => {
    if (compact || mode !== 'gif') return;
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
  }, [compact, mode, mediaItems]);

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

  const applyMirrorFilter = useCallback(async (key: ScreenFilterKey) => {
    const def = screenFilterByKey(key);
    setFilter(key);
    setMode('screen');
    setMusicReactive(false).catch(() => { /* best-effort */ });
    await setScreenEffect(def.pp);
    await startScreenMirror(def.pp.saturation, def.pp.contrast, '', def.pp.hue, def.pp.colorize);
    publishLighting('screen', 'screen');
  }, [publishLighting]);

  const cycleAnimate = useCallback((delta: number) => {
    const idx = EFFECTS.findIndex(e => e.key === activeEffect);
    const nextIdx = (idx < 0 ? 0 : (idx + delta + EFFECTS.length) % EFFECTS.length);
    const next = EFFECTS[nextIdx];
    applyEffect(next.key, resolveEffectState(next.key, templates));
  }, [activeEffect, applyEffect, templates]);

  // Simple-mode arrow handler. From inside an animation, behaves like
  // cycleAnimate. From any non-animate state (screen mirror / gif / off),
  // the first press jumps into the animation list: right arrow lands on
  // the first effect, left arrow lands on the last effect (i.e. the
  // cycle's wrap-around starting position).
  const enterOrCycleAnimate = useCallback((delta: number) => {
    if (mode === 'animate') {
      cycleAnimate(delta);
      return;
    }
    const targetIdx = delta > 0 ? 0 : EFFECTS.length - 1;
    const next = EFFECTS[targetIdx];
    applyEffect(next.key, resolveEffectState(next.key, templates));
  }, [mode, cycleAnimate, applyEffect, templates]);

  const cycleFilter = useCallback((delta: number) => {
    const idx = SCREEN_FILTERS.findIndex(f => f.key === filter);
    const base = idx < 0 ? 0 : idx;
    const nextIdx = (base + delta + SCREEN_FILTERS.length) % SCREEN_FILTERS.length;
    applyMirrorFilter(SCREEN_FILTERS[nextIdx].key);
  }, [applyMirrorFilter, filter]);

  const onAnimateButton = useCallback(() => {
    const effect = EFFECTS.some(e => e.key === activeEffect) ? activeEffect : 'rainbow';
    applyEffect(effect);
  }, [activeEffect, applyEffect]);

  const onMirrorButton = useCallback(() => {
    applyMirrorFilter(filter);
  }, [applyMirrorFilter, filter]);

  const onMediaButton = useCallback(async () => {
    setMode('gif');
    setMusicReactive(false).catch(() => { /* best-effort */ });
    await playCurrentOrFirstMedia();
    publishLighting('gif', 'gif');
  }, [publishLighting]);

  const handleButton = (k: WidgetMode) => {
    if (k === 'animate') onAnimateButton();
    else if (k === 'gif') onMediaButton();
    else if (k === 'screen') onMirrorButton();
  };

  const view = useMemo<SingleView>(() => {
    // Arrow handlers depend on simple-mode: in simple mode every
    // mode's prev/next jumps into / stays in the animation cycle (per
    // user spec — arrows ALWAYS cycle animations, never filters).
    const prev = simpleMode ? () => enterOrCycleAnimate(-1) : undefined;
    const next = simpleMode ? () => enterOrCycleAnimate(1)  : undefined;

    if (mode === 'animate') {
      const effect = EFFECTS.find(e => e.key === activeEffect) ?? EFFECTS[0];
      return {
        kind: 'thumb',
        thumbUrl: thumbs[effect.key] ?? null,
        label: t(effect.labelKey),
        onPrev: prev ?? (() => cycleAnimate(-1)),
        onNext: next ?? (() => cycleAnimate(1)),
      };
    }
    if (mode === 'screen') {
      const def = screenFilterByKey(filter);
      return {
        kind: 'icon',
        icon: Monitor,
        label: t(def.i18nKey),
        onPrev: prev ?? (() => cycleFilter(-1)),
        onNext: next ?? (() => cycleFilter(1)),
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
  }, [mode, activeEffect, thumbs, t, filter, mediaItems, activeMediaId, mediaThumbs, cycleAnimate, cycleFilter, simpleMode, enterOrCycleAnimate]);

  const widgetMode: WidgetMode | null =
    mode === 'animate' ? 'animate'
    : mode === 'gif' ? 'gif'
    : mode === 'screen' ? 'screen'
    : null;

  // Simple mode: same UX at every size — center icon/label + arrows, no
  // mode-buttons row. Per user spec the arrows cycle through animations
  // regardless of current mode (cycleStatic / cycleFilter are skipped),
  // wired in the `view` builder above via simpleMode-aware onPrev/onNext.
  if (simpleMode) {
    return (
      <div className={styles.lighting} data-size={widget.size} data-mode={mode} data-simple="true">
        <SingleItemView view={view} t={t} showArrows />
      </div>
    );
  }

  if (compact) {
    return (
      <div className={styles.lighting} data-size={widget.size} data-mode={mode}>
        <SingleItemView view={view} t={t} showArrows={false} />
      </div>
    );
  }

  return (
    <div className={styles.lighting} data-size={widget.size} data-mode={mode}>
      <SingleItemView view={view} t={t} showArrows />
      <div className={styles.modeGrid}>
        {WIDGET_BUTTONS.map(item => (
          <button
            key={item.key}
            type="button"
            className={styles.modeButton}
            data-active={widgetMode === item.key ? 'true' : 'false'}
            onClick={() => handleButton(item.key)}
            aria-label={t(item.labelKey)}
          >
            <item.icon size={15} aria-hidden="true" />
            <span className={styles.modeButtonLabel}>{t(item.labelKey)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

type SingleView =
  | { kind: 'thumb'; thumbUrl: string | null; label: string; onPrev?: () => void; onNext?: () => void }
  | { kind: 'icon';  icon: LucideIcon;       label: string; onPrev?: () => void; onNext?: () => void }
  | { kind: 'message'; message: string;      label: string; onPrev?: () => void; onNext?: () => void };

function SingleItemView({ view, t, showArrows }: { view: SingleView; t: (key: string) => string; showArrows: boolean }) {
  const arrowsRendered = showArrows && !!view.onPrev && !!view.onNext;
  if (view.kind === 'message') {
    return (
      <div className={styles.thumbBox}>
        <span className={styles.thumb}>
          <span className={styles.thumbIconWrap}>
            <Lightbulb className={styles.thumbIcon} aria-hidden="true" />
            <span className={styles.thumbCaption}>{view.label}</span>
          </span>
        </span>
        {arrowsRendered && (
          <>
            <button
              type="button"
              className={styles.arrowBtn}
              data-side="prev"
              onClick={view.onPrev}
              aria-label={t('lighting.panel.prev')}
            >
              <ChevronLeft />
            </button>
            <button
              type="button"
              className={styles.arrowBtn}
              data-side="next"
              onClick={view.onNext}
              aria-label={t('lighting.panel.next')}
            >
              <ChevronRight />
            </button>
          </>
        )}
      </div>
    );
  }
  return (
    <div className={styles.thumbBox}>
      <span className={styles.thumb}>
        {view.kind === 'icon' && (
          <span className={styles.thumbIconWrap}>
            <view.icon className={styles.thumbIcon} aria-hidden="true" />
            <span className={styles.thumbCaption}>{view.label}</span>
          </span>
        )}
        {view.kind === 'thumb' && (
          view.thumbUrl
            ? (
              <>
                <img src={view.thumbUrl} alt="" draggable={false} />
                <span className={styles.thumbLabel}>{view.label}</span>
              </>
            )
            : <span className={styles.thumbSkeleton} />
        )}
      </span>
      {arrowsRendered && (
        <>
          <button
            type="button"
            className={styles.arrowBtn}
            data-side="prev"
            onClick={view.onPrev}
            aria-label={t('lighting.panel.prev')}
          >
            <ChevronLeft />
          </button>
          <button
            type="button"
            className={styles.arrowBtn}
            data-side="next"
            onClick={view.onNext}
            aria-label={t('lighting.panel.next')}
          >
            <ChevronRight />
          </button>
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

function resolveMode(sync: string): LightingMode {
  if (!sync || sync === 'none') return 'none';
  if (sync === 'screen' || sync.includes('mirror')) return 'screen';
  if (sync === 'gif' || sync.includes('media')) return 'gif';
  return 'animate';
}

export default LightingWidget;
