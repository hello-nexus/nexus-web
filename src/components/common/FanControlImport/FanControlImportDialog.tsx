import { useTranslation } from '../../../lib/i18n';
import { DeviceModal } from '../DeviceModal/DeviceModal';
import { FanControlImportSection } from './FanControlImportSection';
import type { FanControlConfigFile } from '../../../api/fancontrol';

export interface FanControlImportDialogProps {
  open: boolean;
  configs: FanControlConfigFile[];
  onClose: () => void;
  /** Fires after a successful apply so the cooling page refetches. */
  onImported?: () => void;
}

/**
 * Cooling-page entry point for the FanControl import: hosts the same section
 * the onboarding screen does, so the preview and apply flow exists once.
 */
export function FanControlImportDialog({ open, configs, onClose, onImported }: FanControlImportDialogProps) {
  const { t } = useTranslation();
  return (
    <DeviceModal open={open} onClose={onClose} title={t('fanControlImport.title')}>
      <FanControlImportSection open={open} configs={configs} onImported={onImported} />
    </DeviceModal>
  );
}
