import { useCallback } from 'react';
import { ServiceRequired } from '../ServiceRequired';
import { GenericSkeleton } from '../PageSkeleton/PageSkeleton';
import type { ConnectionState } from '../../../hooks/useServiceStatus';
import type { UseProfilesResult } from '../../../hooks/useProfiles';
import type { Preferences } from '../../../api/profiles';
import { ProfilesTab } from './ProfilesTab';
import styles from './SettingsView.module.scss';

interface ProfilesViewProps {
  serviceOnline: boolean;
  connectionState?: ConnectionState;
  profiles: UseProfilesResult;
}

// Standalone Profiles page (was the Settings > Profiles tab). Reached from the
// top-bar profile menu's "Manage profiles" link. Reuses the settings page
// chrome so it reads identically to the rest of /system.
export function ProfilesView({ serviceOnline, connectionState, profiles }: ProfilesViewProps) {
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
      <div className={`${styles.tabContent} pageBody`}>
        <ProfilesTab profiles={profiles} onPreferencesChanged={onPreferencesChanged} />
      </div>
    </div>
  );
}
