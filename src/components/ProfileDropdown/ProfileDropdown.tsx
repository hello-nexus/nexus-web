import { useCallback, useRef, useState } from 'react';
import { ChevronDown, Plus, Download, Upload, Settings, UserRound } from 'lucide-react';
import classNames from 'classnames';
import { useTranslation } from '../../lib/i18n';
import { useClickOutside } from '../../hooks/useClickOutside';
import { PRESET_ACCENTS, loadSettings } from '../../lib/settings';
import type { UseProfilesResult } from '../../hooks/useProfiles';
import type { UiSettings } from '../../api/profiles';
import { savePreferences } from '../../api/profiles';
import { PromptDialog } from '../PromptDialog/PromptDialog';
import styles from './ProfileDropdown.module.scss';

interface ProfileDropdownProps {
  profiles: UseProfilesResult;
  onPreferencesChanged: (ui: UiSettings) => void;
  onNavigateSettings: () => void;
  compact?: boolean;
}

export function ProfileDropdown({ profiles, onPreferencesChanged, onNavigateSettings, compact = false }: ProfileDropdownProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useClickOutside(ref, () => setOpen(false), open);

  const activeEntry = profiles.profiles.find(p => p.id === profiles.activeId);

  const handleSwitch = useCallback((id: string) => {
    if (id === profiles.activeId) return;
    // Close the dropdown immediately - the optimistic update inside
    // switchProfile already flips the active highlight, so awaiting here
    // would just delay the dismissal.
    setOpen(false);
    profiles.switchProfile(id).then(ui => {
      if (ui) onPreferencesChanged(ui);
    });
  }, [profiles, onPreferencesChanged]);

  const handleCreate = useCallback(() => {
    setCreateOpen(true);
    setOpen(false);
  }, []);

  const handleCreateConfirm = useCallback(async (rawName: string) => {
    const name = rawName.trim().slice(0, 20);
    if (!name) return;
    setCreateOpen(false);

    const currentAccent = loadSettings().general.accentColor;
    const others = PRESET_ACCENTS.filter(c => c !== currentAccent);
    const newAccent = others[Math.floor(Math.random() * others.length)];

    await profiles.createProfile(name);
    const updated = profiles.profiles;
    const created = updated[updated.length - 1];
    if (created) {
      const ui = await profiles.switchProfile(created.id);
      await savePreferences({ accentColor: newAccent });
      if (ui) onPreferencesChanged({ ...ui, accentColor: newAccent });
    }
  }, [profiles, onPreferencesChanged]);

  const validateNewName = useCallback((raw: string): string | null => {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const dupe = profiles.profiles.some(p => p.name.toLowerCase() === trimmed.toLowerCase());
    return dupe ? t('profile.duplicateName') : null;
  }, [profiles.profiles, t]);

  const handleExport = useCallback(async () => {
    await profiles.exportProfile(profiles.activeId);
  }, [profiles]);

  const handleImport = useCallback(() => {
    fileRef.current?.click();
  }, []);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await profiles.importProfile(file);
    e.target.value = '';
  }, [profiles]);

  const handleManage = useCallback(() => {
    onNavigateSettings();
    setOpen(false);
  }, [onNavigateSettings]);

  const atLimit = profiles.profiles.length >= 5;
  const displayName = activeEntry?.name ?? t('profile.default');
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <div className={classNames(styles.wrapper, { [styles.wrapperCompact]: compact })} ref={ref}>
      {compact ? (
        <button
          type="button"
          className={styles.letterCircle}
          onClick={() => setOpen(o => !o)}
          title={`${t('profile.label')}: ${displayName}`}
        >
          {initial}
        </button>
      ) : (
        <button
          type="button"
          className={styles.trigger}
          onClick={() => setOpen(o => !o)}
          aria-label={`${t('profile.label')}: ${displayName}`}
        >
          <UserRound size={14} className={styles.triggerIcon} aria-hidden />
          <span className={styles.triggerName}>{displayName}</span>
          <ChevronDown size={14} className={classNames(styles.chevron, { [styles.chevronOpen]: open })} />
        </button>
      )}
      {open && (
        <div className={classNames(styles.dropdown, { [styles.compactDropdown]: compact })}>
          <div className={styles.dropdownHeader}>{t('profile.header')}</div>
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
          <div className={styles.actions}>
            <button type="button" className={styles.actionBtn} onClick={handleCreate} disabled={atLimit}>
              <Plus size={14} /> {t('profile.create')}
            </button>
            <button type="button" className={styles.actionBtn} onClick={handleImport} disabled={atLimit}>
              <Download size={14} /> {t('profile.import')}
            </button>
            <button type="button" className={styles.actionBtn} onClick={handleExport}>
              <Upload size={14} /> {t('profile.export')}
            </button>
            <div className={styles.actionSep} />
            <button type="button" className={styles.actionBtn} onClick={handleManage}>
              <Settings size={14} /> {t('profile.manage')}
            </button>
          </div>
          <input ref={fileRef} type="file" accept=".json" className={styles.hiddenInput} onChange={handleFileChange} />
        </div>
      )}
      <PromptDialog
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
