import { useState, type FormEvent } from 'react';
import { Button } from '../../../common/Button/Button';
import { TextInput } from '../../../common/TextInput/TextInput';
import { useTranslation } from '../../../../lib/i18n';
import type { CloudFetchResult, CloudLoginResponse } from '../../../../api/cloud';
import { authErrorMessage } from './accountErrors';
import styles from './Account.module.scss';

interface SignInFormProps {
  onLogin: (identifier: string, password: string) => Promise<CloudFetchResult<CloudLoginResponse>>;
  onSuccess: () => void;
  onForgotPassword?: () => void;
  onCreateAccount?: () => void;
  submitLabel?: string;
}

// Extracted from AccountSignedOut's 'signIn' state so it can also open inside
// a DeviceModal from the account switcher's "Add account" button. Holds
// identifier/password itself so an email_unverified response can retry the
// same credentials without the caller re-plumbing them.
export function SignInForm({ onLogin, onSuccess, onForgotPassword, onCreateAccount, submitLabel }: SignInFormProps) {
  const { t } = useTranslation();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unverified, setUnverified] = useState(false);

  const attemptLogin = async () => {
    const trimmedIdentifier = identifier.trim();
    if (!trimmedIdentifier || !password || submitting) return;
    setSubmitting(true);
    setError(null);
    const result = await onLogin(trimmedIdentifier, password);
    setSubmitting(false);
    if (result.status >= 200 && result.status < 300) {
      onSuccess();
      return;
    }
    const code = result.body?.msg;
    if (code === 'email_unverified') {
      setUnverified(true);
      return;
    }
    setUnverified(false);
    setError(authErrorMessage(t, code));
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void attemptLogin();
  };

  if (unverified) {
    return (
      <div className={styles.pendingBlock}>
        <p className={styles.subtitle}>{t('account.verify.pendingMessage')}</p>
        {error && <p className={styles.error} role="alert">{error}</p>}
        <Button type="button" tone="accent" loading={submitting} onClick={() => void attemptLogin()}>
          {t('account.create.verifiedRetry')}
        </Button>
        <button type="button" className={styles.linkBtn} onClick={() => setUnverified(false)}>
          {t('account.signIn.backToSignIn')}
        </button>
      </div>
    );
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>{t('account.signIn.identifier')}</span>
        <TextInput
          value={identifier}
          onInput={setIdentifier}
          name="username"
          autoComplete="username"
          ariaLabel={t('account.signIn.identifier')}
          placeholder={t('account.signIn.identifierPlaceholder')}
        />
      </label>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>{t('account.signIn.password')}</span>
        <TextInput
          value={password}
          type="password"
          onInput={setPassword}
          name="current-password"
          autoComplete="current-password"
          ariaLabel={t('account.signIn.password')}
        />
      </label>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <Button type="submit" tone="accent" loading={submitting} disabled={submitting || !identifier.trim() || !password}>
        {submitLabel ?? t('account.signIn.submit')}
      </Button>
      {(onForgotPassword || onCreateAccount) && (
        <div className={styles.links}>
          {onForgotPassword && (
            <button type="button" className={styles.linkBtn} onClick={onForgotPassword}>
              {t('account.signIn.forgotPassword')}
            </button>
          )}
          {onCreateAccount && (
            <button type="button" className={styles.linkBtn} onClick={onCreateAccount}>
              {t('account.signIn.createAccount')}
            </button>
          )}
        </div>
      )}
    </form>
  );
}
