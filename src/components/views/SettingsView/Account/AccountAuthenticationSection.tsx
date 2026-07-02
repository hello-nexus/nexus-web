import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { BadgeCheck, Camera } from 'lucide-react';
import { Badge } from '../../../common/Badge/Badge';
import { Button } from '../../../common/Button/Button';
import { TextInput } from '../../../common/TextInput/TextInput';
import { MediaCropper, type NormalizedCrop } from '../../../common/MediaCropper/MediaCropper';
import { SettingsSection } from '../../../common/SettingsSection/SettingsSection';
import { SettingRow, SettingToggle } from '../../../common/SettingRow/SettingRow';
import { useToast } from '../../../common/Toast/Toast';
import { useTranslation } from '../../../../lib/i18n';
import type { AuthAccount, AuthBackend } from '../../../../api/authBackend';
import { ChangePasswordModal } from './ChangePasswordModal';
import { authErrorMessage } from './accountErrors';
import { cropToSourceRect } from './avatarCrop';
import { isValidUsername } from './accountValidation';
import styles from './Account.module.scss';

interface AccountAuthenticationSectionProps {
  backend: AuthBackend;
  account: AuthAccount;
  // Called after avatar/username/privacy mutations succeed so the caller can
  // reload the account (in-app: accounts.refresh(); public: the page's own
  // account hook) - this section never owns the account object itself.
  onAccountChanged: () => void;
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

// Avatar, username, password, and the private-account toggle - the block
// shared by the in-app Account page and the public /account and /recover
// pages (the public surface renders this block alone, no profile sync).
export function AccountAuthenticationSection({
  backend, account, onAccountChanged, recoveryFresh, onRecoveryFreshConsumed,
}: AccountAuthenticationSectionProps) {
  const { t } = useTranslation();
  const { push } = useToast();
  const initial = (account.username || '?').charAt(0).toUpperCase();

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
    const avatar = blob ? await backend.uploadAvatar(blob) : null;
    URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
    setAvatarBusy(false);
    if (avatar) {
      onAccountChanged();
      push({ title: t('account.avatar.updated') });
    } else {
      setAvatarError(t('account.error.generic'));
    }
  }, [cropSrc, backend, onAccountChanged, push, t]);

  // ── Username ────────────────────────────────────────────────────────────
  const [usernameValue, setUsernameValue] = useState(account.username);
  const [usernameSaving, setUsernameSaving] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [usernameRetryAt, setUsernameRetryAt] = useState<string | null>(null);
  useEffect(() => { setUsernameValue(account.username); }, [account.username]);
  const cooldown = useRetryCountdown(usernameRetryAt);
  useEffect(() => {
    if (cooldown == null && usernameRetryAt != null) {
      setUsernameRetryAt(null);
      setUsernameError(null);
    }
  }, [cooldown, usernameRetryAt]);

  const handleUsernameSave = async () => {
    const trimmed = usernameValue.trim();
    if (!isValidUsername(trimmed) || trimmed === account.username || usernameSaving) return;
    setUsernameSaving(true);
    setUsernameError(null);
    const result = await backend.changeUsername(trimmed);
    setUsernameSaving(false);
    if (result.status >= 200 && result.status < 300) {
      onAccountChanged();
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
    if (privacySaving) return;
    setPrivacySaving(true);
    const ok = await backend.setPrivate(!account.isPrivate);
    setPrivacySaving(false);
    if (ok) onAccountChanged();
  };

  // Defensive reset if `account.accountId` ever changes while this component
  // stays mounted (e.g. a stale username cooldown message or a half-typed
  // password field from the prior account bleeding into the new one's form).
  // The password modal stays open through the reset only when a
  // recovery-fresh session is live, so a passwordless recovery in progress
  // is never force-closed.
  const accountId = account.accountId;
  const previousAccountId = useRef(accountId);
  useEffect(() => {
    if (previousAccountId.current === accountId) return;
    previousAccountId.current = accountId;
    setUsernameError(null);
    setUsernameRetryAt(null);
    if (!recoveryFresh) setPasswordModalOpen(false);
    setAvatarError(null);
  }, [accountId, recoveryFresh]);

  return (
    <SettingsSection title={t('account.authentication.title')}>
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

      <SettingRow label={t('account.username.label')} description={t('account.username.description')}>
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

      <SettingRow label={t('account.password.title')} description={t('account.password.description')}>
        <Button type="button" tone="neutral" size="sm" onClick={() => setPasswordModalOpen(true)}>
          {t('account.password.change')}
        </Button>
      </SettingRow>

      <SettingToggle
        label={t('account.privacy.label')}
        description={t('account.privacy.description')}
        checked={account.isPrivate}
        onChange={() => void handlePrivacyToggle()}
        disabled={privacySaving}
      />

      <ChangePasswordModal
        open={passwordModalOpen}
        onClose={() => setPasswordModalOpen(false)}
        recoveryFresh={recoveryFresh}
        onRecoveryFreshConsumed={onRecoveryFreshConsumed}
        changePassword={backend.changePassword}
      />
    </SettingsSection>
  );
}
