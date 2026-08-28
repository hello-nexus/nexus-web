import type { AuthAccount, AuthBackend } from '../../../../api/authBackend';
import type { UseCloudAccountsResult } from '../../../../hooks/useCloudAccounts';
import { AccountAuthenticationSection } from './AccountAuthenticationSection';
import { AccountDangerZoneSection } from './AccountDangerZoneSection';
import { AccountDevicesSection } from './AccountDevicesSection';
import styles from './Account.module.scss';

interface AccountSignedInProps {
  backend: AuthBackend;
  account: AuthAccount;
  accounts: UseCloudAccountsResult;
  recoveryFresh: boolean;
  onRecoveryFreshConsumed: () => void;
}

// Identity and devices only. Cloud profile backup and cross-machine import
// live under Manage Profiles, next to the profiles they act on.
export function AccountSignedIn({ backend, account, accounts, recoveryFresh, onRecoveryFreshConsumed }: AccountSignedInProps) {
  return (
    <div className={styles.tabPanel}>
      <AccountAuthenticationSection
        backend={backend}
        account={account}
        onAccountChanged={() => void accounts.refresh()}
        recoveryFresh={recoveryFresh}
        onRecoveryFreshConsumed={onRecoveryFreshConsumed}
      />

      <AccountDevicesSection backend={backend} prefillFromLocalSpecs />

      <AccountDangerZoneSection
        backend={backend}
        recoveryFresh={recoveryFresh}
        onRecoveryFreshConsumed={onRecoveryFreshConsumed}
        onLoggedOut={() => void accounts.refresh()}
        onDeleted={() => void accounts.refresh()}
      />
    </div>
  );
}
