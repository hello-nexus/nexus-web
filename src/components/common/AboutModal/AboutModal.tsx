import { useEffect, useState } from 'react';
import { ExternalLink, Globe } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { Overlay } from '../Overlay/Overlay';
import { GithubGlyph, NexusWordmark } from '../../icons/NexusBrand';
import { pingService } from '../../../api/service';
import styles from './AboutModal.module.scss';

interface AboutModalProps {
  open: boolean;
  onClose: () => void;
  onCheckUpdate: () => void;
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

// "About Nexus" dialog opened from the top-bar "..." menu: brand, build
// version, our links, and open-source acknowledgements.
export function AboutModal({ open, onClose, onCheckUpdate }: AboutModalProps) {
  const { t } = useTranslation();
  const [liveVersion, setLiveVersion] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    pingService().then(p => { if (!cancelled && p?.version) setLiveVersion(p.version); });
    return () => { cancelled = true; };
  }, [open]);
  if (!open) return null;

  return (
    <Overlay open={open} onClose={onClose} variant="alert" onEnter={onClose}
      className={styles.modal} ariaLabel={t('nav.about')}>
      <div className={styles.hero}>
        <img className={styles.logo} src="/nexus-mark-color.png" alt="" width={84} height={84} />
        <NexusWordmark height={26} />
        <div className={styles.version}>{t('about.version', { version: liveVersion ?? __APP_VERSION__ })}</div>
        <button type="button" className={styles.checkUpdateLink} onClick={() => { onClose(); onCheckUpdate(); }}>
          {t('about.checkUpdate')}
        </button>
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
