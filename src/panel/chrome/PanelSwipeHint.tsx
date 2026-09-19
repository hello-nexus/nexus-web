import { ChevronUp, Pointer } from 'lucide-react';
import { SWIPE_HINT_CYCLE_MS, SWIPE_HINT_CYCLES } from '../engine/usePanelSwipeOnboarding';
import { useTranslation } from '../../lib/i18n';
import styles from './PanelSwipeHint.module.scss';

// Pointer-transparent so it never steals the swipe it asks for.
export function PanelSwipeHint() {
  const { t } = useTranslation();
  return (
    <div
      className={styles.hint}
      role="img"
      aria-label={t('panel.swipeHint.label')}
      style={{
        '--swipe-hint-cycle': `${SWIPE_HINT_CYCLE_MS}ms`,
        '--swipe-hint-cycles': SWIPE_HINT_CYCLES,
      } as React.CSSProperties}
    >
      <ChevronUp className={styles.chevron} aria-hidden />
      <Pointer className={styles.hand} aria-hidden />
    </div>
  );
}
