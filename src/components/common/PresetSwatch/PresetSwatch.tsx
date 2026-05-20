import { type CSSProperties } from 'react';
import styles from './PresetSwatch.module.scss';

interface PresetSwatchProps {
  /** Hue in 0..1 (matches EffectState.hue). */
  hue: number;
  /** Colorize amount 0..1. 0 = full rainbow base; 1 = solid hue overlay. */
  colorize: number;
  /** Saturation post-process multiplier (matches EffectState.saturation, ~0..4). 1 = unchanged, 0 = grayscale. */
  saturation?: number;
  /** Contrast post-process multiplier (matches EffectState.contrast, ~0..4). 1 = unchanged, 0 = flat mid-gray. */
  contrast?: number;
  className?: string;
  style?: CSSProperties;
}

/**
 * Two-layer CSS preview of an effect template slot. Bottom layer is a fixed
 * rainbow gradient; top layer is a solid hue tint at colorize-opacity. CSS
 * filters then re-apply the slot's saturation and contrast so the swatch
 * tracks the same finalize() post-process the running shader will apply -
 * a sat=0 slot reads grayscale here too, contrast=0 reads flat mid-grey.
 *
 * Used by both the dashboard EffectControls and the panel Lighting
 * widget so the preset row looks identical in both surfaces.
 */
export function PresetSwatch({
  hue,
  colorize,
  saturation = 1,
  contrast = 1,
  className,
  style,
}: PresetSwatchProps) {
  const cssVars = {
    '--preset-hue': hue,
    '--preset-colorize': colorize,
    '--preset-saturation': saturation,
    '--preset-contrast': contrast,
    ...style,
  } as CSSProperties;
  return <span className={`${styles.swatch}${className ? ` ${className}` : ''}`} style={cssVars} aria-hidden="true" />;
}
