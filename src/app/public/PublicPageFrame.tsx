import type { ReactNode } from 'react';
import { NexusMark } from '../../components/icons/NexusBrand';
import { useTranslation } from '../../lib/i18n';
import styles from './PublicPageFrame.module.scss';

/**
 * Shared outer shell for the browser-only emailed account landings
 * (/auth/verify, /auth/recover): dark centered column with the Nexus mark
 * linking home.
 */
export function PublicPageFrame({ children, maxWidth = 420 }: { children: ReactNode; maxWidth?: number }) {
  const { t } = useTranslation();
  return (
    <div className={styles.frame}>
      <a href="/" className={styles.logo} aria-label={t('common.nexusHome')}>
        <NexusMark size={40} />
      </a>
      <div className={styles.stack} style={{ maxWidth }}>
        {children}
      </div>
    </div>
  );
}
