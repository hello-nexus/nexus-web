import { useCallback, useEffect, useState } from 'react';
import { Boxes, ChevronLeft, Star, Trash2 } from 'lucide-react';
import { Card } from '../../common/Card/Card';
import { ConfirmModal } from '../../common/ConfirmModal/ConfirmModal';
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
import { findAppUsage, removeAppEverywhere, type AppUsage } from '../../../api/storeUsage';
import { postService } from '../../../api/service';
import styles from './StorePage.module.scss';

type InstallState = 'idle' | 'working' | 'failed';

interface InstalledInfo { version: string; iconUrl?: string | null }

/** Installed apps by id, so a listing can offer Install / Installed / Update. */
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

function Stars({ rating }: { rating: { average: number; count: number } }) {
  const { t } = useTranslation();
  if (rating.count === 0) return <span className={styles.ratingEmpty}>{t('store.noRatings')}</span>;
  return (
    <span className={styles.rating}>
      {[1, 2, 3, 4, 5].map(n => (
        <Star
          key={n}
          size={12}
          className={n <= Math.round(rating.average) ? styles.starOn : styles.starOff}
          aria-hidden={true}
        />
      ))}
      <span className={styles.ratingCount}>{rating.average.toFixed(1)} ({rating.count})</span>
    </span>
  );
}

function InstallButton({ app, installedVersion }: { app: StoreApp; installedVersion?: string }) {
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
    } else {
      setState('failed');
    }
  }, [app.id, latest]);

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
      onClick={install}
      disabled={state === 'working' || upToDate}
    >
      {label}
    </button>
  );
}

/**
 * Uninstall, after showing where the app is placed. The panel reconciler drops
 * orphaned widgets silently, so a user who uninstalls without being told would
 * find widgets simply missing from panels they were not thinking about.
 */
function RemoveButton({ app }: { app: { id: string; name: string } }) {
  const { t } = useTranslation();
  const [usage, setUsage] = useState<AppUsage | null>(null);
  const [busy, setBusy] = useState(false);

  const ask = useCallback(async () => {
    setUsage(await findAppUsage(app.id, t('nav.dashboard')));
  }, [app.id, t]);

  const confirm = useCallback(async () => {
    setBusy(true);
    await removeAppEverywhere(app.id);
    await postService('/apps-api/uninstall', { id: app.id });
    await loadMarketplaceApps();
    setBusy(false);
    setUsage(null);
  }, [app.id]);

  // Just the place, the way the user names it. A count only when it is there
  // more than once, since "Dashboard (1)" reads like a bug.
  const bullets = (usage?.places ?? []).map(p =>
    p.count > 1 ? `${p.name} (${p.count})` : p.name);

  return (
    <>
      <button type="button" className={styles.remove} onClick={ask} aria-label={t('store.remove')}>
        <Trash2 size={15} aria-hidden={true} />
      </button>
      <ConfirmModal
        open={usage !== null}
        title={t('store.removeTitle', { name: app.name })}
        message={usage && usage.total > 0 ? t('store.removeUsed') : t('store.removeUnused')}
        bullets={bullets}
        confirmLabel={t('store.remove')}
        confirmDisabled={busy}
        onConfirm={() => { void confirm(); }}
        onCancel={() => setUsage(null)}
      />
    </>
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

function AppCard({ app, installed, onOpen }: {
  app: StoreApp; installed?: InstalledInfo; onOpen: () => void;
}) {
  return (
    <Card
      interactive
      onClick={onOpen}
      disableInteractiveRole
      icon={<AppIcon app={app} installed={installed} />}
      title={app.name}
      subtitle={app.tagline || app.publisher}
      truncateSubtitle
      actions={(
        // The card itself opens the detail view, so its own buttons must not
        // bubble - a click on Install or Remove would otherwise navigate too.
        <div className={styles.cardActions} onClick={e => e.stopPropagation()}>
          <InstallButton app={app} installedVersion={installed?.version} />
          {installed && <RemoveButton app={app} />}
        </div>
      )}
    >
      <Stars rating={app.rating} />
    </Card>
  );
}

function AppDetail({ appId, onBack, installed }: {
  appId: string; onBack: () => void; installed?: InstalledInfo;
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
        subtitle={app.publisher}
        actions={(
          <div className={styles.cardActions}>
            <InstallButton app={app} installedVersion={installed?.version} />
            {installed && <RemoveButton app={app} />}
          </div>
        )}
      >
        <Stars rating={app.rating} />
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
            <dd>{app.latest.hasWidget ? t('store.value.yes') : t('store.value.no')}</dd>
            {app.latest.hasWidget && app.latest.sizes.length > 0 && (
              <>
                <dt>{t('store.spec.widgetSizes')}</dt>
                <dd className={styles.sizes}>
                  {app.latest.sizes.map(size => (
                    <span key={size} className={styles.size}>{size}</span>
                  ))}
                </dd>
              </>
            )}
            <dt>{t('store.spec.page')}</dt>
            <dd>{app.latest.hasPage ? t('store.value.yes') : t('store.value.no')}</dd>
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
    </div>
  );
}

/**
 * The Nexus Store. The catalog is answered per client - this build's version
 * decides which releases it is offered - so the page renders what it is given
 * rather than filtering locally.
 */
export function StorePage() {
  const { t } = useTranslation();
  const installed = useInstalled();
  const [apps, setApps] = useState<StoreApp[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void fetchStoreApps().then(res => {
      if (!alive) return;
      if (res) setApps(res); else setFailed(true);
    });
    return () => { alive = false; };
  }, []);

  return (
    <div className={styles.app}>
      <ViewHeader title={t('apps.tabs.store')} />
      {openId ? (
        <AppDetail appId={openId} onBack={() => setOpenId(null)} installed={installed.get(openId)} />
      ) : failed ? (
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
              onOpen={() => setOpenId(app.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default StorePage;
