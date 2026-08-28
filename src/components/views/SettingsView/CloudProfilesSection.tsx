import { useCallback, useEffect, useState } from 'react';
import { CloudOff, DownloadCloud, RefreshCw } from 'lucide-react';
import { Badge } from '../../common/Badge/Badge';
import { Button } from '../../common/Button/Button';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { SettingRow } from '../../common/SettingRow/SettingRow';
import { EmptyState } from '../../common/EmptyState/EmptyState';
import { Spinner } from '../../common/Spinner/Spinner';
import { SyncConflictModal } from '../../common/SyncConflictModal/SyncConflictModal';
import { fetchCloudLibrary, importCloudProfile, type CloudLibrary } from '../../../api/cloud';
import { useCloudAccounts } from '../../../hooks/useCloudAccounts';
import { useSyncStatus } from '../../../hooks/useSyncStatus';
import type { UseProfilesResult } from '../../../hooks/useProfiles';
import { useTranslation } from '../../../lib/i18n';
import { isSyncPassSettled } from './Account/syncProfileRows';
import styles from './SettingsView.module.scss';

/** This machine's profiles back up to the account; another machine's never arrive on their own, so crossing machines is an explicit per-profile import. */
export function CloudProfilesSection({ profiles }: { profiles: UseProfilesResult }) {
  const { t } = useTranslation();
  const accounts = useCloudAccounts(true);
  const signedIn = accounts.activeAccountId !== null;
  const sync = useSyncStatus(signedIn);
  const [library, setLibrary] = useState<CloudLibrary | null>(null);
  const [importingKey, setImportingKey] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [conflictOpen, setConflictOpen] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  // The 25s background poll can land a pre-click status in the same window, so
  // the spinner only settles on state observed after this click's own round trip.
  const [ownRefreshLanded, setOwnRefreshLanded] = useState(false);

  const loadLibrary = useCallback(() => {
    if (!signedIn) return;
    void fetchCloudLibrary()
      .then(data => setLibrary(data ?? { machines: [] }))
      .catch(() => setLibrary({ machines: [] }));
  }, [signedIn]);

  useEffect(() => { loadLibrary(); }, [loadLibrary, sync.lastSyncAt]);

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
          action={(
            <Button type="button" tone="accent" href="/system/account">
              {t('profile.cloud.signedOut.signIn')}
            </Button>
          )}
        />
      </SettingsSection>
    );
  }

  const handleSyncNow = () => {
    if (syncBusy) return;
    setOwnRefreshLanded(false);
    setSyncBusy(true);
    void sync.syncNow().finally(() => setOwnRefreshLanded(true));
  };

  // Copying in a whole profile is a create, so it is one click with nothing to
  // choose - the same shape as importing a profile from a file.
  const runImport = async (installId: string, profileId: string, key: string) => {
    if (importingKey) return;
    setImportingKey(key);
    setImportError(null);
    const result = await importCloudProfile(installId, profileId);
    setImportingKey(null);
    if (!result || result.error) {
      setImportError(result?.msg === 'profile_limit_reached'
        ? t('profile.cloud.import.error.limit')
        : t('profile.cloud.import.error.failed'));
      return;
    }
    void profiles.refresh();
    loadLibrary();
  };

  const atLimit = profiles.profiles.length >= 5;
  const unknown = t('profile.cloud.machine.unknown');
  // One flat list across every machine on the account: a profile name alone is
  // ambiguous when every computer calls one "Default", so each row is labelled
  // with the computer it belongs to.
  const rows = (library?.machines ?? []).flatMap(machine =>
    machine.profiles.map(profile => ({ machine, profile })),
  );

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

      {library === null ? <Spinner size={24} /> : rows.length === 0 ? (
        <EmptyState title={t('profile.cloud.list.empty')} />
      ) : rows.map(({ machine, profile }) => {
        const key = `${machine.installId}:${profile.profileId}`;
        return (
          <SettingRow
            key={key}
            label={profile.name}
            description={(
              <span className={styles.cloudProfileOwner}>
                {machine.hostname || unknown}
                {machine.isThisMachine && <Badge label={t('profile.cloud.list.thisComputer')} />}
              </span>
            )}
          >
            {!machine.isThisMachine && (
              <Button
                type="button"
                tone="neutral"
                size="sm"
                icon={<DownloadCloud />}
                loading={importingKey === key}
                disabled={atLimit || importingKey !== null}
                onClick={() => void runImport(machine.installId, profile.profileId, key)}
              >
                {t('profile.cloud.import.open')}
              </Button>
            )}
          </SettingRow>
        );
      })}

      {importError && <p className={styles.profileImportError} role="alert" data-settings-aside="true">{importError}</p>}
      {atLimit && <p className={styles.note} data-settings-aside="true">{t('profile.maxReached')}</p>}

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
