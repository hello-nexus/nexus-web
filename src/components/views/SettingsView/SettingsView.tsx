import { useCallback, useMemo, type ReactNode } from 'react';
import { Activity, Lightbulb, Palette, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { ServiceRequired } from '../ServiceRequired';
import { GenericSkeleton } from '../PageSkeleton/PageSkeleton';
import { ViewHeader } from '../../common/ViewHeader/ViewHeader';
import type { ConnectionState } from '../../../hooks/useServiceStatus';
import { useUiSettings } from '../../../hooks/useUiSettings';
import type { NexusSettings } from '../../../lib/settings';
import { useTranslation } from '../../../lib/i18n';
import { GeneralTab } from './GeneralTab';
import { AppearanceTab } from './AppearanceTab';
import { LightingCoolingTab } from './LightingCoolingTab';
import { MonitoringTab } from './MonitoringTab';
import { PrivacyTab } from './PrivacyTab';
import styles from './SettingsView.module.scss';

interface SettingsViewProps {
  serviceOnline: boolean;
  connectionState?: ConnectionState;
  platform: string;
  tab: string | null;
  onTabChange: (tab: string) => void;
}

export type SettingsTabKey = 'general' | 'appearance' | 'lighting-cooling' | 'monitoring' | 'privacy';

// Single source of truth for the settings tab strip - key, translated label,
// icon, and tab validity (isValidTab below) all derive from this list so they
// can never disagree about which tabs exist. Icon size matches the other tab
// bars in the app (RightPaneTabs).
const TAB_DEFS: readonly { key: SettingsTabKey; labelKey: string; icon: ReactNode }[] = [
  { key: 'general', labelKey: 'settings.general', icon: <SlidersHorizontal size={14} /> },
  { key: 'appearance', labelKey: 'settings.tab.appearance', icon: <Palette size={14} /> },
  { key: 'lighting-cooling', labelKey: 'settings.lightingCooling.title', icon: <Lightbulb size={14} /> },
  { key: 'monitoring', labelKey: 'settings.tab.monitoringDiagnostics', icon: <Activity size={14} /> },
  { key: 'privacy', labelKey: 'settings.tab.privacyData', icon: <ShieldCheck size={14} /> },
];

function isValidTab(key: string): key is SettingsTabKey {
  return TAB_DEFS.some(d => d.key === key);
}

// Profiles live on their own page (the top-bar profile menu) and the developer
// Dev Tools page hangs off the top-bar "..." menu; neither is a Settings tab.
export function SettingsView({ serviceOnline, connectionState, platform, tab: urlTab, onTabChange }: SettingsViewProps) {
  const { t } = useTranslation();
  // All server persistence + local mirror + theme/accent application goes
  // through this hook. No fetchPreferences/savePreferences in this file.
  const { settings: ui, update: updateUi } = useUiSettings();

  // View the unified settings through the legacy `NexusSettings` shape so the
  // tab components don't need their own rewrite.
  const settings = useMemo<NexusSettings>(() => ({
    general: {
      language: ui.language,
      themeMode: ui.themeMode,
      accentColor: ui.accentColor,
      customAccentColor: ui.customAccentColor,
      backgroundMode: ui.backgroundMode,
      smartPollSeconds: ui.smartPollSeconds,
      smartPollDefaultSeconds: ui.smartPollDefaultSeconds,
      smartPollPerDrive: ui.smartPollPerDrive,
      accentSource: ui.accentSource,
      startOnLogin: ui.startOnLogin,
      showConflictAlerts: ui.showConflictAlerts,
      autoKillConflictsAtStartup: ui.autoKillConflictsAtStartup,
      conflictAutoKillExclusions: ui.conflictAutoKillExclusions,
      monitoringDetailedCollapsed: ui.monitoringDetailedCollapsed,
      monitoringEventsEnabled: ui.monitoringEventsEnabled,
      monitoringFpsOverlayEnabled: ui.monitoringFpsOverlayEnabled,
      monitoringEventKindsHidden: ui.monitoringEventKindsHidden,
      showMacStatusBarIcon: ui.showMacStatusBarIcon,
      showWindowsTrayIcon: ui.showWindowsTrayIcon,
      rememberLastPage: ui.rememberLastPage,
      pinnedSidebarApps: ui.pinnedSidebarApps,
      sidebarAppOrder: ui.sidebarAppOrder,
      sidebarCollapsed: ui.sidebarCollapsed,
      widgetAdvancedMode: ui.widgetAdvancedMode,
      lightingDashboardMode: ui.lightingDashboardMode,
      coolingDashboardMode: ui.coolingDashboardMode,
      showUncontrolledLightingDevices: ui.showUncontrolledLightingDevices,
      showUncontrolledCoolingDevices: ui.showUncontrolledCoolingDevices,
      monitoringTempUnit: ui.monitoringTempUnit,
      timeFormat: ui.timeFormat,
      numberFormat: ui.numberFormat,
      startupDelaySeconds: ui.startupDelaySeconds,
      featureLightingEnabled: ui.featureLightingEnabled,
      featureCoolingEnabled: ui.featureCoolingEnabled,
      featureMonitoringEnabled: ui.featureMonitoringEnabled,
      featureDiagnosticsEnabled: ui.featureDiagnosticsEnabled,
      updateMode: ui.updateMode,
      updateChannel: ui.updateChannel,
      lastDismissedUpdateVersion: ui.lastDismissedUpdateVersion,
    },
  }), [ui]);

  const updateGeneral = useCallback((patch: Partial<NexusSettings['general']>) => {
    updateUi(patch);
  }, [updateUi]);

  const tab: SettingsTabKey = urlTab && isValidTab(urlTab) ? urlTab : 'general';
  const tabs = useMemo(() => TAB_DEFS.map(d => ({ key: d.key, label: t(d.labelKey), icon: d.icon })), [t]);

  // When the local service isn't detected, show the ServiceRequired overlay
  // instead of controls that can't persist. The tab strip still renders
  // (disabled) so the layout doesn't jump once the service reconnects.
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
      case 'appearance':
        return <AppearanceTab settings={settings} updateGeneral={updateGeneral} />;
      case 'lighting-cooling':
        return <LightingCoolingTab settings={settings} updateGeneral={updateGeneral} serviceOnline={serviceOnline} platform={platform} />;
      case 'monitoring':
        return <MonitoringTab settings={settings} updateGeneral={updateGeneral} serviceOnline={serviceOnline} />;
      case 'privacy':
        return <PrivacyTab settings={settings} serviceOnline={serviceOnline} />;
      case 'general':
      default:
        return <GeneralTab settings={settings} updateGeneral={updateGeneral} serviceOnline={serviceOnline} platform={platform} />;
    }
  };

  return (
    <div className={styles.settings}>
      <ViewHeader title={t('settings.title')} tabs={tabs} activeTab={tab} onTabChange={onTabChange} />
      <div className={`${styles.tabContent} pageBody`}>
        {renderTab()}
      </div>
    </div>
  );
}
