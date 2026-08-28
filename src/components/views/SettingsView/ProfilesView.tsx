import { useCallback, useMemo, useState } from 'react';
import { ServiceRequired } from '../ServiceRequired';
import { GenericSkeleton } from '../PageSkeleton/PageSkeleton';
import type { ConnectionState } from '../../../hooks/useServiceStatus';
import type { UseProfilesResult } from '../../../hooks/useProfiles';
import type { Preferences } from '../../../api/profiles';
import { RefreshCw } from 'lucide-react';
import { ViewHeader } from '../../common/ViewHeader/ViewHeader';
import type { TabDef } from '../../common/Tabs/Tabs';
import { useTranslation } from '../../../lib/i18n';
import { useCloudAccounts } from '../../../hooks/useCloudAccounts';
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
  // Bumped by the tab's own refresh control; CloudProfilesSection reloads the
  // library when it changes. The cloud list is fetched, not pushed, so there
  // has to be a way to re-read it without leaving the page.
  const [cloudReload, setCloudReload] = useState(0);
  const [cloudLoading, setCloudLoading] = useState(false);
  // The refresh control is meaningless signed out: there is no library to
  // re-read, only the sign-in prompt.
  const accounts = useCloudAccounts(true);
  const showRefresh = active === 'cloud' && accounts.activeAccountId !== null;
  const tabs: TabDef[] = useMemo(() => [
    { key: 'local', label: t('profile.tab.local') },
    {
      key: 'cloud',
      label: t('profile.tab.cloud'),
      trailing: showRefresh ? (
        <button
          type="button"
          className={styles.cloudRefresh}
          aria-label={t('profile.cloud.refresh')}
          title={t('profile.cloud.refresh')}
          data-loading={cloudLoading ? 'true' : undefined}
          disabled={cloudLoading}
          onClick={() => setCloudReload(n => n + 1)}
        >
          <RefreshCw size={14} className={cloudLoading ? styles.cloudRefreshSpinning : undefined} />
        </button>
      ) : undefined,
    },
  ], [t, showRefresh, cloudLoading]);

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
      <ViewHeader title={t('profile.manageTitle')} tabs={tabs} activeTab={active} onTabChange={onTabChange} />
      <div className={`${styles.tabContent} pageBody`}>
        {active === 'cloud'
          ? <CloudProfilesSection profiles={profiles} reloadToken={cloudReload} onLoadingChange={setCloudLoading} />
          : <ProfilesTab profiles={profiles} onPreferencesChanged={onPreferencesChanged} />}
      </div>
    </div>
  );
}
