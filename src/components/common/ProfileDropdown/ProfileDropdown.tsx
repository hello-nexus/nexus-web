import { useCallback, useRef, useState } from 'react';
import { ChevronDown, Plus, UsersRound, UserRound, LogIn } from 'lucide-react';
import classNames from 'classnames';
import { useTranslation } from '../../../lib/i18n';
import { useClickOutside } from '../../../hooks/useClickOutside';
import { HoverTooltip } from '../HoverTooltip/HoverTooltip';
import { MenuDivider } from '../MenuDivider/MenuDivider';
import { PRESET_ACCENTS, loadSettings } from '../../../lib/settings';
import type { UseProfilesResult } from '../../../hooks/useProfiles';
import type { Preferences } from '../../../api/profiles';
import { savePreferences } from '../../../api/profiles';
import { isProfileNameTaken } from '../../../hooks/profileNameUtils';
import { PromptModal } from '../PromptModal/PromptModal';
import styles from './ProfileDropdown.module.scss';

interface ProfileDropdownProps {
  profiles: UseProfilesResult;
  onPreferencesChanged: (prefs: Preferences) => void;
  onNavigateSettings: () => void;
  // Cloud account management page (distinct from in-app profiles above).
  // Optional so every existing call site keeps working unchanged.
  onNavigateAccount?: () => void;
  // Active cloud account's avatar, for the 'avatar' variant trigger and the
  // dropdown's top account entry. Both undefined when logged out - the
  // trigger then renders its original generic person icon, unchanged.
  accountAvatarUrl?: string;
  accountInitial?: string;
  // Active cloud account's username, shown in the dropdown's top account
  // entry when signedIn is true.
  accountUsername?: string;
  // Whether a cloud account is currently signed in on this machine. Drives
  // the top entry: a "Log in" row when false, the account row when true.
  signedIn?: boolean;
  compact?: boolean;
  // 'sidebar' (default) renders the full trigger or letter circle in the
  // sidebar header. 'avatar' renders a round person-icon button for the
  // top bar, with its dropdown right-aligned under the avatar.
  variant?: 'sidebar' | 'avatar';
}

export function ProfileDropdown({
  profiles, onPreferencesChanged, onNavigateSettings, onNavigateAccount,
  accountAvatarUrl, accountInitial, accountUsername, signedIn = false,
  compact = false, variant = 'sidebar',
}: ProfileDropdownProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useClickOutside(ref, () => setOpen(false), open);

  const activeEntry = profiles.profiles.find(p => p.id === profiles.activeId);

  const handleSwitch = useCallback((id: string) => {
    if (id === profiles.activeId) return;
    // Close the dropdown immediately rather than waiting on switchProfile,
    // which only flips the active highlight once the server confirms.
    setOpen(false);
    profiles.switchProfile(id).then(prefs => {
      if (prefs) onPreferencesChanged(prefs);
    });
  }, [profiles, onPreferencesChanged]);

  const handleCreate = useCallback(() => {
    setCreateOpen(true);
    setOpen(false);
  }, []);

  const handleCreateConfirm = useCallback(async (rawName: string) => {
    const name = rawName.trim().slice(0, 20);
    if (!name) return;

    const currentAccent = loadSettings().general.accentColor;
    const others = PRESET_ACCENTS.filter(c => c !== currentAccent);
    const newAccent = others[Math.floor(Math.random() * others.length)];

    const result = await profiles.createProfile(name);
    if (result.body?.msg === 'profile_name_taken') {
      return t('profile.duplicateName');
    }
    setCreateOpen(false);

    const updated = profiles.profiles;
    const created = updated[updated.length - 1];
    if (created) {
      const prefs = await profiles.switchProfile(created.id);
      await savePreferences({ theme: { accentColor: newAccent } });
      if (prefs) onPreferencesChanged({
        ...prefs,
        theme: { ...prefs.theme, accentColor: newAccent },
      });
    }
  }, [profiles, onPreferencesChanged, t]);

  const validateNewName = useCallback((raw: string): string | null => {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    return isProfileNameTaken(profiles.profiles, trimmed) ? t('profile.duplicateName') : null;
  }, [profiles.profiles, t]);

  const handleManage = useCallback(() => {
    onNavigateSettings();
    setOpen(false);
  }, [onNavigateSettings]);

  const handleAccountEntry = useCallback(() => {
    onNavigateAccount?.();
    setOpen(false);
  }, [onNavigateAccount]);

  const atLimit = profiles.profiles.length >= 5;
  const displayName = activeEntry?.name ?? t('profile.default');
  const initial = displayName.charAt(0).toUpperCase();

  const isAvatar = variant === 'avatar';

  // Single trigger button that fills the wrapper so the entire bordered
  // .sidebarHeaderBox in Dashboard becomes the click target (no dead pixels
  // around a smaller inner control). The avatar variant is a self-contained
  // round person-icon button for the top bar instead.
  const triggerButton = isAvatar ? (
    <button
      type="button"
      className={styles.avatarTrigger}
      onClick={() => setOpen(o => !o)}
      aria-label={`${t('profile.label')}: ${displayName}`}
      aria-haspopup="menu"
      aria-expanded={open}
    >
      {accountAvatarUrl ? (
        <img className={styles.accountAvatarImg} src={accountAvatarUrl} alt="" />
      ) : accountInitial ? (
        <span className={styles.accountAvatarInitial}>{accountInitial}</span>
      ) : (
        <UserRound size={16} aria-hidden />
      )}
    </button>
  ) : (
    <button
      type="button"
      className={classNames(styles.trigger, { [styles.triggerCompact]: compact })}
      onClick={() => setOpen(o => !o)}
      aria-label={`${t('profile.label')}: ${displayName}`}
    >
      {compact ? (
        <span className={styles.letterCircle}>{initial}</span>
      ) : (
        <>
          <UserRound size={14} className={styles.triggerIcon} aria-hidden />
          <span className={styles.triggerName}>{displayName}</span>
          <ChevronDown size={14} className={classNames(styles.chevron, { [styles.chevronOpen]: open })} />
        </>
      )}
    </button>
  );

  return (
    <div className={classNames(styles.wrapper, {
      [styles.wrapperCompact]: compact,
      [styles.wrapperAvatar]: isAvatar,
    })} ref={ref}>
      {(compact || isAvatar) ? (
        <HoverTooltip body={displayName} side={isAvatar ? 'bottom' : 'right'}>
          {triggerButton}
        </HoverTooltip>
      ) : triggerButton}
      {open && (
        <div className={classNames(styles.dropdown, {
          [styles.compactDropdown]: compact,
          [styles.avatarDropdown]: isAvatar,
        })}>
          {onNavigateAccount && (
            <>
              <div className={styles.groupLabel}>{t('account.title')}</div>
              <div className={styles.accountSection}>
                <button
                  type="button"
                  className={styles.actionBtn}
                  onClick={handleAccountEntry}
                  aria-label={signedIn ? `${t('account.title')}: ${accountUsername}` : undefined}
                >
                  {signedIn ? (
                    <>
                      <span className={styles.accountEntryAvatar}>
                        {accountAvatarUrl ? (
                          <img className={styles.accountAvatarImg} src={accountAvatarUrl} alt="" />
                        ) : accountInitial ? (
                          <span className={styles.accountAvatarInitial}>{accountInitial}</span>
                        ) : (
                          <UserRound size={12} aria-hidden />
                        )}
                      </span>
                      <span className={styles.accountEntryName}>{accountUsername}</span>
                    </>
                  ) : (
                    <>
                      <LogIn size={14} aria-hidden /> {t('account.dropdown.logIn')}
                    </>
                  )}
                </button>
              </div>
              <MenuDivider />
            </>
          )}
          <div className={styles.groupLabel}>{t('profile.header')}</div>
          <div className={styles.profileList}>
            {profiles.profiles.map(p => (
              <button key={p.id} type="button"
                className={classNames(styles.profileItem, { [styles.profileActive]: p.id === profiles.activeId })}
                onClick={() => handleSwitch(p.id)}>
                <span className={styles.profileDot} />
                <span className={styles.profileName}>{p.name}</span>
              </button>
            ))}
          </div>
          <MenuDivider />
          <div className={styles.actions}>
            <button type="button" className={styles.actionBtn} onClick={handleCreate} disabled={atLimit}>
              <Plus size={14} /> {t('profile.create')}
            </button>
            <MenuDivider />
            <button type="button" className={styles.actionBtn} onClick={handleManage}>
              <UsersRound size={14} /> {t('profile.manage')}
            </button>
          </div>
        </div>
      )}
      <PromptModal
        open={createOpen}
        title={t('profile.create')}
        message={t('profile.createPrompt')}
        maxLength={20}
        validate={validateNewName}
        onConfirm={handleCreateConfirm}
        onCancel={() => setCreateOpen(false)}
      />
    </div>
  );
}
