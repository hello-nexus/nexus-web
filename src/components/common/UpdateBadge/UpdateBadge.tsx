import { Download } from 'lucide-react';
import { TopBarStatusButton } from '../TopBarStatusButton/TopBarStatusButton';
import { useTranslation } from '../../../lib/i18n';

interface UpdateBadgeProps {
  updateMode?: string;
  onOpen: () => void;
  onInstall: () => void;
}

export function UpdateBadge({ updateMode, onOpen, onInstall }: UpdateBadgeProps) {
  const { t } = useTranslation();

  // notify mode: the update is detected but not staged, so the button opens the
  // modal (release notes). Otherwise it's downloaded and the button installs.
  // The tooltip mirrors whichever action the click performs.
  const isNotify = updateMode === 'notify';
  const label = isNotify ? t('update.badge.label') : t('update.badge.labelReady');
  const handleClick = isNotify ? onOpen : onInstall;

  return (
    <TopBarStatusButton
      tone="good"
      icon={<Download size={16} />}
      label={label}
      onClick={handleClick}
    />
  );
}
