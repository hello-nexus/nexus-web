import { useCallback, useEffect, useState } from 'react';
import { Check, CloudOff, CloudUpload, DownloadCloud } from 'lucide-react';
import { Badge } from '../../common/Badge/Badge';
import { Button } from '../../common/Button/Button';
import { ConfirmModal } from '../../common/ConfirmModal/ConfirmModal';
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

interface ConflictPrompt {
  installId: string;
  profileId: string;
  key: string;
  name: string;
}

/** This machine's profiles back up to the account; another machine's never arrive on their own, so crossing machines is an explicit per-profile import. */
export function CloudProfilesSection({ profiles }: { profiles: UseProfilesResult }) {
  const { t } = useTranslation();
  const accounts = useCloudAccounts(true);
  const signedIn = accounts.activeAccountId !== null;
  const sync = useSyncStatus(signedIn);
  const [library, setLibrary] = useState<CloudLibrary | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [importedKeys, setImportedKeys] = useState<string[]>([]);
  const [conflict, setConflict] = useState<ConflictPrompt | null>(null);
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

  const runImport = async (installId: string, profileId: string, key: string, replaceExisting: boolean, name: string) => {
    if (busyKey) return;
    setBusyKey(key);
    setImportError(null);
    const result = await importCloudProfile(installId, profileId, replaceExisting);
    setBusyKey(null);
    if (result?.error && result.msg === 'profile_name_taken') {
      setConflict({ installId, profileId, key, name });
      return;
    }
    if (!result || result.error) {
      setImportError(result?.msg === 'profile_limit_reached'
        ? t('profile.cloud.import.error.limit')
        : t('profile.cloud.import.error.failed'));
      return;
    }
    setImportedKeys(prev => prev.includes(key) ? prev : [...prev, key]);
    void profiles.refresh();
    loadLibrary();
  };

  const atLimit = profiles.profiles.length >= 5;
  const unknown = t('profile.cloud.machine.unknown');

  // This computer's profiles first: they are the ones being backed up, and the
  // rest of the list is other computers you might copy from.
  const rows = (library?.machines ?? [])
    .flatMap(machine => machine.profiles.map(profile => ({ machine, profile })))
    .sort((a, b) => Number(b.machine.isThisMachine) - Number(a.machine.isThisMachine));

  const backedUpAt = (profileId: string) => {
    const status = sync.profiles.find(p => p.profileId === profileId);
    return status?.lastSyncedAt ? new Date(status.lastSyncedAt).toLocaleString() : null;
  };

  return (
    <SettingsSection title={t('profile.cloud.title')} description={t('profile.cloud.subtitle')}>
      {library === null ? <Spinner size={24} /> : rows.length === 0 ? (
        <EmptyState title={t('profile.cloud.list.empty')} />
      ) : rows.map(({ machine, profile }) => {
        const key = `${machine.installId}:${profile.profileId}`;
        const when = machine.isThisMachine ? backedUpAt(profile.profileId) : null;
        const imported = importedKeys.includes(key);
        return (
          <SettingRow
            key={key}
            label={profile.name}
            description={(
              <span className={styles.cloudProfileOwner}>
                {machine.hostname || unknown}
                {machine.isThisMachine && <Badge label={t('profile.cloud.list.thisComputer')} />}
                {machine.isThisMachine && (
                  <span className={styles.cloudProfileBackedUp}>
                    {when
                      ? t('profile.cloud.backup.lastSynced', { when })
                      : t('profile.cloud.backup.never')}
                  </span>
                )}
              </span>
            )}
          >
            {machine.isThisMachine ? (
              <Button
                type="button"
                tone="neutral"
                size="sm"
                icon={<CloudUpload />}
                loading={syncBusy}
                onClick={handleSyncNow}
              >
                {t('profile.cloud.backup.syncNow')}
              </Button>
            ) : (
              <Button
                type="button"
                tone="neutral"
                size="sm"
                icon={imported ? <Check /> : <DownloadCloud />}
                loading={busyKey === key}
                disabled={atLimit || busyKey !== null}
                onClick={() => void runImport(machine.installId, profile.profileId, key, false, profile.name)}
              >
                {imported ? t('profile.cloud.import.done') : t('profile.cloud.import.open')}
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

      <ConfirmModal
        open={conflict !== null}
        title={t('profile.cloud.import.nameTaken.title')}
        message={t('profile.cloud.import.nameTaken.message', { name: conflict?.name ?? '' })}
        confirmLabel={t('profile.cloud.import.nameTaken.replace')}
        destructive
        onConfirm={() => {
          const pending = conflict;
          setConflict(null);
          if (pending) void runImport(pending.installId, pending.profileId, pending.key, true, pending.name);
        }}
        onCancel={() => setConflict(null)}
      />

      <SyncConflictModal
        open={conflictOpen}
        conflicts={sync.conflicts}
        onResolve={sync.resolve}
        onClose={() => setConflictOpen(false)}
      />
    </SettingsSection>
  );
}
