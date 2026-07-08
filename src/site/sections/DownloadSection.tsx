import { useTranslation } from '../../lib/i18n';
import { DownloadCards } from '../components/DownloadCards';
import styles from '../site.module.scss';

export function DownloadSection() {
  const { t } = useTranslation();

  return (
    <section id="download" className={styles.downloadSection}>
      <h2>{t('site.download.title')}</h2>
      <p className={styles.lead}>{t('site.download.lead')}</p>
      <DownloadCards />
      <p className={styles.downloadNote}>{t('site.download.free')}</p>
      <a href="/download" className={styles.downloadAllLink}>{t('site.nav.allDownloads')}</a>
    </section>
  );
}
