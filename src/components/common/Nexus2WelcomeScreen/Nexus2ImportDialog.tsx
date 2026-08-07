import { useTranslation } from '../../../lib/i18n';
import { DeviceModal } from '../DeviceModal/DeviceModal';
import { Nexus2ImportSection } from './Nexus2ImportSection';

export interface Nexus2ImportDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Settings re-entry point for the one-time welcome screen's Nexus 2.0 import:
 * hosts the same Nexus2ImportSection, so the grouped preview/apply
 * flow only exists in one place.
 */
export function Nexus2ImportDialog({ open, onClose }: Nexus2ImportDialogProps) {
  const { t } = useTranslation();
  return (
    <DeviceModal open={open} onClose={onClose} title={t('nexus2Welcome.settingsEntry.rowLabel')}>
      <Nexus2ImportSection open={open} />
    </DeviceModal>
  );
}
