import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from '../../lib/i18n';
import { PlatformIcon } from '../../components/icons/PlatformIcons';
import {
  DOWNLOAD_URLS,
  ALL_DOWNLOADABLE_OS,
  fetchDownloadManifest,
  formatDownloadSizeMb,
  type DownloadableOS,
  type DownloadManifest,
} from '../../lib/downloads';
import { detectOS } from '../../lib/platform';
import styles from '../site.module.scss';

function useDownloadManifest(): DownloadManifest | null {
  const [manifest, setManifest] = useState<DownloadManifest | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetchDownloadManifest(controller.signal).then((m) => {
      if (m) setManifest(m);
    });
    return () => controller.abort();
  }, []);
  return manifest;
}

/** The per-OS download card grid, shared by the landing section and /download. */
export function DownloadCards() {
  const { t } = useTranslation();
  const detected = useMemo(() => detectOS(), []);
  const manifest = useDownloadManifest();

  return (
    <div className={styles.downloadGrid}>
      {ALL_DOWNLOADABLE_OS.map((os: DownloadableOS) => {
        const primary = os === detected;
        const version = manifest?.version ?? null;
        const sizeMb = formatDownloadSizeMb(manifest?.assets?.[os]?.size);
        return (
          <div key={os} className={primary ? `${styles.downloadCard} ${styles.downloadPrimary}` : styles.downloadCard}>
            {primary && <span className={styles.downloadDetected}>{t('site.download.detected')}</span>}
            <h3>{t(`service.required.os.${os}`)}</h3>
            <div className={styles.downloadCta}>
              <a
                href={DOWNLOAD_URLS[os]}
                className={primary ? styles.ctaPrimary : styles.ctaGhost}
              >
                <span className={styles.ctaPlatform}>
                  <PlatformIcon platform={os} size={16} />
                </span>
                {t('service.required.downloadFor', { os: t(`service.required.os.${os}`) })}
              </a>
              {version && sizeMb && (
                <span className={styles.downloadMeta}>{t('site.download.meta', { version, size: sizeMb })}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
