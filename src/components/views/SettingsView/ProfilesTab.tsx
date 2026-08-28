import { useCallback, useMemo, useRef, useState } from 'react';
import { Anchor, Download, Plus, RotateCcw, Trash2, Upload } from 'lucide-react';
import { Button } from '../../common/Button/Button';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { EditableText } from '../../common/Editable/EditableText';
import { ConfirmModal } from '../../common/ConfirmModal/ConfirmModal';
import { HoverTooltip } from '../../common/HoverTooltip/HoverTooltip';
import { PromptModal } from '../../common/PromptModal/PromptModal';
import { SortableList } from '../../common/SortableList/SortableList';
import { exportProfile, type Preferences, type ProfileCategory } from '../../../api/profiles';
import { useProfileSharing, type UseProfilesResult } from '../../../hooks/useProfiles';
import { isProfileNameTaken } from '../../../hooks/profileNameUtils';
import { useTranslation } from '../../../lib/i18n';
import { SharingSection } from './SharingSection';
import { CloudProfilesSection } from './CloudProfilesSection';
import styles from './SettingsView.module.scss';

type ConfirmKind =
  | { kind: 'delete'; profileId: string; name: string }
  | { kind: 'resetProfile'; profileId: string; name: string }
  | { kind: 'resetCategory'; profileId: string; category: ProfileCategory; shared: boolean }
  | { kind: 'shareCategory'; category: ProfileCategory; primaryName: string }
  | { kind: 'replaceImport'; file: File };

export function ProfilesTab({ profiles, onPreferencesChanged }: { profiles: UseProfilesResult; onPreferencesChanged: (prefs: Preferences) => void }) {
  const { t } = useTranslation();
  const sharing = useProfileSharing(true);
  const [confirmTarget, setConfirmTarget] = useState<ConfirmKind | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [renameError, setRenameError] = useState<{ profileId: string; message: string } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const switchingRef = useRef(false);
  // Per-profile attempt counter so a stale rename response (superseded by a
  // second rename on the same row before the first round-trip resolves)
  // can't redisplay a collision error over a state that already succeeded.
  const renameSeqRef = useRef<Record<string, number>>({});

  const handleSwitch = (id: string) => {
    if (switchingRef.current) return;
    switchingRef.current = true;
    // Don't await - the active state flips once switchProfile's server
    // round-trip resolves, but the click handler doesn't need to block on it.
    profiles.switchProfile(id).then(ui => {
      switchingRef.current = false;
      if (ui) onPreferencesChanged(ui);
      // Primary badge follows whatever profile is active; refresh once the
      // switch has actually landed server-side.
      sharing.refresh();
    });
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setImportError(null);
    const result = await profiles.importProfile(file);
    if (result.body?.msg === 'profile_name_taken') {
      setConfirmTarget({ kind: 'replaceImport', file });
    }
  };

  const atLimit = profiles.profiles.length >= 5;

  const primaryId = sharing.config?.primaryProfileId ?? profiles.activeId;
  const sharedCats = useMemo(() => sharing.config?.sharedCategories ?? [], [sharing.config]);
  const counts = useMemo(() => sharing.config?.counts ?? {}, [sharing.config]);
  const onlyOneProfile = profiles.profiles.length <= 1;

  const handleConfirm = useCallback(async () => {
    if (!confirmTarget) return;
    const target = confirmTarget;
    setConfirmTarget(null);
    if (target.kind === 'delete') {
      await profiles.deleteProfile(target.profileId);
      await sharing.refresh();
    } else if (target.kind === 'resetProfile') {
      await sharing.resetProfile(target.profileId);
      await profiles.refresh();
    } else if (target.kind === 'resetCategory') {
      await sharing.resetCategory(target.profileId, target.category);
      await profiles.refresh();
    } else if (target.kind === 'shareCategory') {
      await sharing.setCategoryShared(target.category, true);
    } else if (target.kind === 'replaceImport') {
      const result = await profiles.importProfile(target.file, true);
      if (result.body?.msg === 'profile_name_taken') {
        setImportError(t('profile.importDuplicateName'));
      }
    }
  }, [confirmTarget, profiles, sharing, t]);

  const confirmCopy = useMemo(() => {
    if (!confirmTarget) return null;
    if (confirmTarget.kind === 'delete') {
      return {
        title: t('profile.deleteConfirmTitle'),
        message: t('profile.deleteConfirm'),
        note: undefined,
        confirmLabel: t('profile.delete'),
        destructive: true,
      };
    }
    if (confirmTarget.kind === 'resetProfile') {
      const sharedNames = sharedCats.length > 0
        ? sharedCats.map(c => t(`settings.profiles.sharing.cat.${c}.label`)).join(', ')
        : '';
      return {
        title: t('settings.profiles.reset.profileTitle', { name: confirmTarget.name }),
        message: t('settings.profiles.reset.profileMessage', { name: confirmTarget.name }),
        note: sharedCats.length > 0
          ? t('settings.profiles.reset.sharedUntouched', { categories: sharedNames })
          : undefined,
        confirmLabel: t('settings.profiles.reset.action'),
        destructive: true,
      };
    }
    if (confirmTarget.kind === 'shareCategory') {
      const catLabel = t(`settings.profiles.sharing.cat.${confirmTarget.category}.label`);
      return {
        title: t('settings.profiles.sharing.shareConfirmTitle', { category: catLabel }),
        message: t('settings.profiles.sharing.shareConfirmMessage', {
          category: catLabel,
          primary: confirmTarget.primaryName,
        }),
        note: undefined,
        confirmLabel: t('settings.profiles.sharing.shareConfirmAction'),
        destructive: true,
      };
    }
    if (confirmTarget.kind === 'replaceImport') {
      return {
        title: t('profile.importReplaceTitle'),
        message: t('profile.importReplaceMessage'),
        note: undefined,
        confirmLabel: t('profile.importReplaceAction'),
        destructive: true,
      };
    }
    // resetCategory
    const catLabel = t(`settings.profiles.sharing.cat.${confirmTarget.category}.label`);
    return {
      title: t('settings.profiles.reset.categoryTitle', { category: catLabel }),
      message: confirmTarget.shared
        ? t('settings.profiles.reset.categorySharedMessage', { category: catLabel })
        : t('settings.profiles.reset.categoryPerProfileMessage', { category: catLabel }),
      confirmLabel: t('settings.profiles.reset.action'),
      destructive: true,
    };
  }, [confirmTarget, sharedCats, t]);

  return (
    <div className={styles.tabPanel}>
      <SettingsSection
        title={t('settings.tab.profiles')}
        description={t('settings.profiles.description')}
      >
      {profiles.profiles.length === 0 ? (
        <p className={styles.note} data-settings-aside="true">{t('settings.profiles.noProfiles')}</p>
      ) : (
        <SortableList
          className={styles.profileList}
          ariaLabel={t('settings.tab.profiles')}
          ids={profiles.profiles.map(p => p.id)}
          onReorder={ids => profiles.reorderProfiles(ids)}
          renderRow={(id, a) => {
            const p = profiles.profiles.find(x => x.id === id);
            if (!p) return null;
            const isActive = p.id === profiles.activeId;
            const isPrimary = p.id === primaryId;
            return (
              <div
                ref={a.ref}
                role="listitem"
                style={a.style}
                {...a.attributes}
                {...a.listeners}
                className={`${styles.profileCard} ${isActive ? styles.profileCardActive : ''} ${a.isDragging ? a.placeholderClassName : ''}`}
                onClick={() => { if (!isActive) handleSwitch(p.id); }}
              >
                <div className={styles.profileInfo}>
                  {/* data-no-dnd: clicking the name edits it, never starts a drag. */}
                  <span data-no-dnd>
                    <EditableText
                      value={p.name}
                      onCommit={name => {
                        const trimmed = name.trim();
                        if (!trimmed || trimmed === p.name) {
                          if (renameError?.profileId === p.id) setRenameError(null);
                          return;
                        }
                        if (isProfileNameTaken(profiles.profiles, trimmed, p.id)) {
                          setRenameError({ profileId: p.id, message: t('profile.duplicateName') });
                          return;
                        }
                        setRenameError(null);
                        const seq = (renameSeqRef.current[p.id] ?? 0) + 1;
                        renameSeqRef.current[p.id] = seq;
                        profiles.renameProfile(p.id, trimmed).then(result => {
                          if (renameSeqRef.current[p.id] !== seq) return; // superseded by a later rename
                          if (result.body?.msg === 'profile_name_taken') {
                            setRenameError({ profileId: p.id, message: t('profile.duplicateName') });
                          }
                        });
                      }}
                      className={styles.profileName}
                      ariaLabel={t('profile.rename')}
                    />
                  </span>
                  {renameError?.profileId === p.id && (
                    <p
                      className={styles.profileRenameError}
                      role="alert"
                      aria-live="polite"
                    >
                      {renameError.message}
                    </p>
                  )}
                  {isActive && (
                    <span className={styles.profileBadge}>{t('settings.profiles.active')}</span>
                  )}
                </div>
                <div className={styles.profileActions} data-no-dnd onClick={(e) => e.stopPropagation()}>
                  {isPrimary ? (
                    <HoverTooltip body={t('settings.profiles.sharing.primaryBadgeTooltip')} side="top">
                      <span className={styles.profileBadgePrimary}>
                        <Anchor size={11} />
                        {t('settings.profiles.sharing.primary')}
                      </span>
                    </HoverTooltip>
                  ) : (
                    <Button
                      type="button"
                      tone="ghost"
                      size="sm"
                      icon={<Anchor />}
                      onClick={() => sharing.setPrimary(p.id)}
                      title={t('settings.profiles.sharing.makePrimary')}
                      aria-label={t('settings.profiles.sharing.makePrimary')}
                    />
                  )}
                  <Button
                    type="button"
                    tone="ghost"
                    size="sm"
                    icon={<RotateCcw />}
                    onClick={() => setConfirmTarget({ kind: 'resetProfile', profileId: p.id, name: p.name })}
                    title={t('settings.profiles.reset.profile')}
                    aria-label={t('settings.profiles.reset.profile')}
                  />
                  <Button
                    type="button"
                    tone="ghost"
                    size="sm"
                    icon={<Upload />}
                    onClick={() => exportProfile(p.id, p.name)}
                    title={t('profile.export')}
                    aria-label={t('profile.export')}
                  />
                  {profiles.profiles.length > 1 && !isActive && (
                    <Button
                      type="button"
                      tone="ghost"
                      size="sm"
                      icon={<Trash2 />}
                      onClick={() => setConfirmTarget({ kind: 'delete', profileId: p.id, name: p.name })}
                      title={isPrimary ? t('settings.profiles.sharing.deletePrimaryDisabled') : t('profile.delete')}
                      aria-label={isPrimary ? t('settings.profiles.sharing.deletePrimaryDisabled') : t('profile.delete')}
                      disabled={isPrimary}
                    />
                  )}
                </div>
              </div>
            );
          }}
        />
      )}

      <div className={styles.profileButtons} data-settings-aside="true">
        <Button
          type="button"
          tone="neutral"
          size="sm"
          icon={<Plus />}
          onClick={() => setCreateOpen(true)}
          disabled={atLimit}
        >
          {t('profile.create')}
        </Button>
        <Button
          type="button"
          tone="neutral"
          size="sm"
          icon={<Download />}
          onClick={() => fileRef.current?.click()}
          disabled={atLimit}
        >
          {t('profile.import')}
        </Button>
        <input ref={fileRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImport} />
      </div>
      {atLimit && <p className={styles.note} data-settings-aside="true">{t('profile.maxReached')}</p>}
      {importError && <p className={styles.profileImportError} role="alert" data-settings-aside="true">{importError}</p>}
      </SettingsSection>

      <PromptModal
        open={createOpen}
        title={t('profile.create')}
        message={t('profile.createPrompt')}
        maxLength={20}
        validate={raw => {
          const trimmed = raw.trim();
          if (!trimmed) return null;
          return isProfileNameTaken(profiles.profiles, trimmed) ? t('profile.duplicateName') : null;
        }}
        onConfirm={async raw => {
          const trimmed = raw.trim().slice(0, 20);
          if (!trimmed) return;
          const result = await profiles.createProfile(trimmed);
          if (result.body?.msg === 'profile_name_taken') {
            return t('profile.duplicateName');
          }
          setCreateOpen(false);
        }}
        onCancel={() => setCreateOpen(false)}
      />

      <CloudProfilesSection profiles={profiles} />

      <SharingSection
        profiles={profiles}
        sharing={sharing}
        primaryId={primaryId}
        sharedCats={sharedCats}
        counts={counts}
        onlyOneProfile={onlyOneProfile}
        onResetCategory={(profileId, category, shared) =>
          setConfirmTarget({ kind: 'resetCategory', profileId, category, shared })
        }
        onShareCategory={(category) => {
          const primaryProfile = profiles.profiles.find(pp => pp.id === primaryId);
          setConfirmTarget({ kind: 'shareCategory', category, primaryName: primaryProfile?.name ?? '' });
        }}
      />

      {confirmTarget && confirmCopy && (
        <ConfirmModal
          open
          title={confirmCopy.title}
          message={confirmCopy.message}
          note={confirmCopy.note}
          confirmLabel={confirmCopy.confirmLabel}
          destructive={confirmCopy.destructive}
          onConfirm={handleConfirm}
          onCancel={() => setConfirmTarget(null)}
        />
      )}
    </div>
  );
}
