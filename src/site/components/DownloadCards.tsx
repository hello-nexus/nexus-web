import { useMemo } from 'react';
import { useTranslation } from '../../lib/i18n';
import { PlatformIcon } from '../../components/icons/PlatformIcons';
import { DOWNLOAD_URLS, ALL_DOWNLOADABLE_OS, type DownloadableOS } from '../../lib/downloads';
import { detectOS } from '../../lib/platform';
import styles from '../site.module.scss';

/** The per-OS download card grid, shared by the landing section and /download. */
export function DownloadCards() {
  const { t } = useTranslation();
  const detected = useMemo(() => detectOS(), []);

  return (
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
              <span className={styles.ctaPlatform}>
                <PlatformIcon platform={os} size={16} />
              </span>
              {t('service.required.downloadFor', { os: t(`service.required.os.${os}`) })}
            </a>
          </div>
        );
      })}
    </div>
  );
}
