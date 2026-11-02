import { AlertTriangle } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { Badge } from '../Badge/Badge';

/** Warn pill for a device Nexus controls but cannot write lighting to; pressing it opens the Fix lighting flow. */
export function NotRespondingBadge({ onClick, className }: { onClick: () => void; className?: string }) {
  const { t } = useTranslation();
  return (
    <Badge
      label={t('lighting.writeHealth.badge')}
      color="var(--warn)"
      icon={<AlertTriangle size={12} aria-hidden />}
      tooltip={{ body: t('lighting.writeHealth.tooltip') }}
      onClick={onClick}
      className={className}
    />
  );
}
