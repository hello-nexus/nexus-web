import { useTranslation } from '../../../lib/i18n';
import { Overlay } from '../Overlay/Overlay';
import { NexusMark, NexusWordmark } from '../../icons/NexusBrand';
import styles from './AboutModal.module.scss';

interface AboutModalProps {
  open: boolean;
  onClose: () => void;
}

// Lightweight "About Nexus" dialog opened from the top-bar "..." menu.
// Shows the brand, build version, and a link back to the site.
export function AboutModal({ open, onClose }: AboutModalProps) {
  const { t } = useTranslation();
  if (!open) return null;

  return (
    <Overlay open={open} onClose={onClose} variant="alert" onEnter={onClose}
      className={styles.modal} ariaLabel={t('nav.about')}>
      <div className={styles.brand}>
        <NexusMark size={40} />
        <NexusWordmark height={22} />
      </div>
      <div className={styles.version}>{__APP_VERSION__} alpha</div>
      <a className={styles.link} href="https://hellonexus.com" target="_blank" rel="noopener noreferrer">
        hellonexus.com
      </a>
      <div className={styles.actions}>
        <button type="button" className={styles.okBtn} onClick={onClose}>
          {t('confirm.ok')}
        </button>
      </div>
    </Overlay>
  );
}
