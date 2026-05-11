import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Lightbulb } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  fetchAnimateSettings,
  fetchCurrentSync,
  fetchLightingDevices,
  fetchStaticColor,
  setMusicReactive,
  startAnimate,
  startScreenMirror,
  startStatic,
  stopLighting,
} from '../../../api/lighting';
import {
  fetchMediaCurrent,
  fetchMediaLibrary,
  playCurrentOrFirstMedia,
  playMedia,
  type MediaItem,
} from '../../../api/mediaLibrary';
import { fetchServiceBlob } from '../../../api/service';
import { useTopicCallback } from '../../../hooks/useMultiplexSocket';
import { publishControlSync } from '../../../lib/controlSync';
import { useTranslation } from '../../../lib/i18n';
import { LIGHTING_MODE_ICONS } from '../../../lib/lightingModeIcons';
import {
  EFFECTS,
  MODES,
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
  const mediaThumbsRef = useRef<Record<string, string>>({});
  const compact = widget.size === '2x2';

  const hydrate = useCallback(async () => {
    const [sync, animate, color] = await Promise.all([
      fetchCurrentSync(),
      fetchAnimateSettings(),
      fetchStaticColor(),
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
  }, []);

  useEffect(() => {
    hydrate();
  }, [hydrate]);
  // Push-driven refresh: every lighting mutation on the service publishes a
  // 'lighting' frame on the multiplex hub. We refetch the canonical state
  // on receive instead of polling on a 4s timer.
  useTopicCallback('lighting', true, hydrate);

  useEffect(() => {
    if (compact) return;
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
  }, [compact]);

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

  const applyMedia = useCallback(async (id: string) => {
    const ok = await playMedia(id);
    if (ok) {
      setActiveMediaId(id);
      setMode('gif');
      publishLighting('gif', 'media');
    }
  }, [publishLighting]);

  const setLightingMode = useCallback(async (nextMode: LightingMode) => {
    if (nextMode === 'animate') {
      const effect = EFFECTS.some(e => e.key === activeEffect) ? activeEffect : 'rainbow';
      await applyEffect(effect);
      return;
    }
    if (nextMode === 'static') {
      await applyStatic(staticColor);
      return;
    }
    if (nextMode === 'screen') {
      setMode('screen');
      setMusicReactive(false).catch(() => { /* best-effort */ });
      await startScreenMirror(1, 1, '', 0, 0);
      publishLighting('screen', 'screen');
      return;
    }
    if (nextMode === 'gif') {
      setMusicReactive(false).catch(() => { /* best-effort */ });
      const mediaId = await playCurrentOrFirstMedia();
      if (mediaId) {
        setActiveMediaId(mediaId);
        setMode('gif');
        publishLighting('gif', 'media');
      }
      return;
    }
    setMode('none');
    setMusicReactive(false).catch(() => { /* best-effort */ });
    await stopLighting();
    publishLighting('none', 'none');
  }, [activeEffect, applyEffect, applyStatic, publishLighting, staticColor]);

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

  const cycleMedia = useCallback((delta: number) => {
    if (!mediaItems.length) return;
    const idx = mediaItems.findIndex(m => m.id === activeMediaId);
    const base = idx < 0 ? 0 : idx;
    const nextIdx = (base + delta + mediaItems.length) % mediaItems.length;
    applyMedia(mediaItems[nextIdx].id);
  }, [activeMediaId, applyMedia, mediaItems]);

  const singleView = useMemo(() => {
    if (compact) return null;
    if (mode === 'animate') {
      const effect = EFFECTS.find(e => e.key === activeEffect) ?? EFFECTS[0];
      return {
        kind: 'thumb' as const,
        thumbUrl: thumbs[effect.key] ?? null,
        label: t(effect.labelKey),
        showArrows: true,
        onPrev: () => cycleAnimate(-1),
        onNext: () => cycleAnimate(1),
      };
    }
    if (mode === 'static') {
      const lower = staticColor.toLowerCase();
      const preset = STATIC_COLORS.find(c => c.hex.toLowerCase() === lower);
      return {
        kind: 'color' as const,
        color: staticColor,
        label: preset?.label ?? staticColor.toUpperCase(),
        showArrows: true,
        onPrev: () => cycleStatic(-1),
        onNext: () => cycleStatic(1),
      };
    }
    if (mode === 'gif') {
      const item = mediaItems.find(m => m.id === activeMediaId) ?? mediaItems[0];
      if (!item) {
        return { kind: 'message' as const, message: t('lighting.controls.noMedia') };
      }
      return {
        kind: 'thumb' as const,
        thumbUrl: mediaThumbs[item.id] ?? null,
        label: item.name.replace(/\.[^.]+$/, ''),
        showArrows: mediaItems.length > 1,
        onPrev: () => cycleMedia(-1),
        onNext: () => cycleMedia(1),
      };
    }
    if (mode === 'screen') {
      return { kind: 'message' as const, message: t('lighting.panel.screenActive') };
    }
    return { kind: 'message' as const, message: t('lighting.panel.selectMode') };
  }, [compact, mode, activeEffect, thumbs, t, staticColor, mediaItems, activeMediaId, mediaThumbs, cycleAnimate, cycleStatic, cycleMedia]);

  const activeModeLabel = t(MODES.find(item => item.key === mode)?.labelKey ?? 'lighting.mode.off');
  const showControls = widget.config?.showControls?.b ?? true;
  const displayOnly = !showControls;

  const [deviceCount, setDeviceCount] = useState(0);
  useEffect(() => {
    if (!displayOnly) return;
    let cancelled = false;
    const refresh = async () => {
      const data = await fetchLightingDevices();
      if (cancelled || !data) return;
      setDeviceCount(data.devices?.length ?? 0);
    };
    refresh();
    return () => { cancelled = true; };
  }, [displayOnly]);
  useTopicCallback('lighting', displayOnly, () => {
    fetchLightingDevices().then(data => {
      if (data) setDeviceCount(data.devices?.length ?? 0);
    });
  });

  if (displayOnly) {
    const lightingOn = mode !== 'none';
    const deviceLabel = deviceCount === 1
      ? t('panel.widget.lighting.deviceCount.one')
      : t('panel.widget.lighting.deviceCount.other').replace('{n}', String(deviceCount));
    return (
      <div className={styles.lighting} data-size={widget.size} data-mode={mode} data-display-only="true">
        <div className={styles.display}>
          <Lightbulb className={styles.displayIcon} aria-hidden="true" />
          <div className={styles.displayMode}>{activeModeLabel}</div>
          {lightingOn && deviceCount > 0 && <div className={styles.displayValue}>{deviceLabel}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.lighting} data-size={widget.size} data-mode={mode}>
      {singleView && (
        <SingleItemView
          view={singleView}
          modeLabel={!compact ? activeModeLabel : null}
          t={t}
        />
      )}
      <div className={styles.modeGrid}>
        {MODES.map(item => (
          <ModeButton
            key={item.key}
            icon={LIGHTING_MODE_ICONS[item.key]}
            label={t(item.labelKey)}
            active={mode === item.key}
            onClick={() => setLightingMode(item.key)}
          />
        ))}
      </div>
    </div>
  );
}

function ModeButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={styles.modeButton}
      data-active={active ? 'true' : 'false'}
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      <Icon size={15} />
    </button>
  );
}

type SingleView =
  | {
      kind: 'thumb';
      thumbUrl: string | null;
      label: string;
      showArrows: boolean;
      onPrev: () => void;
      onNext: () => void;
    }
  | {
      kind: 'color';
      color: string;
      label: string;
      showArrows: boolean;
      onPrev: () => void;
      onNext: () => void;
    }
  | { kind: 'message'; message: string };

function SingleItemView({ view, modeLabel, t }: { view: SingleView; modeLabel: string | null; t: (key: string) => string }) {
  if (view.kind === 'message') {
    return <div className={styles.message}>{view.message}</div>;
  }
  return (
    <div className={styles.thumbBox}>
      <span className={styles.thumb}>
        {view.kind === 'color'
          ? <span className={styles.thumbSwatch} style={{ background: view.color }} />
          : view.thumbUrl
            ? <img src={view.thumbUrl} alt="" draggable={false} />
            : <span className={styles.thumbSkeleton} />}
      </span>
      {modeLabel && <span className={styles.modeLabel}>{modeLabel}</span>}
      <span className={styles.itemLabel} title={view.label}>{view.label}</span>
      <button
        type="button"
        className={styles.arrowBtn}
        data-side="prev"
        onClick={view.onPrev}
        disabled={!view.showArrows}
        aria-label={t('lighting.panel.prev')}
      >
        <ChevronLeft />
      </button>
      <button
        type="button"
        className={styles.arrowBtn}
        data-side="next"
        onClick={view.onNext}
        disabled={!view.showArrows}
        aria-label={t('lighting.panel.next')}
      >
        <ChevronRight />
      </button>
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
