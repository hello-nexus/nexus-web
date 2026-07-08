import { useEffect, useState } from 'react';
import { GithubGlyph } from '../components/icons/NexusBrand';
import { useTranslation } from '../lib/i18n';
import { SiteHeader } from './components/SiteHeader';
import { SiteFooter } from './components/SiteFooter';
import { DownloadCards } from './components/DownloadCards';
import styles from './site.module.scss';

const RELEASES_URL = 'https://github.com/hello-nexus/nexus/releases';
const RELEASES_API = 'https://api.github.com/repos/hello-nexus/nexus/releases?per_page=15';

// Best-effort version badge from the public releases API (60 req/h/IP
// unauthenticated); the page renders fully without it. Same resolution as
// server.js's download redirects: latest stable, else newest prerelease.
function useLatestVersion(): string | null {
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch(RELEASES_API, { signal: controller.signal })
      .then(res => (res.ok ? res.json() : null))
      .then((releases: Array<{ tag_name?: string; prerelease?: boolean; draft?: boolean }> | null) => {
        if (!Array.isArray(releases)) return;
        const usable = releases.filter(r => !r.draft);
        const pick = usable.find(r => !r.prerelease) ?? usable[0];
        if (typeof pick?.tag_name === 'string' && pick.tag_name) setVersion(pick.tag_name);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  return version;
}

/** hellonexus.com/download - all installers, latest version, release links. */
export function DownloadPage() {
  const { t } = useTranslation();
  const version = useLatestVersion();

  return (
    <div className={styles.page}>
      <SiteHeader />
      <main className={styles.downloadPage}>
        <h1 className={styles.downloadPageTitle}>{t('site.download.title')}</h1>
        <p className={styles.lead}>{t('site.download.lead')}</p>
        {version && (
          <p className={styles.downloadVersion}>{t('site.download.latest', { version })}</p>
        )}
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
