import { useEffect, useState } from 'react';
import { useTranslation } from '../../lib/i18n';
import { verifyEmail } from '../../api/account';
import { PublicPageFrame } from './PublicPageFrame';
import { AuthLoadingCard, AuthResultCard } from './AuthResultCard';

type VerifyState = 'loading' | 'success' | 'already-verified' | 'invalid';

/** /auth/verify?token=... - email verification landing (browser-only). */
export function VerifyEmailPage({ token }: { token: string }) {
  const { t } = useTranslation();
  const [state, setState] = useState<VerifyState>(token ? 'loading' : 'invalid');

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void verifyEmail(token).then((result) => {
      if (cancelled) return;
      if (result.ok) setState(result.alreadyVerified ? 'already-verified' : 'success');
      else setState('invalid');
    });
    return () => { cancelled = true; };
  }, [token]);

  return (
    <PublicPageFrame>
      {state === 'loading' && <AuthLoadingCard label={t('auth.verify.loading')} />}
      {state === 'success' && (
        <AuthResultCard title={t('auth.verify.success.title')} body={t('auth.verify.success.body')} showBackLink />
      )}
      {state === 'already-verified' && (
        <AuthResultCard title={t('auth.verify.alreadyVerified.title')} body={t('auth.verify.alreadyVerified.body')} showBackLink />
      )}
      {state === 'invalid' && (
        <AuthResultCard title={t('auth.verify.invalid.title')} body={t('auth.verify.invalid.body')} showBackLink />
      )}
    </PublicPageFrame>
  );
}
