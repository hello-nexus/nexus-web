import styles from './ColorPickerWithPresets.module.scss';

/**
 * Preset-swatch grid used by every theming surface (app accent, panel accent,
 * panel background). Renders the supplied presets as a fixed 2-row grid; tiles
 * commit immediately on click. There is no free-form color input - the preset
 * list is the entire palette.
 *
 * onPreview is kept in the prop contract for symmetry with other live-preview
 * controls but is unused here because preset selection is a single-click commit.
 */
export interface ColorPickerWithPresetsProps {
  value: string;
  presets: readonly string[];
  /** Used when value is empty to determine which preset reads as selected. */
  fallback?: string;
  onPreview?: (hex: string) => void;
  onCommit: (hex: string) => void;
  className?: string;
}

export function ColorPickerWithPresets({
  value,
  presets,
  fallback,
  onCommit,
  className,
}: ColorPickerWithPresetsProps) {
  const normalized = (value || fallback || presets[0] || '#000000').toLowerCase();

  return (
    <div className={`${styles.root} ${className ?? ''}`}>
      <div className={styles.swatchGrid}>
        {presets.map(hex => {
          const selected = hex.toLowerCase() === normalized;
          return (
            <button
              key={hex}
              type="button"
              className={`${styles.swatch} ${selected ? styles.swatchSelected : ''}`}
              style={{ background: hex }}
              onClick={() => onCommit(hex)}
              aria-label={hex}
              aria-pressed={selected}
            />
          );
        })}
      </div>
    </div>
  );
}
