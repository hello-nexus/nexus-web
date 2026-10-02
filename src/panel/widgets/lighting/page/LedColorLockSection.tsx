import { useTranslation } from '../../../../lib/i18n';
import { pluralKey } from '../../../../lib/pluralKey';
import { Button } from '../../../../components/common/Button/Button';
import { SettingsSection } from '../../../../components/common/SettingsSection/SettingsSection';
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
  /** The zone is an unsaved partition edit: no card exists to hold colours until Save. */
  draft?: boolean;
  onPreview: (hex: string) => void;
  onCommit: (hex: string) => void;
  onClearSelected: () => void;
  onClearAll: () => void;
}

export function LedColorLockSection({
  selectedCount, selectedColor, lockedCount, draft = false,
  onPreview, onCommit, onClearSelected, onClearAll,
}: LedColorLockSectionProps) {
  const { t, language } = useTranslation();
  if (selectedCount === 0 && lockedCount === 0 && !draft) return null;
  return (
    <SettingsSection title={t('lighting.ledMap.color')} className={styles.section} boxClassName={styles.box}>
      <div className={styles.body}>
      {selectedCount > 0 ? (
        <ColorPickerWithPresets
          value={selectedColor}
          presets={LED_COLOR_PRESETS}
          onPreview={onPreview}
          onCommit={onCommit}
          allowCustom
          pickerPortal
          disabled={draft}
          extraSwatch={{
            color: NO_LOCK_SWATCH,
            label: t('lighting.ledMap.colorFollowEffect'),
            selected: !selectedColor,
            onSelect: onClearSelected,
          }}
        />
      ) : lockedCount > 0 && (
        <div className={styles.summary}>
          <span>{t(pluralKey('lighting.ledMap.colorLockedCount', language, lockedCount), { count: lockedCount })}</span>
          <Button tone="ghost" size="sm" disabled={draft} onClick={onClearAll}>
            {t('lighting.ledMap.colorClearAll')}
          </Button>
        </div>
      )}
      <div className={styles.hint}>
        {draft
          ? t('lighting.ledMap.colorSaveFirst')
          : selectedCount > 0 ? t('lighting.ledMap.colorHint') : t('lighting.ledMap.colorSelectHint')}
      </div>
      </div>
    </SettingsSection>
  );
}
