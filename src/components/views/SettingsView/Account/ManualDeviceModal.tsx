import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '../../../common/Button/Button';
import { TextInput } from '../../../common/TextInput/TextInput';
import { DeviceModal } from '../../../common/DeviceModal/DeviceModal';
import { useTranslation } from '../../../../lib/i18n';
import type { AccountDeviceItem, AuthBackend } from '../../../../api/authBackend';
import { SPEC_FIELD_ORDER } from '../../../../app/public/publicProfileUtils';
import { DEVICE_HOSTNAME_MAX_LENGTH, DEVICE_SPEC_VALUE_MAX_LENGTH, generateManualInstallId, isValidDeviceHostname, trimDeviceSpecs } from './deviceUtils';
import { deviceUpsertErrorMessage } from './accountErrors';
import styles from './Account.module.scss';

const SPEC_FIELDS = SPEC_FIELD_ORDER.map((key) => ({ key, labelKey: `devices.specs.row.${key}` }));

interface ManualDeviceModalProps {
  open: boolean;
  onClose: () => void;
  /** Present to edit an existing manual device; absent to add a new one. */
  device: AccountDeviceItem | null;
  upsertDevice: NonNullable<AuthBackend['upsertDevice']>;
  onSaved: (item: AccountDeviceItem) => void;
  /** Spec fields to seed a new device's form with (in-app surface only, from the local service's own specs). Ignored when editing an existing device. */
  prefillSpecs?: Record<string, string> | null;
}

// DeviceModal unmounts its children on close, so the form resets to a blank
// (or the next `device` prop's) state on every open - no stale field values
// survive between an add and an edit.
export function ManualDeviceModal({ open, onClose, device, upsertDevice, onSaved, prefillSpecs }: ManualDeviceModalProps) {
  const { t } = useTranslation();
  const [hostname, setHostname] = useState('');
  const [specs, setSpecs] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setHostname(device?.hostname ?? '');
    setSpecs(device?.specs ?? prefillSpecs ?? {});
    setSaving(false);
    setError(null);
    setTouched(false);
  }, [open, device, prefillSpecs]);

  if (!open) return null;

  const hostnameInvalid = touched && !isValidDeviceHostname(hostname);

  const handleSave = async () => {
    setTouched(true);
    if (!isValidDeviceHostname(hostname) || saving) return;
    setSaving(true);
    setError(null);
    const installId = device?.installId ?? generateManualInstallId();
    const result = await upsertDevice(installId, {
      hostname: hostname.trim(),
      specs: trimDeviceSpecs(specs),
      manual: true,
    });
    setSaving(false);
    if (result.status >= 200 && result.status < 300 && result.body) {
      onSaved({
        installId: result.body.installId ?? installId,
        hostname: result.body.hostname ?? hostname.trim(),
        specs: result.body.specs ?? trimDeviceSpecs(specs),
        manual: result.body.manual ?? true,
        lastSeenAt: result.body.lastSeenAt ?? new Date().toISOString(),
      });
      onClose();
      return;
    }
    setError(deviceUpsertErrorMessage(t, result.body?.msg));
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void handleSave();
  };

  return (
    <DeviceModal open={open} onClose={onClose} title={device ? t('account.devices.modal.editTitle') : t('account.devices.modal.addTitle')}>
      <form className={styles.form} onSubmit={handleSubmit}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>{t('account.devices.modal.nameLabel')}</span>
          <TextInput
            value={hostname}
            onInput={setHostname}
            name="device-name"
            maxLength={DEVICE_HOSTNAME_MAX_LENGTH}
            ariaLabel={t('account.devices.modal.nameLabel')}
            invalid={hostnameInvalid}
          />
          {hostnameInvalid && <p className={styles.error} role="alert">{t('account.devices.modal.nameRequired')}</p>}
        </label>

        <span className={styles.fieldLabel}>{t('account.devices.modal.specsSection')}</span>
        {SPEC_FIELDS.map(({ key, labelKey }) => (
          <label key={key} className={styles.field}>
            <span className={styles.fieldLabel}>{t(labelKey)}</span>
            <TextInput
              value={specs[key] ?? ''}
              onInput={(v) => setSpecs((prev) => ({ ...prev, [key]: v }))}
              name={`device-spec-${key}`}
              maxLength={DEVICE_SPEC_VALUE_MAX_LENGTH}
              ariaLabel={t(labelKey)}
            />
          </label>
        ))}

        {error && <p className={styles.error} role="alert">{error}</p>}
        <Button type="submit" tone="accent" loading={saving} disabled={saving}>
          {t('account.save')}
        </Button>
      </form>
    </DeviceModal>
  );
}
