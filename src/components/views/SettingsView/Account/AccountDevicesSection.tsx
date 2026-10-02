import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '../../../common/Button/Button';
import { Badge } from '../../../common/Badge/Badge';
import { SettingsSection } from '../../../common/SettingsSection/SettingsSection';
import { ConfirmModal } from '../../../common/ConfirmModal/ConfirmModal';
import { Toggle } from '../../../common/Toggle/Toggle';
import { fetchService, putService } from '../../../../api/service';
import { useToast } from '../../../common/Toast/Toast';
import { useTranslation } from '../../../../lib/i18n';
import { useSystemSpecs } from '../../../../hooks/useSystemSpecs';
import type { AccountDeviceItem, AuthBackend } from '../../../../api/authBackend';
import { DeviceSpecsCard } from '../../../../app/public/DeviceSpecsCard';
import { ManualDeviceModal } from './ManualDeviceModal';
import { systemSpecsToDeviceSpecs } from './deviceUtils';
import styles from './Account.module.scss';

interface AccountDevicesSectionProps {
  backend: AuthBackend;
  /** In-app surface only: seeds a new manual device's spec fields from the local service's own /system/specs. Never set on the public web account page (localhost is never reachable there). */
  prefillFromLocalSpecs?: boolean;
  /** In-app surface only: lists the machine the app runs on first, with its reporting switch and no Remove. */
  showThisSystem?: boolean;
}

// The local service's /system/report: the install id this machine reports under, and whether it reports.
interface SystemReport {
  installId: string;
  report: boolean;
}

function asSystemReport(value: Partial<SystemReport> & { error?: boolean } | null): SystemReport | null {
  return value && value.error !== true && typeof value.installId === 'string' && typeof value.report === 'boolean'
    ? { installId: value.installId, report: value.report }
    : null;
}

/**
 * "My devices" section: lists the account's linked machines (auto-reported,
 * read-only) alongside manually-added rigs (editable). Renders nothing when
 * the backend doesn't implement device management (see AuthBackend).
 */
export function AccountDevicesSection({ backend, prefillFromLocalSpecs, showThisSystem }: AccountDevicesSectionProps) {
  const { t } = useTranslation();
  const { push } = useToast();
  const syncLabelId = useId();
  const { specs: localSpecs } = useSystemSpecs(Boolean(prefillFromLocalSpecs || showThisSystem));
  // Stable identity: ManualDeviceModal's form-reset effect depends on this
  // value, so a fresh object on every parent re-render (e.g. AccountSignedIn's
  // 25s sync-status poll) would wipe an in-progress add/edit.
  const prefillSpecs = useMemo(
    () => (prefillFromLocalSpecs && localSpecs ? systemSpecsToDeviceSpecs(localSpecs) : null),
    [prefillFromLocalSpecs, localSpecs],
  );
  const [devices, setDevices] = useState<AccountDeviceItem[] | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AccountDeviceItem | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AccountDeviceItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [thisSystem, setThisSystem] = useState<SystemReport | null>(null);
  const [savingReport, setSavingReport] = useState(false);

  const load = useCallback(async () => {
    const result = await backend.listDevices?.();
    setDevices(result ?? []);
  }, [backend]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!showThisSystem) return undefined;
    let cancelled = false;
    void fetchService<Partial<SystemReport>>('/system/report').then((res) => {
      if (!cancelled) setThisSystem(asSystemReport(res));
    });
    return () => { cancelled = true; };
  }, [showThisSystem]);

  if (!backend.listDevices || !backend.upsertDevice) return null;
  const upsertDevice = backend.upsertDevice;

  const openAdd = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (device: AccountDeviceItem) => { setEditing(device); setModalOpen(true); };

  const handleSaved = (item: AccountDeviceItem) => {
    setDevices((prev) => {
      const list = prev ?? [];
      const idx = list.findIndex((d) => d.installId === item.installId);
      if (idx === -1) return [item, ...list];
      const next = [...list];
      next[idx] = item;
      return next;
    });
    push({ title: t(editing ? 'account.devices.updated' : 'account.devices.added') });
  };

  // Off removes this machine from the account; on reports it again before the list reloads.
  const changeReport = async (report: boolean) => {
    if (!thisSystem || savingReport) return;
    setSavingReport(true);
    let saved: SystemReport | null = null;
    try {
      saved = asSystemReport(await putService<Partial<SystemReport> & { error?: boolean }>('/system/report', { report }));
    } catch {
      // A failed request leaves the switch where it was.
    } finally {
      setSavingReport(false);
    }
    if (!saved) {
      push({ title: t('account.devices.syncFailed') });
      return;
    }
    setThisSystem(saved);
    if (saved.report) void load();
    else setDevices((prev) => (prev ?? []).filter((d) => d.installId !== saved.installId));
  };

  const own = thisSystem ? (devices ?? []).find((d) => d.installId === thisSystem.installId) ?? null : null;
  const others = (devices ?? []).filter((d) => d !== own);
  // Off the account, the card fills from the local specs, empty until they load: the switch to turn sync back on always shows.
  const ownSpecs = own?.specs ?? (localSpecs ? systemSpecsToDeviceSpecs(localSpecs) : {});

  const handleDeleteConfirm = async () => {
    if (!pendingDelete || deleting || !backend.deleteDevice) return;
    setDeleting(true);
    const ok = await backend.deleteDevice(pendingDelete.installId);
    setDeleting(false);
    if (ok) {
      setDevices((prev) => (prev ?? []).filter((d) => d.installId !== pendingDelete.installId));
      push({ title: t('account.devices.removed') });
    }
    setPendingDelete(null);
  };

  return (
    <>
      <SettingsSection
        title={t('account.devices.title')}
        description={t('account.devices.description')}
        action={(
          <Button type="button" tone="neutral" size="sm" icon={<Plus size={14} />} onClick={openAdd}>
            {t('account.devices.add')}
          </Button>
        )}
      >
        {devices != null && devices.length === 0 && !thisSystem && (
          <p className={styles.hint}>{t('account.devices.empty')}</p>
        )}
        {thisSystem && (
          <DeviceSpecsCard
            hostname={own?.hostname || localSpecs?.pcName || t('account.devices.thisSystem')}
            specs={ownSpecs}
            lastSeenAt={own?.lastSeenAt}
            badge={<Badge label={t('account.devices.thisSystem')} size="small" />}
            actions={(
              <span className={styles.syncSwitch}>
                <span id={syncLabelId}>{t('account.devices.sync')}</span>
                <Toggle checked={thisSystem.report} disabled={savingReport} onChange={(next) => void changeReport(next)} ariaLabelledBy={syncLabelId} />
              </span>
            )}
          />
        )}
        {others.map((device) => (
          <DeviceSpecsCard
            key={device.installId}
            hostname={device.hostname}
            specs={device.specs}
            manual={device.manual}
            lastSeenAt={device.lastSeenAt}
            badge={device.manual ? <Badge label={t('account.devices.manual.badge')} size="small" /> : undefined}
            actions={(
              <>
                {device.manual && (
                  <Button type="button" tone="neutral" size="sm" icon={<Pencil size={14} />} onClick={() => openEdit(device)}>
                    {t('account.devices.edit')}
                  </Button>
                )}
                {backend.deleteDevice && (
                  <Button type="button" tone="danger" size="sm" icon={<Trash2 size={14} />} onClick={() => setPendingDelete(device)}>
                    {t('account.devices.remove')}
                  </Button>
                )}
              </>
            )}
          />
        ))}
      </SettingsSection>

      <ManualDeviceModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        device={editing}
        upsertDevice={upsertDevice}
        onSaved={handleSaved}
        prefillSpecs={prefillSpecs}
      />

      <ConfirmModal
        open={pendingDelete != null}
        title={t('account.devices.remove.confirmTitle')}
        message={t('account.devices.remove.confirmMessage', { hostname: pendingDelete?.hostname ?? '' })}
        confirmLabel={t('account.devices.remove')}
        destructive
        onConfirm={() => void handleDeleteConfirm()}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );
}
