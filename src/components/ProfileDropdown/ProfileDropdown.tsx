import { useCallback, useRef, useState } from 'react';
import { ChevronDown, Plus, Download, Upload, Settings } from 'lucide-react';
import classNames from 'classnames';
import { useTranslation } from '../../lib/i18n';
import { useClickOutside } from '../../hooks/useClickOutside';
import { PRESET_ACCENTS, loadSettings } from '../../lib/settings';
import type { UseProfilesResult } from '../../hooks/useProfiles';
import type { UiSettings } from '../../api/profiles';
import { savePreferences } from '../../api/profiles';
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
  const ref = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useClickOutside(ref, () => setOpen(false), open);

  const activeEntry = profiles.profiles.find(p => p.id === profiles.activeId);

  const handleSwitch = useCallback(async (id: string) => {
    if (id === profiles.activeId) return;
    const ui = await profiles.switchProfile(id);
    if (ui) onPreferencesChanged(ui);
    setOpen(false);
  }, [profiles, onPreferencesChanged]);

  const handleCreate = useCallback(async () => {
    const name = prompt(t('profile.createPrompt'));
    if (!name?.trim()) return;

    const currentAccent = loadSettings().general.accentColor;
    const others = PRESET_ACCENTS.filter(c => c !== currentAccent);
    const newAccent = others[Math.floor(Math.random() * others.length)];

    await profiles.createProfile(name.trim().slice(0, 20));
    const updated = profiles.profiles;
    const created = updated[updated.length - 1];
    if (created) {
      const ui = await profiles.switchProfile(created.id);
      await savePreferences({ accentColor: newAccent });
      if (ui) onPreferencesChanged({ ...ui, accentColor: newAccent });
    }
    setOpen(false);
  }, [profiles, t, onPreferencesChanged]);

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
        <button type="button" className={styles.trigger} onClick={() => setOpen(o => !o)}>
          <span className={styles.triggerPrefix}>{t('profile.label')}:</span>
          <span className={styles.triggerName}>{displayName}</span>
          <ChevronDown size={14} className={classNames(styles.chevron, { [styles.chevronOpen]: open })} />
        </button>
      )}
      {open && (
        <div className={classNames(styles.dropdown, { [styles.compactDropdown]: compact })}>
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
    </div>
  );
}
