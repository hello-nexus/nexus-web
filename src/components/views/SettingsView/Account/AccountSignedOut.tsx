import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Button } from '../../../common/Button/Button';
import { Spinner } from '../../../common/Spinner/Spinner';
import { TextInput } from '../../../common/TextInput/TextInput';
import { useTranslation } from '../../../../lib/i18n';
import type { UseCloudAccountsResult } from '../../../../hooks/useCloudAccounts';
import { SignInForm } from './SignInForm';
import { authErrorMessage } from './accountErrors';
import { isValidEmail, isValidPassword, isValidUsername } from './accountValidation';
import styles from './Account.module.scss';

type SignedOutState =
  | 'signIn'
  | 'forgotEmail'
  | 'forgotPending'
  | 'forgotReset'
  | 'forgotExpired'
  | 'create'
  | 'createPendingVerify';

interface AccountSignedOutProps {
  accounts: UseCloudAccountsResult;
  onRecoveryApproved: () => void;
}

const RECOVERY_POLL_MS = 3000;

export function AccountSignedOut({ accounts, onRecoveryApproved }: AccountSignedOutProps) {
  const { t } = useTranslation();
  const [state, setState] = useState<SignedOutState>('signIn');
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [pendingCreds, setPendingCreds] = useState<{ email: string; password: string } | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  useEffect(() => {
    if (state !== 'forgotPending') return;
    let cancelled = false;
    const poll = async () => {
      const status = await accounts.recoveryStatus();
      if (cancelled || !status) return;
      if (status.status === 'approved') {
        setState('forgotReset');
        onRecoveryApproved();
      } else if (status.status === 'expired') {
        setState('forgotExpired');
      }
    };
    void poll();
    const timer = window.setInterval(() => { void poll(); }, RECOVERY_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [state, accounts, onRecoveryApproved]);

  const handleForgotSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!recoveryEmail.trim()) return;
    await accounts.recoveryStart(recoveryEmail.trim());
    setState('forgotPending');
  };

  // pendingCreds holds a plaintext password (for the "I've verified - sign
  // in" retry); back-to-sign-in abandons that flow, so drop it here rather
  // than leaving it sitting in this still-mounted component's state.
  const goToSignIn = useCallback(() => {
    setPendingCreds(null);
    setRetryError(null);
    setState('signIn');
  }, []);

  const handleRetryVerify = async () => {
    if (!pendingCreds) return;
    setRetrying(true);
    setRetryError(null);
    const result = await accounts.login(pendingCreds.email, pendingCreds.password);
    setRetrying(false);
    if (result.status >= 200 && result.status < 300) return;
    const code = result.body?.msg;
    setRetryError(code === 'email_unverified' ? t('account.verify.stillUnverified') : authErrorMessage(t, code));
  };

  if (state === 'signIn') {
    return (
      <div className={styles.wrap}>
        <h1 className={styles.title}>{t('account.signIn.title')}</h1>
        <p className={styles.subtitle}>{t('account.signIn.subtitle')}</p>
        <SignInForm
          onLogin={accounts.login}
          onSuccess={() => {}}
          onForgotPassword={() => setState('forgotEmail')}
          onCreateAccount={() => setState('create')}
        />
      </div>
    );
  }

  if (state === 'forgotEmail') {
    return (
      <div className={styles.wrap}>
        <h1 className={styles.title}>{t('account.recovery.title')}</h1>
        <p className={styles.subtitle}>{t('account.recovery.subtitle')}</p>
        <form className={styles.form} onSubmit={handleForgotSubmit}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>{t('account.recovery.email')}</span>
            <TextInput
              value={recoveryEmail}
              onInput={setRecoveryEmail}
              name="email"
              autoComplete="email"
              ariaLabel={t('account.recovery.email')}
            />
          </label>
          <Button type="submit" tone="accent" disabled={!recoveryEmail.trim()}>
            {t('account.recovery.submit')}
          </Button>
          <div className={styles.links}>
            <button type="button" className={styles.linkBtn} onClick={goToSignIn}>
              {t('account.signIn.backToSignIn')}
            </button>
          </div>
        </form>
      </div>
    );
  }

  if (state === 'forgotPending') {
    return (
      <div className={styles.wrap}>
        <h1 className={styles.title}>{t('account.recovery.pendingTitle')}</h1>
        <div className={styles.pendingBlock}>
          <div className={styles.pendingRow}>
            <Spinner size={18} />
            <p className={styles.subtitle}>{t('account.recovery.pendingMessage', { email: recoveryEmail })}</p>
          </div>
          <button type="button" className={styles.linkBtn} onClick={() => setState('forgotEmail')}>
            {t('account.recovery.cancel')}
          </button>
        </div>
      </div>
    );
  }

  if (state === 'forgotExpired') {
    return (
      <div className={styles.wrap}>
        <h1 className={styles.title}>{t('account.recovery.expiredTitle')}</h1>
        <p className={styles.subtitle}>{t('account.recovery.expiredMessage')}</p>
        <Button type="button" tone="accent" onClick={() => setState('forgotEmail')}>
          {t('account.recovery.tryAgain')}
        </Button>
      </div>
    );
  }

  if (state === 'forgotReset') {
    return (
      <div className={styles.wrap}>
        <div className={styles.pendingBlock}>
          <div className={styles.pendingRow}>
            <Spinner size={18} />
            <p className={styles.subtitle}>{t('account.recovery.signingIn')}</p>
          </div>
          {/* Fallback escape if accounts.refresh() never lands the session
              (network hiccup) - otherwise this screen is transient and the
              parent switches to AccountSignedIn as soon as activeAccountId
              flips non-null. */}
          <button type="button" className={styles.linkBtn} onClick={goToSignIn}>
            {t('account.signIn.backToSignIn')}
          </button>
        </div>
      </div>
    );
  }

  if (state === 'create') {
    return (
      <div className={styles.wrap}>
        <h1 className={styles.title}>{t('account.create.title')}</h1>
        <p className={styles.subtitle}>{t('account.create.subtitle')}</p>
        <CreateAccountForm
          onRegister={accounts.register}
          onSuccess={(email, password) => {
            setPendingCreds({ email, password });
            setRetryError(null);
            setState('createPendingVerify');
          }}
        />
        <div className={styles.links}>
          <button type="button" className={styles.linkBtn} onClick={goToSignIn}>
            {t('account.signIn.backToSignIn')}
          </button>
        </div>
      </div>
    );
  }

  // createPendingVerify
  return (
    <div className={styles.wrap}>
      <h1 className={styles.title}>{t('account.create.verifyTitle')}</h1>
      <div className={styles.pendingBlock}>
        <p className={styles.subtitle}>{t('account.verify.pendingMessage')}</p>
        {retryError && <p className={styles.error} role="alert">{retryError}</p>}
        <Button type="button" tone="accent" loading={retrying} onClick={() => void handleRetryVerify()}>
          {t('account.create.verifiedRetry')}
        </Button>
        <button type="button" className={styles.linkBtn} onClick={goToSignIn}>
          {t('account.signIn.backToSignIn')}
        </button>
      </div>
    </div>
  );
}

function CreateAccountForm({ onRegister, onSuccess }: {
  onRegister: UseCloudAccountsResult['register'];
  onSuccess: (email: string, password: string) => void;
}) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const emailInvalid = touched && email.length > 0 && !isValidEmail(email);
  const usernameInvalid = touched && username.length > 0 && !isValidUsername(username);
  const passwordInvalid = touched && password.length > 0 && !isValidPassword(password);
  const confirmInvalid = touched && confirmPassword.length > 0 && confirmPassword !== password;

  const canSubmit = isValidEmail(email) && isValidUsername(username)
    && isValidPassword(password) && confirmPassword === password;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setFormError(null);
    const trimmedEmail = email.trim();
    const trimmedUsername = username.trim();
    const result = await onRegister(trimmedEmail, password, trimmedUsername);
    setSubmitting(false);
    if (result.status >= 200 && result.status < 300) {
      onSuccess(trimmedEmail, password);
      return;
    }
    if (result.status !== 409) {
      setFormError(t('account.error.generic'));
      return;
    }
    setFormError(result.body?.msg === 'username_taken' ? t('account.error.usernameTaken') : t('account.create.error.duplicate'));
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>{t('account.create.email')}</span>
        <TextInput
          value={email}
          onInput={setEmail}
          name="email"
          autoComplete="email"
          ariaLabel={t('account.create.email')}
          invalid={emailInvalid}
        />
        {emailInvalid && <p className={styles.error} role="alert">{t('account.create.error.email')}</p>}
      </label>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>{t('account.create.username')}</span>
        <TextInput
          value={username}
          onInput={setUsername}
          name="username"
          autoComplete="username"
          ariaLabel={t('account.create.username')}
          maxLength={15}
          invalid={usernameInvalid}
        />
        {usernameInvalid
          ? <p className={styles.error} role="alert">{t('account.create.error.username')}</p>
          : <p className={styles.hint}>{t('account.create.usernameHint')}</p>}
      </label>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>{t('account.create.password')}</span>
        <TextInput
          value={password}
          type="password"
          onInput={setPassword}
          name="new-password"
          autoComplete="new-password"
          ariaLabel={t('account.create.password')}
          invalid={passwordInvalid}
        />
        {passwordInvalid
          ? <p className={styles.error} role="alert">{t('account.create.error.password')}</p>
          : <p className={styles.hint}>{t('account.create.passwordHint')}</p>}
      </label>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>{t('account.create.confirmPassword')}</span>
        <TextInput
          value={confirmPassword}
          type="password"
          onInput={setConfirmPassword}
          name="new-password"
          autoComplete="new-password"
          ariaLabel={t('account.create.confirmPassword')}
          invalid={confirmInvalid}
        />
        {confirmInvalid && <p className={styles.error} role="alert">{t('account.create.error.confirmMismatch')}</p>}
      </label>
      {formError && <p className={styles.error} role="alert">{formError}</p>}
      <Button type="submit" tone="accent" loading={submitting} disabled={submitting}>
        {t('account.create.submit')}
      </Button>
    </form>
  );
}
