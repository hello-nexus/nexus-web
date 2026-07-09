import { useMemo, type ReactNode } from 'react';
import { Compass } from 'lucide-react';
import { useTranslation } from '../../lib/i18n';
import type { ConnectionState } from '../../hooks/useServiceStatus';
import { detectOS, isSafari, type DetectedOS } from '../../lib/platform';
import { DOWNLOAD_URLS, ALL_DOWNLOADABLE_OS, type DownloadableOS } from '../../lib/downloads';
import { ServiceLaunchButton } from '../common/ServiceLaunchButton/ServiceLaunchButton';
import styles from './Placeholder.module.scss';

interface ServiceRequiredProps {
  state?: ConnectionState;
  skeleton?: ReactNode;
  /** Overrides the default in-app "this section requires..." message - the
   *  standalone my. gate describes the whole page, not a section. */
  message?: string;
}

function osLabelKey(os: DownloadableOS): string {
  return `service.required.os.${os}`;
}

export function ServiceRequired({ state = 'offline', skeleton, message }: ServiceRequiredProps) {
  const { t } = useTranslation();
  const detected: DetectedOS = useMemo(() => detectOS(), []);
  const primaryOS: DownloadableOS = detected === 'unknown' ? 'windows' : detected;
  const alternateOS = ALL_DOWNLOADABLE_OS.filter((os) => os !== primaryOS);
  // Show the download CTA whenever the service is unreachable, including
  // 'offline-installed' (localStorage says installed but may be a different
  // machine). The two states get different labels below.
  const showDownload = state === 'offline' || state === 'offline-installed';
  // Reinstall label only for 'offline-installed'; everything else gets the
  // "don't have it yet?" label.
  const downloadLabelKey = state === 'offline-installed'
    ? 'service.required.needReinstall'
    : 'service.required.dontHaveIt';
  const showSafariNote = useMemo(() => {
    if (!isSafari()) return false;
    return typeof window !== 'undefined' && window.location.protocol === 'https:';
  }, []);

  return (
    <div className={styles.offlineBody}>
      {skeleton && <div className={styles.skeletonWrap}>{skeleton}</div>}
      <div className={styles.overlay}>
        <div className={styles.overlayCard}>
          <div className={styles.badge}>{t('service.required.badge')}</div>
          <p className={styles.overlayMessage}>{message ?? t('service.required.message')}</p>

          {showSafariNote && (
            <div className={styles.safariNote}>
              <Compass
                size={28}
                aria-hidden
                className={styles.safariIcon}
              />
              <p className={styles.safariNoteText}>{t('service.required.safari')}</p>
            </div>
          )}

          {/* Safari blocks custom-scheme handlers on https origins, so the
              nexus:// launch button is suppressed whenever the Safari note
              shows. */}
          {!showSafariNote && <ServiceLaunchButton />}

          {showDownload && (
            <div className={styles.downloadSection}>
              <p className={styles.downloadLabel}>{t(downloadLabelKey)}</p>
              <a
                className={styles.downloadSecondary}
                href={DOWNLOAD_URLS[primaryOS]}
                download
                rel="noopener"
              >
                {t('service.required.downloadFor', { os: t(osLabelKey(primaryOS)) })}
              </a>
              <div className={styles.downloadAlts}>
                <span className={styles.downloadAltsLabel}>{t('service.required.otherPlatforms')}</span>
                {alternateOS.map((os) => (
                  <a
                    key={os}
                    className={styles.downloadChip}
                    href={DOWNLOAD_URLS[os]}
                    download
                    rel="noopener"
                  >
                    {t(osLabelKey(os))}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
