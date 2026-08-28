import { ViewHeader } from '../../common/ViewHeader/ViewHeader';
import { useTranslation } from '../../../lib/i18n';
import styles from './StorePage.module.scss';

/**
 * The Nexus Store app page. A placeholder until the store backend ships
 * (plans/nexus-store.md); it exists now so the surface has a home of its own
 * rather than a tab on the dashboard.
 */
export function StorePage() {
  const { t } = useTranslation();
  return (
    <div className={styles.app}>
      <ViewHeader title={t('apps.tabs.store')} />
      <div className={styles.placeholder}>
        <span className={styles.placeholderText}>{t('apps.store.comingSoon')}</span>
      </div>
    </div>
  );
}

export default StorePage;
