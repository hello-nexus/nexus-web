import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { BadgeCheck, Camera, LogOut, RefreshCw, Trash2, UserPlus } from 'lucide-react';
import { Button } from '../../../common/Button/Button';
import { Badge } from '../../../common/Badge/Badge';
import { TextInput } from '../../../common/TextInput/TextInput';
import { ConfirmModal } from '../../../common/ConfirmModal/ConfirmModal';
import { DeviceModal } from '../../../common/DeviceModal/DeviceModal';
import { MediaCropper, type NormalizedCrop } from '../../../common/MediaCropper/MediaCropper';
import { SyncConflictModal } from '../../../common/SyncConflictModal/SyncConflictModal';
import { SettingsSection } from '../../../common/SettingsSection/SettingsSection';
import { SettingRow, SettingToggle } from '../../../common/SettingRow/SettingRow';
import { useToast } from '../../../common/Toast/Toast';
import { useTranslation } from '../../../../lib/i18n';
import type { UseCloudAccountsResult } from '../../../../hooks/useCloudAccounts';
import type { UseSyncStatusResult } from '../../../../hooks/useSyncStatus';
import type { SyncState } from '../../../../api/cloud';
import { SignInForm } from './SignInForm';
import { ChangePasswordModal } from './ChangePasswordModal';
import { authErrorMessage, currentPasswordErrorMessage } from './accountErrors';
import { cropToSourceRect } from './avatarCrop';
import { isValidUsername } from './accountValidation';
import { usePublishPageSyncConflictModalOpen } from '../../../../app/syncConflictModalCoordination';
import styles from './Account.module.scss';

interface AccountSignedInProps {
  accounts: UseCloudAccountsResult;
  sync: UseSyncStatusResult;
  recoveryFresh: boolean;
  onRecoveryFreshConsumed: () => void;
}

const AVATAR_OUTPUT_SIZE = 512;

async function cropToAvatarBlob(objectUrl: string, crop: NormalizedCrop): Promise<Blob | null> {
  const image = new Image();
  image.src = objectUrl;
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('avatar image failed to load'));
    });
  } catch {
    return null;
  }
  if (!image.naturalWidth) return null;
  const { sx, sy, sw, sh } = cropToSourceRect(crop, image.naturalWidth, image.naturalHeight);
  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_OUTPUT_SIZE;
  canvas.height = AVATAR_OUTPUT_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, AVATAR_OUTPUT_SIZE, AVATAR_OUTPUT_SIZE);
  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}

function syncStateColor(state: SyncState): string {
  switch (state) {
    case 'syncing': return 'var(--accent)';
    case 'dirty': return 'var(--warn, #f59e0b)';
    case 'offline': return 'var(--text-dim)';
    case 'error': return 'var(--bad, #ef4444)';
    default: return 'var(--good, #22c55e)';
  }
}

// Ticks off `retryAt` (an ISO date) into whole hours/minutes remaining, for
// the username-change 24h cooldown. Mirrors PanelOfflineOverlay's
// useCountdownSeconds shape at a coarser (minute) resolution.
function useRetryCountdown(retryAt: string | null): { hours: number; minutes: number } | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!retryAt) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [retryAt]);
  if (!retryAt) return null;
  const target = new Date(retryAt).getTime();
  if (Number.isNaN(target)) return null;
  const remainingMs = target - now;
  if (remainingMs <= 0) return null;
  const totalMinutes = Math.ceil(remainingMs / 60_000);
  return { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 };
}

export function AccountSignedIn({ accounts, sync, recoveryFresh, onRecoveryFreshConsumed }: AccountSignedInProps) {
  const { t } = useTranslation();
  const { push } = useToast();
  const account = accounts.activeAccount;
  const initial = (account?.username ?? '?').charAt(0).toUpperCase();

  // ── Avatar ──────────────────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);

  const handleAvatarPick = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setCropSrc(URL.createObjectURL(file));
  };

  const handleCropCancel = useCallback(() => {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
  }, [cropSrc]);

  const [avatarError, setAvatarError] = useState<string | null>(null);

  const handleCropConfirm = useCallback(async (crop: NormalizedCrop) => {
    if (!cropSrc) return;
    setAvatarBusy(true);
    setAvatarError(null);
    const blob = await cropToAvatarBlob(cropSrc, crop);
    const ok = blob ? await accounts.uploadAvatar(blob) : false;
    URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
    setAvatarBusy(false);
    if (ok) push({ title: t('account.avatar.updated') });
    else setAvatarError(t('account.error.generic'));
  }, [cropSrc, accounts, push, t]);

  // ── Username ────────────────────────────────────────────────────────────
  const [usernameValue, setUsernameValue] = useState(account?.username ?? '');
  const [usernameSaving, setUsernameSaving] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [usernameRetryAt, setUsernameRetryAt] = useState<string | null>(null);
  useEffect(() => { setUsernameValue(account?.username ?? ''); }, [account?.username]);
  const cooldown = useRetryCountdown(usernameRetryAt);
  useEffect(() => {
    if (cooldown == null && usernameRetryAt != null) {
      setUsernameRetryAt(null);
      setUsernameError(null);
    }
  }, [cooldown, usernameRetryAt]);

  const handleUsernameSave = async () => {
    const trimmed = usernameValue.trim();
    if (!isValidUsername(trimmed) || trimmed === account?.username || usernameSaving) return;
    setUsernameSaving(true);
    setUsernameError(null);
    const result = await accounts.changeUsername(trimmed);
    setUsernameSaving(false);
    if (result.status >= 200 && result.status < 300) {
      push({ title: t('account.username.updated') });
      return;
    }
    if (result.status === 409 && (result.body?.msg === 'username_cooldown' || result.body?.retryAt)) {
      // Always set the static fallback text, even when retryAt is present -
      // useRetryCountdown rejects an unparseable or already-elapsed retryAt
      // (returns null), and the render below only prefers the live message
      // over this one when `cooldown` actually computed a value, so a bad
      // retryAt still leaves the user with a message instead of none.
      if (result.body?.retryAt) setUsernameRetryAt(result.body.retryAt);
      setUsernameError(t('account.username.error.cooldown'));
      return;
    }
    setUsernameError(authErrorMessage(t, result.body?.msg));
  };

  // ── Password ────────────────────────────────────────────────────────────
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);

  // A recovery-approved session (from the email magic link) opens the
  // change-password modal directly, passwordless, instead of the user
  // having to find and click the button themselves.
  useEffect(() => {
    if (recoveryFresh) setPasswordModalOpen(true);
  }, [recoveryFresh]);

  // ── Privacy ─────────────────────────────────────────────────────────────
  const [privacySaving, setPrivacySaving] = useState(false);
  const handlePrivacyToggle = async () => {
    if (!account || privacySaving) return;
    setPrivacySaving(true);
    await accounts.setPrivate(!account.isPrivate);
    setPrivacySaving(false);
  };

  // ── Sync ────────────────────────────────────────────────────────────────
  const [syncing, setSyncing] = useState(false);
  const [conflictModalOpen, setConflictModalOpen] = useState(false);
  usePublishPageSyncConflictModalOpen(conflictModalOpen);
  const handleSyncNow = async () => {
    setSyncing(true);
    await sync.syncNow();
    setSyncing(false);
  };
  const lastSyncedText = sync.lastSyncAt
    ? new Date(sync.lastSyncAt).toLocaleString()
    : t('account.sync.never');

  // ── Account switcher ────────────────────────────────────────────────────
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [addAccountOpen, setAddAccountOpen] = useState(false);

  const handleActivate = async (accountId: string) => {
    setSwitchingId(accountId);
    await accounts.activate(accountId);
    setSwitchingId(null);
  };

  const handleLogout = async (accountId: string) => {
    setSwitchingId(accountId);
    await accounts.logout(accountId);
    setSwitchingId(null);
  };

  // ── Danger zone ─────────────────────────────────────────────────────────
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteConfirm = async () => {
    if (deleting) return;
    const sentWithoutCurrentPassword = recoveryFresh;
    setDeleting(true);
    setDeleteError(null);
    const result = await accounts.deleteAccount(sentWithoutCurrentPassword ? undefined : deletePassword);
    setDeleting(false);
    if (result.status >= 200 && result.status < 300) {
      setDeleteConfirmOpen(false);
      setDeletePassword('');
      return;
    }
    if (sentWithoutCurrentPassword) onRecoveryFreshConsumed();
    setDeleteError(currentPasswordErrorMessage(t, result.body !== null, sentWithoutCurrentPassword));
  };

  // Every per-account form/error state above is scoped to the PREVIOUSLY
  // active account and must not leak across a switch (e.g. a stale username
  // cooldown message or a half-typed password field from account A showing
  // up under account B's form). Closing the password modal drops its
  // self-contained field state the same way, since DeviceModal unmounts it -
  // unless a recovery-fresh session is still live, in which case the modal
  // stays open for it rather than being force-closed mid-switch.
  // Skipped on the initial mount (ref starts equal to accountId) so this
  // does not fight the recovery-fresh effect above, which opens the modal
  // on that same first render - AccountView only mounts this component once
  // `accounts` and `activeAccountId` have already resolved together, so
  // `accountId` is stable from the first render. The recoveryFresh check on
  // the modal-close guards the same race if that mount invariant ever
  // changes.
  const accountId = account?.accountId ?? null;
  const previousAccountId = useRef(accountId);
  useEffect(() => {
    if (previousAccountId.current === accountId) return;
    previousAccountId.current = accountId;
    setUsernameError(null);
    setUsernameRetryAt(null);
    if (!recoveryFresh) setPasswordModalOpen(false);
    setDeletePassword('');
    setDeleteError(null);
    setAvatarError(null);
  }, [accountId, recoveryFresh]);

  if (!account) return null;

  return (
    <div className={styles.tabPanel}>
      <SettingsSection title={t('account.title')} description={t('account.subtitle')}>
        <div className={styles.accountCard}>
          <div className={styles.avatarWrap}>
            {account.avatar?.large ? (
              <img className={styles.avatarLarge} src={account.avatar.large} alt="" />
            ) : (
              <div className={styles.avatarLargeFallback}>{initial}</div>
            )}
            <button
              type="button"
              className={styles.avatarCameraBtn}
              onClick={() => fileInputRef.current?.click()}
              aria-label={t('account.avatar.change')}
            >
              <Camera size={14} />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className={styles.hiddenInput}
              onChange={handleAvatarPick}
            />
          </div>
          <div className={styles.accountInfo}>
            <div className={styles.accountNameRow}>
              <span className={styles.accountName}>{account.username}</span>
              {account.emailVerified && (
                <Badge label={t('account.verifiedBadge')} color="var(--good, #22c55e)" icon={<BadgeCheck size={12} />} />
              )}
            </div>
            <span className={styles.accountEmail}>{account.email}</span>
          </div>
        </div>
        {avatarError && <p className={styles.error} role="alert">{avatarError}</p>}
        {cropSrc && (
          <MediaCropper src={cropSrc} aspect={1} busy={avatarBusy} onConfirm={c => void handleCropConfirm(c)} onCancel={handleCropCancel} />
        )}
      </SettingsSection>

      <SettingsSection title={t('account.username.title')} description={t('account.username.description')}>
        <SettingRow label={t('account.username.label')}>
          <div className={styles.inlineField}>
            <TextInput
              value={usernameValue}
              onInput={setUsernameValue}
              maxLength={15}
              ariaLabel={t('account.username.label')}
              disabled={usernameSaving || cooldown != null}
              invalid={usernameError != null}
            />
            <Button
              type="button"
              tone="neutral"
              size="sm"
              loading={usernameSaving}
              disabled={usernameSaving || cooldown != null || usernameValue.trim() === account.username || !isValidUsername(usernameValue.trim())}
              onClick={() => void handleUsernameSave()}
            >
              {t('account.save')}
            </Button>
          </div>
        </SettingRow>
        {usernameError && (
          <p className={styles.error} role="alert">
            {cooldown
              ? t('account.username.error.cooldownIn', { hours: cooldown.hours, minutes: cooldown.minutes })
              : usernameError}
          </p>
        )}
      </SettingsSection>

      <SettingsSection title={t('account.password.title')} description={t('account.password.description')}>
        <Button type="button" tone="neutral" size="sm" onClick={() => setPasswordModalOpen(true)}>
          {t('account.password.change')}
        </Button>
      </SettingsSection>
      <ChangePasswordModal
        open={passwordModalOpen}
        onClose={() => setPasswordModalOpen(false)}
        recoveryFresh={recoveryFresh}
        onRecoveryFreshConsumed={onRecoveryFreshConsumed}
        changePassword={accounts.changePassword}
      />

      <SettingsSection title={t('account.privacy.title')}>
        <SettingToggle
          label={t('account.privacy.label')}
          description={t('account.privacy.description')}
          checked={account.isPrivate}
          onChange={() => void handlePrivacyToggle()}
          disabled={privacySaving}
        />
      </SettingsSection>

      <SettingsSection title={t('account.sync.title')} description={t('account.sync.description')}>
        <SettingRow label={t('account.sync.statusLabel')}>
          <Badge label={t(`account.sync.state.${sync.state}`)} color={syncStateColor(sync.state)} />
        </SettingRow>
        <SettingRow label={t('account.sync.lastSyncedLabel')} description={lastSyncedText}>
          <Button type="button" tone="neutral" size="sm" icon={<RefreshCw size={14} />} loading={syncing} onClick={() => void handleSyncNow()}>
            {t('account.sync.syncNow')}
          </Button>
        </SettingRow>
        {sync.conflicts.length > 0 && (
          <SettingRow label={t('account.sync.conflict.title')} description={t('account.sync.conflict.pendingCount', { count: sync.conflicts.length })}>
            <Button type="button" tone="danger" size="sm" onClick={() => setConflictModalOpen(true)}>
              {t('account.sync.conflict.review')}
            </Button>
          </SettingRow>
        )}
      </SettingsSection>
      <SyncConflictModal
        open={conflictModalOpen}
        conflicts={sync.conflicts}
        onResolve={(profileId, choice) => void sync.resolve(profileId, choice)}
        onClose={() => setConflictModalOpen(false)}
      />

      <SettingsSection title={t('account.switcher.title')} description={t('account.switcher.description')}>
        <div className={styles.switcherList}>
          {accounts.accounts.map(entry => (
            <div key={entry.accountId} className={`${styles.switcherRow} ${entry.active ? styles.switcherRowActive : ''}`}>
              {entry.avatar?.small ? (
                <img className={styles.switcherAvatar} src={entry.avatar.small} alt="" />
              ) : (
                <div className={styles.switcherAvatarFallback}>{entry.username.charAt(0).toUpperCase()}</div>
              )}
              <div className={styles.switcherInfo}>
                <span className={styles.switcherName}>{entry.username}</span>
                <span className={styles.switcherEmail}>{entry.email}</span>
              </div>
              <div className={styles.switcherActions}>
                <Button
                  type="button"
                  tone="ghost"
                  size="sm"
                  disabled={entry.active || switchingId === entry.accountId}
                  loading={switchingId === entry.accountId}
                  onClick={() => void handleActivate(entry.accountId)}
                >
                  {t('account.switcher.activate')}
                </Button>
                <Button
                  type="button"
                  tone="ghost"
                  size="sm"
                  icon={<LogOut size={14} />}
                  disabled={switchingId === entry.accountId}
                  onClick={() => void handleLogout(entry.accountId)}
                  aria-label={t('account.switcher.logOut')}
                  title={t('account.switcher.logOut')}
                />
              </div>
            </div>
          ))}
        </div>
        <div className={styles.profileButtons}>
          <Button type="button" tone="neutral" size="sm" icon={<UserPlus size={14} />} onClick={() => setAddAccountOpen(true)}>
            {t('account.switcher.addAccount')}
          </Button>
        </div>
      </SettingsSection>
      <DeviceModal open={addAccountOpen} onClose={() => setAddAccountOpen(false)} title={t('account.switcher.addAccount')}>
        <SignInForm
          onLogin={accounts.login}
          onSuccess={() => setAddAccountOpen(false)}
          submitLabel={t('account.signIn.submit')}
        />
      </DeviceModal>

      {/* eslint-disable-next-line i18next/no-literal-string -- CSS variable token */}
      <SettingsSection title={t('settings.dangerZone')} titleStyle={{ color: 'var(--bad)' }}>
        <SettingRow label={t('account.danger.logOut.label')} description={t('account.danger.logOut.description')}>
          <Button type="button" tone="danger" size="sm" onClick={() => void handleLogout(account.accountId)}>
            {t('account.switcher.logOut')}
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
    </div>
  );
}
