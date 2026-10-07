import { useMemo } from 'react';
import { useTranslation } from '../../lib/i18n';
import type { ConnectionState } from '../../hooks/useServiceStatus';
import { detectOS, isSafari, type DetectedOS } from '../../lib/platform';
import { DOWNLOAD_URLS, type DownloadableOS } from '../../lib/downloads';
import { ServiceLaunchButton } from '../common/ServiceLaunchButton/ServiceLaunchButton';
import { Notice } from '../common/Notice/Notice';
import { PlatformIcon } from '../icons/PlatformIcons';
import { PageHero, type PageHeroKey } from '../common/PageHero/PageHero';
import styles from './ServiceRequired.module.scss';

/** The OS whose installer leads; an undetected OS falls back to Windows. */
export function primaryDownloadOS(): DownloadableOS {
  const detected: DetectedOS = detectOS();
  return detected === 'unknown' ? 'windows' : detected;
}

/** Safari blocks custom-scheme handlers on https origins, so it gets a note in place of Launch. */
export function useSafariLaunchBlocked(): boolean {
  return useMemo(() => isSafari() && typeof window !== 'undefined' && window.location.protocol === 'https:', []);
}

export function SafariLaunchNote() {
  const { t } = useTranslation();
  return (
    <div className={styles.safariNote}>
      <Notice tone="warning">{t('service.required.safari')}</Notice>
    </div>
  );
}

interface ServiceRequiredProps {
  page: PageHeroKey;
  state?: ConnectionState;
}

/** A page's hero with the launch card under it, while the local service is unreachable. */
export function ServiceRequired({ page, state = 'offline' }: ServiceRequiredProps) {
  const { t } = useTranslation();
  const primaryOS = useMemo(() => primaryDownloadOS(), []);
  const safariBlocked = useSafariLaunchBlocked();
  // 'offline-installed' means a previous visit saw Nexus, possibly on another machine.
  const showDownload = state === 'offline' || state === 'offline-installed';
  const downloadLabelKey = state === 'offline-installed'
    ? 'service.required.needReinstall'
    : 'service.required.dontHaveIt';

  return (
    <div className={styles.page}>
      <PageHero
        page={page}
        action={(
          <>
            <div className={styles.card}>
              <div className={styles.cardText}>
                <span className={styles.cardTitle}>
                  <span className={styles.dot} aria-hidden />
                  {t('service.required.badge')}
                </span>
                <span className={styles.cardMessage}>{t('service.required.message')}</span>
              </div>
              {!safariBlocked && <ServiceLaunchButton />}
            </div>
            {safariBlocked && <SafariLaunchNote />}
            {showDownload && (
              <p className={styles.reinstall}>
                {t(downloadLabelKey)}
                <a className={styles.reinstallLink} href={DOWNLOAD_URLS[primaryOS]} download rel="noopener">
                  <PlatformIcon platform={primaryOS} size={12} />
                  {t('service.required.downloadFor', { os: t(`service.required.os.${primaryOS}`) })}
                </a>
              </p>
            )}
          </>
        )}
      />
    </div>
  );
}
