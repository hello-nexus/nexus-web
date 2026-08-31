import { useCallback, useEffect, useState } from 'react';
import { Boxes, ExternalLink } from 'lucide-react';
import { Button } from '../../../common/Button/Button';
import { SettingsSection } from '../../../common/SettingsSection/SettingsSection';
import { useTranslation } from '../../../../lib/i18n';
import { fetchStoreLibrary, type StorePurchase } from '../../../../api/store';
import { useUnitPrefs } from '../../../../hooks/useUiSettings';
import { formatBytes } from '../../DiagnosticsView/diagnosticsHelpers';
import { RemoveAppButton } from '../../StorePage/RemoveAppButton';
import styles from './AccountPurchases.module.scss';

interface AccountPurchasesSectionProps {
  /** Opens the app's store page. Omitted on surfaces with no store route (the public web account page). */
  onOpenStoreApp?: (appId: string) => void;
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * Manage purchases: every app the account has acquired, free or paid, with what
 * this machine has of it. Free today, so a row is a claim rather than a receipt -
 * priceCents is on the wire for when that changes.
 */
export function AccountPurchasesSection({ onOpenStoreApp }: AccountPurchasesSectionProps) {
  const { t } = useTranslation();
  const { numberFormat } = useUnitPrefs();
  const [purchases, setPurchases] = useState<StorePurchase[] | null>(null);

  const load = useCallback(async () => {
    const library = await fetchStoreLibrary();
    setPurchases(library?.purchases ?? []);
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <SettingsSection
      title={t('account.purchases.title')}
      description={t('account.purchases.description')}
    >
      {purchases != null && purchases.length === 0 && (
        <p className={styles.empty}>{t('account.purchases.empty')}</p>
      )}
      {(purchases ?? []).map(purchase => (
        <div key={purchase.appId} className={styles.row}>
          <span className={styles.iconBox}>
            {purchase.iconUrl
              ? <img src={purchase.iconUrl} alt="" className={styles.icon} />
              : <Boxes className={styles.iconFallback} aria-hidden={true} />}
          </span>

          <div className={styles.info}>
            <span className={styles.name}>{purchase.name}</span>
            <dl className={styles.facts}>
              {purchase.acquiredAt && (
                <>
                  <dt>{t('account.purchases.acquired')}</dt>
                  <dd>{formatDate(purchase.acquiredAt)}</dd>
                </>
              )}
              <dt>{t('account.purchases.price')}</dt>
              <dd>
                {purchase.priceCents === 0
                  ? t('account.purchases.free')
                  : `$${(purchase.priceCents / 100).toFixed(2)}`}
              </dd>
              {purchase.installedVersion ? (
                <>
                  <dt>{t('account.purchases.version')}</dt>
                  <dd>{purchase.installedVersion}</dd>
                  <dt>{t('account.purchases.size')}</dt>
                  <dd>{formatBytes(purchase.sizeBytes ?? 0, numberFormat)}</dd>
                </>
              ) : (
                <>
                  <dt>{t('account.purchases.version')}</dt>
                  <dd>{t('account.purchases.notInstalled')}</dd>
                </>
              )}
            </dl>
          </div>

          <div className={styles.actions}>
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
      ))}
    </SettingsSection>
  );
}
