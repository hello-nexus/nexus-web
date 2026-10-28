import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
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
const GRID_PAD = 4;

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
      const w = r.width - GRID_PAD * 2;
      const h = r.height - GRID_PAD * 2;
      if (w > 0 && h > 0) setGrid(fitSwatchGrid(w, h, aspect, max));
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
        if (cancelled) return;
        if (!blob) continue;
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
  const visibleEffects = useMemo(() => ANIMATE_SWATCHES.slice(0, count), [count]);
  const thumbs = useEffectThumbs(visibleEffects, templates, kind === 'animate' && !preview);

  return (
    <div ref={ref} className={styles.swatchInset}>
      <div
        className={styles.swatchGrid}
        data-kind={kind}
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {kind === 'static'
          ? STATIC_SWATCHES.slice(0, count).map(color => {
            const name = `${t(paletteFamilyKey(color.family))} ${color.shade}`;
            return (
              <div key={color.id} className={styles.swatchCell} style={{ '--swatch-ratio': '100%' } as CSSProperties}>
                <button
                  type="button"
                  data-palette-id={color.id}
                  className={`${styles.swatchColor} ${color.hex.toLowerCase() === activeColor ? styles.swatchActive : ''}`}
                  style={{ backgroundColor: color.hex }}
                  onClick={() => onColor(color)}
                  aria-label={name}
                  aria-pressed={color.hex.toLowerCase() === activeColor}
                />
              </div>
            );
          })
          : visibleEffects.map(fx => (
            <div key={fx.key} className={styles.swatchCell} style={{ '--swatch-ratio': '56.25%' } as CSSProperties}>
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
