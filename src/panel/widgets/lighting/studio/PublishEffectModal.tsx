import { useEffect, useRef, useState } from 'react';
import { Overlay } from '../../../../components/common/Overlay/Overlay';
import { Button } from '../../../../components/common/Button/Button';
import { TextInput } from '../../../../components/common/TextInput/TextInput';
import { AccountSignInModal } from '../../../../components/views/SettingsView/Account/AccountSignInModal';
import { fetchCloudAccounts } from '../../../../api/cloud';
import {
  publishEffect, updateEffect,
  type EffectListing, type EffectMarketError, type EffectMarketResult,
} from '../../../../api/effectMarket';
import { useTranslation } from '../../../../lib/i18n';
import type { StudioRecipe } from './studioCompiler';
import { EFFECT_NAME_MAX, type MarketLink } from './studioLibrary';
import promptStyles from '../../../../components/common/PromptModal/PromptModal.module.scss';
import styles from './ShaderStudio.module.scss';

const ERROR_KEYS: Partial<Record<EffectMarketError, string>> = {
  unavailable: 'lighting.studio.publish.unavailable',
  listing_limit: 'lighting.studio.publish.limit',
  duplicate: 'lighting.studio.publish.duplicate',
  name_not_allowed: 'lighting.studio.publish.nameNotAllowed',
};

async function activeUsername(): Promise<string | null> {
  const data = await fetchCloudAccounts().catch(() => null);
  return data?.accounts?.find(a => a.accountId === data.activeAccountId)?.username ?? null;
}

/**
 * Publishes the Studio's recipe to the Marketplace under the signed-in
 * username, or updates the listing this account published it as. `save`
 * stores the local copy: first plain (the service compile-checks it), then
 * with the listing link.
 */
export function PublishEffectModal({ open, initialName, recipe, link, save, onViewListing, onClose }: {
  open: boolean;
  initialName: string;
  recipe: StudioRecipe;
  link: MarketLink | null;
  /** Resolves to an error text when the service refused the effect. */
  save: (name: string, link?: MarketLink) => Promise<string | null>;
  onViewListing?: (id: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  // undefined while the account is being read.
  const [username, setUsername] = useState<string | null | undefined>(undefined);
  const [name, setName] = useState(initialName);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signIn, setSignIn] = useState(false);
  const [published, setPublished] = useState<EffectListing | null>(null);
  const resumeRef = useRef(false);
  const initialNameRef = useRef(initialName);
  initialNameRef.current = initialName;

  const updating = !!link && !!username && link.marketAuthor.toLowerCase() === username.toLowerCase();

  // Resets on open only: the first save renames the effect, which must not clear the form mid-publish.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    resumeRef.current = false;
    setName(initialNameRef.current);
    setError(null);
    setPublished(null);
    setUsername(undefined);
    void activeUsername().then(u => { if (alive) setUsername(u); });
    return () => { alive = false; };
  }, [open]);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed || working) return;
    if (!username) { setSignIn(true); return; }
    setWorking(true);
    setError(null);
    const saveError = await save(trimmed);
    if (saveError) { setWorking(false); setError(saveError); return; }
    // A copy of someone else's listing credits it on the new one.
    const body = { name: trimmed, recipe, ...(link && !updating ? { basedOn: link.marketId } : {}) };
    let res: EffectMarketResult<EffectListing> = updating && link ? await updateEffect(link.marketId, body) : await publishEffect(body);
    // The listing was unpublished from the Marketplace since: publish it anew.
    if (!res.ok && res.error === 'not_found' && updating) res = await publishEffect(body);
    if (!res.ok) {
      setWorking(false);
      if (res.error === 'sign_in_required') { setUsername(null); setSignIn(true); return; }
      setError(t(ERROR_KEYS[res.error] ?? 'lighting.studio.publish.failed'));
      return;
    }
    const linkError = await save(trimmed, { marketId: res.value.id, marketAuthor: res.value.author, downloaded: false });
    setWorking(false);
    if (linkError) { setError(linkError); return; }
    setPublished(res.value);
  };

  // Resumes the publish the sign-in interrupted, once the new session's username is known.
  useEffect(() => {
    if (!resumeRef.current || !username) return;
    resumeRef.current = false;
    void submit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  const handleSignedIn = () => {
    setSignIn(false);
    resumeRef.current = true;
    void activeUsername().then(u => {
      if (!u) resumeRef.current = false;
      setUsername(u);
    });
  };

  if (!open) return null;

  return (
    <>
      <Overlay open={open && !signIn} onClose={onClose} variant="alert" onEnter={published ? onClose : () => { void submit(); }}
        className={promptStyles.modal} ariaLabel={t('lighting.studio.publish.title')}>
        {published ? (
          <>
            <h2 className={promptStyles.title}>{t('lighting.studio.publish.doneTitle')}</h2>
            <p className={promptStyles.message}>{t('lighting.studio.publish.doneBody', { name: published.name, author: published.author })}</p>
            {typeof published.version === 'number' && <p className={promptStyles.message}>{t('lighting.studio.publish.doneVersion', { version: published.version })}</p>}
            <div className={promptStyles.actions}>
              <Button tone="neutral" onClick={onClose}>{t('lighting.studio.done')}</Button>
              {onViewListing && (
                <Button tone="accent" onClick={() => onViewListing(published.id)}>{t('lighting.studio.publish.view')}</Button>
              )}
            </div>
          </>
        ) : (
          <>
            <h2 className={promptStyles.title}>{t(updating ? 'lighting.studio.publish.updateTitle' : 'lighting.studio.publish.title')}</h2>
            <p className={promptStyles.message}>
              {username === undefined ? t('store.loading')
                : username ? t('lighting.studio.publish.as', { author: username })
                : t('lighting.studio.publish.needsAccount')}
            </p>
            <div className={styles.publishFields}>
              <label className={promptStyles.fieldWrap}>
                <span className={styles.caption}>{t('lighting.studio.publish.name')}</span>
                <TextInput value={name} maxLength={EFFECT_NAME_MAX} onInput={setName} ariaLabel={t('lighting.studio.publish.name')} />
              </label>
            </div>
            {error && <p className={promptStyles.error} role="alert">{error}</p>}
            <div className={promptStyles.actions}>
              <Button tone="neutral" onClick={onClose}>{t('confirm.cancel')}</Button>
              <Button tone="accent" loading={working} disabled={!name.trim() || working || username === undefined} onClick={() => { void submit(); }}>
                {t(!username ? 'lighting.studio.publish.signIn' : updating ? 'lighting.studio.publish.update' : 'lighting.studio.publish.confirm')}
              </Button>
            </div>
          </>
        )}
      </Overlay>
      <AccountSignInModal
        open={signIn}
        onClose={() => setSignIn(false)}
        onSignedIn={handleSignedIn}
        title={t('lighting.studio.publish.signInTitle')}
        body={t('store.signIn.body')}
      />
    </>
  );
}
