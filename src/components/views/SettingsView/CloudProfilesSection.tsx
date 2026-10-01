import { useCallback, useEffect, useState } from 'react';
import { Check, Cloud, CloudUpload, DownloadCloud, Monitor, RotateCcw, Trash2 } from 'lucide-react';
import { Badge } from '../../common/Badge/Badge';
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
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { formatDateTime, hour12OptionFor } from '../../../lib/units';
import { ProfileRestoreModal, appDataNames, appDataSummary } from './ProfileRestoreModal';
import { HoverTooltip } from '../../common/HoverTooltip/HoverTooltip';
import styles from './SettingsView.module.scss';

interface ConflictPrompt {
  installId: string;
  profileId: string;
  key: string;
  name: string;
  includeAppData: boolean;
}

interface RestorePrompt {
  installId: string;
  profileId: string;
  key: string;
  name: string;
  appIds: string[];
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
  const { timeFormat, dateFormat } = useUnitPrefs();
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
  const [backingUp, setBackingUp] = useState<string[]>([]);
  const [signInOpen, setSignInOpen] = useState(false);
  const [restore, setRestore] = useState<RestorePrompt | null>(null);

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
          title={t('account.title')}
        />
      </div>
    );
  }

  // The service runs one backup at a time, so a second row's click queues behind the first.
  const handleBackUp = (profileId: string) => {
    if (backingUp.includes(profileId)) return;
    setBackingUp(prev => [...prev, profileId]);
    void sync.syncNow(profileId).finally(() => setBackingUp(prev => prev.filter(id => id !== profileId)));
  };

  const runImport = async (installId: string, profileId: string, key: string, replaceExisting: boolean, name: string, includeAppData: boolean) => {
    if (busyKey) return;
    setBusyKey(key);
    setImportError(null);
    const { status, body } = await importCloudProfile(installId, profileId, replaceExisting, includeAppData);
    setBusyKey(null);
    if (status === 409 || body?.msg === 'profile_name_taken') {
      // body.name is the derived local name ("<name> (<hostname>)"), which is
      // what clashed - not the name on the row the user clicked.
      setConflict({ installId, profileId, key, name: body?.name || name, includeAppData });
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

  // A backup with app data asks first, the same dialog a file import shows.
  const startImport = (installId: string, profileId: string, key: string, name: string, appIds: string[] | undefined) => {
    if (appIds && appIds.length > 0) {
      setRestore({ installId, profileId, key, name, appIds });
      return;
    }
    void runImport(installId, profileId, key, false, name, true);
  };

  const includesApps = (appIds: string[] | undefined) => {
    if (!appIds || appIds.length === 0) return null;
    const text = t('profile.cloud.backup.includes', { apps: appDataSummary(t, appIds) });
    return appIds.length >= 3
      ? <HoverTooltip body={appDataNames(appIds).join(', ')}><span>{text}</span></HoverTooltip>
      : text;
  };

  const withApps = (text: string | null, appIds: string[] | undefined) => {
    const apps = includesApps(appIds);
    if (!apps) return text;
    if (!text) return apps;
    return <>{text} · {apps}</>;
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
  const ownMachine = library?.machines.find(m => m.isThisMachine);
  const ownInstallId = ownMachine?.installId ?? '';
  const pcChip = (hostname: string | undefined) => <Badge label={hostname || unknown} color="var(--accent)" />;

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
      updatedAt: ownCloud.find(r => r.profile.profileId === local.id)?.profile.updatedAt,
      appIds: ownCloud.find(r => r.profile.profileId === local.id)?.profile.appIds,
    })),
    ...ownCloud
      .filter(r => !profiles.profiles.some(local => local.id === r.profile.profileId))
      .map(r => ({
        profileId: r.profile.profileId,
        name: r.profile.name,
        installId: r.machine.installId,
        inCloud: true,
        isLocal: false,
        updatedAt: r.profile.updatedAt,
        appIds: r.profile.appIds,
      })),
  ];

  const formatWhen = (iso: string | null | undefined) => {
    if (!iso) return null;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;
    // toLocaleString's own defaults, spelled out so a custom pattern keeps the time fields.
    return formatDateTime(date, dateFormat, {
      year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
      hour12: hour12OptionFor(timeFormat),
    }, { variant: 'year' });
  };
  const lastBackedUp = (iso: string | null | undefined) => {
    const when = formatWhen(iso);
    return when ? t('profile.cloud.backup.lastSynced', { when }) : null;
  };

  const ownRow = (row: typeof mine[number]) => {
    const key = `${row.installId}:${row.profileId}`;
    // The sync status is fresher right after a backup; the library row covers a profile it has no status for.
    const backedUp = lastBackedUp(sync.profiles.find(p => p.profileId === row.profileId)?.lastSyncedAt || row.updatedAt);
    return (
      <SettingRow
        key={key}
        label={row.name}
        labelSuffix={ownMachine && pcChip(ownMachine.hostname)}
        description={withApps(!row.isLocal
          ? [t('profile.cloud.list.notOnThisComputer'), backedUp].filter(Boolean).join(' · ')
          : !row.inCloud
            ? t('profile.cloud.backup.never')
            : backedUp ?? t('profile.cloud.backup.never'), row.inCloud ? row.appIds : undefined)}
      >
        {row.isLocal ? (
          <>
            <Button
              type="button"
              tone="neutral"
              size="sm"
              icon={<CloudUpload />}
              loading={backingUp.includes(row.profileId)}
              onClick={() => handleBackUp(row.profileId)}
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
              onClick={() => startImport(row.installId, row.profileId, key, row.name, row.appIds)}
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
        labelSuffix={pcChip(machine.hostname)}
        description={withApps(lastBackedUp(profile.updatedAt), profile.appIds)}
      >
        <Button
          type="button"
          tone="neutral"
          size="sm"
          icon={imported ? <Check /> : <DownloadCloud />}
          loading={busyKey === key}
          disabled={atLimit || busyKey !== null}
          onClick={() => startImport(machine.installId, profile.profileId, key, profile.name, profile.appIds)}
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
          if (pending) void runImport(pending.installId, pending.profileId, pending.key, true, pending.name, pending.includeAppData);
        }}
        onCancel={() => setConflict(null)}
      />

      <ProfileRestoreModal
        open={restore !== null}
        title={t('profile.restore.importTitle', { name: restore?.name ?? '' })}
        confirmLabel={t('profile.restore.importAction')}
        appIds={restore?.appIds ?? []}
        onConfirm={(includeAppData) => {
          const pending = restore;
          setRestore(null);
          if (pending) void runImport(pending.installId, pending.profileId, pending.key, false, pending.name, includeAppData);
        }}
        onCancel={() => setRestore(null)}
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
