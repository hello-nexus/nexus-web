import { MonitorSmartphone } from 'lucide-react';
import { NexusWordmark } from '../components/icons/NexusBrand';
import { useTranslation } from '../lib/i18n';
import type { ConnectionState } from '../hooks/useServiceStatus';
import { ServiceRequired } from '../components/views/ServiceRequired';
import { isHandheldDevice } from '../lib/platform';
import styles from './ServiceGatePage.module.scss';

// The marketing site lives on the bare domain this app host is the my.
// subdomain of; loopback/dev hosts fall back to the site root.
function marketingUrl(): string {
  const { protocol, host } = window.location;
  const h = host.toLowerCase();
  return h.startsWith('my.') ? `${protocol}//${h.slice(3)}` : '/';
}

function marketingHref(path: string): string {
  const base = marketingUrl();
  return base === '/' ? path : `${base}${path}`;
}

// The pairing guide on the marketing site's docs; the handheld gate's
// primary CTA. (/how-to/pair-your-phone 301s here for older builds.)
const PAIR_HOWTO_PATH = '/docs/guides/remote-devices/pair-your-phone';

/**
 * my.hellonexus.com with no reachable local service: the launch / download
 * gate (the dashboard renders once a local Nexus answers). The update hint
 * matters here - services older than the my. rollout don't allow this origin
 * via CORS, which is indistinguishable from "not running".
 *
 * A phone or tablet can never reach a local service, so instead of the
 * launch/download card it gets the platform note and the pairing how-to.
 */
export function ServiceGatePage({ state }: { state: ConnectionState }) {
  const { t } = useTranslation();
  if (isHandheldDevice()) {
    return (
      <div className={styles.page}>
        <div className={styles.wordmark}>
          <NexusWordmark height={22} />
        </div>
        <div className={styles.handheldCard}>
          <MonitorSmartphone size={32} className={styles.handheldIcon} aria-hidden />
          <p className={styles.handheldMessage}>{t('site.gate.handheldMessage')}</p>
          <p className={styles.handheldPair}>{t('site.gate.handheldPair')}</p>
          <a className={styles.howToLink} href={marketingHref(PAIR_HOWTO_PATH)}>
            {t('site.gate.handheldHowTo')}
          </a>
        </div>
        <a className={styles.backLink} href={marketingUrl()}>{t('site.gate.backToSite')}</a>
      </div>
    );
  }
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
