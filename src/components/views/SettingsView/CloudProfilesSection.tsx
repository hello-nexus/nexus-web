import { useEffect, useState } from 'react';
import { CloudOff, DownloadCloud, RefreshCw } from 'lucide-react';
import { Button } from '../../common/Button/Button';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { SettingRow } from '../../common/SettingRow/SettingRow';
import { EmptyState } from '../../common/EmptyState/EmptyState';
import { SyncConflictModal } from '../../common/SyncConflictModal/SyncConflictModal';
import { useCloudAccounts } from '../../../hooks/useCloudAccounts';
import { useSyncStatus } from '../../../hooks/useSyncStatus';
import type { UseProfilesResult } from '../../../hooks/useProfiles';
import { useTranslation } from '../../../lib/i18n';
import { isSyncPassSettled } from './Account/syncProfileRows';
import { ImportFromMachinePanel } from './ImportFromMachinePanel';
import styles from './SettingsView.module.scss';

/** This machine's profiles back up to the account; another machine's never arrive on their own, so crossing machines is the explicit import below. */
export function CloudProfilesSection({ profiles }: { profiles: UseProfilesResult }) {
  const { t } = useTranslation();
  const accounts = useCloudAccounts(true);
  const signedIn = accounts.activeAccountId !== null;
  const sync = useSyncStatus(signedIn);
  const [importOpen, setImportOpen] = useState(false);
  const [conflictOpen, setConflictOpen] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  // The 25s background poll can land a pre-click status in the same window, so
  // the spinner only settles on state observed after this click's own round trip.
  const [ownRefreshLanded, setOwnRefreshLanded] = useState(false);

  const activeProfile = profiles.profiles.find(p => p.id === profiles.activeId);

  useEffect(() => {
    if (!syncBusy || !ownRefreshLanded) return;
    if (isSyncPassSettled(sync.state)) setSyncBusy(false);
  }, [sync.state, syncBusy, ownRefreshLanded]);

  if (!signedIn) {
    return (
      <SettingsSection title={t('profile.cloud.title')}>
        <EmptyState
          icon={<CloudOff />}
          title={t('profile.cloud.signedOut.title')}
          hint={t('profile.cloud.signedOut.hint')}
          compact
        />
        <div className={styles.profileActions}>
          <Button type="button" tone="accent" size="sm" href="/system/account">
            {t('profile.cloud.signedOut.signIn')}
          </Button>
        </div>
      </SettingsSection>
    );
  }

  const handleSyncNow = () => {
    if (syncBusy) return;
    setOwnRefreshLanded(false);
    setSyncBusy(true);
    void sync.syncNow().finally(() => setOwnRefreshLanded(true));
  };

  return (
    <SettingsSection title={t('profile.cloud.title')} description={t('profile.cloud.subtitle')}>
      <SettingRow
        label={t('profile.cloud.backup.label')}
        description={sync.lastSyncAt
          ? t('profile.cloud.backup.lastSynced', { when: new Date(sync.lastSyncAt).toLocaleString() })
          : t('profile.cloud.backup.never')}
      >
        <Button type="button" tone="neutral" size="sm" icon={<RefreshCw />} loading={syncBusy} onClick={handleSyncNow}>
          {t('profile.cloud.backup.syncNow')}
        </Button>
      </SettingRow>

      <SettingRow
        label={t('profile.cloud.import.label')}
        description={t('profile.cloud.import.description')}
      >
        <Button
          type="button"
          tone="neutral"
          size="sm"
          icon={<DownloadCloud />}
          onClick={() => setImportOpen(open => !open)}
        >
          {importOpen ? t('profile.cloud.import.close') : t('profile.cloud.import.open')}
        </Button>
      </SettingRow>

      {importOpen && (
        <ImportFromMachinePanel
          targetProfileId={profiles.activeId ?? undefined}
          targetProfileName={activeProfile?.name ?? ''}
          onImported={() => void profiles.refresh()}
          onClose={() => setImportOpen(false)}
        />
      )}

      {/* Per-machine rows make a conflict need two writers on THIS machine. */}
      {sync.conflicts.length > 0 && (
        <SettingRow
          label={t('account.sync.conflict.title')}
          description={t('account.sync.conflict.pendingCount', { count: sync.conflicts.length })}
        >
          <Button type="button" tone="accent" size="sm" onClick={() => setConflictOpen(true)}>
            {t('account.sync.conflict.review')}
          </Button>
        </SettingRow>
      )}

      <SyncConflictModal
        open={conflictOpen}
        conflicts={sync.conflicts}
        onResolve={sync.resolve}
        onClose={() => setConflictOpen(false)}
      />
    </SettingsSection>
  );
}
