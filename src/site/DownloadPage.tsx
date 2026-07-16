import { GithubGlyph } from '../components/icons/NexusBrand';
import { useTranslation } from '../lib/i18n';
import { SiteHeader } from './components/SiteHeader';
import { SiteFooter } from './components/SiteFooter';
import { DownloadCards } from './components/DownloadCards';
import styles from './site.module.scss';

const RELEASES_URL = 'https://github.com/hello-nexus/nexus/releases';

/** hellonexus.com/download - all installers, per-card version + size, release links. */
export function DownloadPage() {
  const { t } = useTranslation();

  return (
    <div className={styles.page}>
      <SiteHeader />
      <main className={styles.downloadPage}>
        <h1 className={styles.downloadPageTitle}>{t('site.download.title')}</h1>
        <p className={styles.lead}>{t('site.download.lead')}</p>
        <DownloadCards />
        <p className={styles.downloadNote}>{t('site.download.free')}</p>
        <a href={RELEASES_URL} target="_blank" rel="noreferrer" className={styles.aboutGithub}>
          <GithubGlyph size={16} />
          <span>{t('site.download.releases')}</span>
        </a>
      </main>
      <SiteFooter />
    </div>
  );
}
