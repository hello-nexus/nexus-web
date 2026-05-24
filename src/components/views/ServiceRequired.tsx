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
}

function osLabelKey(os: DownloadableOS): string {
  return `service.required.os.${os}`;
}

export function ServiceRequired({ state = 'offline', skeleton }: ServiceRequiredProps) {
  const { t } = useTranslation();
  const detected: DetectedOS = useMemo(() => detectOS(), []);
  const primaryOS: DownloadableOS = detected === 'unknown' ? 'windows' : detected;
  const alternateOS = ALL_DOWNLOADABLE_OS.filter((os) => os !== primaryOS);
  // Show the download CTA whenever the service isn't reachable, not only
  // for first-time visitors. Someone whose localStorage flag says they
  // installed Nexus before (so state is 'offline-installed') might be on a
  // different machine where they don't actually have it - they still need
  // a download link. Different label for the two cases keeps the UX honest.
  const showDownload = state === 'offline' || state === 'offline-installed';
  // Default to the friendlier "don't have it yet?" phrasing - the
  // reinstall variant is reserved strictly for the localStorage-says-
  // installed-but-unreachable case so future state additions don't
  // accidentally inherit a wrong label.
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
          <p className={styles.overlayMessage}>{t('service.required.message')}</p>

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

          {/* Launch button only makes sense when nexus:// can plausibly
              route to a running installer - Safari blocks custom-scheme
              handlers on https origins, so suppressing the button while the
              Safari note is shown keeps the UI from promising an action that
              won't fire. */}
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
