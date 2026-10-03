import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import {
  ChevronLeft, ChevronRight, Hand, HardDrive, LayoutGrid, Ruler, ShieldCheck, Sparkles, Store, Tag,
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
  getAllMarketplaceListings, getMarketplaceListing, loadMarketplaceApps, reloadMarketplaceApps,
  subscribeMarketplaceRegistry, typeForMarketplace,
} from '../../../widgets/marketplaceRegistry';
import type { UnifiedDevice } from '../../../hooks/useUnifiedDevices';
import { announceSidebarArrival } from '../../../app/sidebarArrival';
import { InstallPlacementModal } from './InstallPlacementModal';
import { dashboardColumnsForWidth } from './installPlacement';
import type { UseCloudAccountsResult } from '../../../hooks/useCloudAccounts';
import { capabilityGrants, capabilityLabel } from './capabilityLabels';
import { AccountSignInModal } from '../SettingsView/Account/AccountSignInModal';
import { AppIconTile } from '../../common/AppIconTile/AppIconTile';
import { resolveHttp } from '../../../api/service';
import { openExternalUrl } from '../../../sandbox/ui/openExternal';
import { widgetLayoutSize, type PanelWidgetSize } from '../../../panel/types';
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

type NeedsSignIn = (retry: () => void) => void;
/** A fresh install landed; updates do not call it. */
type OnInstalled = (app: StoreApp) => void;

function InstallButton({ app, installedVersion, onNeedsSignIn, onInstalled }: {
  app: StoreApp; installedVersion?: string; onNeedsSignIn: NeedsSignIn; onInstalled: OnInstalled;
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
      // the app appear without a reload. A load already in flight can predate
      // the install, so this one must not join it.
      await reloadMarketplaceApps();
      setState('idle');
      if (!installedVersion) onInstalled(app);
      return;
    }
    setState('idle');
    if (res?.reason === 'sign_in_required') {
      onNeedsSignIn(() => { void install(); });
      return;
    }
    setState('failed');
  }, [app, installedVersion, latest, onNeedsSignIn, onInstalled]);

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

interface Placing { app: StoreApp; iconSrc: string | null; dashboardColumns: number }

const NO_DEVICES: readonly UnifiedDevice[] = [];

// Row and hero edges in px; the row edge matches $row-icon in the stylesheet.
const ICON_SIZE = { row: 56, hero: 112 } as const;

function AppIcon({ app, installed, size = 'row' }: {
  app: { id: string; iconUrl: string | null }; installed?: InstalledInfo; size?: 'row' | 'hero';
}) {
  return <AppIconTile src={iconFor(app, installed)} size={ICON_SIZE[size]} />;
}

// disableInteractiveRole: the Install button inside is the focusable control;
// role="button" here would nest a focusable descendant inside a button role.
function AppRow({ app, installed, onOpen, onNeedsSignIn, onInstalled }: {
  app: StoreApp; installed?: InstalledInfo; onOpen: () => void;
  onNeedsSignIn: NeedsSignIn; onInstalled: OnInstalled;
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
        <InstallButton app={app} installedVersion={installed?.version} onNeedsSignIn={onNeedsSignIn} onInstalled={onInstalled} />
      </div>
    </Card>
  );
}

/**
 * The first app in the catalog, shown large with its screenshots. The
 * catalog lists no media, so the card fetches the app page's own detail.
 */
function FeaturedApp({ app, installed, onOpen, onNeedsSignIn, onInstalled }: {
  app: StoreApp; installed?: InstalledInfo; onOpen: () => void;
  onNeedsSignIn: NeedsSignIn; onInstalled: OnInstalled;
}) {
  const { t } = useTranslation();
  const [shots, setShots] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    void fetchStoreApp(app.id).then(res => { if (alive && res) setShots(res.screenshots.slice(0, 3)); });
    return () => { alive = false; };
  }, [app.id]);

  return (
    // The title button is the keyboard route; the section only widens the click target.
    <section className={styles.featured} onClick={onOpen}>
      {shots[0] && <img src={shots[0]} alt="" className={styles.featuredGlow} aria-hidden={true} />}
      <div className={styles.featuredMain}>
        <span className={styles.featuredEyebrow}>
          <Sparkles size={14} aria-hidden={true} />
          {t('store.featured')}
        </span>
        <AppIcon app={app} installed={installed} size="hero" />
        <button type="button" className={styles.featuredTitle} onClick={e => { e.stopPropagation(); onOpen(); }}>
          {app.name}
        </button>
        {/* A tagline is written whole, so it is never cut to its first sentence; the description's
            opening paragraph follows it, and only then, so the card never says the same thing twice. */}
        {(app.tagline.trim() || shortDescription(app)) && (
          <p className={styles.featuredLine}>{app.tagline.trim() || shortDescription(app)}</p>
        )}
        {app.tagline.trim() && app.description?.trim() && (
          <p className={styles.featuredBlurb}>{app.description.trim().split(/\n\s*\n/)[0]}</p>
        )}
        <div className={styles.featuredActions}>
          <InstallButton app={app} installedVersion={installed?.version} onNeedsSignIn={onNeedsSignIn} onInstalled={onInstalled} />
        </div>
      </div>
      {shots.length > 0 && (
        <div className={styles.featuredShots}>
          {shots.map((url, i) => (
            <img
              key={url}
              src={url}
              alt={t('store.screenshotAlt', { name: app.name, index: i + 1 })}
              className={styles.featuredShot}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function StoreBanner() {
  const { t } = useTranslation();
  return (
    <div className={styles.banner}>
      <Store className={styles.bannerIcon} size={22} aria-hidden={true} />
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
      // Round folds into 2x2, which every 2x2 widget already covers; the Set dedupes the fold and wire repeats.
      value: [...new Set(latest.sizes.map((s) => widgetLayoutSize(s as PanelWidgetSize)))].join(' · '),
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
              <span className={`${styles.highlightValue} selectable`}>{h.value}</span>
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
    <p className={`${styles.description} selectable`}>
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

/** A version's notes as blocks: a run of lines led by '- ', '* ' or '• ' is a list, any other run a paragraph; a blank line ends a run. */
export function notesBlocks(notes: string): Array<{ list: false; text: string } | { list: true; items: string[] }> {
  const blocks: Array<{ list: false; text: string } | { list: true; items: string[] }> = [];
  let gap = true;
  for (const raw of notes.split('\n')) {
    const line = raw.trim();
    if (!line) {
      gap = true;
      continue;
    }
    const last = gap ? undefined : blocks[blocks.length - 1];
    const bullet = /^[-*\u2022]\s+(.*)$/.exec(line);
    if (bullet) {
      if (last?.list) last.items.push(bullet[1]);
      else blocks.push({ list: true, items: [bullet[1]] });
    } else if (last && !last.list) last.text += `\n${line}`;
    else blocks.push({ list: false, text: line });
    gap = false;
  }
  return blocks;
}

/** What is new in the version on offer; renders nothing when its release says nothing. */
function WhatsNew({ latest }: { latest: StoreVersion }) {
  const { t } = useTranslation();
  const blocks = notesBlocks(latest.notes ?? '');
  if (blocks.length === 0) return null;
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{t('store.section.whatsNew', { version: latest.version })}</h2>
      {blocks.map((b, i) => (b.list ? (
        <ul key={i} className={`${styles.notes} selectable`}>
          {b.items.map((item, k) => <li key={k}>{item}</li>)}
        </ul>
      ) : (
        <p key={i} className={`${styles.description} selectable`}>{b.text}</p>
      )))}
    </section>
  );
}

/** What the version is allowed to do on this PC; renders nothing when it requests no permission. */
function Permissions({ latest }: { latest: StoreVersion }) {
  const { t } = useTranslation();
  const grants = capabilityGrants(latest.capabilities);
  if (grants.length === 0) return null;
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{t('store.section.permissions')}</h2>
      <ul className={`${styles.permissions} selectable`}>
        {grants.map(grant => <li key={grant}>{capabilityLabel(grant, t)}</li>)}
      </ul>
    </section>
  );
}

/** The screenshot row; an arrow shows only while more screenshots lie past that edge. */
function Screenshots({ app }: { app: StoreAppDetail }) {
  const { t } = useTranslation();
  const rowRef = useRef<HTMLDivElement>(null);
  const leftRef = useRef<HTMLButtonElement>(null);
  const rightRef = useRef<HTMLButtonElement>(null);
  const pressed = useRef<-1 | 1 | null>(null);
  const [more, setMore] = useState({ left: false, right: false });

  // The arrow that reached its end unmounts with focus on it; hand focus to the opposite one,
  // and only when focus fell to the body, so focus the user placed elsewhere stays put.
  useLayoutEffect(() => {
    const reachedEnd = (pressed.current === 1 && !more.right) || (pressed.current === -1 && !more.left);
    if (!reachedEnd) return;
    const lost = document.activeElement === null || document.activeElement === document.body;
    if (lost) (pressed.current === 1 ? leftRef : rightRef).current?.focus();
    pressed.current = null;
  }, [more]);

  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const update = () => {
      const left = row.scrollLeft > 1;
      const right = row.scrollLeft + row.clientWidth < row.scrollWidth - 1;
      setMore(prev => (prev.left === left && prev.right === right ? prev : { left, right }));
    };
    update();
    row.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(row);
    return () => { row.removeEventListener('scroll', update); observer.disconnect(); };
  }, []);

  const scrollPage = (direction: -1 | 1) => {
    pressed.current = direction;
    const row = rowRef.current;
    row?.scrollBy({ left: direction * row.clientWidth * 0.9, behavior: 'smooth' });
  };

  return (
    <div className={styles.shotsRail}>
      <div ref={rowRef} className={styles.shots}>
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
      {more.left && (
        <Button
          ref={leftRef}
          className={`${styles.shotsArrow} ${styles.shotsArrowLeft}`}
          size="lg"
          icon={<ChevronLeft size={22} />}
          aria-label={t('common.pager.prev')}
          onClick={() => scrollPage(-1)}
        />
      )}
      {more.right && (
        <Button
          ref={rightRef}
          className={`${styles.shotsArrow} ${styles.shotsArrowRight}`}
          size="lg"
          icon={<ChevronRight size={22} />}
          aria-label={t('common.pager.next')}
          onClick={() => scrollPage(1)}
        />
      )}
    </div>
  );
}

function AppDetail({ appId, onBack, installed, onNeedsSignIn, onInstalled }: {
  appId: string; onBack: () => void; installed?: InstalledInfo;
  onNeedsSignIn: NeedsSignIn; onInstalled: OnInstalled;
}) {
  const { t, language } = useTranslation();
  const [app, setApp] = useState<StoreAppDetail | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let alive = true;
    void fetchStoreApp(appId, { locale: language }).then(res => {
      if (!alive) return;
      if (res) setApp(res); else setMissing(true);
    });
    return () => { alive = false; };
  }, [appId, language]);

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
          <h1 className={`${styles.heroTitle} selectable`}>{app.name}</h1>
          {app.tagline.trim() && <p className={`${styles.heroSubtitle} selectable`}>{app.tagline.trim()}</p>}
          <div className={styles.heroActions}>
            <InstallButton app={app} installedVersion={installed?.version} onNeedsSignIn={onNeedsSignIn} onInstalled={onInstalled} />
          </div>
          {installed && (
            <span className={`${styles.installedVersion} selectable`}>
              {t('store.installedVersion', { version: installed.version })}
            </span>
          )}
        </div>
      </header>

      {app.latest && <Highlights latest={app.latest} />}

      {app.latest && <WhatsNew latest={app.latest} />}

      {/* Media rides the service's store proxy, never the bundle: it must be readable before the app is installed. */}
      {app.screenshots.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t('store.section.preview')}</h2>
          <Screenshots key={app.id} app={app} />
        </section>
      )}

      {app.description && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t('store.section.description')}</h2>
          <Description text={app.description} />
        </section>
      )}

      {app.latest && <Permissions latest={app.latest} />}
    </div>
  );
}

/**
 * The Nexus Marketplace. The catalog is answered per client - this build's
 * version decides which releases it is offered - so the page renders what it is
 * given rather than filtering locally.
 */
export function StorePage({ tab, onTabChange, accounts, devices = NO_DEVICES }: {
  /** Route segment: the open app's id, so a store page is linkable. */
  tab?: string | null;
  onTabChange?: (tab: string) => void;
  /** The app's shared account state: signing in from the store dialog signs the whole app in, so the top bar and account page have to hear about it. */
  accounts?: UseCloudAccountsResult;
  /** The sidebar's device list: a fresh widget install offers every panel in it. */
  devices?: readonly UnifiedDevice[];
}) {
  const { t, language } = useTranslation();
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
    void fetchStoreApps({ locale: language }).then(res => {
      if (!alive) return;
      if (res) setApps(res); else setFailed(true);
    });
    return () => { alive = false; };
  }, [language]);

  const handleNeedsSignIn = useCallback((retry: () => void) => {
    setPendingInstall(() => retry);
  }, []);

  const rootRef = useRef<HTMLDivElement>(null);
  // One modal at a time: a second install while one is open waits its turn.
  const [placeQueue, setPlaceQueue] = useState<Placing[]>([]);
  const placing = placeQueue[0] ?? null;

  // A page docks into the sidebar at once; a widget asks where to go. With both,
  // the modal waits for the dock's shine, which its scrim would otherwise cover.
  const handleInstalled = useCallback((app: StoreApp) => {
    const listing = getMarketplaceListing(app.id);
    const hasPage = !!listing?.page;
    const hasWidget = app.latest?.hasWidget !== false;
    const ask = () => setPlaceQueue(queue => [...queue, {
      app,
      iconSrc: iconFor(app, listing ? { version: listing.version, iconUrl: listing.iconUrl } : undefined),
      dashboardColumns: dashboardColumnsForWidth(rootRef.current?.clientWidth ?? 0),
    }]);
    if (hasPage) {
      announceSidebarArrival(typeForMarketplace(app.id), {
        enter: true,
        shines: hasWidget ? 1 : 2,
        onRevealed: hasWidget ? ask : undefined,
      });
    } else if (hasWidget) {
      ask();
    }
  }, []);

  const handlePlaced = useCallback(() => {
    if (placing && getMarketplaceListing(placing.app.id)?.page) {
      announceSidebarArrival(typeForMarketplace(placing.app.id), { enter: false });
    }
    setPlaceQueue(queue => queue.slice(1));
  }, [placing]);

  const handleSignedIn = useCallback(() => {
    const retry = pendingInstall;
    setPendingInstall(null);
    void accounts?.refresh();
    retry?.();
  }, [accounts, pendingInstall]);

  return (
    <div className={styles.app} ref={rootRef}>
      <ViewHeader title={t('apps.tabs.store')} />
      {openId ? (
        <AppDetail
          appId={openId}
          onBack={() => open(null)}
          installed={installed.get(openId)}
          onNeedsSignIn={handleNeedsSignIn}
          onInstalled={handleInstalled}
        />
      ) : (
        <div className={styles.body}>
          <StoreBanner />
          {failed ? (
            <div className={styles.notice}>{t('store.unavailable')}</div>
          ) : !apps ? (
            <div className={styles.notice}>{t('store.loading')}</div>
          ) : apps.length === 0 ? (
            <div className={styles.notice}>{t('store.empty')}</div>
          ) : (
            <>
              <FeaturedApp
                key={apps[0].id}
                app={apps[0]}
                installed={installed.get(apps[0].id)}
                onOpen={() => open(apps[0].id)}
                onNeedsSignIn={handleNeedsSignIn}
                onInstalled={handleInstalled}
              />
              {apps.length > 1 && (
                <>
                  <h2 className={styles.sectionTitle}>{t('store.section.apps')}</h2>
                  <div className={styles.grid}>
                    {apps.slice(1).map(app => (
                      <AppRow
                        key={app.id}
                        app={app}
                        installed={installed.get(app.id)}
                        onOpen={() => open(app.id)}
                        onNeedsSignIn={handleNeedsSignIn}
                        onInstalled={handleInstalled}
                      />
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
      <AccountSignInModal
        open={pendingInstall !== null}
        onClose={() => setPendingInstall(null)}
        onSignedIn={handleSignedIn}
        title={t('store.signIn.title')}
        body={t('store.signIn.body')}
      />
      {placing && (
        <InstallPlacementModal
          key={placing.app.id}
          app={placing.app}
          iconSrc={placing.iconSrc}
          devices={devices}
          dashboardColumns={placing.dashboardColumns}
          onDone={handlePlaced}
        />
      )}
    </div>
  );
}

export default StorePage;
