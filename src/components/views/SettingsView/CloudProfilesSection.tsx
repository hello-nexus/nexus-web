import { useCallback, useEffect, useState } from 'react';
import { Check, Cloud, CloudUpload, DownloadCloud, Monitor, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '../../common/Button/Button';
import { ConfirmModal } from '../../common/ConfirmModal/ConfirmModal';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { SettingRow } from '../../common/SettingRow/SettingRow';
import { EmptyState } from '../../common/EmptyState/EmptyState';
import { Spinner } from '../../common/Spinner/Spinner';
import { SyncConflictModal } from '../../common/SyncConflictModal/SyncConflictModal';
import { AccountSignInModal } from './Account/AccountSignInModal';
import { deleteCloudProfile, fetchCloudLibrary, importCloudProfile, type CloudLibrary } from '../../../api/cloud';
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
export function CloudProfilesSection(
  { profiles, reloadToken = 0, onLoadingChange }: {
    profiles: UseProfilesResult;
    reloadToken?: number;
    /** Reports whether a library read is in flight, so the tab's refresh control can spin while it is. */
    onLoadingChange?: (loading: boolean) => void;
  },
) {
  const { t } = useTranslation();
  const accounts = useCloudAccounts(true);
  const signedIn = accounts.activeAccountId !== null;
  const sync = useSyncStatus(signedIn);
  const [library, setLibrary] = useState<CloudLibrary | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [importedKeys, setImportedKeys] = useState<string[]>([]);
  const [conflict, setConflict] = useState<ConflictPrompt | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ installId: string; profileId: string; key: string } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [conflictOpen, setConflictOpen] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  // The 25s background poll can land a pre-click status in the same window, so
  // the spinner only settles on state observed after this click's own round trip.
  const [ownRefreshLanded, setOwnRefreshLanded] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);

  const loadLibrary = useCallback(() => {
    if (!signedIn) return;
    onLoadingChange?.(true);
    void fetchCloudLibrary()
      .then(data => setLibrary(data ?? { machines: [] }))
      .catch(() => setLibrary({ machines: [] }))
      .finally(() => onLoadingChange?.(false));
  }, [signedIn, onLoadingChange]);

  useEffect(() => {
    loadLibrary();
    // The backup timestamps come from the sync status, so the tab's refresh
    // has to re-read both, not just the library.
    if (reloadToken > 0) void sync.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync is rebuilt each render; only the token should retrigger
  }, [loadLibrary, sync.lastSyncAt, reloadToken]);

  useEffect(() => {
    if (!syncBusy || !ownRefreshLanded) return;
    if (isSyncPassSettled(sync.state)) setSyncBusy(false);
  }, [sync.state, syncBusy, ownRefreshLanded]);

  // Signed out there is nothing to head up: the sign-in prompt IS the page, so
  // it stands alone rather than under a "this computer's cloud profiles" title
  // describing a list that cannot exist yet.
  if (!signedIn) {
    return (
      <div className={styles.tabPanel}>
        <EmptyState
          hero
          icon={<Cloud />}
          title={t('profile.cloud.signedOut.title')}
          hint={t('profile.cloud.signedOut.hint')}
          points={[
            { icon: <CloudUpload />, text: t('profile.cloud.signedOut.pointBackup') },
            { icon: <RotateCcw />, text: t('profile.cloud.signedOut.pointRestore') },
            { icon: <Monitor />, text: t('profile.cloud.signedOut.pointOtherComputers') },
          ]}
          action={(
            <Button type="button" tone="accent" onClick={() => setSignInOpen(true)}>
              {t('profile.cloud.signedOut.signIn')}
            </Button>
          )}
        />
        <AccountSignInModal
          open={signInOpen}
          onClose={() => setSignInOpen(false)}
          onSignedIn={() => {
            setSignInOpen(false);
            void accounts.refresh();
          }}
          ariaLabel={t('account.signIn.title')}
        />
      </div>
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
    const { status, body } = await importCloudProfile(installId, profileId, replaceExisting);
    setBusyKey(null);
    if (status === 409 || body?.msg === 'profile_name_taken') {
      // body.name is the derived local name ("<name> (<hostname>)"), which is
      // what clashed - not the name on the row the user clicked.
      setConflict({ installId, profileId, key, name: body?.name || name });
      return;
    }
    if (status < 200 || status >= 300) {
      setImportError(body?.msg === 'profile_limit_reached'
        ? t('profile.cloud.import.error.limit')
        : t('profile.cloud.import.error.failed'));
      return;
    }
    setImportedKeys(prev => prev.includes(key) ? prev : [...prev, key]);
    void profiles.refresh();
    loadLibrary();
  };

  const removeFromCloud = async (installId: string, profileId: string, key: string) => {
    if (busyKey) return;
    setBusyKey(key);
    setImportError(null);
    const result = await deleteCloudProfile(installId, profileId);
    setBusyKey(null);
    if (!result || result.error) {
      setImportError(t('profile.cloud.delete.error'));
      return;
    }
    loadLibrary();
  };

  const atLimit = profiles.profiles.length >= 5;
  const unknown = t('profile.cloud.machine.unknown');

  const deleteButton = (installId: string, profileId: string, key: string) => (
    <Button
      type="button"
      tone="danger"
      size="sm"
      icon={<Trash2 />}
      disabled={busyKey !== null}
      onClick={() => setPendingDelete({ installId, profileId, key })}
    >
      {t('profile.cloud.delete.action')}
    </Button>
  );

  const allRows = (library?.machines ?? [])
    .flatMap(machine => machine.profiles.map(profile => ({ machine, profile })));
  const others = allRows.filter(r => !r.machine.isThisMachine);
  const ownCloud = allRows.filter(r => r.machine.isThisMachine);
  const ownInstallId = library?.machines.find(m => m.isThisMachine)?.installId ?? '';

  // The list is the union of what is local and what is backed up, so a profile
  // whose backup was removed still appears - with only a Back up action - and
  // a backup whose local profile was deleted still appears to be restored.
  const mine = [
    ...profiles.profiles.map(local => ({
      profileId: local.id,
      name: local.name,
      installId: ownCloud.find(r => r.profile.profileId === local.id)?.machine.installId ?? ownInstallId,
      inCloud: ownCloud.some(r => r.profile.profileId === local.id),
      isLocal: true,
    })),
    ...ownCloud
      .filter(r => !profiles.profiles.some(local => local.id === r.profile.profileId))
      .map(r => ({
        profileId: r.profile.profileId,
        name: r.profile.name,
        installId: r.machine.installId,
        inCloud: true,
        isLocal: false,
      })),
  ];

  const backedUpAt = (profileId: string) => {
    const status = sync.profiles.find(p => p.profileId === profileId);
    return status?.lastSyncedAt ? new Date(status.lastSyncedAt).toLocaleString() : null;
  };

  const ownRow = (row: typeof mine[number]) => {
    const key = `${row.installId}:${row.profileId}`;
    const when = backedUpAt(row.profileId);
    return (
      <SettingRow
        key={key}
        label={row.name}
        description={!row.isLocal
          ? t('profile.cloud.list.notOnThisComputer')
          : !row.inCloud
            ? t('profile.cloud.backup.never')
            : when
              ? t('profile.cloud.backup.lastSynced', { when })
              : t('profile.cloud.backup.never')}
      >
        {row.isLocal ? (
          <>
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
            {/* Nothing to remove or restore until it has actually been backed up. */}
            {row.inCloud && deleteButton(row.installId, row.profileId, key)}
          </>
        ) : (
          <>
            <Button
              type="button"
              tone="neutral"
              size="sm"
              icon={<DownloadCloud />}
              loading={busyKey === key}
              disabled={atLimit || busyKey !== null}
              onClick={() => void runImport(row.installId, row.profileId, key, false, row.name)}
            >
              {t('profile.cloud.import.open')}
            </Button>
            {deleteButton(row.installId, row.profileId, key)}
          </>
        )}
      </SettingRow>
    );
  };

  const otherRow = ({ machine, profile }: typeof allRows[number]) => {
    const key = `${machine.installId}:${profile.profileId}`;
    const imported = importedKeys.includes(key);
    return (
      <SettingRow
        key={key}
        label={profile.name}
        description={machine.hostname || unknown}
      >
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
        {deleteButton(machine.installId, profile.profileId, key)}
      </SettingRow>
    );
  };

  return (
    <div className={styles.tabPanel}>
      <SettingsSection title={t('profile.cloud.title')}>
        {library === null && profiles.profiles.length === 0 ? <Spinner size={24} /> : mine.length === 0 ? (
          <EmptyState title={t('profile.cloud.list.empty')} />
        ) : mine.map(ownRow)}

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
      </SettingsSection>

      {others.length > 0 && (
        <SettingsSection title={t('profile.cloud.others.title')}>
          {others.map(otherRow)}
          {importError && <p className={styles.profileImportError} role="alert" data-settings-aside="true">{importError}</p>}
          {atLimit && <p className={styles.note} data-settings-aside="true">{t('profile.maxReached')}</p>}
        </SettingsSection>
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

      <ConfirmModal
        open={pendingDelete !== null}
        title={t('profile.cloud.delete.title')}
        message={t('profile.cloud.delete.message')}
        confirmLabel={t('profile.cloud.delete.action')}
        destructive
        onConfirm={() => {
          const pending = pendingDelete;
          setPendingDelete(null);
          if (pending) void removeFromCloud(pending.installId, pending.profileId, pending.key);
        }}
        onCancel={() => setPendingDelete(null)}
      />

      <SyncConflictModal
        open={conflictOpen}
        conflicts={sync.conflicts}
        onResolve={sync.resolve}
        onClose={() => setConflictOpen(false)}
      />
    </div>
  );
}
