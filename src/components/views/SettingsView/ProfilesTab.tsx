import { useCallback, useMemo, useRef, useState } from 'react';
import { Anchor, Download, RotateCcw, Trash2, Upload } from 'lucide-react';
import { Button } from '../../common/Button/Button';
import { EditableText } from '../../common/Editable/EditableText';
import { ConfirmModal } from '../../common/ConfirmModal/ConfirmModal';
import { HoverTooltip } from '../../common/HoverTooltip/HoverTooltip';
import { PromptModal } from '../../common/PromptModal/PromptModal';
import { exportProfile, type Preferences, type ProfileCategory } from '../../../api/profiles';
import { useProfileSharing, type UseProfilesResult } from '../../../hooks/useProfiles';
import { useTranslation } from '../../../lib/i18n';
import { SharingSection } from './SharingSection';
import styles from './SettingsView.module.scss';

type ConfirmKind =
  | { kind: 'delete'; profileId: string; name: string }
  | { kind: 'resetProfile'; profileId: string; name: string }
  | { kind: 'resetCategory'; profileId: string; category: ProfileCategory; shared: boolean }
  | { kind: 'shareCategory'; category: ProfileCategory; primaryName: string };

export function ProfilesTab({ profiles, onPreferencesChanged }: { profiles: UseProfilesResult; onPreferencesChanged: (prefs: Preferences) => void }) {
  const { t } = useTranslation();
  const sharing = useProfileSharing(true);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<ConfirmKind | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [renameError, setRenameError] = useState<{ profileId: string; message: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Match the cooling FanCard / CurveEditor drag pattern: the whole card is
  // draggable, but if mousedown lands on an interactive child (action button,
  // EditableText name span) we toggle the host's draggable=false at capture
  // time so HTML5 drag never initiates and the child keeps the pointer.
  const profileInteractiveSelector = 'button, [role="button"], input';

  const handleSwitch = (id: string) => {
    // switchProfile flips the active state optimistically inside the hook,
    // so this returns control synchronously - awaiting would just delay
    // the visual update by the round-trip.
    profiles.switchProfile(id).then(ui => {
      if (ui) onPreferencesChanged(ui);
    });
    // Primary badge follows whatever profile is active; refresh in the
    // background, do not block the click.
    sharing.refresh();
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await profiles.importProfile(file);
    e.target.value = '';
  };

  const atLimit = profiles.profiles.length >= 5;

  const primaryId = sharing.config?.primaryProfileId ?? profiles.activeId;
  const sharedCats = sharing.config?.sharedCategories ?? [];
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
    }
  }, [confirmTarget, profiles, sharing]);

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
  }, [confirmTarget, sharing.config, sharedCats, t]);

  return (
    <div className={styles.tabPanel}>
      <p className={styles.note}>{t('settings.profiles.description')}</p>

      {profiles.profiles.length === 0 ? (
        <p className={styles.note}>{t('settings.profiles.noProfiles')}</p>
      ) : (
        <div className={styles.profileList}>
          {profiles.profiles.map(p => {
            const isActive = p.id === profiles.activeId;
            const isPrimary = p.id === primaryId;
            return (
              <div
                key={p.id}
                className={`${styles.profileCard} ${isActive ? styles.profileCardActive : ''} ${dragOverId === p.id ? styles.profileCardDragOver : ''}`}
                draggable
                onMouseDownCapture={(e) => {
                  // Mirrors FanCard: flip the host's draggable to false
                  // BEFORE the browser starts drag tracking when the
                  // pointer lands on an interactive child. The child's
                  // own click handler then runs unobstructed.
                  const target = e.target as HTMLElement;
                  const interactive = !!target.closest(profileInteractiveSelector);
                  e.currentTarget.draggable = !interactive;
                }}
                onDragStart={(e) => {
                  // Belt + suspenders gate matching FanCard - cancels any
                  // drag whose source is an interactive child even if the
                  // capture-phase toggle didn't catch it.
                  const target = e.target as HTMLElement;
                  if (target.closest(profileInteractiveSelector)) {
                    e.preventDefault();
                    return;
                  }
                  setDragId(p.id);
                }}
                onDragOver={(e) => { e.preventDefault(); setDragOverId(p.id); }}
                onDragLeave={() => setDragOverId(null)}
                onDrop={() => {
                  if (dragId && dragId !== p.id) {
                    const ids = profiles.profiles.map(x => x.id);
                    const fromIdx = ids.indexOf(dragId);
                    const toIdx = ids.indexOf(p.id);
                    ids.splice(fromIdx, 1);
                    ids.splice(toIdx, 0, dragId);
                    profiles.reorderProfiles(ids);
                  }
                  setDragId(null);
                  setDragOverId(null);
                }}
                onDragEnd={() => { setDragId(null); setDragOverId(null); }}
                onClick={() => {
                  if (!isActive) handleSwitch(p.id);
                }}
              >
                <div className={styles.profileInfo}>
                  <EditableText
                    value={p.name}
                    onCommit={name => {
                      const trimmed = name.trim();
                      if (!trimmed || trimmed === p.name) {
                        if (renameError?.profileId === p.id) setRenameError(null);
                        return;
                      }
                      const dupe = profiles.profiles.some(pp => pp.id !== p.id && pp.name.toLowerCase() === trimmed.toLowerCase());
                      if (dupe) {
                        setRenameError({ profileId: p.id, message: t('profile.duplicateName') });
                        return;
                      }
                      setRenameError(null);
                      profiles.renameProfile(p.id, trimmed);
                    }}
                    className={styles.profileName}
                    ariaLabel={t('profile.rename')}
                  />
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
                <div className={styles.profileActions} onClick={(e) => e.stopPropagation()}>
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
          })}
        </div>
      )}

      <div className={styles.profileButtons}>
        <Button
          type="button"
          tone="neutral"
          size="sm"
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
      {atLimit && <p className={styles.note}>{t('profile.maxReached')}</p>}

      <PromptModal
        open={createOpen}
        title={t('profile.create')}
        message={t('profile.createPrompt')}
        maxLength={20}
        validate={raw => {
          const trimmed = raw.trim();
          if (!trimmed) return null;
          const dupe = profiles.profiles.some(pp => pp.name.toLowerCase() === trimmed.toLowerCase());
          return dupe ? t('profile.duplicateName') : null;
        }}
        onConfirm={async raw => {
          const trimmed = raw.trim().slice(0, 20);
          if (!trimmed) return;
          setCreateOpen(false);
          await profiles.createProfile(trimmed);
        }}
        onCancel={() => setCreateOpen(false)}
      />

      <SharingSection
        profiles={profiles}
        sharing={sharing}
        primaryId={primaryId}
        sharedCats={sharedCats}
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
