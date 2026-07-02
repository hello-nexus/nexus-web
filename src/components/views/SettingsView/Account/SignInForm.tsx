import { useState, type FormEvent } from 'react';
import { flushSync } from 'react-dom';
import { Button } from '../../../common/Button/Button';
import { TextInput } from '../../../common/TextInput/TextInput';
import { useTranslation } from '../../../../lib/i18n';
import type { AuthBackend } from '../../../../api/authBackend';
import { authErrorMessage } from './accountErrors';
import { storeLoginCredential } from './credentialStore';
import styles from './Account.module.scss';

interface SignInFormProps {
  backend: AuthBackend;
  onSuccess: () => void;
  onForgotPassword?: () => void;
  onCreateAccount?: () => void;
}

// Holds identifier/password itself so an email_unverified response can retry
// the same credentials without the caller re-plumbing them.
export function SignInForm({ backend, onSuccess, onForgotPassword, onCreateAccount }: SignInFormProps) {
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
    const result = await backend.login(trimmedIdentifier, password);
    setSubmitting(false);
    if (result.status >= 200 && result.status < 300) {
      void storeLoginCredential(trimmedIdentifier, password);
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

  // Chromium infers a successful login when a filled password field unmounts,
  // and offers to save it. flushSync commits the cleared fields to the DOM
  // before navigate() runs the caller's unmount, so it never sees them filled.
  const clearAndNavigate = (navigate: () => void) => {
    flushSync(() => {
      setIdentifier('');
      setPassword('');
    });
    navigate();
  };

  return (
    <div className={styles.wrap}>
      <h1 className={styles.title}>{t('account.signIn.title')}</h1>
      <p className={styles.subtitle}>{t('account.signIn.subtitle')}</p>
      {unverified ? (
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
      ) : (
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
            {t('account.signIn.submit')}
          </Button>
          {(onForgotPassword || onCreateAccount) && (
            <div className={styles.links}>
              {onForgotPassword && (
                <button type="button" className={styles.linkBtn} onClick={() => clearAndNavigate(onForgotPassword)}>
                  {t('account.signIn.forgotPassword')}
                </button>
              )}
              {onCreateAccount && (
                <button type="button" className={styles.linkBtn} onClick={() => clearAndNavigate(onCreateAccount)}>
                  {t('account.signIn.createAccount')}
                </button>
              )}
            </div>
          )}
        </form>
      )}
    </div>
  );
}
