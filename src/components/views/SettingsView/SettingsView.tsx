import { useCallback, useMemo } from 'react';
import { ViewHeader } from '../../common/ViewHeader/ViewHeader';
import { ServiceRequired } from '../ServiceRequired';
import { GenericSkeleton } from '../PageSkeleton/PageSkeleton';
import type { ConnectionState } from '../../../hooks/useServiceStatus';
import type { UseProfilesResult } from '../../../hooks/useProfiles';
import type { Preferences } from '../../../api/profiles';
import { useTranslation } from '../../../lib/i18n';
import { useUiSettings } from '../../../hooks/useUiSettings';
import type { NexusSettings } from '../../../lib/settings';
import { GeneralTab } from './GeneralTab';
import { ThemeTab } from './ThemeTab';
import { ProfilesTab } from './ProfilesTab';
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

  const onPreferencesChanged = useCallback((_prefs: Preferences) => {
    // Kept for ProfilesTab compatibility. The UiSettingsProvider already
    // reloads + re-applies theme/accent/language on profile switch, so this
    // callback is effectively a no-op -- retained to avoid rewiring the
    // ProfilesTab prop chain in the same PR.
  }, []);

  const tab: SettingsTab = urlTab && VALID_TABS.includes(urlTab as SettingsTab)
    ? urlTab as SettingsTab : 'general';

  // View the unified settings through the legacy `NexusSettings` shape so
  // the tab components don't need their own rewrite in this pass.
  const settings = useMemo<NexusSettings>(() => ({
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
      pinnedSidebarApps: ui.pinnedSidebarApps,
    },
  }), [ui]);

  const tabs = [
    { key: 'general', label: t('settings.general') },
    { key: 'theme', label: t('settings.theme') },
    { key: 'profiles', label: t('settings.tab.profiles') },
  ];

  const updateGeneral = useCallback((patch: Partial<NexusSettings['general']>) => {
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
