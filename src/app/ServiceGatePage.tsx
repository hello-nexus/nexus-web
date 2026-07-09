import { NexusWordmark } from '../components/icons/NexusBrand';
import { useTranslation } from '../lib/i18n';
import type { ConnectionState } from '../hooks/useServiceStatus';
import { ServiceRequired } from '../components/views/ServiceRequired';
import styles from './ServiceGatePage.module.scss';

// The marketing site lives on the bare domain this app host is the my.
// subdomain of; loopback/dev hosts fall back to the site root.
function marketingUrl(): string {
  const { protocol, host } = window.location;
  const h = host.toLowerCase();
  return h.startsWith('my.') ? `${protocol}//${h.slice(3)}` : '/';
}

/**
 * my.hellonexus.com with no reachable local service: the launch / download
 * gate (the dashboard renders once a local Nexus answers). The update hint
 * matters here - services older than the my. rollout don't allow this origin
 * via CORS, which is indistinguishable from "not running".
 */
export function ServiceGatePage({ state }: { state: ConnectionState }) {
  const { t } = useTranslation();
  return (
    <div className={styles.page}>
      <div className={styles.wordmark}>
        <NexusWordmark height={22} />
      </div>
      {/* ServiceRequired positions its card against this wrapper's width; the
          page's centered column would otherwise shrink it to content width. */}
      <div className={styles.body}>
        <ServiceRequired state={state} message={t('site.gate.message')} />
      </div>
      <p className={styles.updateHint}>{t('site.gate.updateHint')}</p>
      <a className={styles.backLink} href={marketingUrl()}>{t('site.gate.backToSite')}</a>
    </div>
  );
}
