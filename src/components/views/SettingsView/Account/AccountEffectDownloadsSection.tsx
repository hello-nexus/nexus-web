import { useEffect, useRef, useState } from 'react';
import { CopyPlus, ExternalLink } from 'lucide-react';
import { Button } from '../../../common/Button/Button';
import { InlineError } from '../../../common/InlineError/InlineError';
import { SettingsSection } from '../../../common/SettingsSection/SettingsSection';
import { useTranslation } from '../../../../lib/i18n';
import { useUnitPrefs } from '../../../../hooks/useUiSettings';
import { formatDate } from '../../../../lib/units';
import { downloadEffect, listEffectDownloads, type EffectDownload } from '../../../../api/effectMarket';
import { attachRecipePreview } from '../../../../panel/widgets/lighting/studio/recipePreview';
import { usePreviewSensorFeed } from '../../../../panel/widgets/lighting/studio/usePreviewSensorFeed';
import { copyName, getSavedEffects, newEffectId, parseMarketRecipe, saveEffect } from '../../../../panel/widgets/lighting/studio/studioLibrary';
import { recipeUsesSensors, type StudioRecipe } from '../../../../panel/widgets/lighting/studio/studioCompiler';
import styles from './AccountPurchases.module.scss';

type RowState = 'working' | 'failed' | 'added';

// Parsed once per row object, so a re-render keeps each preview's recipe identity and its canvas attached.
const parsedRecipes = new WeakMap<EffectDownload, StudioRecipe | null>();
function recipeOf(item: EffectDownload): StudioRecipe | null {
  if (item.removed) return null;
  if (!parsedRecipes.has(item)) parsedRecipes.set(item, parseMarketRecipe(item.recipe));
  return parsedRecipes.get(item)!;
}

function Preview({ recipe }: { recipe: StudioRecipe | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  usePreviewSensorFeed(!!recipe && recipeUsesSensors(recipe));
  useEffect(() => (ref.current && recipe ? attachRecipePreview(ref.current, recipe) : undefined), [recipe]);
  return <canvas ref={ref} className={styles.effectThumb} aria-hidden={true} />;
}

/** Lighting effects the account copied from the Marketplace, removed ones included; any still listed can be copied again. */
export function AccountEffectDownloadsSection({ onOpenStoreEffect }: {
  /** Opens the effect's Marketplace page. */
  onOpenStoreEffect?: (listingId: string) => void;
}) {
  const { t } = useTranslation();
  const { dateFormat } = useUnitPrefs();
  const [items, setItems] = useState<EffectDownload[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [rows, setRows] = useState<Record<string, RowState>>({});

  useEffect(() => {
    let cancelled = false;
    void listEffectDownloads().then(res => {
      if (cancelled) return;
      if (res.ok) setItems(res.value.items);
      else setLoadFailed(true);
    });
    return () => { cancelled = true; };
  }, []);

  // A fresh copy of the listing as it is now, which also records the version copied.
  const addAgain = async (item: EffectDownload) => {
    setRows(prev => ({ ...prev, [item.id]: 'working' }));
    const res = await downloadEffect(item.id);
    const recipe = res.ok ? parseMarketRecipe(res.value.recipe) : null;
    const error = !res.ok || !recipe ? 'failed'
      : await saveEffect(newEffectId(), copyName(res.value.name, getSavedEffects().map(s => s.name)), recipe, { marketId: res.value.id, marketAuthor: res.value.author, downloaded: true });
    if (res.ok) setItems(prev => prev?.map(i => (i.id === item.id ? { ...i, version: res.value.version, latestVersion: res.value.version } : i)) ?? prev);
    setRows(prev => ({ ...prev, [item.id]: error ? 'failed' : 'added' }));
  };

  const downloadedOn = (iso: string) => {
    const date = new Date(iso);
    return Number.isNaN(date.getTime())
      ? ''
      : formatDate(date, dateFormat, { variant: 'year', system: { year: 'numeric', month: 'short', day: 'numeric' } });
  };

  return (
    <SettingsSection title={t('store.effects.tab')} description={t('account.effects.description')}>
      {loadFailed && <InlineError>{t('account.effects.loadFailed')}</InlineError>}
      {items?.length === 0 && <p className={styles.empty}>{t('account.effects.empty')}</p>}
      {items?.map(item => {
        const recipe = recipeOf(item);
        const state = rows[item.id];
        const copied = typeof item.version === 'number' ? item.version : null;
        const newer = copied !== null && typeof item.latestVersion === 'number' && item.latestVersion > copied;
        const date = downloadedOn(item.downloadedAt);
        return (
          <div key={item.id} className={styles.row}>
            <Preview recipe={recipe} />
            <div className={styles.info}>
              <span className={styles.name}>{item.name}</span>
              {item.author && <span className={styles.tagline}>{t('store.effects.byAuthor', { author: item.author })}</span>}
              <ul className={styles.facts}>
                {item.removed
                  ? <li className={styles.removed}>{t('account.effects.removed')}</li>
                  : !recipe ? <li className={styles.value}>{t('store.effects.unsupported')}</li>
                    : null}
                {copied !== null && <li className={styles.value}>{t('account.effects.copiedVersion', { version: copied })}</li>}
                {newer && <li className={styles.value}>{t('account.effects.latestVersion', { version: item.latestVersion! })}</li>}
                {date && <li>{t('account.effects.downloaded')} <span className={styles.value}>{date}</span></li>}
                {state === 'added' && <li className={styles.value}>{t('account.effects.added')}</li>}
              </ul>
            </div>
            <div className={styles.actions}>
              {recipe && (
                <Button type="button" tone={state === 'failed' ? 'danger' : 'neutral'} size="sm" icon={<CopyPlus size={14} />}
                  loading={state === 'working'} disabled={state === 'working'} onClick={() => { void addAgain(item); }}>
                  {state === 'failed' ? t('store.retry') : t('account.effects.addAgain')}
                </Button>
              )}
              {!item.removed && onOpenStoreEffect && (
                <Button type="button" tone="neutral" size="sm" icon={<ExternalLink size={14} />} onClick={() => onOpenStoreEffect(item.id)}>
                  {t('account.purchases.viewInStore')}
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </SettingsSection>
  );
}

export default AccountEffectDownloadsSection;
