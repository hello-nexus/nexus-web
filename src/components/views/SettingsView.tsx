import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Trash2, Download, Upload, RotateCcw, Anchor } from 'lucide-react';
import { ViewHeader } from '../ViewHeader/ViewHeader';
import { Button } from '../Button/Button';
import { EditableText } from '../Editable/EditableText';
import { ColorPickerWithPresets } from '../ColorPickerWithPresets/ColorPickerWithPresets';
import { Toggle } from '../Toggle/Toggle';
import { Select } from '../Select/Select';
import { ConfirmDialog } from '../ConfirmDialog/ConfirmDialog';
import { fetchService, postService } from '../../api/service';
import { ScreenTimeDataControl } from './ScreenTimeBrowse/ScreenTimeDataControl';
import { ServiceRequired } from './ServiceRequired';
import { GenericSkeleton } from './PageSkeleton/PageSkeleton';
import type { ConnectionState } from '../../hooks/useServiceStatus';
import { useProfileSharing, type UseProfilesResult } from '../../hooks/useProfiles';
import { exportProfile, PROFILE_CATEGORIES, type UiSettings, type ProfileCategory } from '../../api/profiles';
import { useTranslation } from '../../lib/i18n';
import { useUiSettings } from '../../hooks/useUiSettings';
import {
  type QosSettings,
  type Language,
  type ThemeMode,
  applyThemeMode,
  applyAccentColor,
  watchSystemTheme,
  LANGUAGES,
  LANGUAGE_LABELS,
  LANGUAGE_FLAGS,
  THEME_MODES,
  PRESET_ACCENTS,
} from '../../lib/settings';
import styles from './SettingsView.module.scss';

type SettingsTab = 'general' | 'theme' | 'profiles';
const VALID_TABS: SettingsTab[] = ['general', 'theme', 'profiles'];

interface SettingsViewProps {
  serviceOnline: boolean;
  connectionState?: ConnectionState;
  platform: string;
  tab: string | null;
  onTabChange: (tab: string) => void;
  profiles: UseProfilesResult;
}

export function SettingsView({ serviceOnline, connectionState, platform, tab: urlTab, onTabChange, profiles: profilesHook }: SettingsViewProps) {
  const { t } = useTranslation();

  // All server persistence + local mirror + theme/accent application goes
  // through this hook now. No fetchPreferences/savePreferences in this file.
  const { settings: ui, update: updateUi } = useUiSettings();

  const onPreferencesChanged = useCallback((_ui: UiSettings) => {
    // Kept for ProfilesTab compatibility. The UiSettingsProvider already
    // reloads + re-applies theme/accent/language on profile switch, so this
    // callback is effectively a no-op -- retained to avoid rewiring the
    // ProfilesTab prop chain in the same PR.
  }, []);

  const tab: SettingsTab = urlTab && VALID_TABS.includes(urlTab as SettingsTab)
    ? urlTab as SettingsTab : 'general';

  // View the unified settings through the legacy `QosSettings` shape so
  // the GeneralTab / ThemeTab components don't need their own rewrite in this
  // pass.
  const settings = useMemo<QosSettings>(() => ({
    general: {
      language: ui.language,
      themeMode: ui.themeMode,
      accentColor: ui.accentColor,
      startOnLogin: ui.startOnLogin,
      disableConflictAlerts: ui.disableConflictAlerts,
      monitoringShowAverage: ui.monitoringShowAverage,
      monitoringDetailedCollapsed: ui.monitoringDetailedCollapsed,
      showMacStatusBarIcon: ui.showMacStatusBarIcon,
      showWindowsTrayIcon: ui.showWindowsTrayIcon,
    },
  }), [ui]);

  const tabs = [
    { key: 'general', label: t('settings.general') },
    { key: 'theme', label: t('settings.theme') },
    { key: 'profiles', label: t('settings.tab.profiles') },
  ];

  const updateGeneral = useCallback((patch: Partial<QosSettings['general']>) => {
    updateUi(patch);
  }, [updateUi]);

  // Match every other primary view: when the local service isn't detected
  // the page shows the ServiceRequired overlay (Launch / download / Safari
  // note) instead of controls that silently can't persist. Tabs on the
  // header stay visible but disabled so the user knows where they'd land
  // once the service is up.
  if (!serviceOnline) {
    return (
      <div className={styles.settings}>
        <ViewHeader title={t('settings.title')} tabs={tabs} activeTab={tab} onTabChange={onTabChange} tabsDisabled />
        <ServiceRequired state={connectionState} skeleton={<GenericSkeleton />} />
      </div>
    );
  }

  const renderTab = () => {
    switch (tab) {
      case 'general':
        return <GeneralTab settings={settings} updateGeneral={updateGeneral} serviceOnline={serviceOnline} platform={platform} />;
      case 'theme':
        return <ThemeTab settings={settings} updateGeneral={updateGeneral} />;
      case 'profiles':
        return <ProfilesTab profiles={profilesHook} onPreferencesChanged={onPreferencesChanged} />;
      default:
        return null;
    }
  };

  return (
    <div className={styles.settings}>
      <ViewHeader title={t('settings.title')} tabs={tabs} activeTab={tab} onTabChange={onTabChange} />
      <div className={styles.tabContent}>
        {renderTab()}
      </div>
    </div>
  );
}

// ── General Tab ──────────────────────────────────────────────────────────────

interface GeneralTabProps {
  settings: QosSettings;
  updateGeneral: (patch: Partial<QosSettings['general']>) => void;
  serviceOnline: boolean;
  platform: string;
}

function GeneralTab({ settings, updateGeneral, serviceOnline, platform }: GeneralTabProps) {
  const { t } = useTranslation();
  const [autoStart, setAutoStart] = useState<boolean | null>(null);
  const [autoStartLoading, setAutoStartLoading] = useState(false);
  const [stopConfirmOpen, setStopConfirmOpen] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [screenTimeOpen, setScreenTimeOpen] = useState(false);

  // Hydrate "Start Qos at system startup" from the SCM-backed endpoint on
  // mount. The state is independent of the per-user "Show in tray" flag.
  useEffect(() => {
    if (!serviceOnline || platform !== 'windows') return;
    let cancelled = false;
    setAutoStartLoading(true);
    fetchService<{ autoStart: boolean }>('/service/startup-mode').then(data => {
      if (data && !cancelled) setAutoStart(data.autoStart);
    }).finally(() => {
      if (!cancelled) setAutoStartLoading(false);
    });
    return () => { cancelled = true; };
  }, [serviceOnline, platform]);

  const toggleAutoStart = async () => {
    if (autoStart === null) return;
    setAutoStartLoading(true);
    const resp = await postService<{ autoStart: boolean }>('/service/startup-mode', {
      autoStart: !autoStart,
    });
    if (resp) setAutoStart(resp.autoStart);
    setAutoStartLoading(false);
  };

  const shutDown = async () => {
    setStopping(true);
    await postService('/service/stop', {});
    setStopConfirmOpen(false);
    setStopping(false);
    window.close();
  };

  return (
    <div className={styles.tabPanel}>
      <SelectRow
        label={t('settings.language')}
        value={settings.general.language}
        options={LANGUAGES.map(l => ({ value: l, label: `${LANGUAGE_FLAGS[l]}  ${LANGUAGE_LABELS[l]}` }))}
        onChange={v => updateGeneral({ language: v as Language })}
      />

      {platform === 'windows' && autoStart !== null && (
        <ToggleRow
          label={t('settings.systemStartup.label')}
          description={t('settings.systemStartup.description')}
          checked={autoStart}
          onChange={toggleAutoStart}
          disabled={!serviceOnline || autoStartLoading}
        />
      )}

      <ToggleRow
        label={t('settings.alerts.label')}
        description={t('settings.alerts.description')}
        checked={settings.general.disableConflictAlerts}
        onChange={() => updateGeneral({ disableConflictAlerts: !settings.general.disableConflictAlerts })}
      />

      {platform === 'macos' && (
        <ToggleRow
          label={t('settings.macStatusBar.label')}
          description={t('settings.macStatusBar.description')}
          checked={settings.general.showMacStatusBarIcon}
          onChange={() => updateGeneral({ showMacStatusBarIcon: !settings.general.showMacStatusBarIcon })}
        />
      )}

      {platform === 'windows' && (
        <ToggleRow
          label={t('settings.windowsTray.label')}
          description={t('settings.windowsTray.description')}
          checked={settings.general.showWindowsTrayIcon}
          onChange={() => updateGeneral({ showWindowsTrayIcon: !settings.general.showWindowsTrayIcon })}
        />
      )}

      <div className={styles.row}>
        <div className={styles.rowInfo}>
          <span className={styles.rowLabel}>{t('settings.screentime.title')}</span>
          <span className={styles.rowDesc}>{t('settings.screentime.trackingDesc')}</span>
        </div>
        <Button
          type="button"
          tone="neutral"
          size="sm"
          onClick={() => setScreenTimeOpen(true)}
          disabled={!serviceOnline}
        >
          {t('settings.screentime.openButton')}
        </Button>
      </div>

      <div className={styles.row}>
        <div className={styles.rowInfo}>
          <span className={styles.rowLabel}>{t('settings.feedback')}</span>
        </div>
        <a
          className={styles.rowButton}
          href="https://github.com/nexusqos/qos-service/issues"
          target="_blank"
          rel="noopener noreferrer"
        >
          {t('settings.feedback.report')}
        </a>
      </div>

      {platform === 'windows' && (
        <div className={styles.row}>
          <div className={styles.rowInfo}>
            <span className={styles.rowLabel}>{t('settings.shutDown.label')}</span>
            <span className={styles.rowDesc}>{t('settings.shutDown.description')}</span>
          </div>
          <Button
            type="button"
            tone="danger"
            size="sm"
            onClick={() => setStopConfirmOpen(true)}
            disabled={!serviceOnline || stopping}
          >
            {t('settings.shutDown.button')}
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={stopConfirmOpen}
        title={t('settings.shutDown.confirmTitle')}
        message={t('settings.shutDown.confirmMessage')}
        confirmLabel={t('settings.shutDown.button')}
        destructive
        onConfirm={shutDown}
        onCancel={() => setStopConfirmOpen(false)}
      />

      <ScreenTimeDataControl
        open={screenTimeOpen}
        onClose={() => setScreenTimeOpen(false)}
        onChanged={() => { /* settings page doesn't need to refetch */ }}
      />
    </div>
  );
}

// ── Theme Tab ────────────────────────────────────────────────────────────────

interface ThemeTabProps {
  settings: QosSettings;
  updateGeneral: (patch: Partial<QosSettings['general']>) => void;
}

function ThemeTab({ settings, updateGeneral }: ThemeTabProps) {
  const { t } = useTranslation();
  const [liveAccent, setLiveAccent] = useState(settings.general.accentColor);

  useEffect(() => {
    setLiveAccent(settings.general.accentColor);
  }, [settings.general.accentColor]);

  const handleThemeChange = (mode: ThemeMode) => {
    updateGeneral({ themeMode: mode });
    applyThemeMode(mode);
    watchSystemTheme(mode);
  };

  const handleAccentPreview = (hex: string) => {
    setLiveAccent(hex);
    applyAccentColor(hex);
  };

  const handleAccentCommit = (hex: string) => {
    setLiveAccent(hex);
    updateGeneral({ accentColor: hex });
    applyAccentColor(hex);
  };

  return (
    <div className={styles.tabPanel}>
      <div className={styles.row}>
        <span className={styles.rowLabel}>{t('settings.theme')}</span>
        <div className={styles.themeOptions}>
          {THEME_MODES.map(mode => (
            <label key={mode} className={styles.themeOption}>
              <input
                type="radio"
                name="theme"
                value={mode}
                checked={settings.general.themeMode === mode}
                onChange={() => handleThemeChange(mode)}
                className={styles.themeRadio}
              />
              <span className={styles.themeLabel}>{t(`settings.theme.${mode}`)}</span>
            </label>
          ))}
        </div>
      </div>

      <div className={styles.accentSection}>
        <span className={styles.rowLabel}>{t('settings.accent')}</span>
        <ColorPickerWithPresets
          value={liveAccent}
          presets={PRESET_ACCENTS}
          onPreview={handleAccentPreview}
          onCommit={handleAccentCommit}
        />
      </div>
    </div>
  );
}

// ── Profiles Tab ────────────────────────────────────────────────────────────

type ConfirmKind =
  | { kind: 'delete'; profileId: string; name: string }
  | { kind: 'resetProfile'; profileId: string; name: string }
  | { kind: 'resetCategory'; profileId: string; category: ProfileCategory; shared: boolean }
  | { kind: 'shareCategory'; category: ProfileCategory; primaryName: string };

function ProfilesTab({ profiles, onPreferencesChanged }: { profiles: UseProfilesResult; onPreferencesChanged: (ui: UiSettings) => void }) {
  const { t } = useTranslation();
  const sharing = useProfileSharing(true);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<ConfirmKind | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Match the cooling FanCard / CurveEditor drag pattern: the whole card is
  // draggable, but if mousedown lands on an interactive child (action button,
  // EditableText name span) we toggle the host's draggable=false at capture
  // time so HTML5 drag never initiates and the child keeps the pointer.
  const profileInteractiveSelector = 'button, [role="button"], input';

  const handleSwitch = async (id: string) => {
    const ui = await profiles.switchProfile(id);
    if (ui) onPreferencesChanged(ui);
    // The new active profile may toggle the implicit Primary; refetch.
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
                      if (!trimmed || trimmed === p.name) return;
                      const dupe = profiles.profiles.some(pp => pp.id !== p.id && pp.name.toLowerCase() === trimmed.toLowerCase());
                      if (dupe) {
                        alert(t('profile.duplicateName'));
                        return;
                      }
                      profiles.renameProfile(p.id, trimmed);
                    }}
                    className={styles.profileName}
                    ariaLabel={t('profile.rename')}
                  />
                  {isActive && (
                    <span className={styles.profileBadge}>{t('settings.profiles.active')}</span>
                  )}
                </div>
                <div className={styles.profileActions} onClick={(e) => e.stopPropagation()}>
                  {isPrimary ? (
                    <span
                      className={styles.profileBadgePrimary}
                      title={t('settings.profiles.sharing.primaryBadgeTooltip')}
                    >
                      <Anchor size={11} />
                      {t('settings.profiles.sharing.primary')}
                    </span>
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
          onClick={() => {
            const name = prompt(t('profile.createPrompt'));
            const trimmed = name?.trim();
            if (!trimmed) return;
            const dupe = profiles.profiles.some(pp => pp.name.toLowerCase() === trimmed.toLowerCase());
            if (dupe) {
              alert(t('profile.duplicateName'));
              return;
            }
            profiles.createProfile(trimmed);
          }}
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
        <ConfirmDialog
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

interface SharingSectionProps {
  profiles: UseProfilesResult;
  sharing: ReturnType<typeof useProfileSharing>;
  primaryId: string;
  sharedCats: ProfileCategory[];
  onlyOneProfile: boolean;
  onResetCategory: (profileId: string, category: ProfileCategory, shared: boolean) => void;
  onShareCategory: (category: ProfileCategory) => void;
}

function SharingSection({ profiles, sharing, primaryId, sharedCats, onlyOneProfile, onResetCategory, onShareCategory }: SharingSectionProps) {
  const { t } = useTranslation();
  const primaryName = profiles.profiles.find(p => p.id === primaryId)?.name ?? '';

  return (
    <div className={styles.sharingSection}>
      <h3 className={styles.sharingHeading}>{t('settings.profiles.sharing.heading')}</h3>

      <p className={styles.sharingExplain}>
        {t('settings.profiles.sharing.explainV2', { primary: primaryName })}
      </p>

      <div className={styles.sharingCategories}>
        {PROFILE_CATEGORIES.map(category => {
          const isShared = sharedCats.includes(category);
          return (
            <div key={category} className={styles.sharingRow}>
              <div className={styles.rowInfo}>
                <span className={styles.rowLabel}>{t(`settings.profiles.sharing.cat.${category}.label`)}</span>
                <span className={styles.rowDesc}>{t(`settings.profiles.sharing.cat.${category}.desc`)}</span>
              </div>
              <div className={styles.sharingControls}>
                <div className={styles.segmented} role="radiogroup" aria-label={t(`settings.profiles.sharing.cat.${category}.label`)}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={!isShared}
                    className={`${styles.segmentedOption} ${!isShared ? styles.segmentedOptionActive : ''}`}
                    onClick={() => { if (isShared) sharing.setCategoryShared(category, false); }}
                    disabled={onlyOneProfile}
                  >
                    {t('settings.profiles.sharing.perProfile')}
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={isShared}
                    className={`${styles.segmentedOption} ${isShared ? styles.segmentedOptionActive : ''}`}
                    onClick={() => { if (!isShared) onShareCategory(category); }}
                    disabled={onlyOneProfile}
                  >
                    {t('settings.profiles.sharing.shared')}
                  </button>
                </div>
                <Button
                  type="button"
                  tone="ghost"
                  size="sm"
                  icon={<RotateCcw />}
                  onClick={() => onResetCategory(profiles.activeId, category, isShared)}
                  title={t('settings.profiles.reset.categoryTooltip')}
                  aria-label={t('settings.profiles.reset.categoryTooltip')}
                />
              </div>
            </div>
          );
        })}
      </div>

      {onlyOneProfile && (
        <p className={styles.note}>{t('settings.profiles.sharing.onlyOneProfile')}</p>
      )}
    </div>
  );
}

// ── Shared UI primitives ─────────────────────────────────────────────────────

interface ToggleRowProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}

function ToggleRow({ label, description, checked, onChange, disabled }: ToggleRowProps) {
  return (
    <label className={`${styles.row} ${disabled ? styles.disabled : ''}`}>
      <div className={styles.rowInfo}>
        <span className={styles.rowLabel}>{label}</span>
        {description && <span className={styles.rowDesc}>{description}</span>}
      </div>
      <Toggle checked={checked} onChange={onChange} disabled={disabled} ariaLabel={label} />
    </label>
  );
}

interface SelectRowProps {
  label?: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}

function SelectRow({ label, value, options, onChange }: SelectRowProps) {
  return (
    <div className={styles.row}>
      {label && <span className={styles.rowLabel}>{label}</span>}
      <Select value={value} onChange={onChange} options={options} ariaLabel={label} />
    </div>
  );
}
