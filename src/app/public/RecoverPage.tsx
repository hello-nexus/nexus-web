import { useEffect, useState } from 'react';
import { useTranslation } from '../../lib/i18n';
import { completeRecovery } from '../../api/account';
import { PublicPageFrame } from './PublicPageFrame';
import { AuthLoadingCard, AuthResultCard } from './AuthResultCard';

type RecoverState =
  | { phase: 'loading' }
  | { phase: 'success'; username: string }
  | { phase: 'invalid' };

/**
 * /auth/recover?token=... - lost-password magic-link landing. No password
 * form here: completing recovery signs the device-grant-polling Nexus app
 * in, and the app owns setting the new password from there.
 */
export function RecoverPage({ token }: { token: string }) {
  const { t } = useTranslation();
  const [state, setState] = useState<RecoverState>(token ? { phase: 'loading' } : { phase: 'invalid' });

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void completeRecovery(token).then((result) => {
      if (cancelled) return;
      if (result.ok && result.username) setState({ phase: 'success', username: result.username });
      else setState({ phase: 'invalid' });
    });
    return () => { cancelled = true; };
  }, [token]);

  return (
    <PublicPageFrame>
      {state.phase === 'loading' && <AuthLoadingCard label={t('auth.recover.loading')} />}
      {state.phase === 'success' && (
        <AuthResultCard
          title={t('auth.recover.success.title')}
          body={t('auth.recover.success.body', { username: state.username })}
          showBackLink
        />
      )}
      {state.phase === 'invalid' && (
        <AuthResultCard title={t('auth.recover.invalid.title')} body={t('auth.recover.invalid.body')} showBackLink />
      )}
    </PublicPageFrame>
  );
}
