import { useState, type FormEvent } from 'react';
import { Button } from '../../../common/Button/Button';
import { TextInput } from '../../../common/TextInput/TextInput';
import { DeviceModal } from '../../../common/DeviceModal/DeviceModal';
import { useToast } from '../../../common/Toast/Toast';
import { useTranslation } from '../../../../lib/i18n';
import type { AuthBackend } from '../../../../api/authBackend';
import { isValidPassword } from './accountValidation';
import styles from './Account.module.scss';

interface ChangePasswordModalProps {
  open: boolean;
  onClose: () => void;
  // True while a recovery-fresh session (from the email magic link) applies
  // the change at once; otherwise the server mails a confirmation link first.
  recoveryFresh: boolean;
  onRecoveryFreshConsumed: () => void;
  changePassword: AuthBackend['changePassword'];
}

// DeviceModal unmounts its children on close, so every field here resets to
// its initial empty state on the next mount - no password value is ever
// held outside this component's lifetime.
export function ChangePasswordModal({ open, onClose, recoveryFresh, onRecoveryFreshConsumed, changePassword }: ChangePasswordModalProps) {
  const { t } = useTranslation();
  const { push } = useToast();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = isValidPassword(newPassword) && newPassword === confirmPassword;

  const handleSave = async () => {
    if (!canSubmit || saving) return;
    setSaving(true);
    setError(null);
    const result = await changePassword(undefined, newPassword);
    setSaving(false);
    if (result.status >= 200 && result.status < 300) {
      onRecoveryFreshConsumed();
      // 202: the server holds the change until the emailed link is confirmed.
      push({ title: t(result.status === 202 ? 'account.password.confirmSent' : 'account.password.updated') });
      onClose();
      return;
    }
    setError(t(result.status === 429 ? 'account.error.passwordChangeTooSoon' : 'account.error.generic'));
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void handleSave();
  };

  return (
    <DeviceModal open={open} onClose={onClose} title={t('account.password.change')}>
      <form className={styles.form} onSubmit={handleSubmit}>
        {!recoveryFresh && <p className={styles.hint}>{t('account.password.confirmHint')}</p>}
        <label className={styles.field}>
          <span className={styles.fieldLabel}>{t('account.password.new')}</span>
          <TextInput
            value={newPassword}
            type="password"
            onInput={setNewPassword}
            name="new-password"
            autoComplete="new-password"
            ariaLabel={t('account.password.new')}
            invalid={newPassword.length > 0 && !isValidPassword(newPassword)}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>{t('account.password.confirm')}</span>
          <TextInput
            value={confirmPassword}
            type="password"
            onInput={setConfirmPassword}
            name="new-password"
            autoComplete="new-password"
            ariaLabel={t('account.password.confirm')}
            invalid={confirmPassword.length > 0 && confirmPassword !== newPassword}
          />
        </label>
        {newPassword.length > 0 && !isValidPassword(newPassword) && (
          <p className={styles.hint}>{t('account.create.passwordHint')}</p>
        )}
        {error && <p className={styles.error} role="alert">{error}</p>}
        <Button type="submit" tone="accent" loading={saving} disabled={!canSubmit || saving}>
          {t('account.save')}
        </Button>
      </form>
    </DeviceModal>
  );
}
