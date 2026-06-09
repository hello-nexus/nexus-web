import { useTranslation } from '../../../../lib/i18n';
import { PaletteRing } from '../../../../components/common/PaletteRing/PaletteRing';
import { Slider } from '../../../../components/common/Slider/Slider';
import { HoverTooltip } from '../../../../components/common/HoverTooltip/HoverTooltip';
import type { PostProcessState } from './types';
import styles from '../LightingPage.module.scss';

/**
 * Palette ring + saturation/contrast + reset — the Effect-tab body for the
 * media and mirror modes. Extracted so the desktop EffectTab and the immersive
 * effect editor render one implementation.
 */
export function PostProcessControls({ value, onChange, onCommit, onReset }: {
  value: PostProcessState;
  onChange: (patch: Partial<PostProcessState>, commit: boolean) => void;
  onCommit: () => void;
  onReset: () => void;
}) {
  const { t } = useTranslation();
  const isIdentity = value.hue === 0 && value.colorize === 0
    && value.saturation === 1 && value.contrast === 1;
  return (
    <div className={styles.effectControls}>
      <div className={styles.drawerSliders}>
        <div className={styles.paletteRingWrap}>
          <PaletteRing
            hue={value.hue}
            colorize={value.colorize}
            onChange={(hue, colorize, commit) => onChange({ hue, colorize }, commit)}
            onCommit={onCommit}
          />
        </div>
        <Slider
          orientation="stacked"
          editable
          label={t('lighting.controls.saturation')}
          value={Math.round(value.saturation * 100)}
          min={0}
          max={400}
          onChange={(v, commit) => onChange({ saturation: v / 100 }, !!commit)}
          onCommit={onCommit}
        />
        <Slider
          orientation="stacked"
          editable
          label={t('lighting.controls.contrast')}
          value={Math.round(value.contrast * 100)}
          min={0}
          max={400}
          onChange={(v, commit) => onChange({ contrast: v / 100 }, !!commit)}
          onCommit={onCommit}
        />
      </div>
      <div className={styles.drawerFooter}>
        <HoverTooltip body={isIdentity ? t('lighting.controls.resetAlready') : t('lighting.controls.reset')} side="top">
          <button
            type="button"
            className={styles.drawerReset}
            onClick={onReset}
            disabled={isIdentity}
          >{t('lighting.controls.reset')}</button>
        </HoverTooltip>
      </div>
    </div>
  );
}
