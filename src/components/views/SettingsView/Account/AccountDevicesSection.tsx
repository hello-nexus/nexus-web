import { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '../../../common/Button/Button';
import { Badge } from '../../../common/Badge/Badge';
import { SettingsSection } from '../../../common/SettingsSection/SettingsSection';
import { ConfirmModal } from '../../../common/ConfirmModal/ConfirmModal';
import { useToast } from '../../../common/Toast/Toast';
import { useTranslation } from '../../../../lib/i18n';
import type { AccountDeviceItem, AuthBackend } from '../../../../api/authBackend';
import { DeviceSpecsCard } from '../../../../app/public/DeviceSpecsCard';
import { ManualDeviceModal } from './ManualDeviceModal';
import styles from './Account.module.scss';

interface AccountDevicesSectionProps {
  backend: AuthBackend;
}

/**
 * "My devices" section: lists the account's linked machines (auto-reported,
 * read-only) alongside manually-added rigs (editable). Renders nothing when
 * the backend doesn't implement device management (see AuthBackend) - today
 * that's every backend except DirectApiBackend, since nexus-api's
 * /account/devices routes have no local-service proxy.
 */
export function AccountDevicesSection({ backend }: AccountDevicesSectionProps) {
  const { t } = useTranslation();
  const { push } = useToast();
  const [devices, setDevices] = useState<AccountDeviceItem[] | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AccountDeviceItem | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AccountDeviceItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    const result = await backend.listDevices?.();
    setDevices(result ?? []);
  }, [backend]);

  useEffect(() => { void load(); }, [load]);

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
        {devices != null && devices.length === 0 && (
          <p className={styles.hint}>{t('account.devices.empty')}</p>
        )}
        {(devices ?? []).map((device) => (
          <DeviceSpecsCard
            key={device.installId}
            hostname={device.hostname}
            specs={device.specs}
            manual={device.manual}
            lastSeenAt={device.lastSeenAt}
            badge={<Badge label={t(device.manual ? 'account.devices.manual.badge' : 'account.devices.auto.badge')} />}
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
