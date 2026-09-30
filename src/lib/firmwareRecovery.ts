import type { FirmwareStatusItem } from '../hooks/useFirmwareStatus';
import type { FlashStatus } from '../hooks/useFlashStatus';

export type RecoveryAction = 'recover' | 'checking' | 'pick' | 'contactSupport';

export function findRecoveryRow(items: readonly FirmwareStatusItem[]): FirmwareStatusItem | null {
  return items.find(i => i.needsRecovery) ?? null;
}

/** What the user can do with a recovery row. Only a dev-tools build may pick an image by hand. */
export function recoveryAction(item: FirmwareStatusItem, devTools: boolean): RecoveryAction {
  if (item.recoveryState === 'identifying') return 'checking';
  if (item.recoveryState === 'ready' && item.firmwareType && item.availableVersion) return 'recover';
  if (devTools && item.devImages.length > 0) return 'pick';
  return 'contactSupport';
}

/** The global flash status belongs to this recovery row. */
export function flashMatchesRecovery(item: FirmwareStatusItem, status: FlashStatus | null): boolean {
  if (!status || !status.deviceType) return false;
  return status.deviceType === item.firmwareType
    || item.devImages.some(img => img.firmwareType === status.deviceType);
}

export function recoveryDone(item: FirmwareStatusItem, status: FlashStatus | null): boolean {
  return flashMatchesRecovery(item, status) && !status!.active && status!.phase === 'done' && status!.success;
}
