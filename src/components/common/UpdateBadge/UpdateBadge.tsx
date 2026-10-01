import { Download } from 'lucide-react';
import { TopBarStatusButton } from '../TopBarStatusButton/TopBarStatusButton';
import { useTranslation } from '../../../lib/i18n';

interface UpdateBadgeProps {
  updateMode?: string;
  // False where the service cannot install updates itself: the badge opens
  // downloadUrl instead of the notify/install split below.
  canAutoInstall: boolean;
  // False when the release cannot be staged ahead of the install: the button
  // opens the modal, which downloads and installs on demand.
  canStage?: boolean;
  downloadUrl: string;
  onOpen: () => void;
  onInstall: () => void;
}

export function UpdateBadge({ updateMode, canAutoInstall, canStage = true, downloadUrl, onOpen, onInstall }: UpdateBadgeProps) {
  const { t } = useTranslation();

  // Not staged (notify mode, or a release that cannot be staged): the button
  // opens the modal, which installs on demand. Otherwise the update is already
  // downloaded and the button installs. The tooltip mirrors the click's action.
  const notStaged = updateMode === 'notify' || !canStage;
  const label = !canAutoInstall
    ? t('update.badge.labelDownload')
    : (notStaged ? t('update.badge.label') : t('update.badge.labelReady'));
  const handleClick = !canAutoInstall
    ? () => { if (downloadUrl) window.open(downloadUrl, '_blank', 'noopener,noreferrer'); }
    : (notStaged ? onOpen : onInstall);

  return (
    <TopBarStatusButton
      tone="good"
      icon={<Download size={16} />}
      label={label}
      onClick={handleClick}
    />
  );
}
