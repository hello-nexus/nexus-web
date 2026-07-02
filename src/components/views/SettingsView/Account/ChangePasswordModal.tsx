import { useState, type FormEvent } from 'react';
import { Button } from '../../../common/Button/Button';
import { TextInput } from '../../../common/TextInput/TextInput';
import { DeviceModal } from '../../../common/DeviceModal/DeviceModal';
import { useToast } from '../../../common/Toast/Toast';
import { useTranslation } from '../../../../lib/i18n';
import type { AuthBackend } from '../../../../api/authBackend';
import { currentPasswordErrorMessage } from './accountErrors';
import { isValidPassword } from './accountValidation';
import styles from './Account.module.scss';

interface ChangePasswordModalProps {
  open: boolean;
  onClose: () => void;
  // True while a recovery-fresh session (from the email magic link) still
  // authorizes a passwordless change - hides the current-password field.
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
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = isValidPassword(newPassword) && newPassword === confirmPassword
    && (recoveryFresh || currentPassword.length > 0);

  const handleSave = async () => {
    if (!canSubmit || saving) return;
    const sentWithoutCurrentPassword = recoveryFresh;
    setSaving(true);
    setError(null);
    const result = await changePassword(sentWithoutCurrentPassword ? undefined : currentPassword, newPassword);
    setSaving(false);
    if (result.status >= 200 && result.status < 300) {
      onRecoveryFreshConsumed();
      push({ title: t('account.password.updated') });
      onClose();
      return;
    }
    // A recovery-fresh request that still failed means that session expired
    // server-side since we last checked - drop the flag so the current-password
    // field reappears (inside this still-open modal) instead of silently
    // retrying the same passwordless call.
    if (sentWithoutCurrentPassword) onRecoveryFreshConsumed();
    setError(currentPasswordErrorMessage(t, result.body !== null, sentWithoutCurrentPassword));
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void handleSave();
  };

  return (
    <DeviceModal open={open} onClose={onClose} title={t('account.password.change')}>
      <form className={styles.form} onSubmit={handleSubmit}>
        {!recoveryFresh && (
          <label className={styles.field}>
            <span className={styles.fieldLabel}>{t('account.password.current')}</span>
            <TextInput
              value={currentPassword}
              type="password"
              onInput={setCurrentPassword}
              name="current-password"
              autoComplete="current-password"
              ariaLabel={t('account.password.current')}
            />
          </label>
        )}
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
