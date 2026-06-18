import { Monitor } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import styles from './DesktopOnlyBadge.module.scss';

export function DesktopOnlyBadge() {
  const { t } = useTranslation();
  return (
    <span className={styles.badge}>
      <Monitor size={12} aria-hidden />
      {t('common.desktopOnly')}
    </span>
  );
}
