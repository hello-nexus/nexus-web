import { Lock } from 'lucide-react';
import { useTranslation } from '../../lib/i18n';
import styles from './RestrictedIndicator.module.scss';

/** The only content the tray and the control center show in Restricted mode. */
export function RestrictedIndicator() {
  const { t } = useTranslation();
  return (
    <div className={styles.indicator} role="status">
      <Lock size={16} aria-hidden />
      <span>{t('devices.y70.restrictedMode')}</span>
    </div>
  );
}
