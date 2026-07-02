import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '../../../common/Button/Button';
import { SettingsSection } from '../../../common/SettingsSection/SettingsSection';
import { SettingRow } from '../../../common/SettingRow/SettingRow';
import { SyncConflictModal } from '../../../common/SyncConflictModal/SyncConflictModal';
import { useTranslation } from '../../../../lib/i18n';
import type { AuthAccount, AuthBackend } from '../../../../api/authBackend';
import type { UseCloudAccountsResult } from '../../../../hooks/useCloudAccounts';
import type { UseSyncStatusResult } from '../../../../hooks/useSyncStatus';
import { AccountAuthenticationSection } from './AccountAuthenticationSection';
import { AccountDangerZoneSection } from './AccountDangerZoneSection';
import { isSyncPassSettled } from './syncProfileRows';
import { usePublishPageSyncConflictModalOpen } from '../../../../app/syncConflictModalCoordination';
import styles from './Account.module.scss';

interface AccountSignedInProps {
  backend: AuthBackend;
  account: AuthAccount;
  accounts: UseCloudAccountsResult;
  sync: UseSyncStatusResult;
  recoveryFresh: boolean;
  onRecoveryFreshConsumed: () => void;
}

// In-app Account page body: the shared Authentication + Danger zone blocks
// plus Profile sync, which stays app-only (nexus-service is the sync engine;
// the public /account page renders Authentication + Danger zone alone).
export function AccountSignedIn({ backend, account, accounts, sync, recoveryFresh, onRecoveryFreshConsumed }: AccountSignedInProps) {
  const { t } = useTranslation();

  // ── Profile sync ────────────────────────────────────────────────────────
  const [syncNowBusy, setSyncNowBusy] = useState(false);
  const [conflictModalOpen, setConflictModalOpen] = useState(false);
  usePublishPageSyncConflictModalOpen(conflictModalOpen);

  // The click's own re-render still carries the pre-click `sync` prop (no
  // fetch has landed yet), and the background 25s poll (useSyncStatus) can
  // also land a stale refresh in the same window - both would read
  // pre-click data and could clear the spinner instantly if the account
  // happened to already be idle. Gating on `ownRefreshLanded` (flipped only
  // once this click's own syncNow() call has itself resolved) guarantees
  // every `sync` value the settle check reads from then on is at least as
  // fresh as this click's own confirmed round trip.
  const [ownRefreshLanded, setOwnRefreshLanded] = useState(false);

  const handleSyncNow = () => {
    if (syncNowBusy) return;
    setOwnRefreshLanded(false);
    setSyncNowBusy(true);
    void sync.syncNow().finally(() => setOwnRefreshLanded(true));
  };

  useEffect(() => {
    if (!syncNowBusy || !ownRefreshLanded) return;
    if (isSyncPassSettled(sync.state)) setSyncNowBusy(false);
  }, [sync.state, syncNowBusy, ownRefreshLanded]);

  return (
    <div className={styles.tabPanel}>
      <AccountAuthenticationSection
        backend={backend}
        account={account}
        onAccountChanged={() => void accounts.refresh()}
        recoveryFresh={recoveryFresh}
        onRecoveryFreshConsumed={onRecoveryFreshConsumed}
      />

      <SettingsSection
        title={t('account.sync.title')}
        action={(
          <Button
            type="button"
            tone="neutral"
            size="sm"
            icon={<RefreshCw size={14} />}
            loading={syncNowBusy}
            onClick={handleSyncNow}
          >
            {t('account.sync.syncNow')}
          </Button>
        )}
      >
        {sync.profiles.map(profile => (
          <SettingRow
            key={profile.profileId}
            label={profile.name}
            description={profile.lastSyncedAt ? new Date(profile.lastSyncedAt).toLocaleString() : t('account.sync.neverSyncedYet')}
          />
        ))}
        {sync.conflicts.length > 0 && (
          <SettingRow label={t('account.sync.conflict.title')} description={t('account.sync.conflict.pendingCount', { count: sync.conflicts.length })}>
            <Button type="button" tone="danger" size="sm" onClick={() => setConflictModalOpen(true)}>
              {t('account.sync.conflict.review')}
            </Button>
          </SettingRow>
        )}
      </SettingsSection>
      <SyncConflictModal
        open={conflictModalOpen}
        conflicts={sync.conflicts}
        onResolve={(profileId, choice) => void sync.resolve(profileId, choice)}
        onClose={() => setConflictModalOpen(false)}
      />

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
