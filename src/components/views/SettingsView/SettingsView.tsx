import { useCallback, useMemo } from 'react';
import { ServiceRequired } from '../ServiceRequired';
import { GenericSkeleton } from '../PageSkeleton/PageSkeleton';
import type { ConnectionState } from '../../../hooks/useServiceStatus';
import { useUiSettings } from '../../../hooks/useUiSettings';
import type { NexusSettings } from '../../../lib/settings';
import { GeneralTab } from './GeneralTab';
import styles from './SettingsView.module.scss';

interface SettingsViewProps {
  serviceOnline: boolean;
  connectionState?: ConnectionState;
  platform: string;
}

// Settings is a single scroller of SettingsSection groups - no top tabs.
// Profiles live on their own page (the top-bar profile menu) and the developer
// Dev Tools page hangs off the top-bar "..." menu; neither is a Settings tab.
export function SettingsView({ serviceOnline, connectionState, platform }: SettingsViewProps) {
  // All server persistence + local mirror + theme/accent application goes
  // through this hook. No fetchPreferences/savePreferences in this file.
  const { settings: ui, update: updateUi } = useUiSettings();

  // View the unified settings through the legacy `NexusSettings` shape so
  // GeneralTab doesn't need its own rewrite.
  const settings = useMemo<NexusSettings>(() => ({
    general: {
      language: ui.language,
      themeMode: ui.themeMode,
      accentColor: ui.accentColor,
      backgroundMode: ui.backgroundMode,
      accentSource: ui.accentSource,
      startOnLogin: ui.startOnLogin,
      showConflictAlerts: ui.showConflictAlerts,
      monitoringDetailedCollapsed: ui.monitoringDetailedCollapsed,
      monitoringEventsEnabled: ui.monitoringEventsEnabled,
      monitoringEventKindsHidden: ui.monitoringEventKindsHidden,
      showMacStatusBarIcon: ui.showMacStatusBarIcon,
      showWindowsTrayIcon: ui.showWindowsTrayIcon,
      pinnedSidebarApps: ui.pinnedSidebarApps,
      recentSidebarApps: ui.recentSidebarApps,
      widgetAdvancedMode: ui.widgetAdvancedMode,
      monitoringTempUnit: ui.monitoringTempUnit,
      timeFormat: ui.timeFormat,
      numberFormat: ui.numberFormat,
      updateMode: ui.updateMode,
      updateChannel: ui.updateChannel,
      lastDismissedUpdateVersion: ui.lastDismissedUpdateVersion,
    },
  }), [ui]);

  const updateGeneral = useCallback((patch: Partial<NexusSettings['general']>) => {
    updateUi(patch);
  }, [updateUi]);

  // When the local service isn't detected, show the ServiceRequired overlay
  // instead of controls that can't persist.
  if (!serviceOnline) {
    return (
      <div className={styles.settings}>
        <ServiceRequired state={connectionState} skeleton={<GenericSkeleton />} />
      </div>
    );
  }

  return (
    <div className={styles.settings}>
      <div className={`${styles.tabContent} pageBody`}>
        <GeneralTab settings={settings} updateGeneral={updateGeneral} serviceOnline={serviceOnline} platform={platform} />
      </div>
    </div>
  );
}
