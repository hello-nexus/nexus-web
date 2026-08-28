import { useCallback, useMemo } from 'react';
import { ServiceRequired } from '../ServiceRequired';
import { GenericSkeleton } from '../PageSkeleton/PageSkeleton';
import type { ConnectionState } from '../../../hooks/useServiceStatus';
import type { UseProfilesResult } from '../../../hooks/useProfiles';
import type { Preferences } from '../../../api/profiles';
import { Tabs, type TabDef } from '../../common/Tabs/Tabs';
import { useTranslation } from '../../../lib/i18n';
import { ProfilesTab } from './ProfilesTab';
import { CloudProfilesSection } from './CloudProfilesSection';
import styles from './SettingsView.module.scss';

interface ProfilesViewProps {
  serviceOnline: boolean;
  connectionState?: ConnectionState;
  profiles: UseProfilesResult;
  /** The route's subtab segment (/system/profiles/<tab>). */
  tab: string | null;
  onTabChange: (tab: string) => void;
}

const TAB_KEYS = ['local', 'cloud'] as const;

// Standalone Profiles page (was the Settings > Profiles tab). Reached from the
// top-bar profile menu's "Manage profiles" link. Reuses the settings page
// chrome so it reads identically to the rest of /system.
export function ProfilesView({ serviceOnline, connectionState, profiles, tab, onTabChange }: ProfilesViewProps) {
  const { t } = useTranslation();
  const active = TAB_KEYS.includes(tab as typeof TAB_KEYS[number]) ? tab! : 'local';
  const tabs: TabDef[] = useMemo(() => [
    { key: 'local', label: t('profile.tab.local') },
    { key: 'cloud', label: t('profile.tab.cloud') },
  ], [t]);

  // UiSettingsProvider already reloads + re-applies theme/accent/language on a
  // profile switch, so this callback is a no-op (kept to satisfy ProfilesTab).
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- prop signature matches ProfilesTab's onPreferencesChanged callback
  const onPreferencesChanged = useCallback((_prefs: Preferences) => {}, []);

  if (!serviceOnline) {
    return (
      <div className={styles.settings}>
        <ServiceRequired state={connectionState} skeleton={<GenericSkeleton />} />
      </div>
    );
  }

  return (
    <div className={styles.settings}>
      <Tabs tabs={tabs} activeKey={active} onChange={onTabChange} ariaLabel={t('profile.tab.aria')} />
      <div className={`${styles.tabContent} pageBody`}>
        {active === 'cloud'
          ? <CloudProfilesSection profiles={profiles} />
          : <ProfilesTab profiles={profiles} onPreferencesChanged={onPreferencesChanged} />}
      </div>
    </div>
  );
}
