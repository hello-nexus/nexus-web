import type { ReactNode } from 'react';
import { ChevronRight, PanelsTopLeft } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import styles from './AdvancedModeCta.module.scss';

export interface AdvancedModeCtaProps {
  /** Translated description of what advanced mode unlocks on this page. */
  label: string;
  onPress: () => void;
  /** Leading glyph; defaults to the mode tab's own advanced glyph. */
  icon?: ReactNode;
}

/**
 * Wide card-button rendered at the bottom of the simple-mode lighting/cooling
 * pages: the in-page path into advanced mode (the mode tab's menu is the
 * other). Carries the "Advanced mode" eyebrow so the label can describe what
 * the full page adds, and the same glyph the mode tab wears there.
 */
export function AdvancedModeCta({ label, onPress, icon }: AdvancedModeCtaProps) {
  const { t } = useTranslation();
  return (
    <button type="button" className={styles.cta} onClick={onPress}>
      <span className={styles.iconBox} aria-hidden>{icon ?? <PanelsTopLeft size={20} />}</span>
      <span className={styles.textCol}>
        <span className={styles.badge}>{t('uiMode.advancedMode')}</span>
        <span className={styles.label}>{label}</span>
      </span>
      <ChevronRight className={styles.chevron} size={18} aria-hidden />
    </button>
  );
}
