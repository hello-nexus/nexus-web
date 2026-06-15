import { useTranslation } from '../../../lib/i18n';
import styles from './AppsView.module.scss';

export function StoreTab() {
  const { t } = useTranslation();
  return (
    <div className={styles.storePlaceholder}>
      <span className={styles.storePlaceholderText}>{t('apps.store.comingSoon')}</span>
    </div>
  );
}
