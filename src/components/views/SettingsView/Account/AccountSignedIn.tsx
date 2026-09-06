import type { AuthAccount, AuthBackend } from '../../../../api/authBackend';
import type { UseCloudAccountsResult } from '../../../../hooks/useCloudAccounts';
import { AccountAuthenticationSection } from './AccountAuthenticationSection';
import { AccountDangerZoneSection } from './AccountDangerZoneSection';
import { AccountDevicesSection } from './AccountDevicesSection';
import { AccountPurchasesSection } from './AccountPurchasesSection';
import styles from './Account.module.scss';

export type AccountSignedInTab = 'account' | 'purchases';

interface AccountSignedInProps {
  backend: AuthBackend;
  account: AuthAccount;
  accounts: UseCloudAccountsResult;
  recoveryFresh: boolean;
  onRecoveryFreshConsumed: () => void;
  /** Whether the change-password modal opens unprompted on this mount. */
  promptPasswordChange: boolean;
  onPasswordPromptClosed: () => void;
  /** Which tab the route names; the caller owns the tab strip. */
  tab: AccountSignedInTab;
  /** Opens an app's store page from Manage purchases. */
  onOpenStoreApp?: (appId: string) => void;
}

// Identity and devices only. Cloud profile backup and cross-machine import
// live under Manage Profiles, next to the profiles they act on.
export function AccountSignedIn({ backend, account, accounts, recoveryFresh, onRecoveryFreshConsumed, promptPasswordChange, onPasswordPromptClosed, tab, onOpenStoreApp }: AccountSignedInProps) {
  if (tab === 'purchases') {
    return (
      <div className={styles.tabPanel}>
        <AccountPurchasesSection onOpenStoreApp={onOpenStoreApp} />
      </div>
    );
  }

  return (
    <div className={styles.tabPanel}>
      <AccountAuthenticationSection
        backend={backend}
        account={account}
        onAccountChanged={() => void accounts.refresh()}
        recoveryFresh={recoveryFresh}
        onRecoveryFreshConsumed={onRecoveryFreshConsumed}
        promptPasswordChange={promptPasswordChange}
        onPasswordPromptClosed={onPasswordPromptClosed}
        onLoggedOut={() => void accounts.refresh()}
      />

      <AccountDevicesSection backend={backend} prefillFromLocalSpecs />

      <AccountDangerZoneSection
        backend={backend}
        recoveryFresh={recoveryFresh}
        onRecoveryFreshConsumed={onRecoveryFreshConsumed}
        onDeleted={() => void accounts.refresh()}
      />
    </div>
  );
}
