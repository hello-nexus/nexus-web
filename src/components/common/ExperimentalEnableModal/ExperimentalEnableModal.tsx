import { FlaskConical } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { ConfirmModal } from '../ConfirmModal/ConfirmModal';

interface ExperimentalEnableModalProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Asks before Nexus Control turns on for experimental hardware, in the Experimental badge's own words and icon. */
export function ExperimentalEnableModal({ open, onConfirm, onCancel }: ExperimentalEnableModalProps) {
  const { t } = useTranslation();
  return (
    <ConfirmModal
      open={open}
      title={t('devices.experimental.tooltip.title')}
      icon={<FlaskConical size={18} color="var(--warn)" aria-hidden />}
      message={t('devices.experimental.tooltip.body')}
      confirmLabel={t('devices.experimental.confirm')}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
