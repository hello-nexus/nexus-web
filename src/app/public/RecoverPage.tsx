import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '../../lib/i18n';
import { openRecovery } from '../../api/account';
import { linkRecoveryLocally } from './linkRecoveryLocally';
import { PublicPageFrame } from './PublicPageFrame';
import { AuthLoadingCard, AuthResultCard } from './AuthResultCard';
import styles from './RecoverPage.module.scss';

type RecoverState =
  | { phase: 'opening' }
  | { phase: 'code'; code: string }
  /** The check draws before the signed-in card replaces it. */
  | { phase: 'approved' }
  | { phase: 'success' }
  | { phase: 'invalid' }
  | { phase: 'error' };

/** Long enough to read the mark, short enough not to be a wait. */
const HOLD_MS = 1100;

function isDesktopBrowser(): boolean {
  return !/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

/**
 * /auth/recover?token=... - lost-password magic-link landing. Opened in the
 * browser that asked (the api reads its recovery cookie) it signs in at once;
 * on the computer whose Nexus is waiting, the local service takes the token
 * while the code is already showing. Anywhere else the code is typed on the
 * device that asked, and only the mailbox holder can see it.
 */
export function RecoverPage({ token }: { token: string }) {
  const { t } = useTranslation();
  const [state, setState] = useState<RecoverState>(token ? { phase: 'opening' } : { phase: 'invalid' });
  const [attempt, setAttempt] = useState(0);
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (hold.current) clearTimeout(hold.current); }, []);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const approve = () => {
      if (cancelled) return;
      setState({ phase: 'approved' });
      hold.current = setTimeout(() => setState({ phase: 'success' }), HOLD_MS);
    };
    void openRecovery(token).then(async (result) => {
      if (cancelled) return;
      if (result.status === 'approved') {
        approve();
        return;
      }
      if (result.status !== 'code') {
        setState({ phase: result.status });
        return;
      }
      setState({ phase: 'code', code: result.code });
      // Only after the code is up, and only where Nexus can run: reaching the
      // local service can raise the browser's local-network prompt, which the
      // same-browser path and a phone should never see.
      if (isDesktopBrowser() && (await linkRecoveryLocally(token))) approve();
    });
    return () => { cancelled = true; };
  }, [token, attempt]);

  const retry = () => {
    setState({ phase: 'opening' });
    setAttempt(a => a + 1);
  };

  return (
    <PublicPageFrame>
      {state.phase === 'opening' && <AuthLoadingCard label={t('auth.recover.opening')} />}
      {state.phase === 'code' && (
        <div className={styles.codeForm}>
          <h1 className={styles.title}>{t('auth.recover.code.title')}</h1>
          <div className={styles.codeBlock}>
            <span className={styles.code}>{state.code}</span>
          </div>
          <p className={styles.body}>{t('auth.recover.code.body')}</p>
        </div>
      )}
      {state.phase === 'approved' && (
        <div className={styles.approved}>
          <svg className={styles.check} viewBox="0 0 52 52" aria-hidden>
            <circle className={styles.checkCircle} cx="26" cy="26" r="24" />
            <path className={styles.checkMark} d="M15 27l7.5 7.5L37 19" />
          </svg>
          <p className={styles.body}>{t('auth.recover.success.title')}</p>
        </div>
      )}
      {state.phase === 'success' && (
        <AuthResultCard
          title={t('auth.recover.success.title')}
          body={t('auth.recover.success.body')}
          showBackLink
        />
      )}
      {state.phase === 'invalid' && (
        <AuthResultCard
          title={t('auth.recover.invalid.title')}
          body={t('auth.recover.invalid.body')}
          showBackLink
        />
      )}
      {state.phase === 'error' && (
        <AuthResultCard
          title={t('auth.recover.error.title')}
          body={t('account.error.generic')}
          action={{ label: t('account.recovery.tryAgain'), onClick: retry }}
        />
      )}
    </PublicPageFrame>
  );
}
