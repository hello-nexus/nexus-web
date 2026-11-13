import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { useTranslation } from '../../lib/i18n';
import { PANEL_SKINS, skinAccentVars, type PanelSkinId } from '../skins/skins';
import { useAllSkinStyles } from '../skins/skinLoader';
import type { SkinOverrides } from '../skins/skinOverrides';
import styles from './SkinPicker.module.scss';

export interface SkinPickerProps {
  value: PanelSkinId | null;
  overrides: SkinOverrides;
  // The panel's current resolved mode; every thumbnail renders in it.
  mode: 'dark' | 'light';
  onChange: (skin: PanelSkinId | null) => void;
}

// Thumbnails whose skin ink is too close to the backdrop draw the numeral in the plain text color.
const TEXT_INK = new Set<PanelSkinId>(['blueprint', 'sketch', 'bubblegum', 'sakura']);

// Decorations drawn for a full-size card collide with the numeral at thumbnail size; these move or drop them.
const THUMB_TWEAKS: Partial<Record<PanelSkinId, CSSProperties>> = {
  deco: { '--skin-card-deco-pos': '100% 8px' } as CSSProperties,
  mecha: { '--skin-card-deco-size': '7px 7px, 0 0, 0 0', '--skin-card-deco-pos': '48px 6px, 0 0, 0 0' } as CSSProperties,
  sakura: { '--skin-card-frame': 'inset 0 0 0 1px rgba(var(--skin-accent-rgb), 0.85)' } as CSSProperties,
  cockpit: { '--skin-card-deco-pos': '10px 30px, 10px 30px' } as CSSProperties,
};

export function SkinPicker({ value, overrides, mode, onChange }: SkinPickerProps) {
  const { t } = useTranslation();
  const ready = useAllSkinStyles();
  const label = (key: string, fallback: string) => {
    const v = t(key);
    return v === key ? fallback : v;
  };
  const noneLabel = label('skin.none', 'None');
  const thumbs = useMemo(() => PANEL_SKINS.map(s => ({
    id: s.id,
    label: s.label,
    style: { ...skinAccentVars(s.id, overrides[s.id]?.accent ?? s.accent), ...THUMB_TWEAKS[s.id] } as CSSProperties,
  })), [overrides]);

  return (
    <div className={styles.grid} role="group" aria-label={label('skin.title', 'Skin')}>
      <button type="button" className={styles.item} aria-pressed={value === null} onClick={() => onChange(null)}>
        <span className={styles.frame}>
          <span className={`${styles.thumb} ${styles.none}`}>{noneLabel}</span>
        </span>
        <span className={styles.name}>{noneLabel}</span>
      </button>
      {thumbs.map(s => (
        <button
          key={s.id}
          type="button"
          className={styles.item}
          aria-pressed={value === s.id}
          onClick={() => onChange(s.id)}
        >
          <span className={styles.frame}>
            <span
              className={`${styles.thumb} panel-root`}
              data-panel-skin={ready ? s.id : undefined}
              data-theme={mode}
              data-skin-root=""
              data-thumb={s.id}
              data-thumb-ink={TEXT_INK.has(s.id) ? 'text' : undefined}
              style={s.style}
              aria-hidden="true"
            >
              <span data-skin-part="backdrop" />
              <span className={`panel-card ${styles.card}`}>
                <strong className={styles.glyph}>12</strong>
              </span>
            </span>
          </span>
          <span className={styles.name}>{label(`skin.name.${s.id}`, s.label)}</span>
        </button>
      ))}
    </div>
  );
}
