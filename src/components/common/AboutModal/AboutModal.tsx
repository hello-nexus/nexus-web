import { ExternalLink, Globe } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { Overlay } from '../Overlay/Overlay';
import { NexusWordmark } from '../../icons/NexusBrand';
import styles from './AboutModal.module.scss';

interface AboutModalProps {
  open: boolean;
  onClose: () => void;
}

// Third-party open-source projects Nexus bundles. Names are proper nouns
// (untranslated); URLs are each project's canonical home. Sourced from
// nexus-service/THIRD-PARTY.md.
const OSS_PROJECTS = [
  { name: 'OpenRGB', url: 'https://gitlab.com/CalcProgrammer1/OpenRGB' },
  { name: 'FFmpeg', url: 'https://ffmpeg.org' },
  { name: 'LibreHardwareMonitor', url: 'https://github.com/LibreHardwareMonitor/LibreHardwareMonitor' },
  { name: 'PawnIO', url: 'https://github.com/namazso/PawnIO' },
  { name: 'dfu-util', url: 'https://dfu-util.sourceforge.net' },
] as const;

// GitHub mark (lucide dropped its brand icons); fills with currentColor.
function GithubGlyph({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden={true} focusable="false">
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

// "About Nexus" dialog opened from the top-bar "..." menu: brand, build
// version, our links, and open-source acknowledgements.
export function AboutModal({ open, onClose }: AboutModalProps) {
  const { t } = useTranslation();
  if (!open) return null;

  return (
    <Overlay open={open} onClose={onClose} variant="alert" onEnter={onClose}
      className={styles.modal} ariaLabel={t('nav.about')}>
      <div className={styles.hero}>
        <img className={styles.logo} src="/nexus-mark-color.png" alt="" width={84} height={84} />
        <NexusWordmark height={26} />
        <div className={styles.version}>{t('about.versionAlpha', { version: __APP_VERSION__ })}</div>
      </div>

      <div className={styles.links}>
        <a className={styles.link} href="https://github.com/hello-nexus" target="_blank" rel="noopener noreferrer">
          <GithubGlyph size={15} />
          {t('about.githubOrg')}
        </a>
        {/* eslint-disable i18next/no-literal-string -- brand domain */}
        <a className={styles.link} href="https://hellonexus.com" target="_blank" rel="noopener noreferrer">
          <Globe size={15} aria-hidden={true} />
          hellonexus.com
        </a>
        {/* eslint-enable i18next/no-literal-string */}
      </div>

      <p className={styles.credits}>{t('about.credits')}</p>

      <div className={styles.projects}>
        {OSS_PROJECTS.map(project => (
          <a key={project.name} className={styles.link} href={project.url} target="_blank" rel="noopener noreferrer">
            {project.name}
            <ExternalLink size={12} aria-hidden={true} />
          </a>
        ))}
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.okBtn} onClick={onClose}>
          {t('confirm.ok')}
        </button>
      </div>
    </Overlay>
  );
}
