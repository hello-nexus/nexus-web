import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { RotateCcw } from 'lucide-react';
import { CardDeleteButton } from '../../components/common/CardDeleteButton/CardDeleteButton';
import { EffectCard } from '../../components/common/EffectCard/EffectCard';
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
  // The panel's own theme variables: the Default thumbnail is drawn with them, so it shows the stock look.
  baseStyle?: CSSProperties;
  // Clears the active skin's remembered entry; the active card offers it when that skin has one.
  onReset?: () => void;
  onChange: (skin: PanelSkinId | null) => void;
}

// Thumbnails whose skin ink is too close to the backdrop draw the numeral in the plain text color.
const TEXT_INK = new Set<PanelSkinId>(['blueprint', 'sketch', 'bubblegum', 'sakura']);

// Decorations drawn for a full-size card collide with the numeral at thumbnail size; these move or drop them.
const THUMB_TWEAKS: Partial<Record<PanelSkinId, CSSProperties>> = {
  deco: { '--skin-card-deco-pos': '100% 8px' } as CSSProperties,
  sakura: { '--skin-card-frame': 'inset 0 0 0 1px rgba(var(--skin-accent-rgb), 0.85)' } as CSSProperties,
  cockpit: { '--skin-card-deco-pos': '10px 30px, 10px 30px' } as CSSProperties,
};

// Wide enough that the name fits inside the thumbnail without the card growing tall.
const THUMB_ASPECT = 1.5;

export function SkinPicker({ value, overrides, mode, baseStyle, onReset, onChange }: SkinPickerProps) {
  const { t } = useTranslation();
  const ready = useAllSkinStyles();
  const label = (key: string, fallback: string) => {
    const v = t(key);
    return v === key ? fallback : v;
  };
  const thumbs = useMemo(() => PANEL_SKINS.map(s => ({
    id: s.id,
    label: s.label,
    style: { ...skinAccentVars(s.id, overrides[s.id]?.accent ?? s.accent), ...THUMB_TWEAKS[s.id] } as CSSProperties,
  })), [overrides]);

  const corner = (id: PanelSkinId | null, style: CSSProperties | undefined) => (
    <span className={`${styles.fill} ${mode === 'light' ? styles.fillLight : ''}`}>
      <span
        className={`${styles.thumb} panel-root`}
        data-panel-skin={id && ready ? id : undefined}
        data-theme={mode}
        data-skin-root=""
        data-thumb={id ?? 'default'}
        data-thumb-ink={id && TEXT_INK.has(id) ? 'text' : undefined}
        style={style}
        aria-hidden="true"
      >
        <span data-skin-part="backdrop" />
        <span className={`panel-card ${styles.card}`} />
      </span>
    </span>
  );
  const labelClass = mode === 'light' ? styles.labelLight : undefined;
  const resettable = onReset && value !== null && !!overrides[value];

  return (
    <div className={styles.grid} role="group" aria-label={label('skin.title', 'Skin')}>
      <EffectCard
        overlay
        asDiv
        labelClassName={labelClass}
        thumbStatic
        thumbAspect={THUMB_ASPECT}
        thumbUrl={null}
        label={label('skin.none', 'Default')}
        active={value === null}
        onClick={() => onChange(null)}
        thumbOverlay={corner(null, baseStyle)}
      />
      {thumbs.map(s => {
        const showReset = resettable && value === s.id;
        return (
          <EffectCard
            key={s.id}
            overlay
            asDiv
            labelClassName={labelClass}
            thumbStatic
            thumbAspect={THUMB_ASPECT}
            thumbUrl={null}
            label={label(`skin.name.${s.id}`, s.label)}
            active={value === s.id}
            onClick={() => onChange(s.id)}
            thumbOverlay={corner(s.id, s.style)}
            cornerBadge={showReset ? (
              <CardDeleteButton
                className={styles.reset}
                icon={<RotateCcw size={14} />}
                ariaLabel={label('skin.reset', 'Reset')}
                onDelete={() => onReset()}
              />
            ) : undefined}
          />
        );
      })}
    </div>
  );
}
