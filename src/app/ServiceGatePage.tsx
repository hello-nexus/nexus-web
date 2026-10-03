import { useMemo } from 'react';
import { MonitorSmartphone } from 'lucide-react';
import { NexusWordmark } from '../components/icons/NexusBrand';
import { PlatformIcon } from '../components/icons/PlatformIcons';
import { useTranslation } from '../lib/i18n';
import type { ConnectionState } from '../hooks/useServiceStatus';
import { PageHero, type PageHeroKey } from '../components/common/PageHero/PageHero';
import { ServiceLaunchButton } from '../components/common/ServiceLaunchButton/ServiceLaunchButton';
import { Spinner } from '../components/common/Spinner/Spinner';
import { SafariLaunchNote, primaryDownloadOS, useSafariLaunchBlocked } from '../components/views/ServiceRequired';
import { ALL_DOWNLOADABLE_OS, DOWNLOAD_URLS, formatDownloadSizeMb } from '../lib/downloads';
import { useDownloadManifest } from '../hooks/useDownloadManifest';
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
 * my.hellonexus.com with no reachable local service: the requested page's
 * hero with the download / launch card (the dashboard renders once a local
 * Nexus answers). The update hint matters here - services older than the my.
 * rollout don't allow this origin via CORS, which is indistinguishable from
 * "not running".
 *
 * A phone or tablet can never reach a local service, so instead of the
 * launch/download card it gets the platform note and the pairing how-to.
 */
export function ServiceGatePage({ state, page = 'nexus' }: { state: ConnectionState; page?: PageHeroKey }) {
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
      <PageHero page={page} action={<GetNexus state={state} />} />
    </div>
  );
}

/** Download first, then the already-installed path, under the page's hero. */
function GetNexus({ state }: { state: ConnectionState }) {
  const { t } = useTranslation();
  const primaryOS = useMemo(() => primaryDownloadOS(), []);
  const safariBlocked = useSafariLaunchBlocked();
  const manifest = useDownloadManifest();
  const version = manifest?.version ?? null;
  const sizeMb = formatDownloadSizeMb(manifest?.assets?.[primaryOS]?.size);
  const osLabel = (os: string) => t(`service.required.os.${os}`);
  return (
    <div className={styles.getNexus}>
      <div className={styles.getCard}>
        <div className={styles.getSection}>
          <p className={styles.getLabel}>
            {t(state === 'offline-installed' ? 'service.required.needReinstall' : 'service.required.dontHaveIt')}
          </p>
          <a className={styles.download} href={DOWNLOAD_URLS[primaryOS]} download rel="noopener">
            <PlatformIcon platform={primaryOS} size={18} />
            {t('service.required.downloadFor', { os: osLabel(primaryOS) })}
          </a>
          {version && sizeMb && (
            <span className={styles.downloadMeta}>{t('site.download.meta', { version, size: sizeMb })}</span>
          )}
          <div className={styles.otherPlatforms}>
            <span>{t('service.required.otherPlatforms')}</span>
            {ALL_DOWNLOADABLE_OS.filter(os => os !== primaryOS).map(os => (
              <a key={os} className={styles.platformLink} href={DOWNLOAD_URLS[os]} download rel="noopener">
                <PlatformIcon platform={os} size={13} />
                {osLabel(os)}
              </a>
            ))}
          </div>
        </div>
        <div className={styles.getSection}>
          {safariBlocked ? <SafariLaunchNote /> : (
            <>
              <p className={styles.getHint}>{t('site.gate.updateHint')}</p>
              <ServiceLaunchButton />
            </>
          )}
        </div>
      </div>
      <div className={styles.status} role="status">
        <span className={styles.spinner} aria-hidden><Spinner size={14} /></span>
        {t('status.checking')}
      </div>
      <a className={styles.backLink} href={marketingUrl()}>{t('site.gate.backToSite')}</a>
    </div>
  );
}
