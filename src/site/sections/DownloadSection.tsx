import { useMemo } from 'react';
import { useTranslation } from '../../lib/i18n';
import { DOWNLOAD_URLS, ALL_DOWNLOADABLE_OS, type DownloadableOS } from '../../lib/downloads';
import { detectOS } from '../../lib/platform';
import styles from '../site.module.scss';

export function DownloadSection() {
  const { t } = useTranslation();
  const detected = useMemo(() => detectOS(), []);

  return (
    <section id="download" className={styles.downloadSection}>
      <h2>{t('site.download.title')}</h2>
      <p className={styles.lead}>{t('site.download.lead')}</p>
      <div className={styles.downloadGrid}>
        {ALL_DOWNLOADABLE_OS.map((os: DownloadableOS) => {
          const primary = os === detected;
          return (
            <div key={os} className={primary ? `${styles.downloadCard} ${styles.downloadPrimary}` : styles.downloadCard}>
              {primary && <span className={styles.downloadDetected}>{t('site.download.detected')}</span>}
              <h3>{t(`service.required.os.${os}`)}</h3>
              <a
                href={DOWNLOAD_URLS[os]}
                className={primary ? styles.ctaPrimary : styles.ctaGhost}
              >
                {t('service.required.downloadFor', { os: t(`service.required.os.${os}`) })}
              </a>
            </div>
          );
        })}
      </div>
      <p className={styles.downloadNote}>{t('site.download.free')}</p>
    </section>
  );
}
