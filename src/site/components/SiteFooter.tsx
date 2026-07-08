import { useTranslation } from '../../lib/i18n';
import { NexusWordmark, GithubGlyph } from '../../components/icons/NexusBrand';
import { Select } from '../../components/common/Select/Select';
import { LANGUAGES, LANGUAGE_LABELS, loadSettings, saveSettings, type Language } from '../../lib/settings';
import { mySystemHref } from '../mySystemUrl';
import styles from '../site.module.scss';

const GITHUB_URL = 'https://github.com/hello-nexus/nexus';

export function SiteFooter() {
  const { t, language, setLanguage } = useTranslation();
  const year = new Date().getFullYear();

  const changeLanguage = (value: string) => {
    const lang = value as Language;
    setLanguage(lang);
    // Persist so the choice beats browser-language detection on return visits.
    const settings = loadSettings();
    settings.general.language = lang;
    saveSettings(settings);
  };

  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <div className={styles.footerBrand}>
          <NexusWordmark height={14} />
          <p className={styles.footerTagline}>{t('site.footer.tagline')}</p>
        </div>
        <nav className={styles.footerLinks} aria-label={t('site.nav.sections')}>
          <a href="#features">{t('site.nav.features')}</a>
          <a href="#download">{t('site.nav.download')}</a>
          <a href="#about">{t('site.nav.about')}</a>
          <a href={mySystemHref()}>{t('site.nav.mySystem')}</a>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer" className={styles.footerGithub}>
            <GithubGlyph size={14} />
            <span>{t('site.nav.github')}</span>
          </a>
        </nav>
        <div className={styles.footerLocale}>
          <Select
            value={language}
            onChange={changeLanguage}
            options={LANGUAGES.map(l => ({ value: l, label: LANGUAGE_LABELS[l] }))}
            ariaLabel={t('site.footer.language')}
          />
        </div>
      </div>
      <p className={styles.footerCopyright}>{t('site.footer.copyright', { year })}</p>
    </footer>
  );
}
