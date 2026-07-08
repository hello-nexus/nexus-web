import { useMemo } from 'react';
import { useTranslation } from '../../lib/i18n';
import { NexusMark, NexusWordmark, GithubGlyph } from '../../components/icons/NexusBrand';
import { DOWNLOAD_URLS, type DownloadableOS } from '../../lib/downloads';
import { detectOS } from '../../lib/platform';
import { mySystemHref } from '../mySystemUrl';
import styles from '../site.module.scss';

const GITHUB_URL = 'https://github.com/hello-nexus/nexus';

export function SiteHeader() {
  const { t } = useTranslation();
  const os: DownloadableOS = useMemo(() => {
    const detected = detectOS();
    return detected === 'unknown' ? 'windows' : detected;
  }, []);

  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <a href="/" className={styles.brand} aria-label={t('site.nav.home')}>
          <span className={styles.brandMark}>
            <NexusMark size={26} />
            <img src="/nexus-mark-color.png" alt="" width={26} height={26} className={styles.brandMarkColor} />
          </span>
          <span className={styles.brandWordmark}><NexusWordmark height={16} /></span>
        </a>
        <nav className={styles.nav} aria-label={t('site.nav.sections')}>
          <a href="/#features">{t('site.nav.features')}</a>
          <a href="/download">{t('site.nav.download')}</a>
          <a href="/#about">{t('site.nav.about')}</a>
        </nav>
        <div className={styles.headerActions}>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className={styles.headerIconLink}
            aria-label={t('site.nav.github')}
          >
            <GithubGlyph size={18} />
          </a>
          <a href={mySystemHref('/login')} className={styles.headerLogin}>
            {t('site.nav.login')}
          </a>
          <span className={styles.headerDownloadGroup}>
            <a href={DOWNLOAD_URLS[os]} className={styles.headerDownload}>
              {t('service.required.downloadFor', { os: t(`service.required.os.${os}`) })}
            </a>
            <a href="/download" className={styles.headerAllDownloads}>
              {t('site.nav.allDownloads')}
            </a>
          </span>
          <a href={mySystemHref()} className={styles.headerMySystem}>
            {t('site.nav.mySystem')}
          </a>
        </div>
      </div>
    </header>
  );
}
