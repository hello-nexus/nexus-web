import type { ReactNode } from 'react';
import type { FirmwareStatusItem } from '../../../hooks/useFirmwareStatus';
import type { FlashStatus } from '../../../hooks/useFlashStatus';
import { useTranslation } from '../../../lib/i18n';
import { flashMatchesRecovery, recoveryAction, recoveryDone } from '../../../lib/firmwareRecovery';
import { Button } from '../Button/Button';
import { FlashProgress } from '../FlashProgress/FlashProgress';
import { Notice } from '../Notice/Notice';

export interface FirmwareRecoveryBannerProps {
  item: FirmwareStatusItem | null;
  status: FlashStatus | null;
  /** Dev-tools builds may flash an unsupported device from the firmware table picker. */
  devTools?: boolean;
  onRecover: (item: FirmwareStatusItem) => void;
}

/** Warning for a device stranded in update mode after an interrupted firmware update, with the Recover action. */
export function FirmwareRecoveryBanner({ item, status, devTools = false, onRecover }: FirmwareRecoveryBannerProps) {
  const { t } = useTranslation();
  if (!item) return null;

  const flashing = !!status?.active && flashMatchesRecovery(item, status);
  const done = recoveryDone(item, status);
  const action = recoveryAction(item, devTools);

  let actionNode: ReactNode = null;
  if (done) {
    actionNode = t('devices.firmware.recovery.restored', { name: item.name });
  } else if (flashing) {
    actionNode = <FlashProgress status={status!} />;
  } else if (action === 'recover') {
    actionNode = (
      <Button type="button" tone="accent" size="sm" disabled={!!status?.active} onClick={() => onRecover(item)}>
        {t('devices.firmware.recovery.action')}
      </Button>
    );
  } else if (action === 'checking') {
    actionNode = t('devices.firmware.recovery.checking');
  } else if (action === 'contactSupport') {
    actionNode = t('devices.firmware.recovery.contactSupport');
  }

  return (
    <Notice tone="warning" role="alert" actions={actionNode}>
      <span>{t('devices.firmware.recovery.banner', { name: item.name })}</span>
    </Notice>
  );
}
