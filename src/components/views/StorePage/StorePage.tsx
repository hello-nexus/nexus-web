import { useCallback, useEffect, useState } from 'react';
import { Boxes, ChevronLeft, ShoppingBag } from 'lucide-react';
import { Card } from '../../common/Card/Card';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { ViewHeader } from '../../common/ViewHeader/ViewHeader';
import { useTranslation } from '../../../lib/i18n';
import {
  fetchStoreApp, fetchStoreApps, installStoreApp,
  type StoreApp, type StoreAppDetail,
} from '../../../api/store';
import {
  getAllMarketplaceListings, loadMarketplaceApps, subscribeMarketplaceRegistry,
} from '../../../widgets/marketplaceRegistry';
import { RemoveAppButton } from './RemoveAppButton';
import { StoreSignInModal } from './StoreSignInModal';
import styles from './StorePage.module.scss';

type InstallState = 'idle' | 'working' | 'failed';

interface InstalledInfo { version: string; iconUrl?: string | null }

/** Installed apps by id, so a listing can offer Get / Installed / Update. */
function useInstalled(): Map<string, InstalledInfo> {
  const [installed, setInstalled] = useState(() => installedMap());
  useEffect(() => {
    void loadMarketplaceApps().then(() => setInstalled(installedMap()));
    return subscribeMarketplaceRegistry(() => setInstalled(installedMap()));
  }, []);
  return installed;
}

function installedMap(): Map<string, InstalledInfo> {
  return new Map(getAllMarketplaceListings().map(a => [a.id, { version: a.version, iconUrl: a.iconUrl }]));
}

/**
 * The app's own icon is the default: it ships inside the artifact and the
 * service serves it once installed. A store-uploaded image only overrides it,
 * which is what lets an app carry a richer store icon than its in-app mark.
 */
function iconFor(app: { id: string; iconUrl: string | null }, installed?: InstalledInfo): string | null {
  return app.iconUrl ?? installed?.iconUrl ?? null;
}

/** App Store subtitles are 30 characters; past this a card line stops being a subtitle. */
const SUBTITLE_MAX = 40;

/**
 * The App Store subtitle line: the app's own short line, never the publisher.
 * An app that set no tagline falls back to the first sentence of its
 * description, trimmed at a word - the full text is what the About section is
 * for.
 */
function shortDescription(app: { tagline?: string; description?: string }): string {
  const raw = (app.tagline || app.description || '').trim();
  if (!raw) return '';
  const sentence = raw.split(/(?<=[.!?])\s/)[0].replace(/[.]$/, '');
  if (sentence.length <= SUBTITLE_MAX) return sentence;
  const cut = sentence.slice(0, SUBTITLE_MAX);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd()}\u2026`;
}

function InstallButton({ app, installedVersion, onNeedsSignIn }: {
  app: StoreApp; installedVersion?: string; onNeedsSignIn: (retry: () => void) => void;
}) {
  const { t } = useTranslation();
  const [state, setState] = useState<InstallState>('idle');
  const latest = app.latest;

  const install = useCallback(async () => {
    if (!latest) return;
    setState('working');
    const res = await installStoreApp({ id: app.id, latest });
    if (res?.ok) {
      // The registry is what the panel picker reads; refreshing it is what makes
      // the app appear without a reload.
      await loadMarketplaceApps();
      setState('idle');
      return;
    }
    setState('idle');
    if (res?.reason === 'sign_in_required') {
      onNeedsSignIn(() => { void install(); });
      return;
    }
    setState('failed');
  }, [app.id, latest, onNeedsSignIn]);

  if (!latest) return <span className={styles.incompatible}>{t('store.incompatible')}</span>;

  const upToDate = installedVersion === latest.version;
  const label = state === 'working' ? t('store.installing')
    : state === 'failed' ? t('store.retry')
    : upToDate ? t('store.installed')
    : installedVersion ? t('store.update')
    : t('store.install');

  return (
    <button
      type="button"
      className={`${styles.install} ${state === 'failed' ? styles.installFailed : ''}`}
      onClick={() => { void install(); }}
      disabled={state === 'working' || upToDate}
    >
      {label}
    </button>
  );
}

function AppIcon({ app, installed, large }: {
  app: { id: string; iconUrl: string | null }; installed?: InstalledInfo; large?: boolean;
}) {
  const icon = iconFor(app, installed);
  return (
    <span className={large ? styles.detailIconBox : styles.iconBox}>
      {icon
        ? <img src={icon} alt="" className={large ? styles.detailIcon : styles.icon} />
        : <Boxes className={styles.iconFallback} aria-hidden={true} />}
    </span>
  );
}

/**
 * Storefront card: icon, name, one line of copy. No Get button and no rating -
 * getting an app is a decision made on its page, the way the App Store does it.
 */
function AppCard({ app, installed, onOpen }: {
  app: StoreApp; installed?: InstalledInfo; onOpen: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Card
      interactive
      onClick={onOpen}
      icon={<AppIcon app={app} installed={installed} />}
      title={app.name}
      subtitle={<span className={styles.cardSubtitle}>{shortDescription(app)}</span>}
      truncateSubtitle
    >
      {installed && <span className={styles.installedTag}>{t('store.installed')}</span>}
    </Card>
  );
}

function StoreBanner() {
  const { t } = useTranslation();
  return (
    <div className={styles.banner}>
      <ShoppingBag className={styles.bannerIcon} size={22} aria-hidden={true} />
      <div className={styles.bannerText}>
        <h2 className={styles.bannerTitle}>{t('store.banner.title')}</h2>
        <p className={styles.bannerBody}>{t('store.banner.body')}</p>
      </div>
    </div>
  );
}

function AppDetail({ appId, onBack, installed, onNeedsSignIn }: {
  appId: string; onBack: () => void; installed?: InstalledInfo;
  onNeedsSignIn: (retry: () => void) => void;
}) {
  const { t } = useTranslation();
  const [app, setApp] = useState<StoreAppDetail | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let alive = true;
    void fetchStoreApp(appId).then(res => {
      if (!alive) return;
      if (res) setApp(res); else setMissing(true);
    });
    return () => { alive = false; };
  }, [appId]);

  if (missing) return <div className={styles.notice}>{t('store.unavailable')}</div>;
  if (!app) return <div className={styles.notice}>{t('store.loading')}</div>;

  return (
    <div className={styles.detail}>
      <button type="button" className={styles.back} onClick={onBack}>
        <ChevronLeft size={16} aria-hidden={true} />
        {t('store.back')}
      </button>

      <Card
        icon={<AppIcon app={app} installed={installed} large />}
        title={app.name}
        subtitle={<span className={styles.cardSubtitle}>{shortDescription(app)}</span>}
        actions={(
          <div className={styles.cardActions}>
            <InstallButton app={app} installedVersion={installed?.version} onNeedsSignIn={onNeedsSignIn} />
          </div>
        )}
      >
        {installed && (
          <span className={styles.installedVersion}>
            {t('store.installedVersion', { version: installed.version })}
          </span>
        )}
      </Card>

      {app.screenshots.length > 0 && (
        <SettingsSection title={t('store.section.preview')}>
          <div className={styles.shots}>
            {app.screenshots.map(url => (
              <img key={url} src={url} alt="" className={styles.shot} loading="lazy" />
            ))}
          </div>
        </SettingsSection>
      )}

      {app.description && (
        <SettingsSection title={t('store.section.about')}>
          <p className={styles.description}>{app.description}</p>
        </SettingsSection>
      )}

      {app.latest && (
        <SettingsSection title={t('store.section.details')}>
          <dl className={styles.specs}>
            <dt>{t('store.spec.widget')}</dt>
            <dd>{app.latest.hasWidget ? t('store.value.hasFeature') : t('store.value.noFeature')}</dd>
            {app.latest.hasWidget && app.latest.sizes.length > 0 && (
              <>
                <dt>{t('store.spec.widgetSizes')}</dt>
                <dd className={styles.sizes}>
                  {/* Deduped: sizes is wire data, and a repeat would collide on key. */}
                  {[...new Set(app.latest.sizes)].map(size => (
                    <span key={size} className={styles.size}>{size}</span>
                  ))}
                </dd>
              </>
            )}
            <dt>{t('store.spec.touch')}</dt>
            <dd>
              {app.latest.requiresTouch
                ? t('store.value.touchRequired')
                : t('store.value.touchAny')}
            </dd>
            <dt>{t('store.spec.version')}</dt>
            <dd>{app.latest.version}</dd>
            <dt>{t('store.spec.size')}</dt>
            <dd>{Math.max(1, Math.round(app.latest.size / 1024))} KB</dd>
            {app.latest.minNexusVersion && (
              <>
                <dt>{t('store.spec.requires')}</dt>
                <dd>{app.latest.minNexusVersion}</dd>
              </>
            )}
          </dl>
        </SettingsSection>
      )}

      {installed && (
        <div className={styles.detailFooter}>
          <RemoveAppButton app={{ id: app.id, name: app.name }} label={t('store.delete')} />
        </div>
      )}
    </div>
  );
}

/**
 * The Nexus Store. The catalog is answered per client - this build's version
 * decides which releases it is offered - so the page renders what it is given
 * rather than filtering locally.
 */
export function StorePage({ tab, onTabChange }: {
  /** Route segment: the open app's id, so a store page is linkable. */
  tab?: string | null;
  onTabChange?: (tab: string) => void;
}) {
  const { t } = useTranslation();
  const installed = useInstalled();
  const [apps, setApps] = useState<StoreApp[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [localOpenId, setLocalOpenId] = useState<string | null>(null);
  // Install to resume once a session exists - the modal is opened by a refused
  // install, so signing in finishes what the user already asked for.
  const [pendingInstall, setPendingInstall] = useState<(() => void) | null>(null);

  const openId = onTabChange ? (tab ?? null) : localOpenId;
  const open = useCallback((id: string | null) => {
    if (onTabChange) onTabChange(id ?? '');
    else setLocalOpenId(id);
  }, [onTabChange]);

  useEffect(() => {
    let alive = true;
    void fetchStoreApps().then(res => {
      if (!alive) return;
      if (res) setApps(res); else setFailed(true);
    });
    return () => { alive = false; };
  }, []);

  const handleNeedsSignIn = useCallback((retry: () => void) => {
    setPendingInstall(() => retry);
  }, []);

  const handleSignedIn = useCallback(() => {
    const retry = pendingInstall;
    setPendingInstall(null);
    retry?.();
  }, [pendingInstall]);

  return (
    <div className={styles.app}>
      <ViewHeader title={t('apps.tabs.store')} />
      {openId ? (
        <AppDetail
          appId={openId}
          onBack={() => open(null)}
          installed={installed.get(openId)}
          onNeedsSignIn={handleNeedsSignIn}
        />
      ) : (
        <div className={styles.body}>
          <StoreBanner />
          <h2 className={styles.sectionTitle}>{t('store.section.apps')}</h2>
          {failed ? (
            <div className={styles.notice}>{t('store.unavailable')}</div>
          ) : !apps ? (
            <div className={styles.notice}>{t('store.loading')}</div>
          ) : apps.length === 0 ? (
            <div className={styles.notice}>{t('store.empty')}</div>
          ) : (
            <div className={styles.grid}>
              {apps.map(app => (
                <AppCard
                  key={app.id}
                  app={app}
                  installed={installed.get(app.id)}
                  onOpen={() => open(app.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}
      <StoreSignInModal
        open={pendingInstall !== null}
        onClose={() => setPendingInstall(null)}
        onSignedIn={handleSignedIn}
      />
    </div>
  );
}

export default StorePage;
