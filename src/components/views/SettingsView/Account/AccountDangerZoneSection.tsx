import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '../../../common/Button/Button';
import { TextInput } from '../../../common/TextInput/TextInput';
import { ConfirmModal } from '../../../common/ConfirmModal/ConfirmModal';
import { SettingsSection } from '../../../common/SettingsSection/SettingsSection';
import { SettingRow } from '../../../common/SettingRow/SettingRow';
import { useTranslation } from '../../../../lib/i18n';
import type { AuthBackend } from '../../../../api/authBackend';
import { currentPasswordErrorMessage } from './accountErrors';
import styles from './Account.module.scss';

interface AccountDangerZoneSectionProps {
  backend: AuthBackend;
  recoveryFresh: boolean;
  onRecoveryFreshConsumed: () => void;
  onLoggedOut: () => void;
  onDeleted: () => void;
}

// Log out + delete account - shared by the in-app Account page and the
// public /account and /recover pages.
export function AccountDangerZoneSection({
  backend, recoveryFresh, onRecoveryFreshConsumed, onLoggedOut, onDeleted,
}: AccountDangerZoneSectionProps) {
  const { t } = useTranslation();

  const handleLogout = () => {
    void backend.logout().then(onLoggedOut);
  };

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteConfirm = async () => {
    if (deleting) return;
    const sentWithoutCurrentPassword = recoveryFresh;
    setDeleting(true);
    setDeleteError(null);
    const result = await backend.deleteAccount(sentWithoutCurrentPassword ? undefined : deletePassword);
    setDeleting(false);
    if (result.status >= 200 && result.status < 300) {
      setDeleteConfirmOpen(false);
      setDeletePassword('');
      onDeleted();
      return;
    }
    if (sentWithoutCurrentPassword) onRecoveryFreshConsumed();
    setDeleteError(currentPasswordErrorMessage(t, result.body !== null, sentWithoutCurrentPassword));
  };

  return (
    <>
      {/* eslint-disable-next-line i18next/no-literal-string -- CSS variable token */}
      <SettingsSection title={t('settings.dangerZone')} titleStyle={{ color: 'var(--bad)' }}>
        <SettingRow label={t('account.danger.logOut.label')} description={t('account.danger.logOut.description')}>
          <Button type="button" tone="danger" size="sm" onClick={handleLogout}>
            {t('account.danger.logOut.label')}
          </Button>
        </SettingRow>
        <SettingRow label={t('account.danger.delete.label')} description={t('account.danger.delete.description')}>
          <Button type="button" tone="danger" size="sm" icon={<Trash2 size={14} />} onClick={() => setDeleteConfirmOpen(true)}>
            {t('account.danger.delete.button')}
          </Button>
        </SettingRow>
      </SettingsSection>

      <ConfirmModal
        open={deleteConfirmOpen}
        title={t('account.danger.delete.confirmTitle')}
        message={t('account.danger.delete.confirmMessage')}
        note={t('account.danger.delete.confirmNote')}
        // eslint-disable-next-line i18next/no-literal-string -- note tone enum value
        noteTone="danger"
        confirmLabel={t('account.danger.delete.button')}
        destructive
        onConfirm={() => void handleDeleteConfirm()}
        onCancel={() => { setDeleteConfirmOpen(false); setDeletePassword(''); setDeleteError(null); }}
      >
        {!recoveryFresh && (
          <div className={styles.deletePasswordField}>
            <span className={styles.fieldLabel}>{t('account.password.current')}</span>
            <TextInput
              value={deletePassword}
              type="password"
              onInput={setDeletePassword}
              name="current-password"
              autoComplete="current-password"
              ariaLabel={t('account.password.current')}
            />
          </div>
        )}
        {deleteError && <p className={styles.error} role="alert">{deleteError}</p>}
      </ConfirmModal>
    </>
  );
}
