import { useEffect, useState } from 'react';
import { useTranslation } from '../../lib/i18n';
import { verifyEmail } from '../../api/account';
import { PublicPageFrame } from './PublicPageFrame';
import { AuthLoadingCard, AuthResultCard } from './AuthResultCard';

type VerifyState = 'loading' | 'success' | 'already-used' | 'invalid';

/** /auth/verify?token=... - email verification landing (browser-only). */
export function VerifyEmailPage({ token }: { token: string }) {
  const { t } = useTranslation();
  const [state, setState] = useState<VerifyState>(token ? 'loading' : 'invalid');

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void verifyEmail(token).then((result) => {
      if (cancelled) return;
      if (result.ok) setState('success');
      else setState(result.reason === 'already-used' ? 'already-used' : 'invalid');
    });
    return () => { cancelled = true; };
  }, [token]);

  return (
    <PublicPageFrame>
      {state === 'loading' && <AuthLoadingCard label={t('auth.verify.loading')} />}
      {state === 'success' && (
        <AuthResultCard title={t('auth.verify.success.title')} body={t('auth.verify.success.body')} showBackLink />
      )}
      {state === 'already-used' && (
        <AuthResultCard title={t('auth.verify.alreadyUsed.title')} body={t('auth.verify.alreadyUsed.body')} showBackLink />
      )}
      {state === 'invalid' && (
        <AuthResultCard title={t('auth.verify.invalid.title')} body={t('auth.verify.invalid.body')} showBackLink />
      )}
    </PublicPageFrame>
  );
}
