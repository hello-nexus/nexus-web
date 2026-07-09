import { useTranslation } from '../../lib/i18n';
import { GithubGlyph } from '../../components/icons/NexusBrand';
import styles from '../site.module.scss';

const GITHUB_URL = 'https://github.com/hello-nexus/nexus';

export function AboutSection() {
  const { t } = useTranslation();
  return (
    <section id="about" className={styles.aboutSection}>
      <h2>{t('site.about.title')}</h2>
      <p>{t('site.about.p1')}</p>
      <p>{t('site.about.p2')}</p>
      <a href={GITHUB_URL} target="_blank" rel="noreferrer" className={styles.aboutGithub}>
        <GithubGlyph size={16} />
        <span>{t('site.about.cta')}</span>
      </a>
    </section>
  );
}
