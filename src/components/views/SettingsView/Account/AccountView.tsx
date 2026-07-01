import { useCallback, useState } from 'react';
import { ServiceRequired } from '../../ServiceRequired';
import { GenericSkeleton } from '../../PageSkeleton/PageSkeleton';
import type { ConnectionState } from '../../../../hooks/useServiceStatus';
import type { UseCloudAccountsResult } from '../../../../hooks/useCloudAccounts';
import type { UseSyncStatusResult } from '../../../../hooks/useSyncStatus';
import { AccountSignedOut } from './AccountSignedOut';
import { AccountSignedIn } from './AccountSignedIn';
import styles from '../SettingsView.module.scss';

interface AccountViewProps {
  serviceOnline: boolean;
  connectionState?: ConnectionState;
  accounts: UseCloudAccountsResult;
  sync: UseSyncStatusResult;
}

// Standalone Account page, reached from the top-bar profile menu's "Manage
// account" entry - mirrors ProfilesView's page shell/wiring pattern.
export function AccountView({ serviceOnline, connectionState, accounts, sync }: AccountViewProps) {
  // Set when the user just came back from password recovery: the service
  // grants a recovery-fresh session that authorizes password change AND
  // account deletion without the current password, so AccountSignedIn hides
  // the current-password field in both the password-change section and the
  // delete-account confirm dialog while this is true.
  const [recoveryFresh, setRecoveryFresh] = useState(false);

  const handleRecoveryApproved = useCallback(() => {
    setRecoveryFresh(true);
    void accounts.refresh();
  }, [accounts]);

  const handleRecoveryFreshConsumed = useCallback(() => {
    setRecoveryFresh(false);
  }, []);

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
        {accounts.activeAccountId == null
          ? <AccountSignedOut accounts={accounts} onRecoveryApproved={handleRecoveryApproved} />
          : (
            <AccountSignedIn
              accounts={accounts}
              sync={sync}
              recoveryFresh={recoveryFresh}
              onRecoveryFreshConsumed={handleRecoveryFreshConsumed}
            />
          )}
      </div>
    </div>
  );
}
