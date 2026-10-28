import { useEffect, useMemo, useRef, useState } from 'react';
import { effectThumbnailPath } from '../../../api/lighting';
import { fetchServiceBlob } from '../../../api/service';
import { EffectCard } from '../../../components/common/EffectCard/EffectCard';
import { Ellipsis } from 'lucide-react';
import { HoverTooltip } from '../../../components/common/HoverTooltip/HoverTooltip';
import { useTranslation } from '../../../lib/i18n';
import type { EffectTemplateBundle } from '../../../types/lighting';
import { slotThumbSignature } from '../../../types/lightingTemplates';
import type { PanelWidget } from '../../types';
import {
  pickAnimationTiles, pickStaticTiles, swatchGrid,
  type StaticTile, type SwatchEffect,
} from './swatches';
import styles from './LightingWidget.module.scss';

const RECENTS_IDLE_MS = 2000;

interface Props {
  kind: 'static' | 'animate';
  size: PanelWidget['size'];
  activeEffect: string;
  activeColor: string;
  templates: Record<string, EffectTemplateBundle>;
  preview: boolean;
  previewThumb?: string;
  showRecents: boolean;
  recentColors: readonly string[];
  recentAnimations: readonly string[];
  onColor: (hex: string) => void;
  onEffect: (key: string) => void;
  onOpen: (() => void) | null;
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

export function LightingSwatches({
  kind, size, activeEffect, activeColor, templates, preview, previewThumb,
  showRecents, recentColors, recentAnimations, onColor, onEffect, onOpen,
}: Props) {
  const { t } = useTranslation();
  const { cols, rows, slots } = swatchGrid(size, onOpen !== null);
  // A tap here records into recents; the order is held until the taps go idle or the pointer leaves, so the grid never shuffles under a finger. Picks made elsewhere show at once.
  const [held, setHeld] = useState<{ colors: readonly string[]; animations: readonly string[] } | null>(null);
  const idleRef = useRef<number | null>(null);
  const release = () => {
    if (idleRef.current !== null) window.clearTimeout(idleRef.current);
    idleRef.current = null;
    setHeld(null);
  };
  const holdForTap = () => {
    setHeld(prev => prev ?? { colors: recentColors, animations: recentAnimations });
    if (idleRef.current !== null) window.clearTimeout(idleRef.current);
    idleRef.current = window.setTimeout(release, RECENTS_IDLE_MS);
  };
  useEffect(() => () => { if (idleRef.current !== null) window.clearTimeout(idleRef.current); }, []);
  const shownColors = held?.colors ?? recentColors;
  const shownAnimations = held?.animations ?? recentAnimations;
  const staticTiles = useMemo(
    () => (kind === 'static' ? pickStaticTiles(shownColors, showRecents, slots) : []),
    [kind, shownColors, showRecents, slots],
  );
  const effectTiles = useMemo(
    () => (kind === 'animate' ? pickAnimationTiles(shownAnimations, showRecents, slots) : []),
    [kind, shownAnimations, showRecents, slots],
  );
  const thumbs = useEffectThumbs(effectTiles, templates, kind === 'animate' && !preview);
  const openLabel = t('lighting.widget.openLighting');

  return (
    <div className={styles.swatchInset}>
      <div
        className={styles.swatchGrid}
        data-kind={kind}
        data-cols={cols}
        data-rows={rows}
        onPointerLeave={release}
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}
      >
        {kind === 'static'
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
                  onClick={() => { holdForTap(); onColor(tile.hex); }}
                  aria-label={name}
                  aria-pressed={active}
                />
              </div>
            );
          })
          : effectTiles.map(fx => (
            <div key={fx.key} className={styles.swatchCell}>
              <EffectCard
                overlay
                hideLabel
                label={t(fx.labelKey)}
                thumbUrl={preview ? previewThumb ?? null : thumbs[fx.key] ?? null}
                active={fx.key === activeEffect}
                dataEffectKey={fx.key}
                onClick={() => { holdForTap(); onEffect(fx.key); }}
              />
            </div>
          ))}
        {onOpen && (
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
