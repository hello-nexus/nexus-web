// isInsecureBrowserPanel lives next to the banner it gates; PanelApp imports
// both to decide + render in one place.
 
import { ShieldAlert } from 'lucide-react';
import { useTranslation } from '../../lib/i18n';
import { APP_STORE_URL } from '../../lib/appStore';
import styles from './PanelInsecureBanner.module.scss';

/**
 * Strip shown when the panel was reached over plain HTTP (the LAN browser
 * fallback); not rendered on the native iOS app or HTTPS path. Points at the
 * App Store rather than /r/pair, which needs fresh pair params the panel page
 * doesn't carry post-claim.
 */
export function PanelInsecureBanner({ installHref }: { installHref?: string }) {
  const { t } = useTranslation();
  const href = installHref ?? APP_STORE_URL;

  return (
    <div role="status" className={styles.banner} aria-live="polite">
      <span className={styles.icon} aria-hidden="true">
        <ShieldAlert size={14} />
      </span>
      <span className={styles.message}>{t('panel.insecure.message')}</span>
      <a className={styles.cta} href={href} target="_blank" rel="noreferrer">
        {t('panel.insecure.installCta')}
      </a>
    </div>
  );
}

export function isInsecureBrowserPanel(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.location.protocol !== 'http:') return false;
  // Loopback is the bundled SPA on the user's own PC, not the LAN fallback.
  const host = window.location.hostname;
  return host !== 'localhost' && host !== '127.0.0.1' && host !== '::1';
}
