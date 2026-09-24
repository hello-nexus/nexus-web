import { useTranslation } from '../../lib/i18n';
import { NexusWordmark, GithubGlyph } from '../../components/icons/NexusBrand';
import { mySystemHref } from '../mySystemUrl';
import styles from '../site.module.scss';

const GITHUB_URL = 'https://github.com/hello-nexus/nexus';

export function SiteHeader() {
  const { t } = useTranslation();

  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <a href="/" className={styles.brand} aria-label={t('site.nav.home')}>
          <img src="/nexus-mark-color.png" alt="" width={26} height={26} className={styles.brandMark} />
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
          <a href="/#download" className={styles.headerDownload}>
            {t('site.nav.download')}
          </a>
          <a href={mySystemHref()} className={styles.headerMySystem}>
            {t('site.nav.mySystem')}
          </a>
        </div>
      </div>
    </header>
  );
}
