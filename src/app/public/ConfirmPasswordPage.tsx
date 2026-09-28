import { useState } from 'react';
import { useTranslation } from '../../lib/i18n';
import { confirmPasswordChange } from '../../api/account';
import { PublicPageFrame } from './PublicPageFrame';
import { AuthLoadingCard, AuthResultCard } from './AuthResultCard';

type ConfirmState = 'ready' | 'loading' | 'success' | 'invalid' | 'error';

/**
 * /auth/confirm-password?token=... - applies a password change made without
 * the current password. Waits for a press instead of posting on load, so a
 * mail scanner that opens links cannot confirm a change nobody approved.
 */
export function ConfirmPasswordPage({ token }: { token: string }) {
  const { t } = useTranslation();
  const [state, setState] = useState<ConfirmState>(token ? 'ready' : 'invalid');

  const confirm = async () => {
    setState('loading');
    const result = await confirmPasswordChange(token);
    setState(result === 'ok' ? 'success' : result);
  };

  return (
    <PublicPageFrame>
      {state === 'ready' && (
        <AuthResultCard
          title={t('auth.confirmPassword.title')}
          body={t('auth.confirmPassword.body')}
          action={{ label: t('auth.confirmPassword.action'), onClick: () => void confirm() }}
        />
      )}
      {state === 'error' && (
        <AuthResultCard
          title={t('auth.confirmPassword.title')}
          body={t('account.error.generic')}
          action={{ label: t('auth.confirmPassword.action'), onClick: () => void confirm() }}
        />
      )}
      {state === 'loading' && <AuthLoadingCard label={t('auth.confirmPassword.loading')} />}
      {state === 'success' && (
        <AuthResultCard title={t('auth.confirmPassword.success.title')} body={t('auth.confirmPassword.success.body')} showBackLink />
      )}
      {state === 'invalid' && (
        <AuthResultCard title={t('auth.confirmPassword.invalid.title')} body={t('auth.confirmPassword.invalid.body')} showBackLink />
      )}
    </PublicPageFrame>
  );
}
