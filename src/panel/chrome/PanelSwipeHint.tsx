import { Pointer } from 'lucide-react';
import { SWIPE_HINT_CYCLE_MS, SWIPE_HINT_CYCLES } from '../engine/usePanelSwipeOnboarding';
import { useTranslation } from '../../lib/i18n';
import styles from './PanelSwipeHint.module.scss';

// Pointer-transparent so it never steals the swipe it asks for.
export function PanelSwipeHint({ direction = 'up' }: { direction?: 'up' | 'down' }) {
  const { t } = useTranslation();
  return (
    <div
      className={styles.hint}
      data-direction={direction}
      role="img"
      aria-label={t(direction === 'down' ? 'panel.immersive.swipeHint' : 'panel.swipeHint.label')}
      style={{
        '--swipe-hint-cycle': `${SWIPE_HINT_CYCLE_MS}ms`,
        '--swipe-hint-cycles': SWIPE_HINT_CYCLES,
      } as React.CSSProperties}
    >
      {/* Lucide stroke conventions on a tall viewBox; no lucide arrow has a long shaft. */}
      <svg
        className={styles.arrow}
        viewBox="0 0 24 54"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d={direction === 'down' ? 'm6 45 6 6 6-6' : 'm18 9-6-6-6 6'} />
        <path d="M12 3v48" />
      </svg>
      <Pointer className={styles.hand} aria-hidden />
    </div>
  );
}
