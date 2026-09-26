import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  Boxes, ChevronLeft, Hand, HardDrive, LayoutGrid, Ruler, ShieldCheck, ShoppingBag, Tag,
} from 'lucide-react';
import { Button } from '../../common/Button/Button';
import { Card } from '../../common/Card/Card';
import { ViewHeader } from '../../common/ViewHeader/ViewHeader';
import { useTranslation } from '../../../lib/i18n';
import { formatDateTime, hour12OptionFor, type DateFormat, type TimeFormat } from '../../../lib/units';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import {
  fetchStoreApp, fetchStoreApps, installStoreApp,
  type StoreApp, type StoreAppDetail, type StoreVersion,
} from '../../../api/store';
import {
  getAllMarketplaceListings, loadMarketplaceApps, subscribeMarketplaceRegistry,
} from '../../../widgets/marketplaceRegistry';
import type { UseCloudAccountsResult } from '../../../hooks/useCloudAccounts';
import { AccountSignInModal } from '../SettingsView/Account/AccountSignInModal';
import { resolveHttp } from '../../../api/service';
import { openExternalUrl } from '../../../sandbox/ui/openExternal';
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
  return app.iconUrl ?? (installed?.iconUrl ? resolveHttp(installed.iconUrl) : null);
}

/** The app's own short line: its tagline, else the first sentence of its description. Never abbreviated - a card clips its own line in CSS. */
function shortDescription(app: { tagline?: string; description?: string }): string {
  const raw = (app.tagline || app.description || '').trim();
  if (!raw) return '';
  return raw.split(/(?<=[.!?])\s/)[0].replace(/[.]$/, '');
}

/**
 * The launch day while it is still ahead of us. A past date is simply
 * "available", which is also what an app that never set one is.
 */
function upcomingRelease(app: { releaseDate?: string | null }): Date | null {
  if (!app.releaseDate) return null;
  const at = new Date(app.releaseDate);
  if (Number.isNaN(at.getTime()) || at.getTime() <= Date.now()) return null;
  return at;
}

/** The viewer's local date and time of the launch; the year only when it is not this one. */
function formatLaunch(at: Date, language: string, dateFormat: DateFormat, timeFormat: TimeFormat): string {
  const year = at.getFullYear() === new Date().getFullYear() ? undefined : 'numeric';
  return formatDateTime(at, dateFormat, {
    month: 'long', day: 'numeric', year, hour: 'numeric', minute: '2-digit',
    hour12: hour12OptionFor(timeFormat),
  }, { variant: year ? 'year' : 'short', locale: language });
}

function InstallButton({ app, installedVersion, onNeedsSignIn }: {
  app: StoreApp; installedVersion?: string; onNeedsSignIn: (retry: () => void) => void;
}) {
  const { t, language } = useTranslation();
  const { timeFormat, dateFormat } = useUnitPrefs();
  const [state, setState] = useState<InstallState>('idle');
  const latest = app.latest;
  const launch = upcomingRelease(app);
  const launchAt = launch?.getTime();
  const [tick, rerender] = useState(0);

  // Re-armed each tick until launch, so an open page swaps in Install even past setTimeout's maximum delay.
  useEffect(() => {
    if (launchAt === undefined) return;
    const id = window.setTimeout(() => rerender((n) => n + 1), Math.min(launchAt - Date.now(), 2 ** 31 - 1));
    return () => window.clearTimeout(id);
  }, [launchAt, tick]);

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

  // Ahead of compatibility: an app that is not out yet has nothing to say about
  // whether this build could run it, and the service refuses the install anyway.
  if (launch) {
    return (
      <span className={styles.comingSoon}>
        {t('store.comingSoon', { date: formatLaunch(launch, language, dateFormat, timeFormat) })}
      </span>
    );
  }
  if (!latest) return <span className={styles.incompatible}>{t('store.incompatible')}</span>;

  const upToDate = installedVersion === latest.version;
  const label = state === 'working' ? t('store.installing')
    : state === 'failed' ? t('store.retry')
    : upToDate ? t('store.installed')
    : installedVersion ? t('store.update')
    : t('store.install');

  return (
    <Button
      type="button"
      tone={upToDate ? 'neutral' : state === 'failed' ? 'danger' : 'accent'}
      disabled={state === 'working' || upToDate}
      // The row's whole card opens the app page; getting the app must not.
      onClick={e => { e.stopPropagation(); void install(); }}
    >
      {label}
    </Button>
  );
}

function AppIcon({ app, installed, size = 'row' }: {
  app: { id: string; iconUrl: string | null }; installed?: InstalledInfo; size?: 'row' | 'hero';
}) {
  const icon = iconFor(app, installed);
  return (
    <span className={`${styles.iconBox} ${size === 'hero' ? styles.iconBoxHero : ''}`}>
      {icon
        ? <img src={icon} alt="" className={styles.icon} />
        : <Boxes className={styles.iconFallback} aria-hidden={true} />}
    </span>
  );
}

// disableInteractiveRole: the Install button inside is the focusable control;
// role="button" here would nest a focusable descendant inside a button role.
function AppRow({ app, installed, onOpen, onNeedsSignIn }: {
  app: StoreApp; installed?: InstalledInfo; onOpen: () => void;
  onNeedsSignIn: (retry: () => void) => void;
}) {
  return (
    <Card
      interactive
      disableInteractiveRole
      onClick={onOpen}
      icon={<AppIcon app={app} installed={installed} />}
      title={(
        <button type="button" className={styles.rowTitle} onClick={e => { e.stopPropagation(); onOpen(); }}>
          {app.name}
        </button>
      )}
      subtitle={<span className={styles.rowSubtitle}>{shortDescription(app)}</span>}
      truncateSubtitle
    >
      <div className={styles.rowActions}>
        <InstallButton app={app} installedVersion={installed?.version} onNeedsSignIn={onNeedsSignIn} />
      </div>
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

interface Highlight { key: string; icon: ReactNode; label: string; value: string }

const HIGHLIGHT_ICON = 30;

/** The sizes and Nexus-floor cells are each dropped when the app declares nothing for them. */
function useHighlights(latest: StoreVersion): Highlight[] {
  const { t } = useTranslation();
  const out: Highlight[] = [
    {
      key: 'widget',
      icon: <LayoutGrid size={HIGHLIGHT_ICON} aria-hidden={true} />,
      label: t('store.spec.widget'),
      value: latest.hasWidget ? t('store.value.hasFeature') : t('store.value.noFeature'),
    },
  ];
  if (latest.hasWidget && latest.sizes.length > 0) {
    out.push({
      key: 'sizes',
      icon: <Ruler size={HIGHLIGHT_ICON} aria-hidden={true} />,
      label: t('store.spec.widgetSizes'),
      // Deduped: sizes is wire data and a repeat renders twice.
      value: [...new Set(latest.sizes)].join(' · '),
    });
  }
  out.push(
    {
      key: 'touch',
      icon: <Hand size={HIGHLIGHT_ICON} aria-hidden={true} />,
      label: t('store.spec.touch'),
      value: latest.requiresTouch ? t('store.value.touchRequired') : t('store.value.touchAny'),
    },
    {
      key: 'version',
      icon: <Tag size={HIGHLIGHT_ICON} aria-hidden={true} />,
      label: t('store.spec.version'),
      value: latest.version,
    },
    {
      key: 'size',
      icon: <HardDrive size={HIGHLIGHT_ICON} aria-hidden={true} />,
      label: t('store.spec.size'),
      value: `${Math.max(1, Math.round(latest.size / 1024))} KB`,
    },
  );
  if (latest.minNexusVersion) {
    out.push({
      key: 'requires',
      icon: <ShieldCheck size={HIGHLIGHT_ICON} aria-hidden={true} />,
      label: t('store.spec.requires'),
      value: latest.minNexusVersion,
    });
  }
  return out;
}

function Highlights({ latest }: { latest: StoreVersion }) {
  const highlights = useHighlights(latest);
  return (
    <Card className={styles.highlightsCard}>
      <dl className={styles.highlights}>
        {highlights.map(h => (
          <div key={h.key} className={styles.highlight}>
            <dt className={styles.highlightLabel}>{h.label}</dt>
            <dd className={styles.highlightBody}>
              <span className={styles.highlightIcon}>{h.icon}</span>
              <span className={styles.highlightValue}>{h.value}</span>
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

// Trailing sentence punctuation stays text, so "see https://x.com." links without the period.
const DESCRIPTION_URL = /(https:\/\/\S+?)(?=[.,;:!?)]*(?:\s|$))/;

/** The description with each https URL as a link that opens in the system browser. */
function Description({ text }: { text: string }) {
  return (
    <p className={styles.description}>
      {text.split(DESCRIPTION_URL).map((part, i) => (i % 2 === 1 ? (
        <a
          key={i}
          className={styles.descriptionLink}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => { e.preventDefault(); void openExternalUrl(part); }}
          onAuxClick={e => { if (e.button === 1) { e.preventDefault(); void openExternalUrl(part); } }}
        >
          {part}
        </a>
      ) : part))}
    </p>
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
      <div className={styles.topBar}>
        <button type="button" className={styles.back} onClick={onBack}>
          <ChevronLeft size={16} aria-hidden={true} />
          {t('store.back')}
        </button>
      </div>

      <header className={styles.hero}>
        <AppIcon app={app} installed={installed} size="hero" />
        <div className={styles.heroMain}>
          <h1 className={styles.heroTitle}>{app.name}</h1>
          {app.tagline.trim() && <p className={styles.heroSubtitle}>{app.tagline.trim()}</p>}
          <div className={styles.heroActions}>
            <InstallButton app={app} installedVersion={installed?.version} onNeedsSignIn={onNeedsSignIn} />
          </div>
          {installed && (
            <span className={styles.installedVersion}>
              {t('store.installedVersion', { version: installed.version })}
            </span>
          )}
        </div>
      </header>

      {app.latest && <Highlights latest={app.latest} />}

      {/* Media rides the service's store proxy, never the bundle: it must be readable before the app is installed. */}
      {app.screenshots.length > 0 && (
        <div className={styles.shots}>
          {app.screenshots.map((url, i) => (
            <img
              key={url}
              src={url}
              alt={t('store.screenshotAlt', { name: app.name, index: i + 1 })}
              className={styles.shot}
              loading="lazy"
            />
          ))}
        </div>
      )}

      {app.description && <Description text={app.description} />}
    </div>
  );
}

/**
 * The Nexus Marketplace. The catalog is answered per client - this build's
 * version decides which releases it is offered - so the page renders what it is
 * given rather than filtering locally.
 */
export function StorePage({ tab, onTabChange, accounts }: {
  /** Route segment: the open app's id, so a store page is linkable. */
  tab?: string | null;
  onTabChange?: (tab: string) => void;
  /** The app's shared account state: signing in from the store dialog signs the whole app in, so the top bar and account page have to hear about it. */
  accounts?: UseCloudAccountsResult;
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
    void accounts?.refresh();
    retry?.();
  }, [accounts, pendingInstall]);

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
                <AppRow
                  key={app.id}
                  app={app}
                  installed={installed.get(app.id)}
                  onOpen={() => open(app.id)}
                  onNeedsSignIn={handleNeedsSignIn}
                />
              ))}
            </div>
          )}
        </div>
      )}
      <AccountSignInModal
        open={pendingInstall !== null}
        onClose={() => setPendingInstall(null)}
        onSignedIn={handleSignedIn}
        ariaLabel={t('store.signIn.title')}
        body={t('store.signIn.body')}
      />
    </div>
  );
}

export default StorePage;
