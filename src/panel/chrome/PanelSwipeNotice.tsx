import { Image, Palette, Plus } from 'lucide-react';
import { useTranslation } from '../../lib/i18n';
import styles from './PanelSwipeNotice.module.scss';

// One-shot card above the actions tray on its first-ever open; pointer-transparent so the next tap reaches the scrim.
export function PanelSwipeNotice() {
  const { t } = useTranslation();
  return (
    <div className={styles.card} role="status" aria-live="polite">
      <div className={styles.title}>{t('panel.swipeHint.title')}</div>
      <div className={styles.items}>
        <div className={styles.item}>
          <Plus className={styles.icon} aria-hidden />
          <span className={styles.label}>{t('panel.swipeHint.addWidgets')}</span>
        </div>
        <div className={styles.item}>
          <Palette className={styles.icon} aria-hidden />
          <span className={styles.label}>{t('panel.swipeHint.changeColors')}</span>
        </div>
        <div className={styles.item}>
          <Image className={styles.icon} aria-hidden />
          <span className={styles.label}>{t('panel.swipeHint.background')}</span>
        </div>
      </div>
    </div>
  );
}
