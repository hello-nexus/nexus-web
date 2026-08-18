import type { ReactNode } from 'react';
import { ChevronRight, SlidersHorizontal } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import styles from './AdvancedModeCta.module.scss';

export interface AdvancedModeCtaProps {
  /** Translated description of what advanced mode unlocks on this page. */
  label: string;
  onPress: () => void;
  /** Leading glyph; defaults to the sliders icon of the top-bar page controls. */
  icon?: ReactNode;
}

/**
 * Wide card-button rendered at the bottom of the simple-mode lighting/cooling
 * pages: the in-page path into advanced mode (the top-bar toggle is the
 * other). Carries the "Advanced mode" eyebrow so the label can describe what
 * the full page adds.
 */
export function AdvancedModeCta({ label, onPress, icon }: AdvancedModeCtaProps) {
  const { t } = useTranslation();
  return (
    <button type="button" className={styles.cta} onClick={onPress}>
      <span className={styles.iconBox} aria-hidden>{icon ?? <SlidersHorizontal size={20} />}</span>
      <span className={styles.textCol}>
        <span className={styles.badge}>{t('uiMode.advancedMode')}</span>
        <span className={styles.label}>{label}</span>
      </span>
      <ChevronRight className={styles.chevron} size={18} aria-hidden />
    </button>
  );
}
