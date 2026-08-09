import { Download } from 'lucide-react';
import { TopBarStatusButton } from '../TopBarStatusButton/TopBarStatusButton';
import { useTranslation } from '../../../lib/i18n';

interface UpdateBadgeProps {
  updateMode?: string;
  // False on platforms with no staging/install flow (mac/linux): the badge
  // always opens downloadUrl instead of the notify/install split below.
  canAutoInstall: boolean;
  downloadUrl: string;
  onOpen: () => void;
  onInstall: () => void;
}

export function UpdateBadge({ updateMode, canAutoInstall, downloadUrl, onOpen, onInstall }: UpdateBadgeProps) {
  const { t } = useTranslation();

  // notify mode: the update is detected but not staged, so the button opens the
  // modal (release notes). Otherwise it's downloaded and the button installs.
  // The tooltip mirrors whichever action the click performs.
  const isNotify = updateMode === 'notify';
  const label = !canAutoInstall
    ? t('update.badge.labelDownload')
    : (isNotify ? t('update.badge.label') : t('update.badge.labelReady'));
  const handleClick = !canAutoInstall
    ? () => { if (downloadUrl) window.open(downloadUrl, '_blank', 'noopener,noreferrer'); }
    : (isNotify ? onOpen : onInstall);

  return (
    <TopBarStatusButton
      tone="good"
      icon={<Download size={16} />}
      label={label}
      onClick={handleClick}
    />
  );
}
