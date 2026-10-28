import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { effectThumbnailPath } from '../../../api/lighting';
import { fetchServiceBlob } from '../../../api/service';
import { EffectCard } from '../../../components/common/EffectCard/EffectCard';
import { useTranslation } from '../../../lib/i18n';
import { paletteFamilyKey, type PaletteColor } from '../../../types/lightingPalette';
import type { EffectTemplateBundle } from '../../../types/lighting';
import { slotThumbSignature } from '../../../types/lightingTemplates';
import type { PanelWidget } from '../../types';
import { ANIMATE_SWATCHES, STATIC_SWATCHES, defaultSwatchCount, fitSwatchGrid, type SwatchEffect, type SwatchGrid } from './swatches';
import styles from './LightingWidget.module.scss';

const ANIMATE_ASPECT = 16 / 9;

interface Props {
  kind: 'static' | 'animate';
  size: PanelWidget['size'];
  activeEffect: string;
  activeColor: string;
  templates: Record<string, EffectTemplateBundle>;
  preview: boolean;
  previewThumb?: string;
  onColor: (color: PaletteColor) => void;
  onEffect: (key: string) => void;
}

function useFit(kind: Props['kind'], size: Props['size']) {
  const ref = useRef<HTMLDivElement>(null);
  const [grid, setGrid] = useState<SwatchGrid | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const max = kind === 'static' ? STATIC_SWATCHES.length : ANIMATE_SWATCHES.length;
    const aspect = kind === 'static' ? 1 : ANIMATE_ASPECT;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setGrid(fitSwatchGrid(r.width, r.height, aspect, max));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [kind, size]);
  return { ref, grid };
}

function useEffectThumbs(effects: readonly SwatchEffect[], templates: Record<string, EffectTemplateBundle>, enabled: boolean) {
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const cacheRef = useRef<Record<string, { url: string; sig: string }>>({});
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      for (const fx of effects) {
        const b = templates[fx.key];
        const slot = b?.selected ?? 0;
        const sig = b && b.slots.length > 0 ? slotThumbSignature(b.slots[Math.min(Math.max(slot, 0), b.slots.length - 1)]) : '0';
        if (cacheRef.current[fx.key]?.sig === sig) continue;
        const blob = await fetchServiceBlob(effectThumbnailPath(fx.key, slot, sig), { mayBeCached: true });
        if (cancelled || !blob) continue;
        const url = URL.createObjectURL(blob);
        const prev = cacheRef.current[fx.key];
        cacheRef.current = { ...cacheRef.current, [fx.key]: { url, sig } };
        if (prev) URL.revokeObjectURL(prev.url);
        setThumbs(Object.fromEntries(Object.entries(cacheRef.current).map(([k, v]) => [k, v.url])));
      }
    })();
    return () => { cancelled = true; };
  }, [effects, templates, enabled]);
  useEffect(() => () => {
    for (const v of Object.values(cacheRef.current)) URL.revokeObjectURL(v.url);
    cacheRef.current = {};
  }, []);
  return thumbs;
}

export function LightingSwatches({ kind, size, activeEffect, activeColor, templates, preview, previewThumb, onColor, onEffect }: Props) {
  const { t } = useTranslation();
  const { ref, grid } = useFit(kind, size);
  const count = grid?.count ?? defaultSwatchCount(size);
  const cols = grid?.cols ?? (size === '2x2' ? 2 : size === '4x2' ? 3 : 4);
  const visibleEffects = ANIMATE_SWATCHES.slice(0, count);
  const thumbs = useEffectThumbs(visibleEffects, templates, kind === 'animate' && !preview);

  return (
    <div className={styles.swatchInset}>
      <div
        ref={ref}
        className={styles.swatchGrid}
        data-kind={kind}
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {kind === 'static'
          ? STATIC_SWATCHES.slice(0, count).map(color => {
            const name = `${t(paletteFamilyKey(color.family))} ${color.shade}`;
            return (
              <button
                key={color.id}
                type="button"
                data-palette-id={color.id}
                className={`${styles.swatchColor} ${color.hex === activeColor ? styles.swatchActive : ''}`}
                style={{ backgroundColor: color.hex }}
                onClick={() => onColor(color)}
                aria-label={name}
                aria-pressed={color.hex === activeColor}
              />
            );
          })
          : visibleEffects.map(fx => (
            <div key={fx.key} className={styles.swatchEffect}>
              <EffectCard
                overlay
                hideLabel
                label={t(fx.labelKey)}
                thumbUrl={preview ? previewThumb ?? null : thumbs[fx.key] ?? null}
                active={fx.key === activeEffect}
                dataEffectKey={fx.key}
                onClick={() => onEffect(fx.key)}
              />
            </div>
          ))}
      </div>
    </div>
  );
}
