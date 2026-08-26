import { CheckCircle2 } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import styles from './ConflictAllClear.module.scss';

const ICON_SIZE = 18;

/**
 * All-clear row for the conflict surfaces: nothing is competing with Nexus.
 * Shared so the sidebar modal and the onboarding gate state it identically.
 */
export function ConflictAllClear({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <div className={className ? `${styles.root} ${className}` : styles.root}>
      <CheckCircle2 size={ICON_SIZE} className={styles.icon} aria-hidden />
      <span>{t('conflicts.modal.empty')}</span>
    </div>
  );
}
