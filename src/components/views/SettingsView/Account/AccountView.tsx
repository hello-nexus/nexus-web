import { useCallback, useMemo, useState } from 'react';
import { ServiceRequired } from '../../ServiceRequired';
import { GenericSkeleton } from '../../PageSkeleton/PageSkeleton';
import type { ConnectionState } from '../../../../hooks/useServiceStatus';
import type { UseCloudAccountsResult } from '../../../../hooks/useCloudAccounts';
import { localServiceBackend } from '../../../../api/localServiceBackend';
import { AccountSignedOut, type AccountSignedOutSubtab } from './AccountSignedOut';
import { AccountSignedIn, type AccountSignedInTab } from './AccountSignedIn';
import { ViewHeader } from '../../../common/ViewHeader/ViewHeader';
import type { TabDef } from '../../../common/Tabs/Tabs';
import { useTranslation } from '../../../../lib/i18n';
import styles from '../SettingsView.module.scss';

interface AccountViewProps {
  serviceOnline: boolean;
  connectionState?: ConnectionState;
  accounts: UseCloudAccountsResult;
  /** The route's subtab segment (/system/account/<tab>) - drives the signed-out flow. */
  tab: string | null;
  onTabChange: (tab: string) => void;
  /** Opens an app's store page from Manage purchases. */
  onOpenStoreApp?: (appId: string) => void;
}

const SIGNED_OUT_SUBTABS: readonly AccountSignedOutSubtab[] = ['login', 'register', 'recover'];
const PURCHASES_TAB = 'purchases';

function isSignedOutSubtab(value: string | null): value is AccountSignedOutSubtab {
  return value != null && (SIGNED_OUT_SUBTABS as readonly string[]).includes(value);
}

// Standalone Account page, reached from the top-bar profile menu's "Manage
// account" entry - mirrors ProfilesView's page shell/wiring pattern.
export function AccountView({ serviceOnline, connectionState, accounts, tab, onTabChange, onOpenStoreApp }: AccountViewProps) {
  const { t } = useTranslation();
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

  // localServiceBackend.login()/register() are thin /cloud/* proxies with no
  // side effect beyond the wire call - refreshing the shared accounts hook
  // after a sign-in is this view's job, same as it was before the
  // AuthBackend seam existed.
  const handleSignedIn = useCallback(() => {
    void accounts.refresh();
  }, [accounts]);

  const tabs: TabDef[] = useMemo(() => [
    { key: 'account', label: t('account.tab.account') },
    { key: PURCHASES_TAB, label: t('account.tab.purchases') },
  ], [t]);

  if (!serviceOnline) {
    return (
      <div className={styles.settings}>
        <ServiceRequired state={connectionState} skeleton={<GenericSkeleton />} />
      </div>
    );
  }

  const signedInTab: AccountSignedInTab = tab === PURCHASES_TAB ? PURCHASES_TAB : 'account';

  return (
    <div className={styles.settings}>
      {/* The signed-out flows own the same route segment, so the tab strip
          only exists once there is an account to show. */}
      {accounts.activeAccount && (
        <ViewHeader title={t('account.title')} tabs={tabs} activeTab={signedInTab} onTabChange={onTabChange} />
      )}
      <div className={`${styles.tabContent} pageBody`}>
        {accounts.activeAccountId == null || !accounts.activeAccount
          ? (
            <AccountSignedOut
              backend={localServiceBackend}
              subtab={isSignedOutSubtab(tab) ? tab : null}
              onSubtabChange={onTabChange}
              onRecoveryApproved={handleRecoveryApproved}
              onSignedIn={handleSignedIn}
            />
          )
          : (
            <AccountSignedIn
              backend={localServiceBackend}
              account={accounts.activeAccount}
              accounts={accounts}
              recoveryFresh={recoveryFresh}
              onRecoveryFreshConsumed={handleRecoveryFreshConsumed}
              tab={signedInTab}
              onOpenStoreApp={onOpenStoreApp}
            />
          )}
      </div>
    </div>
  );
}
