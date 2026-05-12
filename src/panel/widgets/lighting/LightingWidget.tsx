import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Lightbulb, Monitor, Sparkles, Palette } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  fetchAnimateSettings,
  fetchCurrentSync,
  fetchScreenEffect,
  fetchStaticColor,
  setMusicReactive,
  setScreenEffect,
  startAnimate,
  startScreenMirror,
  startStatic,
} from '../../../api/lighting';
import {
  fetchMediaCurrent,
  fetchMediaLibrary,
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
} from '../../../components/views/lighting/screenFilters';
import {
  EFFECTS,
  defaultStateFor,
  type EffectState,
  type EffectTemplateBundle,
  type LightingMode,
} from '../../../types/lighting';
import { buildAllDefaultTemplates, mergeTemplates } from '../../../types/lightingTemplates';
import type { WidgetProps } from '../types';
import styles from './LightingWidget.module.scss';

const STATIC_COLORS = [
  { hex: '#ff0000', label: 'Red' },
  { hex: '#ff7a00', label: 'Orange' },
  { hex: '#ffe800', label: 'Yellow' },
  { hex: '#00ff2a', label: 'Green' },
  { hex: '#00c8ff', label: 'Cyan' },
  { hex: '#0033ff', label: 'Blue' },
  { hex: '#8b5cf6', label: 'Violet' },
  { hex: '#ff3bc0', label: 'Pink' },
  { hex: '#ffffff', label: 'White' },
];

type WidgetMode = 'animate' | 'screen' | 'static';

const WIDGET_BUTTONS: { key: WidgetMode; icon: LucideIcon; labelKey: string }[] = [
  { key: 'animate', icon: Sparkles, labelKey: 'lighting.mode.animate' },
  { key: 'screen',  icon: Monitor,  labelKey: 'lighting.mode.screen'  },
  { key: 'static',  icon: Palette,  labelKey: 'lighting.mode.static'  },
];

export function LightingWidget({ widget }: WidgetProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<LightingMode>('none');
  const [activeEffect, setActiveEffect] = useState('rainbow');
  const [templates, setTemplates] = useState<Record<string, EffectTemplateBundle>>(buildAllDefaultTemplates);
  const [staticColor, setStaticColor] = useState('#ff0000');
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [activeMediaId, setActiveMediaId] = useState<string | null>(null);
  const [mediaThumbs, setMediaThumbs] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<ScreenFilterKey>(DEFAULT_SCREEN_FILTER);
  const mediaThumbsRef = useRef<Record<string, string>>({});
  const compact = widget.size === '2x2';

  const hydrate = useCallback(async () => {
    const [sync, animate, color, screen] = await Promise.all([
      fetchCurrentSync(),
      fetchAnimateSettings(),
      fetchStaticColor(),
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

    if (color) {
      setStaticColor(rgbToHex(color.r, color.g, color.b));
    }
    setMode(resolveMode(rawSync));
    setFilter(matchScreenFilter(screen) ?? DEFAULT_SCREEN_FILTER);
  }, []);

  useEffect(() => {
    hydrate();
  }, [hydrate]);
  useTopicCallback('lighting', true, hydrate);

  useEffect(() => {
    let cancelled = false;
    const urls: string[] = [];
    (async () => {
      for (const effect of EFFECTS) {
        const blob = await fetchServiceBlob(`/lighting/effects/${effect.key}/thumbnail.bmp`);
        if (cancelled) return;
        if (!blob) continue;
        const url = URL.createObjectURL(blob);
        urls.push(url);
        setThumbs(prev => ({ ...prev, [effect.key]: url }));
      }
    })();
    return () => {
      cancelled = true;
      urls.forEach(url => URL.revokeObjectURL(url));
    };
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

  const applyStatic = useCallback(async (hex: string) => {
    setStaticColor(hex);
    setMode('static');
    setMusicReactive(false).catch(() => { /* best-effort */ });
    const rgb = hexToRgb(hex);
    await startStatic(rgb.r, rgb.g, rgb.b);
    publishLighting('static', 'static', { staticColor: hex });
  }, [publishLighting]);

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

  const cycleStatic = useCallback((delta: number) => {
    const lower = staticColor.toLowerCase();
    const idx = STATIC_COLORS.findIndex(c => c.hex.toLowerCase() === lower);
    const base = idx < 0 ? 0 : idx;
    const nextIdx = (base + delta + STATIC_COLORS.length) % STATIC_COLORS.length;
    applyStatic(STATIC_COLORS[nextIdx].hex);
  }, [applyStatic, staticColor]);

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

  const onStaticButton = useCallback(() => {
    applyStatic(staticColor);
  }, [applyStatic, staticColor]);

  const handleButton = (k: WidgetMode) => {
    if (k === 'animate') onAnimateButton();
    else if (k === 'screen') onMirrorButton();
    else if (k === 'static') onStaticButton();
  };

  const view = useMemo<SingleView>(() => {
    if (mode === 'animate') {
      const effect = EFFECTS.find(e => e.key === activeEffect) ?? EFFECTS[0];
      return {
        kind: 'thumb',
        thumbUrl: thumbs[effect.key] ?? null,
        label: t(effect.labelKey),
        onPrev: () => cycleAnimate(-1),
        onNext: () => cycleAnimate(1),
      };
    }
    if (mode === 'static') {
      const lower = staticColor.toLowerCase();
      const preset = STATIC_COLORS.find(c => c.hex.toLowerCase() === lower);
      return {
        kind: 'color',
        color: staticColor,
        label: preset?.label ?? staticColor.toUpperCase(),
        onPrev: () => cycleStatic(-1),
        onNext: () => cycleStatic(1),
      };
    }
    if (mode === 'screen') {
      const def = screenFilterByKey(filter);
      return {
        kind: 'icon',
        icon: Monitor,
        label: t(def.i18nKey),
        onPrev: () => cycleFilter(-1),
        onNext: () => cycleFilter(1),
      };
    }
    if (mode === 'gif') {
      const item = mediaItems.find(m => m.id === activeMediaId) ?? mediaItems[0];
      if (!item) {
        return { kind: 'message', message: t('lighting.controls.noMedia'), label: t('lighting.mode.gif') };
      }
      return {
        kind: 'thumb',
        thumbUrl: mediaThumbs[item.id] ?? null,
        label: item.name.replace(/\.[^.]+$/, ''),
      };
    }
    return { kind: 'message', message: t('lighting.panel.selectMode'), label: t('lighting.mode.off') };
  }, [mode, activeEffect, thumbs, t, staticColor, filter, mediaItems, activeMediaId, mediaThumbs, cycleAnimate, cycleStatic, cycleFilter]);

  const widgetMode: WidgetMode | null =
    mode === 'animate' ? 'animate'
    : mode === 'static' ? 'static'
    : mode === 'screen' ? 'screen'
    : null;

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
            title={t(item.labelKey)}
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
  | { kind: 'color'; color: string;          label: string; onPrev?: () => void; onNext?: () => void }
  | { kind: 'icon';  icon: LucideIcon;       label: string; onPrev?: () => void; onNext?: () => void }
  | { kind: 'message'; message: string;      label: string };

function SingleItemView({ view, t, showArrows }: { view: SingleView; t: (key: string) => string; showArrows: boolean }) {
  if (view.kind === 'message') {
    return (
      <div className={styles.thumbBox}>
        <span className={styles.thumb}>
          <span className={styles.thumbIconWrap}>
            <Lightbulb className={styles.thumbIcon} aria-hidden="true" />
          </span>
        </span>
      </div>
    );
  }
  const arrowsRendered = showArrows && !!view.onPrev && !!view.onNext;
  return (
    <div className={styles.thumbBox}>
      <span className={styles.thumb}>
        {view.kind === 'color' && <span className={styles.thumbSwatch} style={{ background: view.color }} />}
        {view.kind === 'icon' && <span className={styles.thumbIconWrap}><view.icon className={styles.thumbIcon} aria-hidden="true" /></span>}
        {view.kind === 'thumb' && (
          view.thumbUrl
            ? <img src={view.thumbUrl} alt="" draggable={false} />
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
  if (sync === 'static') return 'static';
  if (sync === 'screen' || sync.includes('mirror')) return 'screen';
  if (sync === 'gif' || sync.includes('media')) return 'gif';
  return 'animate';
}

function hexToRgb(hex: string) {
  const value = hex.replace('#', '');
  const n = Number.parseInt(value.length === 3
    ? value.split('').map(ch => ch + ch).join('')
    : value, 16);
  return {
    r: (n >> 16) & 255,
    g: (n >> 8) & 255,
    b: n & 255,
  };
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('')}`;
}

export default LightingWidget;
