import { useTranslation } from '../../../lib/i18n';
import { ConfirmModal } from '../ConfirmModal/ConfirmModal';

interface ExperimentalEnableModalProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Asks before Nexus Control turns on for experimental hardware, in the Experimental badge's own words. */
export function ExperimentalEnableModal({ open, onConfirm, onCancel }: ExperimentalEnableModalProps) {
  const { t } = useTranslation();
  return (
    <ConfirmModal
      open={open}
      title={t('devices.experimental.tooltip.title')}
      message={t('devices.experimental.tooltip.body')}
      confirmLabel={t('devices.experimental.confirm')}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
