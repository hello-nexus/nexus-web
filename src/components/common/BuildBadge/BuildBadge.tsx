import { useTranslation } from '../../../lib/i18n';
import styles from './BuildBadge.module.scss';

interface BuildBadgeProps {
  /** Any CSS font size; the padding, corner and outline scale with it, so the tag fits a small widget corner and a site header alike. */
  size?: string;
  className?: string;
}

/** The BUILD tag: the product name in a thin outlined tag, neutral colors only. A quiet identifier, not a button. */
export function BuildBadge({ size, className }: BuildBadgeProps) {
  const { t } = useTranslation();
  return (
    <span className={className ? `${styles.badge} ${className}` : styles.badge} style={size ? { fontSize: size } : undefined}>
      {t('panel.widget.build.badge')}
    </span>
  );
}
