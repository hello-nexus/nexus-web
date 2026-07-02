import { useState, type FormEvent } from 'react';
import { flushSync } from 'react-dom';
import { Button } from '../../../common/Button/Button';
import { TextInput } from '../../../common/TextInput/TextInput';
import { useTranslation } from '../../../../lib/i18n';
import type { AuthBackend } from '../../../../api/authBackend';
import { isValidEmail, isValidPassword, isValidUsername } from './accountValidation';
import styles from './Account.module.scss';

interface CreateAccountFormProps {
  backend: AuthBackend;
  onSuccess: (email: string, password: string) => void;
  onBackToSignIn: () => void;
}

export function CreateAccountForm({ backend, onSuccess, onBackToSignIn }: CreateAccountFormProps) {
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
    const result = await backend.register(trimmedEmail, password, trimmedUsername);
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

  // Chromium infers a successful login when a filled password field unmounts,
  // and offers to save it. flushSync commits the cleared fields to the DOM
  // before onBackToSignIn runs the caller's unmount, so it never sees them filled.
  const handleBackToSignIn = () => {
    flushSync(() => {
      setEmail('');
      setUsername('');
      setPassword('');
      setConfirmPassword('');
    });
    onBackToSignIn();
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
      <div className={styles.links}>
        <button type="button" className={styles.linkBtn} onClick={handleBackToSignIn}>
          {t('account.signIn.backToSignIn')}
        </button>
      </div>
    </form>
  );
}
