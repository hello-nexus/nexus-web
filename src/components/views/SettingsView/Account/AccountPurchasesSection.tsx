import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { Button } from '../../../common/Button/Button';
import { SettingsSection } from '../../../common/SettingsSection/SettingsSection';
import { AppIconTile } from '../../../common/AppIconTile/AppIconTile';
import { useTranslation } from '../../../../lib/i18n';
import {
  APPS_CHANGED_TOPIC, approvePendingStoreUpdate, fetchPendingStoreUpdates, fetchStoreApps, fetchStoreLibrary,
  installStoreApp, type PendingStoreUpdate, type StorePurchase, type StoreVersion,
} from '../../../../api/store';
import { useTopicCallback } from '../../../../hooks/useMultiplexSocket';
import { useCapabilityConsent } from '../../StorePage/CapabilityConsentModal';
import { CONSENT_DECLINED, installWithConsent } from '../../StorePage/consentInstall';
import { loadMarketplaceApps } from '../../../../widgets/marketplaceRegistry';
import { useUnitPrefs } from '../../../../hooks/useUiSettings';
import { formatDate, type DateFormat } from '../../../../lib/units';
import { formatBytes } from '../../DiagnosticsView/diagnosticsHelpers';
import { RemoveAppButton } from '../../StorePage/RemoveAppButton';
import styles from './AccountPurchases.module.scss';

const ICON_SIZE = 64;

type UpdateState = 'working' | 'failed';

interface AccountPurchasesSectionProps {
  /** Opens the app's store page. Omitted on surfaces with no store route (the public web account page). */
  onOpenStoreApp?: (appId: string) => void;
}

// Numeric x.y.z with an optional -prerelease, which sorts before its release.
// Update all must never offer a downgrade, so "different" is not enough.
function isNewer(candidate: string, current: string): boolean {
  const parse = (v: string) => {
    const [core, pre = ''] = v.replace(/^v/i, '').split('-', 2);
    return { nums: core.split('.').map(n => Number.parseInt(n, 10) || 0), pre };
  };
  const a = parse(candidate);
  const b = parse(current);
  for (let i = 0; i < Math.max(a.nums.length, b.nums.length); i++) {
    const d = (a.nums[i] ?? 0) - (b.nums[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  if (a.pre === b.pre) return false;
  if (!a.pre) return true;
  if (!b.pre) return false;
  return a.pre.localeCompare(b.pre, undefined, { numeric: true }) > 0;
}

function formatAcquired(iso: string | null, dateFormat: DateFormat): string {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ''
    : formatDate(date, dateFormat, { variant: 'year', system: { year: 'numeric', month: 'short', day: 'numeric' } });
}

/**
 * Manage purchased apps: every app the account has acquired, free or paid, with what
 * this machine has of it. Free today, so a row is a claim rather than a receipt -
 * priceCents is on the wire for when that changes.
 */
export function AccountPurchasesSection({ onOpenStoreApp }: AccountPurchasesSectionProps) {
  const { t, language } = useTranslation();
  const { numberFormat, dateFormat } = useUnitPrefs();
  const [purchases, setPurchases] = useState<StorePurchase[] | null>(null);
  // Newest release this build can run, per app id; the catalog drops releases it can't.
  const [latest, setLatest] = useState<Map<string, StoreVersion>>(new Map());
  const [updates, setUpdates] = useState<Record<string, UpdateState>>({});
  // Updates the service holds because they add capabilities, by app id.
  const [pending, setPending] = useState<Map<string, PendingStoreUpdate>>(new Map());
  const { ask: askConsent, dialog: consentDialog } = useCapabilityConsent();

  const load = useCallback(async () => {
    const [library, catalog, held] = await Promise.all([
      fetchStoreLibrary(), fetchStoreApps({ locale: language }), fetchPendingStoreUpdates(),
    ]);
    setPurchases(library?.purchases ?? []);
    setLatest(new Map((catalog ?? []).flatMap(app => (app.latest ? [[app.id, app.latest] as const] : []))));
    setPending(new Map((held ?? []).map(u => [u.appId, u] as const)));
  }, [language]);

  useEffect(() => { void load(); }, [load]);
  // The service broadcasts when the held set changes; refetch the canonical list.
  useTopicCallback(APPS_CHANGED_TOPIC, true, () => { void load(); });

  const updateFor = (purchase: StorePurchase): StoreVersion | null => {
    const version = latest.get(purchase.appId);
    return purchase.installedVersion && version && isNewer(version.version, purchase.installedVersion) ? version : null;
  };
  // A held update has its own permission prompt, so Update all leaves it out.
  const updatable = (purchases ?? []).filter(p => updateFor(p) !== null && !pending.has(p.appId));
  const anyWorking = Object.values(updates).includes('working');

  const runUpdate = useCallback(async (purchase: StorePurchase, version: StoreVersion): Promise<boolean> => {
    const appId = purchase.appId;
    setUpdates(prev => ({ ...prev, [appId]: 'working' }));
    const res = await installWithConsent(
      approved => installStoreApp({ id: appId, latest: version }, approved),
      requested => askConsent({ appName: purchase.name, requested }),
    );
    setUpdates(prev => {
      const next = { ...prev };
      if (res?.ok || res?.reason === CONSENT_DECLINED) delete next[appId]; else next[appId] = 'failed';
      return next;
    });
    return res?.ok === true;
  }, [askConsent]);

  const approveHeld = async (purchase: StorePurchase, update: PendingStoreUpdate) => {
    const allowed = await askConsent({
      appName: purchase.name, requested: update.requestedCapabilities, added: update.newCapabilities,
    });
    if (!allowed) return;
    setUpdates(prev => ({ ...prev, [purchase.appId]: 'working' }));
    let res = await approvePendingStoreUpdate(update);
    // The held list comes from the catalog; the downloaded manifest can ask for more.
    if (res?.reason === 'consent_required' && res.requestedCapabilities) {
      const requested = res.requestedCapabilities;
      const again = await askConsent({
        appName: purchase.name, requested,
        added: requested.filter(g => !update.requestedCapabilities.includes(g)),
      });
      if (!again) {
        setUpdates(prev => { const next = { ...prev }; delete next[purchase.appId]; return next; });
        return;
      }
      res = await approvePendingStoreUpdate({ ...update, requestedCapabilities: requested });
    }
    setUpdates(prev => {
      const next = { ...prev };
      if (res?.ok) delete next[purchase.appId]; else next[purchase.appId] = 'failed';
      return next;
    });
    if (res?.ok) {
      await loadMarketplaceApps();
      await load();
    }
  };

  const updateOne = async (purchase: StorePurchase) => {
    const version = updateFor(purchase);
    if (!version) return;
    if (await runUpdate(purchase, version)) {
      // The registry is what the dashboard's widget picker reads.
      await loadMarketplaceApps();
      await load();
    }
  };

  const updateAll = async () => {
    let any = false;
    for (const purchase of updatable) {
      const version = updateFor(purchase);
      if (version && await runUpdate(purchase, version)) any = true;
    }
    if (any) {
      await loadMarketplaceApps();
      await load();
    }
  };

  return (
    <SettingsSection
      title={t('account.purchases.title')}
      description={t('account.purchases.description')}
      action={updatable.length > 0 ? (
        <Button
          type="button"
          tone="accent"
          size="sm"
          icon={<RefreshCw size={14} />}
          disabled={anyWorking}
          onClick={() => { void updateAll(); }}
        >
          {t('account.purchases.updateAll', { count: updatable.length })}
        </Button>
      ) : undefined}
    >
      {purchases != null && purchases.length === 0 && (
        <p className={styles.empty}>{t('account.purchases.empty')}</p>
      )}
      {(purchases ?? []).map(purchase => {
        const held = pending.get(purchase.appId);
        const update = held ? null : updateFor(purchase);
        const state = updates[purchase.appId];
        const acquired = formatAcquired(purchase.acquiredAt, dateFormat);
        return (
          <div key={purchase.appId} className={styles.row}>
            <AppIconTile src={purchase.iconUrl} size={ICON_SIZE} />

            <div className={styles.info}>
              <span className={styles.name}>{purchase.name}</span>
              {purchase.tagline && <span className={styles.tagline}>{purchase.tagline}</span>}
              <ul className={styles.facts}>
                {purchase.installedVersion ? (
                  <li>
                    {t('account.purchases.version')} <span className={styles.value}>{purchase.installedVersion}</span>
                    {held || update
                      ? <span className={styles.available}>{t('account.purchases.updateAvailable', { version: held?.version ?? update?.version ?? '' })}</span>
                      : <span className={styles.current}>{t('account.purchases.upToDate')}</span>}
                  </li>
                ) : (
                  <li className={styles.value}>{t('account.purchases.notInstalled')}</li>
                )}
                {purchase.installedVersion && (
                  <li className={styles.value}>{formatBytes(purchase.sizeBytes ?? 0, numberFormat)}</li>
                )}
                {acquired && (
                  <li>
                    {t('account.purchases.acquired')} <span className={styles.value}>{acquired}</span>
                  </li>
                )}
                <li className={styles.value}>
                  {purchase.priceCents === 0
                    ? t('account.purchases.free')
                    : `$${(purchase.priceCents / 100).toFixed(2)}`}
                </li>
              </ul>
            </div>

            <div className={styles.actions}>
              {held && (
                <Button
                  type="button"
                  tone={state === 'failed' ? 'danger' : 'accent'}
                  size="sm"
                  disabled={anyWorking}
                  onClick={() => { void approveHeld(purchase, held); }}
                >
                  {state === 'working' ? t('account.purchases.updating')
                    : state === 'failed' ? t('store.retry')
                    : t('store.consent.updateNeedsPermission')}
                </Button>
              )}
              {update && (
                <Button
                  type="button"
                  tone={state === 'failed' ? 'danger' : 'accent'}
                  size="sm"
                  // One install at a time: Update all is still walking the other rows.
                  disabled={anyWorking}
                  onClick={() => { void updateOne(purchase); }}
                >
                  {state === 'working' ? t('account.purchases.updating')
                    : state === 'failed' ? t('store.retry')
                    : t('store.update')}
                </Button>
              )}
              {/* Only a store that says "delisted" hides the link; a local-only
                  row has no verdict, and its app is usually still listed. */}
              {onOpenStoreApp && purchase.listed !== false && (
                <Button
                  type="button"
                  tone="neutral"
                  size="sm"
                  icon={<ExternalLink size={14} />}
                  onClick={() => onOpenStoreApp(purchase.appId)}
                >
                  {t('account.purchases.viewInStore')}
                </Button>
              )}
              {purchase.installedVersion && (
                <RemoveAppButton
                  app={{ id: purchase.appId, name: purchase.name }}
                  label={t('account.purchases.uninstall')}
                  iconOnly
                  onRemoved={() => { void load(); }}
                />
              )}
            </div>
          </div>
        );
      })}
      {consentDialog}
    </SettingsSection>
  );
}
