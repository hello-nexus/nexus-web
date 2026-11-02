import { useEffect, useMemo, useRef, useState } from 'react';
import { effectThumbnailPath } from '../../../api/lighting';
import { fetchServiceBlob } from '../../../api/service';
import { EffectCard } from '../../../components/common/EffectCard/EffectCard';
import { Ellipsis } from 'lucide-react';
import { HoverTooltip } from '../../../components/common/HoverTooltip/HoverTooltip';
import { previewTileGradients } from '../common/previewAssets';
import { useTranslation } from '../../../lib/i18n';
import { customEffectKey, useCustomEffects, type CustomEffectEntry } from '../../../api/customEffects';
import type { EffectTemplateBundle } from '../../../types/lighting';
import { slotThumbSignature } from '../../../types/lightingTemplates';
import type { PanelWidget } from '../../types';
import {
  pickAnimationTiles, pickStaticTiles, swatchGrid,
  type AnimationTile, type StaticTile,
} from './swatches';
import styles from './LightingWidget.module.scss';

interface Props {
  kind: 'static' | 'animate';
  size: PanelWidget['size'];
  activeEffect: string;
  activeColor: string;
  templates: Record<string, EffectTemplateBundle>;
  preview: boolean;
  showRecents: boolean;
  recentColors: readonly string[];
  recentAnimations: readonly string[];
  onColor: (hex: string) => void;
  /** The tile's effect and the preset slot its thumbnail shows. */
  onEffect: (key: string, slot: number) => void;
  onOpen: (() => void) | null;
}

/** The cache token for a tile's thumbnail: its preset's content, plus the effect's save time for a Studio effect. */
export function tileThumbVersion(tile: AnimationTile, templates: Record<string, EffectTemplateBundle>, customs: readonly CustomEffectEntry[]): string {
  const b = templates[tile.key];
  const sig = b && b.slots.length > 0 ? slotThumbSignature(b.slots[Math.min(Math.max(tile.slot, 0), b.slots.length - 1)]) : '0';
  const entry = customs.find(c => customEffectKey(c.id) === tile.key);
  return entry ? `${entry.updatedAt}.${sig}` : sig;
}

function useEffectThumbs(
  effects: readonly AnimationTile[],
  templates: Record<string, EffectTemplateBundle>,
  customs: readonly CustomEffectEntry[],
  enabled: boolean,
) {
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const cacheRef = useRef<Record<string, { url: string; sig: string }>>({});
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      for (const fx of effects) {
        const sig = tileThumbVersion(fx, templates, customs);
        if (cacheRef.current[fx.tileKey]?.sig === sig) continue;
        const blob = await fetchServiceBlob(effectThumbnailPath(fx.key, fx.slot, sig), { mayBeCached: true });
        if (cancelled) return;
        if (!blob) continue;
        const url = URL.createObjectURL(blob);
        const prev = cacheRef.current[fx.tileKey];
        cacheRef.current = { ...cacheRef.current, [fx.tileKey]: { url, sig } };
        if (prev) URL.revokeObjectURL(prev.url);
        setThumbs(Object.fromEntries(Object.entries(cacheRef.current).map(([k, v]) => [k, v.url])));
      }
    })();
    return () => { cancelled = true; };
  }, [effects, templates, customs, enabled]);
  useEffect(() => () => {
    for (const v of Object.values(cacheRef.current)) URL.revokeObjectURL(v.url);
    cacheRef.current = {};
  }, []);
  return thumbs;
}

export function LightingSwatches({
  kind, size, activeEffect, activeColor, templates, preview,
  showRecents, recentColors, recentAnimations, onColor, onEffect, onOpen,
}: Props) {
  const { t } = useTranslation();
  const { cols, rows, slots } = swatchGrid(size, preview || onOpen !== null);
  const staticTiles = useMemo(
    () => (kind === 'static' ? pickStaticTiles(recentColors, showRecents, slots) : []),
    [kind, recentColors, showRecents, slots],
  );
  const customs = useCustomEffects(kind === 'animate' && !preview);
  const effectTiles = useMemo(
    () => (kind === 'animate'
      ? pickAnimationTiles(recentAnimations, showRecents, slots, {
        customs: new Map(customs.map(c => [c.id, c.name])),
        selectedSlot: key => templates[key]?.selected ?? 0,
      })
      : []),
    [kind, recentAnimations, showRecents, slots, customs, templates],
  );
  const previewGradients = useMemo(() => previewTileGradients(), []);
  const thumbs = useEffectThumbs(effectTiles, templates, customs, kind === 'animate' && !preview);
  const openLabel = t('lighting.widget.openLighting');

  return (
    <div className={styles.swatchInset}>
      <div
        className={styles.swatchGrid}
        data-kind={kind}
        data-cols={cols}
        data-rows={rows}
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}
      >
        {preview
          ? previewGradients.slice(0, slots).map(bg => (
            <div key={bg} className={styles.swatchCell}>
              <div className={styles.swatchPreviewTile} style={{ backgroundImage: bg }} />
            </div>
          ))
          : kind === 'static'
          ? staticTiles.map((tile: StaticTile) => {
            const name = tile.nameKey ? `${t(tile.nameKey)}${tile.shade ? ` ${tile.shade}` : ''}` : tile.name ?? tile.hex;
            const active = tile.hex.toLowerCase() === activeColor;
            return (
              <div key={tile.hex.toLowerCase()} className={styles.swatchCell}>
                <button
                  type="button"
                  data-swatch-hex={tile.hex}
                  className={`${styles.swatchColor} ${active ? styles.swatchActive : ''}`}
                  style={{ backgroundColor: tile.hex }}
                  onClick={() => onColor(tile.hex)}
                  aria-label={name}
                  aria-pressed={active}
                />
              </div>
            );
          })
          : effectTiles.map(fx => (
            <div key={fx.tileKey} className={styles.swatchCell}>
              <EffectCard
                overlay
                hideLabel
                label={fx.label ?? t(fx.labelKey)}
                thumbUrl={thumbs[fx.tileKey] ?? null}
                active={fx.key === activeEffect && fx.slot === (templates[fx.key]?.selected ?? 0)}
                dataEffectKey={fx.key}
                onClick={() => onEffect(fx.key, fx.slot)}
              />
            </div>
          ))}
        {preview && (
          <div className={styles.swatchCell}>
            <div className={`${styles.swatchOpen} ${styles.swatchPreviewTile}`}>
              {/* eslint-disable-next-line i18next/no-literal-string -- aria boolean */}
              <Ellipsis className={styles.swatchOpenIcon} aria-hidden="true" />
            </div>
          </div>
        )}
        {!preview && onOpen && (
          <div className={styles.swatchCell}>
            <HoverTooltip body={openLabel} side="top">
              <button
                type="button"
                data-swatch-open="true"
                className={styles.swatchOpen}
                onClick={onOpen}
                aria-label={openLabel}
              >
                {/* eslint-disable-next-line i18next/no-literal-string -- aria boolean */}
                <Ellipsis className={styles.swatchOpenIcon} aria-hidden="true" />
              </button>
            </HoverTooltip>
          </div>
        )}
      </div>
    </div>
  );
}
