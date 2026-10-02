import { useTranslation } from '../../../../lib/i18n';
import { pluralKey } from '../../../../lib/pluralKey';
import { Button } from '../../../../components/common/Button/Button';
import { ColorPickerWithPresets } from '../../../../components/common/ColorPickerWithPresets/ColorPickerWithPresets';
import styles from './LedColorLockSection.module.scss';

// Full-saturation hues read true on an LED; pastels and darks wash out or go dim.
export const LED_COLOR_PRESETS = [
  '#ff0000', '#ff5a00', '#ffc800', '#00ff00', '#00ffc8',
  '#00c8ff', '#0000ff', '#8c00ff', '#ff00c8', '#ffffff',
] as const;
// The "follow the effect" swatch shows no colour of its own.
const NO_LOCK_SWATCH = 'transparent';

interface LedColorLockSectionProps {
  selectedCount: number;
  /** A colour one of the selected LEDs holds; empty when none holds one. */
  selectedColor: string;
  lockedCount: number;
  disabled?: boolean;
  onPreview: (hex: string) => void;
  onCommit: (hex: string) => void;
  onClearSelected: () => void;
  onClearAll: () => void;
}

export function LedColorLockSection({
  selectedCount, selectedColor, lockedCount, disabled = false,
  onPreview, onCommit, onClearSelected, onClearAll,
}: LedColorLockSectionProps) {
  const { t, language } = useTranslation();
  if (selectedCount === 0 && lockedCount === 0) return null;
  return (
    <div className={styles.section}>
      <div className={styles.header}>{t('lighting.ledMap.color')}</div>
      {selectedCount > 0 ? (
        <ColorPickerWithPresets
          value={selectedColor}
          presets={LED_COLOR_PRESETS}
          onPreview={onPreview}
          onCommit={onCommit}
          allowCustom
          disabled={disabled}
          extraSwatch={{
            color: NO_LOCK_SWATCH,
            label: t('lighting.ledMap.colorFollowEffect'),
            selected: !selectedColor,
            onSelect: onClearSelected,
          }}
        />
      ) : (
        <div className={styles.summary}>
          <span>{t(pluralKey('lighting.ledMap.colorLockedCount', language, lockedCount), { count: lockedCount })}</span>
          <Button tone="ghost" size="sm" disabled={disabled} onClick={onClearAll}>
            {t('lighting.ledMap.colorClearAll')}
          </Button>
        </div>
      )}
      <div className={styles.hint}>
        {selectedCount > 0 ? t('lighting.ledMap.colorHint') : t('lighting.ledMap.colorSelectHint')}
      </div>
    </div>
  );
}
